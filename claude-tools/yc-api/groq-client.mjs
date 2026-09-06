// Shared Groq chat-completion client with ADAPTIVE pacing and automatic
// MODEL FALLBACK, used by filter-notable.mjs and generate-cards-llm.mjs.
//
// generate-qa.mjs's fixed 2.5s-between-calls pacing assumed the binding
// constraint was requests-per-minute (30 RPM free tier). Measured live
// against this account on 2026-08-31, there are actually TWO separate caps
// per model: 8000 tokens-per-minute (TPM), and — the one that actually
// bites on a run this size — 200,000 tokens-per-day (TPD). A single 10-year
// filtering pass alone needs on the order of 500,000+ tokens, so hitting
// the daily cap mid-run is expected, not a bug.
//
// Groq's rate limits are scoped PER MODEL within one org/account (confirmed
// via the 429 body: "Rate limit reached for model `openai/gpt-oss-120b` in
// organization `org_...`"), and a probe against sibling models
// (openai/gpt-oss-20b, qwen/qwen3.8-27b) on the same key showed a full,
// untouched quota bucket. So instead of stalling for hours (or, worse,
// reaching for a second account/key — explicitly against project policy,
// see claude-tools/README.md), this client rotates to the next model in
// MODEL_FALLBACKS on a TPD-specific 429 and keeps going on the same single
// account. Ordinary (TPM) 429s are just paced through as before, since
// those clear within a minute.
//
// Also worth knowing: Groq's own `retry-after` header on a 429 can be
// wildly inflated (630s, 1819s observed) relative to how quickly a fresh
// probe actually succeeds — so the wait this client actually sleeps for a
// non-TPD 429 is capped, rather than trusting that number verbatim.

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
export const API_KEY = env.GROQ_API_KEY;
if (!API_KEY) { console.error("GROQ_API_KEY not found in claude-tools/.env"); process.exit(1); }

// Fallback order: start with whatever GROQ_MODEL says (or gpt-oss-20b), then
// try other general-purpose text models available on this account that
// showed their own live, untouched quota on 2026-08-31. Audio (whisper,
// orpheus) and safety/guard models are deliberately excluded — not suited
// to open-ended JSON generation.
const preferred = env.GROQ_MODEL || "openai/gpt-oss-20b";
const FALLBACK_POOL = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "qwen/qwen3.6-27b", "openai/gpt-oss-120b"];
export const MODEL_FALLBACKS = [preferred, ...FALLBACK_POOL.filter(m => m !== preferred)];

let modelIndex = 0;
export const currentModel = () => MODEL_FALLBACKS[modelIndex];

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Groq duration strings look like "12.3s", "1m5.2s", "2h12m28.8s".
function parseGroqDuration(str) {
  if (!str) return null;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(str.trim());
  if (!m) return null;
  const h = Number(m[1] || 0), mi = Number(m[2] || 0), s = Number(m[3] || 0);
  return Math.round((h * 3600 + mi * 60 + s) * 1000);
}

// Per-model state (rate limits are tracked separately per model by Groq, so
// pacing state must be too — otherwise switching models after a fallback
// would incorrectly inherit the exhausted model's throttle state).
const state = new Map(); // model -> { lastRemainingTokens, lastResetTokensMs, lastRequestTokens }
function stateFor(model) {
  if (!state.has(model)) state.set(model, { lastRemainingTokens: null, lastResetTokensMs: null, lastRequestTokens: 4000 });
  return state.get(model);
}

/** Call before sending a request estimated to need ~estimatedTokens tokens.
 * Sleeps if the last known remaining-tokens budget looks too thin. */
async function throttle(model, estimatedTokens) {
  const s = stateFor(model);
  if (s.lastRemainingTokens !== null && s.lastRemainingTokens < estimatedTokens) {
    const wait = (s.lastResetTokensMs ?? 30000) + 750;
    console.log(`  (pacing [${model}]: ~${s.lastRemainingTokens} tokens left this window, need ~${estimatedTokens} — waiting ${Math.round(wait / 1000)}s)`);
    await sleep(wait);
    s.lastRemainingTokens = null; // stale after waiting out the window
  } else {
    await sleep(400); // small floor gap regardless, to avoid back-to-back bursts
  }
}

function recordHeaders(model, res) {
  const s = stateFor(model);
  const rem = Number(res.headers.get("x-ratelimit-remaining-tokens"));
  if (Number.isFinite(rem)) s.lastRemainingTokens = rem;
  const resetMs = parseGroqDuration(res.headers.get("x-ratelimit-reset-tokens"));
  if (resetMs !== null) s.lastResetTokensMs = resetMs;
}

/**
 * messages: OpenAI-style messages array.
 * estimatedTokens: rough guess of this call's total token cost, used only
 *   for proactive pacing (falls back to the last real usage figure seen for
 *   whichever model ends up serving this call).
 * Returns the parsed JSON object from the model's response content.
 * Throws if every model in MODEL_FALLBACKS is exhausted for the day.
 */
export async function groqChatJSON(messages, { estimatedTokens, temperature = 0.3, retries = 4 } = {}) {
  const model = currentModel();
  const s = stateFor(model);
  const estimate = estimatedTokens ?? s.lastRequestTokens;
  await throttle(model, estimate);

  // Plain fetch() has no built-in timeout — a stalled TCP connection hangs
  // forever with no error and no log output, which is the most plausible
  // explanation for a silent multi-minute stall a human had to notice and
  // kill (nothing in this module's own pacing logic sleeps that long
  // uninterrupted; the longest intentional wait is the 75s 429 cap). An
  // explicit timeout turns a silent hang into a normal, retryable error.
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({ model, messages, temperature, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(60000),
  });
  recordHeaders(model, res);

  if (res.status === 429) {
    const bodyText = await res.text();
    const isDailyCap = /tokens per day|TPD/i.test(bodyText);
    if (isDailyCap) {
      if (modelIndex + 1 < MODEL_FALLBACKS.length) {
        modelIndex++;
        console.log(`  (${model} hit its daily token cap — switching to ${currentModel()} for subsequent calls)`);
        return groqChatJSON(messages, { estimatedTokens, temperature, retries });
      }
      throw new Error(`All fallback models exhausted for today (${MODEL_FALLBACKS.join(", ")}). Last error: ${bodyText.slice(0, 300)}`);
    }
    if (retries <= 0) throw new Error(`Groq API 429 (out of retries) [${model}]: ${bodyText.slice(0, 300)}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    // Observed live: Groq's own retry-after can be wildly inflated (seen
    // 630s and 1819s) while a direct follow-up probe succeeds immediately
    // with a fully healthy quota — i.e. the number is not reliably "exact
    // time until you have budget." Cap what we actually sleep and let the
    // adaptive remaining-tokens throttle re-assess on the next call.
    const MAX_RETRY_WAIT_MS = 75000;
    const waitMs = Math.min((Number.isFinite(retryAfter) ? retryAfter : 30) * 1000 + 1500, MAX_RETRY_WAIT_MS);
    console.log(`  (429 [${model}]${Number.isFinite(retryAfter) ? ` [server said ${retryAfter}s]` : ""}, waiting ${Math.round(waitMs / 1000)}s before retry)`);
    await sleep(waitMs);
    s.lastRemainingTokens = null; // stale — force a fresh read on the retried call
    return groqChatJSON(messages, { estimatedTokens, temperature, retries: retries - 1 });
  }
  if (!res.ok) throw new Error(`Groq API ${res.status} [${model}]: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  if (data.usage?.total_tokens) s.lastRequestTokens = data.usage.total_tokens;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`no text in response [${model}]: ${JSON.stringify(data).slice(0, 300)}`);
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}
