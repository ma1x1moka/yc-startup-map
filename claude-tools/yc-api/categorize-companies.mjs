// Sorts the Review Queue's flat 797-company bucket into topical sections by
// sphere of activity, so the graph isn't one giant undifferentiated cloud.
// Judges by LLM (batched, same pattern as filter-notable.mjs) rather than a
// mechanical mapping off YC's own `industries` field, because that field is
// noisy at the top (417/797 are tagged generic "B2B") and a company's real
// sphere is better read from what it actually does.
//
// Usage: node categorize-companies.mjs notable.json outDir
// Resumable: skips ids already present in outDir/categorized.json.
// Writes: <outDir>/categorized.json  [{id, slug, category}, ...]
//         <outDir>/categorize-log.json

import fs from "node:fs";
import path from "node:path";
import { groqChatJSON } from "./groq-client.mjs";
import { geminiChatJSON, isGeminiAvailable } from "./gemini-client.mjs";

const inputPath = process.argv[2];
const outDir = process.argv[3];
if (!inputPath || !outDir) {
  console.error("usage: node categorize-companies.mjs notable.json outDir");
  process.exit(1);
}

const BATCH_SIZE = 40;

export const CATEGORIES = [
  "AI & Developer Tools",
  "Fintech & Payments",
  "Healthcare & Biotech",
  "Enterprise & Productivity",
  "Consumer & Marketplace",
  "Hardware, Robotics & Industrials",
  "Real Estate & Construction",
  "Logistics, Supply Chain & Climate",
  "Education",
  "New Frontiers",
];

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "categorized.json");
const logPath = path.join(outDir, "categorize-log.json");

const result = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath)) : [];
const log = fs.existsSync(logPath)
  ? JSON.parse(fs.readFileSync(logPath))
  : { batches: 0, calls: 0, failures: [], providerCalls: { gemini: 0, groq: 0 } };
log.providerCalls ||= { gemini: 0, groq: 0 };

const done = new Set(result.map(r => r.id));
const fullList = JSON.parse(fs.readFileSync(inputPath));
const list = fullList.filter(c => !done.has(c.id));
if (done.size) console.log(`resuming: ${done.size} already categorized, ${list.length} left`);

const SYSTEM_PROMPT = `You sort YC startups into exactly ONE of these sphere-of-activity sections, for a visual graph where too many companies crammed into one bucket is the problem being solved — so pick the section that best groups this company with others like it, not the most technically precise label.

${CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Guidance: "AI & Developer Tools" is for infrastructure, dev tooling, data platforms, security, and agent/model tooling — AI-native or not, if developers are the buyer. "Enterprise & Productivity" is business software bought by ops/sales/marketing/HR/legal teams, not developers. "Consumer & Marketplace" is anything sold to individual consumers, including marketplaces and content/social/gaming. Don't use YC's own generic "B2B"/"Consumer" tags as your answer — reason from what the company actually does. If genuinely torn between two, pick the one that will have more companies to keep it good company, except "New Frontiers" — use that only as a last resort for something that truly fits nowhere else (defense, space, gov, VR/AR, agriculture, other novel domains).

Respond with ONLY a JSON object: {"results": [{"id": <id>, "category": "<one of the exact section names above>"}, ...]} covering EVERY id given, in any order. No markdown fences, no other text.`;

function buildUserMsg(batch) {
  return batch
    .map(c => {
      const desc = (c.long_description || "").replace(/\s+/g, " ").trim().slice(0, 500);
      const tags = (c.tags || []).slice(0, 6).join(", ");
      return `id=${c.id} | name="${c.name}" | one_liner="${c.one_liner || ""}" | tags=[${tags}] | industries=[${(c.industries || []).join(", ")}] | long_description="${desc}"`;
    })
    .join("\n");
}

async function callLLM(batch) {
  if (isGeminiAvailable()) {
    try {
      const r = await geminiChatJSON(SYSTEM_PROMPT + "\n\n--- COMPANIES ---\n" + buildUserMsg(batch));
      log.providerCalls.gemini++;
      return r;
    } catch (err) {
      console.log(`  (Gemini failed/exhausted: ${err.message} — falling back to Groq)`);
    }
  }
  const estimatedTokens = 400 + batch.length * 80;
  const r = await groqChatJSON(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMsg(batch) },
    ],
    { estimatedTokens, temperature: 0.2 }
  );
  log.providerCalls.groq++;
  return r;
}

function flush() {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

const batches = [];
for (let i = 0; i < list.length; i += BATCH_SIZE) batches.push(list.slice(i, i + BATCH_SIZE));

for (let b = 0; b < batches.length; b++) {
  const batch = batches[b];
  log.batches++;
  log.calls++;
  let parsed;
  try {
    parsed = await callLLM(batch);
  } catch (err) {
    console.error(`batch ${b}: ${err.message} — retrying once`);
    try {
      parsed = await callLLM(batch);
    } catch (err2) {
      console.error(`batch ${b}: retry also failed (${err2.message}) — defaulting this batch to "Consumer & Marketplace"`);
      log.failures.push({ batch: b, error: err2.message });
      for (const c of batch) result.push({ id: c.id, slug: c.slug, category: "Consumer & Marketplace" });
      flush();
      continue;
    }
  }
  const byId = new Map((parsed.results || []).map(r => [r.id, r.category]));
  for (const c of batch) {
    let category = byId.get(c.id);
    if (!CATEGORIES.includes(category)) category = "Consumer & Marketplace"; // safe fallback, not New Frontiers
    result.push({ id: c.id, slug: c.slug, category });
  }
  flush();
  console.log(`batch ${b + 1}/${batches.length}: ${result.length} categorized so far`);
}

flush();
const bySection = {};
for (const r of result) bySection[r.category] = (bySection[r.category] || 0) + 1;
console.log(`\nDone. ${result.length} categorized.`);
console.log(bySection);
