// Generates full house-style cards (description, prose body, section
// classification, and a tailored _Usage:_ Q&A) for companies that already
// passed filter-notable.mjs, via one Groq call per company — writing correct
// third-person prose directly rather than generate-cards.mjs's regex
// first-person->third-person conversion (which mishandles phrasal verbs,
// contractions, etc.). Only uses facts present in the source record; the
// Algolia company index has no founders field, so founders are never
// mentioned (a known limitation of this data source, not this script).
//
// Usage: node generate-cards-llm.mjs notable.json outDir
// Reads GROQ_API_KEY from claude-tools/.env (same key/pacing as generate-qa.mjs).
// Writes (flushed every 10 successes, always a complete valid JSON array):
//   <outDir>/candidates.json  [{id, name, slug, batch, section, description, filename, markdown}, ...]
//   <outDir>/unclassified.json  same shape, section: null, for human triage
//   <outDir>/generate-log.json  call/failure stats
//   <outDir>/index.md  human-browsable table of contents (name/slug/batch/section/description)
//
// Resumable: if candidates.json/unclassified.json already exist in outDir
// (e.g. from a prior partial run, or because notable.json is still being
// appended to by a concurrently-running filter-notable.mjs), companies
// already present (by id) are skipped rather than re-generated — safe to
// re-run against a growing input file to pick up new arrivals incrementally.

import fs from "node:fs";
import path from "node:path";
import { slugify } from "../../src/slug.js";
import { groqChatJSON } from "./groq-client.mjs";
import { geminiChatJSON, isGeminiAvailable } from "./gemini-client.mjs";

const inputPath = process.argv[2];
const outDir = process.argv[3];
if (!inputPath || !outDir) {
  console.error("usage: node generate-cards-llm.mjs notable.json outDir");
  process.exit(1);
}

// Pacing is adaptive — see groq-client.mjs (real binding constraint is 8000
// TPM for this account/model, not a requests-per-minute cap).

const SECTIONS = ["AI Research & Labs", "AI Infrastructure", "Vertical AI", "Hardware", "New Frontiers"];

function batchShort(b) {
  const m = /^(Winter|Spring|Summer|Fall) (\d{4})/.exec(b || "");
  if (!m) return b;
  const code = { Winter: "W", Spring: "Sp", Summer: "S", Fall: "F" }[m[1]];
  return `${code}${m[2].slice(2)}`;
}

const SYSTEM_PROMPT = `You write cards for a curated 3D YC startup atlas, in a specific house style. You will be given one company's facts from YC's own company directory. Produce a JSON object with these fields:

"description": one short sentence (no trailing period needed, it will be appended to) summarizing what the company does, in the punchy style of a YC one-liner — third person, no "we/our".

"body": 2-3 short paragraphs of third-person prose (no "we/our/us" — use the company name or "it"), ending in complete sentences with proper terminal punctuation. Describe what the company does and why it's notable, written naturally (not a mechanical pronoun-swap). Use ONLY facts present in the provided text below — do not invent founder names (this data source has no founder info, never mention founders), dollar figures, customer names, or claims not present in the text. If the provided "status" is Acquired or Public, this is very likely the main reason the company was judged notable enough to include — state that fact plainly in the body (e.g. "X was acquired in <year if known>" or "X went public") since it's authoritative directory data, but do not invent an acquirer, price, or date that isn't given. If "status" is Inactive, you may similarly note the company has since shut down. You may naturally weave in team_size/location/industries if given and relevant, but don't force it.

"section": pick the single best-fitting section from this exact list: ${JSON.stringify(SECTIONS)}. Use "AI Research & Labs" for frontier AI/AGI research orgs and foundational science labs; "AI Infrastructure" for developer tools, dev infra, databases, security, agent/inference tooling; "Vertical AI" for AI applied to a specific industry or business function (health, legal, finance, sales, ops, etc.) — this is the largest, most general AI-application bucket; "Hardware" for physical hardware, robotics, semiconductors, energy hardware; "New Frontiers" for eclectic, novel, or hard-to-categorize notable companies (biotech, space, defense, gov, novel non-AI domains). If the company is genuinely not AI-related and doesn't fit "Hardware" or "New Frontiers" either (e.g. a plain fintech, HR, or consumer product with no distinctive tech angle), set "section" to null rather than forcing a bad fit — a human will review these.

"usage_question" and "usage_answer": one tailored "frequently asked" Q&A, the way one engineer explains something to another — direct, concrete, no marketing tone, comfortable with a comparison to a named competitor/alternative if the text implies one, or a skeptical question about a claim that sounds too good. One short paragraph for the answer. Only facts from the text below — no invented numbers or competitors.

Respond with ONLY the JSON object, no markdown fences, no other text.

--- COMPANY FACTS ---
`;

function buildUserMsg(c) {
  return `name: ${c.name}
one_liner: ${c.one_liner || ""}
long_description: ${(c.long_description || "").replace(/\r\n/g, "\n").trim()}
batch: ${c.batch}
status: ${c.status}
industries: ${(c.industries || []).join(", ")}
tags: ${(c.tags || []).join(", ")}
team_size: ${c.team_size ?? "unknown"}
all_locations: ${c.all_locations || "unknown"}
website: ${c.website || "unknown"}`;
}

// Try Gemini first (small supplementary quota, mostly unused during
// filtering so there's real headroom left for generation), fall back to
// Groq (primary, with its own model-fallback chain) if unavailable/fails.
async function callLLM(c, log) {
  if (isGeminiAvailable()) {
    try {
      const result = await geminiChatJSON(SYSTEM_PROMPT + buildUserMsg(c));
      log.providerCalls.gemini++;
      return result;
    } catch (err) {
      console.log(`  (Gemini failed/exhausted: ${err.message} — falling back to Groq)`);
    }
  }
  const promptChars = SYSTEM_PROMPT.length + (c.long_description || "").length + 200;
  const estimatedTokens = Math.round(promptChars / 4) + 400; // + room for the JSON completion
  const result = await groqChatJSON(
    [{ role: "user", content: SYSTEM_PROMPT + buildUserMsg(c) }],
    { estimatedTokens, temperature: 0.4 }
  );
  log.providerCalls.groq++;
  return result;
}

function safeFilename(name) {
  return name.replace(/[\/\\:]/g, "-").trim();
}

// Defensive: smaller models occasionally drop the final period on the last
// sentence of a paragraph (observed on gpt-oss-20b). Add one back if a
// paragraph doesn't already end in terminal punctuation.
function ensureTerminalPunctuation(text) {
  return text
    .split(/\n\s*\n/)
    .map(p => (/[.!?]["')]?\s*$/.test(p.trim()) ? p.trim() : p.trim() + "."))
    .join("\n\n");
}

function buildMarkdown(c, r) {
  const bs = batchShort(c.batch);
  const desc = (r.description || c.one_liner || "").replace(/[.!?\s]+$/, "");
  const ycUrl = `https://www.ycombinator.com/companies/${c.slug}`;
  const websiteLine = c.website
    ? `**Website:** ${c.website} | **YC:** ${ycUrl}`
    : `**YC:** ${ycUrl}`;
  return `---
description: ${desc}. YC ${bs}.
---

${websiteLine}

${ensureTerminalPunctuation(r.body.trim())}

_Usage:_

"${r.usage_question}"

"${r.usage_answer}"
`;
}

fs.mkdirSync(outDir, { recursive: true });

const candidatesPath = path.join(outDir, "candidates.json");
const unclassifiedPath = path.join(outDir, "unclassified.json");
const logPath = path.join(outDir, "generate-log.json");

const candidates = fs.existsSync(candidatesPath) ? JSON.parse(fs.readFileSync(candidatesPath)) : [];
const unclassified = fs.existsSync(unclassifiedPath) ? JSON.parse(fs.readFileSync(unclassifiedPath)) : [];
const log = fs.existsSync(logPath)
  ? JSON.parse(fs.readFileSync(logPath))
  : { total: 0, calls: 0, failures: [], flaggedProse: [], providerCalls: { gemini: 0, groq: 0 } };
log.providerCalls ||= { gemini: 0, groq: 0 };

const alreadyDone = new Set([...candidates, ...unclassified].map(e => e.id).filter(id => id !== undefined));
const fullList = JSON.parse(fs.readFileSync(inputPath));
const list = fullList.filter(c => !alreadyDone.has(c.id));
log.total = fullList.length;
if (alreadyDone.size) console.log(`resuming: ${alreadyDone.size} already done, ${list.length} left to process`);

function writeIndex() {
  const all = [...candidates, ...unclassified].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    "# YC 10-year mining — candidate index",
    "",
    `${candidates.length} classified, ${unclassified.length} unclassified (no good section fit), ${all.length} total.`,
    "",
    "| Name | Slug | Batch | Section | Description |",
    "|---|---|---|---|---|",
    ...all.map(e => `| ${e.name} | ${e.slug} | ${e.batch} | ${e.section || "_UNCLASSIFIED_"} | ${(e.description || "").replace(/\|/g, "\\|")} |`),
  ];
  fs.writeFileSync(path.join(outDir, "index.md"), lines.join("\n") + "\n");
}

function flush() {
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2));
  fs.writeFileSync(unclassifiedPath, JSON.stringify(unclassified, null, 2));
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  writeIndex();
}

const FLAGS = [
  [/\bWe\b|\bOur\b|\b[Ww]e\b|\bour\b/, "residual first-person pronoun"],
  // narrow: catches an actually-invented named founder ("Founded by Jane Doe",
  // "co-founder Jane Doe") without false-positiving on generic phrases like
  // "founder-friendly" (seen in real Algolia copy, e.g. Brex's long_description)
  [/\bco-?founders?\b/i, "mentions co-founder(s) (should never — no founder data in source)"],
  [/\bfounded by [A-Z][a-z]+/, "names a founder (should never — no founder data in source)"],
];

for (let i = 0; i < list.length; i++) {
  const c = list[i];
  let r;
  try {
    log.calls++;
    r = await callLLM(c, log);
    if (!r.body || !r.usage_question || !r.usage_answer) throw new Error("incomplete response fields");
  } catch (err) {
    console.error(`✗ ${c.name}: ${err.message}`);
    log.failures.push({ name: c.name, id: c.id, error: err.message });
    continue;
  }

  const md = buildMarkdown(c, r);
  const entry = {
    id: c.id,
    name: c.name,
    slug: slugify(c.name),
    batch: c.batch,
    section: SECTIONS.includes(r.section) ? r.section : null,
    description: (r.description || c.one_liner || "").replace(/[.!?\s]+$/, ""),
    filename: `${safeFilename(c.name)}.md`,
    markdown: md,
  };

  const hits = FLAGS.filter(([re]) => re.test(md)).map(([, label]) => label);
  if (hits.length) { log.flaggedProse.push({ name: c.name, hits }); console.log(`  ! ${c.name}: ${hits.join(", ")}`); }

  if (entry.section) candidates.push(entry);
  else unclassified.push(entry);

  console.log(`✓ ${c.name} -> ${entry.section || "UNCLASSIFIED"}`);

  if ((candidates.length + unclassified.length) % 10 === 0) flush();
}

flush();
console.log(`\nDone. ${candidates.length} classified candidates, ${unclassified.length} unclassified, ${log.failures.length} failures, ${log.calls} calls (gemini: ${log.providerCalls.gemini}, groq: ${log.providerCalls.groq}).`);
const bySection = {};
for (const c of candidates) bySection[c.section] = (bySection[c.section] || 0) + 1;
console.log("by section:", bySection);
