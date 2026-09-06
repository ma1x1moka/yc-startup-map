// Filters a large list of raw YC Algolia company records down to ones
// genuinely notable enough for a curated "notable YC alumni" atlas, using an
// LLM judgment call per batch of ~35 companies instead of a fixed regex (a
// prior smaller pass used a crude "mentions $/ARR/raised" regex, which is
// too blunt at 10-years-of-YC scale: it both misses distinctive non-
// monetary notability like GitHub stars or being an acqui-hire everyone
// knows, and lets through anyone who mentions "million" in passing).
//
// Uses Gemini (gemini-3.6-flash, single account, small daily quota) as a
// supplementary provider when available, falling back to Groq (primary,
// with its own multi-model fallback chain — see groq-client.mjs) once
// Gemini's quota is exhausted for the day. See gemini-client.mjs /
// groq-client.mjs for the per-provider throttling/fallback details.
//
// Usage: node filter-notable.mjs missing.json outDir
// Resumable: skips ids already present in outDir/notable.json or
// not-notable.json from a prior run, so it's safe to re-invoke against the
// same input after a pause.
// Writes: <outDir>/notable.json (full records that passed)
//         <outDir>/not-notable.json (name/id/reason for records that didn't, for spot-checking)
//         <outDir>/filter-log.json (per-batch call stats: failures, retries, mismatches, per-provider call counts)

import fs from "node:fs";
import path from "node:path";
import { groqChatJSON } from "./groq-client.mjs";
import { geminiChatJSON, isGeminiAvailable } from "./gemini-client.mjs";

const inputPath = process.argv[2];
const outDir = process.argv[3];
if (!inputPath || !outDir) {
  console.error("usage: node filter-notable.mjs missing.json outDir");
  process.exit(1);
}

// Pacing is adaptive for Groq (see groq-client.mjs, per-model TPM/TPD
// aware); Gemini has its own small fixed pacing (see gemini-client.mjs).
const BATCH_SIZE = 35;

fs.mkdirSync(outDir, { recursive: true });
const notablePath = path.join(outDir, "notable.json");
const notNotablePath = path.join(outDir, "not-notable.json");
const logPath = path.join(outDir, "filter-log.json");

const notable = fs.existsSync(notablePath) ? JSON.parse(fs.readFileSync(notablePath)) : [];
const notNotable = fs.existsSync(notNotablePath) ? JSON.parse(fs.readFileSync(notNotablePath)) : [];
const log = fs.existsSync(logPath)
  ? JSON.parse(fs.readFileSync(logPath))
  : { batches: 0, calls: 0, failures: [], mismatches: [], providerCalls: { gemini: 0, groq: 0 } };
log.providerCalls ||= { gemini: 0, groq: 0 };

const alreadyJudged = new Set([...notable, ...notNotable].map(c => c.id).filter(id => id !== undefined));

const fullList = JSON.parse(fs.readFileSync(inputPath));
const list = fullList.filter(c => !alreadyJudged.has(c.id));
if (alreadyJudged.size) console.log(`resuming: ${alreadyJudged.size} already judged, ${list.length} left`);

// Can't judge notability with essentially no text — exclude up front rather
// than waste a call asking an LLM to judge silence.
const judgeable = list.filter(c => (c.one_liner && c.one_liner.length >= 5) || (c.long_description && c.long_description.length >= 20));
const unjudgeable = list.filter(c => !judgeable.includes(c));

console.log(`${list.length} input, ${unjudgeable.length} skipped (no usable text), ${judgeable.length} to judge`);

const SYSTEM_PROMPT = `You are curating a "notable YC alumni" atlas — a hand-picked showcase of Y Combinator companies from the last 10 years (2016-2026), not a directory of everyone who went through YC. The existing cards in this atlas (Fall 2025 / Winter 2026 batches) were filtered on a simple, blunt signal: the description mentions $ funding, ARR, being raised, revenue, or a valuation. Match that same spirit here: the primary bar is ACTUAL FUNDING OR SUCCESS, not "sounds like an interesting idea."

Weight these signals, in roughly this priority order:
1. A concrete dollar figure — funding raised, revenue, ARR, valuation — stated in the text. This is the strongest and most important signal.
2. status = "Acquired" or "Public" in the record below. Being acquired or going public IS success by definition, even if the one_liner/long_description never mentions a dollar figure — treat this as a strong positive signal on its own.
3. Other concrete, numeric traction (user count, GitHub stars, named enterprise customers) — a weaker but still real signal, useful mainly to break ties or corroborate signal 1/2.
4. Name recognition as a company you independently know is genuinely famous/successful.

A distinctive or clever technical approach is NOT sufficient on its own — an unproven idea with no funding/traction/success signal should generally be EXCLUDED even if the tech sounds interesting. This atlas is showcasing successful, funded startups, not interesting-but-unproven ideas. Similarly, a well-written pitch or ambitious one-liner with no financial or success signal is not enough. Most YC companies do NOT clear this bar; being unremarkable (or merely "still operating, unproven") is the default, so when in doubt, exclude. Do not assume fame you can't see evidence of in the text itself, EXCEPT for companies whose name you independently recognize as genuinely famous/successful (name it as the reason).

Respond with ONLY a JSON object: {"results": [{"id": <id>, "notable": true|false, "reason": "<5-10 words>"}, ...]} covering EVERY id given, in any order. No markdown fences, no other text.`;

function buildUserMsg(batch) {
  const lines = batch.map(c => {
    const desc = (c.long_description || "").replace(/\s+/g, " ").trim().slice(0, 700);
    return `id=${c.id} | name="${c.name}" | batch=${c.batch} | status=${c.status} | one_liner="${c.one_liner || ""}" | long_description="${desc}"`;
  });
  return lines.join("\n");
}

// Try Gemini first (small supplementary quota), fall back to Groq (primary,
// with its own model-fallback chain) if Gemini is unavailable or fails.
async function callLLM(batch) {
  if (isGeminiAvailable()) {
    try {
      const result = await geminiChatJSON(SYSTEM_PROMPT + "\n\n--- COMPANIES ---\n" + buildUserMsg(batch));
      log.providerCalls.gemini++;
      return result;
    } catch (err) {
      console.log(`  (Gemini failed/exhausted: ${err.message} — falling back to Groq)`);
    }
  }
  const estimatedTokens = 350 + batch.length * 90;
  const result = await groqChatJSON(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMsg(batch) },
    ],
    { estimatedTokens, temperature: 0.2 }
  );
  log.providerCalls.groq++;
  return result;
}

function flush() {
  fs.writeFileSync(notablePath, JSON.stringify(notable, null, 2));
  fs.writeFileSync(notNotablePath, JSON.stringify(notNotable, null, 2));
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

const batches = [];
for (let i = 0; i < judgeable.length; i += BATCH_SIZE) batches.push(judgeable.slice(i, i + BATCH_SIZE));

console.log(`${batches.length} batches of up to ${BATCH_SIZE}`);

for (let b = 0; b < batches.length; b++) {
  const batch = batches[b];
  log.batches++;
  let result;
  try {
    log.calls++;
    result = await callLLM(batch);
  } catch (err) {
    console.error(`batch ${b}: FAILED (${err.message}) — retrying once as two half-batches`);
    log.failures.push({ batch: b, error: err.message });
    // one retry attempt, split in half in case the failure was a too-long/garbled response
    try {
      const half = Math.ceil(batch.length / 2);
      log.calls++;
      const r1 = await callLLM(batch.slice(0, half));
      log.calls++;
      const r2 = await callLLM(batch.slice(half));
      result = { results: [...(r1.results || []), ...(r2.results || [])] };
    } catch (err2) {
      console.error(`batch ${b}: retry also failed (${err2.message}) — marking all as not-notable (unjudged)`);
      log.failures.push({ batch: b, error: `retry: ${err2.message}` });
      for (const c of batch) notNotable.push({ id: c.id, name: c.name, reason: "UNJUDGED (LLM call failed twice)" });
      flush();
      continue;
    }
  }

  const byId = new Map((result.results || []).map(r => [String(r.id), r]));
  const gotIds = new Set();
  for (const c of batch) {
    const r = byId.get(String(c.id));
    if (!r) { continue; }
    gotIds.add(String(c.id));
    if (r.notable) notable.push({ ...c, _notableReason: r.reason || "" });
    else notNotable.push({ id: c.id, name: c.name, reason: r.reason || "" });
  }
  const missed = batch.filter(c => !gotIds.has(String(c.id)));
  if (missed.length) {
    log.mismatches.push({ batch: b, expected: batch.length, missed: missed.map(c => c.id) });
    for (const c of missed) notNotable.push({ id: c.id, name: c.name, reason: "UNJUDGED (missing from LLM response)" });
  }

  if (b % 5 === 0 || b === batches.length - 1) {
    flush();
    console.log(`batch ${b + 1}/${batches.length}: ${notable.length} notable so far, ${notNotable.length} excluded so far`);
  }
}

for (const c of unjudgeable) notNotable.push({ id: c.id, name: c.name, reason: "SKIPPED (no usable text)" });
flush();

console.log(`\nDone. ${notable.length} notable / ${(notable.length + notNotable.length)} total judged so far (${(100 * notable.length / (notable.length + notNotable.length)).toFixed(1)}%)`);
console.log(`Cumulative (all runs): ${log.calls} calls (gemini: ${log.providerCalls.gemini}, groq: ${log.providerCalls.groq}), failed batches: ${log.failures.length}, response mismatches: ${log.mismatches.length}`);
