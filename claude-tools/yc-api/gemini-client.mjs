// Minimal Gemini (gemini-3.6-flash) JSON-completion client, used as a
// SECOND, SUPPLEMENTARY provider alongside groq-client.mjs for throughput.
// Single account, single key (GEMINI_API_KEY only — see claude-tools/.env
// for why GEMINI_API_KEY_2/_3 are deliberately not used: multi-account
// quota rotation was explicitly abandoned project-wide, see README).
//
// Gemini's free tier here is small (historically ~20 requests/day per the
// project's prior incident, see README) and its 429 retryDelay has
// previously been misleadingly short relative to the real daily-quota
// reset. So: treat ANY 429 from Gemini as "done for today" and permanently
// stop calling it for the rest of this process's lifetime, rather than
// retrying — conservative, but this is a bonus/supplementary resource, not
// the primary one (that's Groq).

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
const API_KEY = env.GEMINI_API_KEY;
const MODEL = env.GEMINI_MODEL || "gemini-3.6-flash";

const sleep = ms => new Promise(r => setTimeout(r, ms));

let exhausted = !API_KEY;
let lastCallAt = 0;
const MIN_GAP_MS = 3000; // courteous fixed pacing; this provider's quota is small, not throughput-critical

export function isGeminiAvailable() {
  return !exhausted;
}

/** promptText: a single combined prompt (Gemini here is used single-turn,
 * no system/user split needed for this task). Returns parsed JSON, or
 * throws — callers should check isGeminiAvailable() before calling and
 * fall back to Groq if this throws. */
export async function geminiChatJSON(promptText) {
  if (exhausted) throw new Error("Gemini already marked exhausted for today");

  const gap = Date.now() - lastCallAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastCallAt = Date.now();

  // See groq-client.mjs for why: plain fetch() has no built-in timeout, and
  // a stalled connection hangs silently forever rather than erroring.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (res.status === 429) {
    exhausted = true;
    const bodyText = await res.text();
    throw new Error(`Gemini 429 — marking exhausted for the rest of this run: ${bodyText.slice(0, 200)}`);
  }
  if (!res.ok) {
    const bodyText = await res.text();
    // Google also returns 400 RESOURCE_EXHAUSTED in some quota cases, not just 429.
    if (/RESOURCE_EXHAUSTED|quota/i.test(bodyText)) {
      exhausted = true;
      throw new Error(`Gemini quota exhausted (status ${res.status}) — marking exhausted for the rest of this run: ${bodyText.slice(0, 200)}`);
    }
    throw new Error(`Gemini API ${res.status}: ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
  if (!text) throw new Error(`no text in Gemini response: ${JSON.stringify(data).slice(0, 300)}`);
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}
