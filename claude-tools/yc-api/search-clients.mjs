// Web-search-backed enrichment clients for enrich-founders.mjs, kept
// separate from groq-client.mjs/gemini-client.mjs (which are both JSON-mode,
// non-grounded clients used by the card-generation scripts) because these
// two calls are plain-text, tool/grounding-enabled, and have their own
// distinct rate-limit buckets.
//
// 1. Gemini with Google Search grounding (tools:[{google_search:{}}]).
//    Observed 2026-09-03: HTTP 429 "You exceeded your current quota" with no
//    quotaId/quotaMetric — a separate, stricter bucket from plain
//    text-generation Gemini calls (already known to be a thin 20/day quota
//    per claude-tools/.env's notes). Treated the same way
//    gemini-client.mjs treats any 429: mark exhausted and stop calling for
//    a good while, rechecked only occasionally (not per-founder).
//
// 2. Groq `groq/compound` — a tool-using model that runs its own web search
//    and returns plain text in message.content (message.executed_tools
//    shows what it searched, safe to ignore). Empirically its search/tool
//    orchestration is billed against a DISTINCT underlying-model bucket
//    (`meta-llama/llama-4-scout-17b-16e-instruct`, 30,000 TPM observed
//    2026-09-03) from the openai/gpt-oss-*/qwen/* models the rest of this
//    project's scripts use — so it needs its own adaptive pacing, tracked
//    here independently of groq-client.mjs's per-model state.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; })
);
const GROQ_API_KEY = env.GROQ_API_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-3.6-flash";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- Gemini --

let geminiExhausted = !GEMINI_API_KEY;
let geminiLastCheckedAt = 0;
const GEMINI_RECHECK_GAP_MS = 30 * 60 * 1000; // recheck at most every 30 min, not per-founder

export function isGeminiSearchAvailable() {
  if (!geminiExhausted) return true;
  // Allow an occasional re-probe rather than staying permanently dead for
  // the whole process lifetime (per instructions: "recheck Gemini only
  // occasionally").
  if (Date.now() - geminiLastCheckedAt > GEMINI_RECHECK_GAP_MS) return true;
  return false;
}

/** promptText -> plain text answer, or throws. Marks exhausted on 429. */
export async function geminiSearchGrounded(promptText) {
  geminiLastCheckedAt = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(45000),
    }
  );
  if (res.status === 429) {
    geminiExhausted = true;
    const bodyText = await res.text();
    throw new Error(`Gemini grounded 429 — marking exhausted: ${bodyText.slice(0, 200)}`);
  }
  if (!res.ok) {
    const bodyText = await res.text();
    if (/RESOURCE_EXHAUSTED|quota/i.test(bodyText)) {
      geminiExhausted = true;
      throw new Error(`Gemini grounded quota exhausted (status ${res.status}): ${bodyText.slice(0, 200)}`);
    }
    throw new Error(`Gemini grounded API ${res.status}: ${bodyText.slice(0, 300)}`);
  }
  geminiExhausted = false; // a real success means it's alive again
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
  if (!text) throw new Error(`no text in Gemini grounded response: ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

// ------------------------------------------------------------- Groq compound --

// Adaptive pacing state for groq/compound, tracked independently of
// groq-client.mjs's per-(gpt-oss/qwen)-model state since compound's tool
// orchestration bills against its own underlying-model bucket
// (meta-llama/llama-4-scout-17b-16e-instruct, 30,000 TPM observed
// 2026-09-03). Empirically a single compound call (search + synthesis) can
// cost anywhere from ~7k to ~26k tokens depending on how much search
// content it pulls in — i.e. sometimes MORE THAN HALF the per-minute
// budget in one call. That makes a tight token-counting throttle fragile
// (one bigger-than-usual call blows the estimate), so the primary pacing
// mechanism here is a simple, conservative FIXED FLOOR between calls (see
// MIN_GAP_MS) — generous enough that most calls clear the window on the
// first try — with the 429/413 retry path (using Groq's own precise
// "try again in Xs" wait from the error body, not the header, which
// groq-client.mjs's notes show can be unreliable) as the fallback for when
// a call is unusually expensive.
const compoundState = { lastCallAt: 0 };
const MIN_GAP_MS = 70000; // conservative floor; a single call can cost >50% of the 30k TPM budget

async function throttleCompound() {
  const gap = Date.now() - compoundState.lastCallAt;
  if (compoundState.lastCallAt && gap < MIN_GAP_MS) {
    const wait = MIN_GAP_MS - gap;
    console.log(`  (pacing [groq/compound]: waiting ${Math.round(wait / 1000)}s before next call)`);
    await sleep(wait);
  }
  compoundState.lastCallAt = Date.now();
}

// Parse Groq's own precise wait time out of the error body, e.g.
// "...Used 26517, Requested 5557. Please try again in 4.148s." — far more
// accurate than the retry-after header (which can be 0/absent or, per
// groq-client.mjs's notes on the sibling models, wildly inflated).
function parseRetrySecondsFromBody(bodyText) {
  const m = /try again in ([\d.]+)(m?s)\b/i.exec(bodyText);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val)) return null;
  return m[2].toLowerCase() === "ms" ? val / 1000 : val;
}

/** promptText -> plain text (message.content), or throws.
 * Handles 429 (TPM, retryable with backoff) and 413 (observed when the
 * account's remaining budget in the current window is too thin for a
 * compound call's typically-large token footprint — treated like a 429
 * that needs a full window reset, not a malformed-request error). */
// A 429 body containing "tokens per day"/TPD (as opposed to TPM) means the
// underlying meta-llama/llama-4-scout-17b-16e-instruct bucket's DAILY
// budget is exhausted (seen live 2026-09-03: "Limit 500000, Used 499912" —
// essentially the whole day's budget gone). Unlike a TPM cap, which clears
// within a minute, a TPD cap only frees up as old usage ages out of the
// rolling 24h window — a handful of seconds of "please try again in Xs"
// (Groq's own TPM-style phrasing, reused here even though the constraint
// is really TPD) buys back only a tiny sliver, nowhere near the ~15-25k
// tokens a real compound call needs. Retrying every ~65s in that state
// just burns cycles (and, if failed attempts partially count against the
// budget the way live evidence suggested, may even prevent it from ever
// recovering). So: once a TPD cap is seen, stop attempting entirely for a
// long cooldown, shared across ALL calls in this process (not per-call),
// rather than each founder rediscovering the same wall through 8 wasted
// retries.
// Persisted to disk (not just an in-process variable): enrich-founders.mjs
// runs under an orchestrator watchdog that restarts it every few seconds
// once it exits, so an in-memory-only cooldown would be forgotten on every
// restart — each fresh process would immediately re-probe, immediately
// hit the same daily wall again, and exit again, in a tight restart loop
// for the entire cooldown window. Persisting means only the FIRST process
// in the window pays for a real (failing) network round-trip; every
// restart after that sees the cooldown file and fails instantly, no
// network call at all.
const cooldownFile = path.join(here, ".compound-tpd-cooldown.json");
const TPD_COOLDOWN_MS = 20 * 60 * 1000; // 20 min between re-probes

function readTpdCooldown() {
  try {
    return JSON.parse(fs.readFileSync(cooldownFile, "utf8")).until || 0;
  } catch {
    return 0;
  }
}
function writeTpdCooldown(until) {
  try {
    fs.writeFileSync(cooldownFile, JSON.stringify({ until, setAt: new Date().toISOString() }));
  } catch {
    /* best-effort — worst case, one extra process re-probes */
  }
}

export async function groqCompoundSearch(promptText) {
  const tpdExhaustedUntil = readTpdCooldown();
  if (Date.now() < tpdExhaustedUntil) {
    throw new Error(`groq/compound daily (TPD) cap still cooling down, ${Math.round((tpdExhaustedUntil - Date.now()) / 1000)}s left`);
  }
  // The floor-pacing throttle only applies ONCE, before the first attempt
  // of a logical call — retries below have their own purpose-built wait
  // (parsed from Groq's real "try again in Xs"), and re-running the fixed
  // 70s floor on top of that on every retry was silently stacking both
  // waits (a real bug seen live: a single founder took 3+ minutes across
  // retries because each retry re-waited the full floor gap in addition to
  // its own backoff).
  await throttleCompound();
  return attemptCompound(promptText, 8);
}

async function attemptCompound(promptText, retries) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "groq/compound",
      messages: [{ role: "user", content: promptText }],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (res.status === 429 || res.status === 413) {
    const bodyText = await res.text();
    if (/tokens per day|TPD/i.test(bodyText)) {
      writeTpdCooldown(Date.now() + TPD_COOLDOWN_MS);
      throw new Error(`groq/compound daily (TPD) cap hit — cooling down ${TPD_COOLDOWN_MS / 60000}min before retrying anyone: ${bodyText.slice(0, 300)}`);
    }
    if (retries <= 0) throw new Error(`groq/compound ${res.status} (out of retries): ${bodyText.slice(0, 300)}`);
    // Prefer Groq's own precise "try again in Xs" figure parsed from the
    // error body (accurate — it's computed from the account's actual
    // rolling-window accounting) over the retry-after header, which can be
    // 0/absent (seen live: Number(null) -> 0, which used to be
    // mistreated as "wait 0s") or, for the sibling gpt-oss models per
    // groq-client.mjs's notes, wildly inflated. A 413 here (seen live, no
    // body detail on timing) means "not enough budget this window" — fall
    // back to a fixed conservative wait.
    const parsedSeconds = parseRetrySecondsFromBody(bodyText);
    const MAX_WAIT_MS = 75000;
    const MIN_WAIT_MS = 5000;
    const waitMs = parsedSeconds !== null
      ? Math.min(Math.max(parsedSeconds * 1000 + 1500, MIN_WAIT_MS), MAX_WAIT_MS)
      : 65000;
    console.log(`  (groq/compound ${res.status}, waiting ${Math.round(waitMs / 1000)}s before retry, ${retries} retries left)`);
    await sleep(waitMs);
    return attemptCompound(promptText, retries - 1);
  }
  if (!res.ok) throw new Error(`groq/compound API ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`no text in groq/compound response: ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}
