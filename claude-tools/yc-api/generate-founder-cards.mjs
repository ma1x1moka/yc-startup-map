// Step 3 of the founders pipeline: turn each enriched founder record
// (enrich-founders.mjs's output) into a house-style "Founders" card,
// matching the format of the 24 hand-written examples in content/ (see
// e.g. content/"Akshay Narisetti.md"): frontmatter with description,
// twitter, linkedin, birth_year, university/university_url (only fields we
// actually have real data for — never a photo or university_logo, per
// project constraints: presigned/per-person avatar URLs would rot or bloat
// the self-contained build, and the UI already falls back to
// generated-initials avatars when photo is absent), then body prose
// (bio-derived, third person) with company links, then an _Usage:_ Q&A.
//
// The "Co-founded [X](./X.md) with [Y](./Y.md)." sentence and the
// Twitter/LinkedIn line are built deterministically in code (not by the
// LLM) so links always use the exact real names/filenames rather than
// something the model could get slightly wrong. The LLM is only asked for:
// description, 2-3 short paragraphs of bio-derived prose, and a tailored
// Usage Q&A — using ONLY facts present in the founder_bio/company
// descriptions/university/birth_year given to it.
//
// Usage: node generate-founder-cards.mjs enriched.json foundersRaw.json outDir
// Reads GROQ_API_KEY from claude-tools/.env (shared model-fallback pool
// with generate-cards-llm.mjs — real, org-scoped contention with that
// concurrently-running sibling script is expected and handled by
// groq-client.mjs's adaptive backoff, not a bug in this script).
//
// Writes (flushed every 10 successes):
//   <outDir>/candidates.json  [{user_id, name, slug, filename, markdown}, ...]
//   <outDir>/generate-log.json
//   <outDir>/index.md

import fs from "node:fs";
import path from "node:path";
import { slugify } from "../../src/slug.js";
import { groqChatJSON } from "./groq-client.mjs";

const enrichedPath = process.argv[2];
const rawPath = process.argv[3];
const outDir = process.argv[4];
if (!enrichedPath || !rawPath || !outDir) {
  console.error("usage: node generate-founder-cards.mjs enriched.json foundersRaw.json outDir");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// enriched.json may not exist yet the first few times the orchestrator's
// periodic cardgen pass runs (enrich-founders.mjs only flushes after its
// first success, which can take a while under quota contention) — treat
// that as "nothing to do yet" rather than crashing.
const enriched = fs.existsSync(enrichedPath) ? JSON.parse(fs.readFileSync(enrichedPath, "utf8")) : [];
const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));

// Map: slug -> [{user_id, full_name}] for co-founder lookups (name only,
// enough to build a link — filename derived the same way as this script
// derives its own founder filenames, so links resolve once that founder's
// card is also generated).
function safeFilename(name) {
  return name.replace(/[\/\\:]/g, "-").trim();
}
function link(name) {
  const fname = safeFilename(name) + ".md";
  return `[${name}](./${encodeURIComponent(fname)})`;
}

function twitterHandle(url) {
  if (!url) return null;
  const m = /(?:x|twitter)\.com\/@?([A-Za-z0-9_]+)/i.exec(url);
  return m ? m[1] : null;
}

const SYSTEM_PROMPT = `You write "Founders" cards for a curated 3D YC startup atlas, in a specific house style. You will be given facts about one YC founder. Produce a JSON object with these fields:

"description": one short sentence (no trailing period needed) summarizing their role — e.g. "Co-founder and CEO of X. Previously built Y." Third person, punchy, YC-bio style.

"body": 2-3 short paragraphs of third-person prose (never "I/we/our" — use their name or "they/he/she" as appropriate given the name), ending in complete sentences with proper terminal punctuation. Elaborate on their background using ONLY the founder_bio and any university/birth_year facts given below — do not invent prior companies, schools, achievements, dollar figures, or credentials not present in the given text. If founder_bio is thin or generic (e.g. just repeats the company name), write a short, honest paragraph rather than padding with invented specifics. Do NOT include a sentence about which company they co-founded/founded — that line is added separately, outside your response. Do NOT include markdown links.

"usage_question" and "usage_answer": one tailored "frequently asked" Q&A about this founder's background or the company they work on, in the style of one engineer explaining something to another — direct, concrete, no marketing tone. Only facts from the text given below. One short paragraph for the answer.

Respond with ONLY the JSON object, no markdown fences, no other text.

--- FOUNDER FACTS ---
`;

function buildUserMsg(f) {
  const companies = f.companies.map(c => `- ${c.name}: ${c.one_liner || "(no description)"}`).join("\n");
  return `full_name: ${f.full_name}
title: ${f.title || "Founder"}
founder_bio: ${(f.founder_bio || "(none given)").replace(/\r\n/g, "\n").trim()}
university: ${f.university || "unknown"}
birth_year: ${f.birth_year || "unknown"}
companies:
${companies}`;
}

async function callLLM(f) {
  const promptChars = SYSTEM_PROMPT.length + (f.founder_bio || "").length + 300;
  const estimatedTokens = Math.round(promptChars / 4) + 400;
  return groqChatJSON(
    [{ role: "user", content: SYSTEM_PROMPT + buildUserMsg(f) }],
    { estimatedTokens, temperature: 0.4 }
  );
}

// Normalizes paragraph breaks AND fixes missing terminal punctuation.
// Splitting on any run of 1+ newlines (not just "\n\n") matters because
// smaller Groq models observed live (e.g. qwen3.8-27b) sometimes separate
// paragraphs with a single "\n" instead of a blank line — a real formatting
// bug seen in generated output (e.g. Angelica Iacovelli's card): markdown
// treats a lone "\n" as a soft line break within the same paragraph, not a
// paragraph break, so without this the 2-3 "short paragraphs" the prompt
// asks for would render as one run-on block instead of matching the house
// style's clearly-separated paragraphs.
function ensureTerminalPunctuation(text) {
  return text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => (/[.!?]["')]?\s*$/.test(p) ? p : p + "."))
    .join("\n\n");
}

function buildFoundedLine(f) {
  // One entry per company this founder is credited on, each noting the
  // other founder(s) of that same company (if any) as links.
  const parts = f.companies.map(c => {
    const others = (raw[c.slug] || [])
      .filter(other => other.user_id !== f.user_id)
      .map(other => other.full_name);
    const companyPhrase = others.length
      ? `${link(c.name)} with ${others.map(n => link(n)).join(" and ")}`
      : link(c.name);
    return { companyPhrase, solo: others.length === 0 };
  });

  if (parts.length === 1) {
    const p = parts[0];
    return p.solo ? `Founded ${p.companyPhrase}.` : `Co-founded ${p.companyPhrase}.`;
  }
  // Multiple companies: "Co-founded [A](...) with X; and founded [B](...)."
  const clauses = parts.map(p => `${p.solo ? "founded" : "co-founded"} ${p.companyPhrase}`);
  const sentence = clauses.join("; and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function buildFrontmatter(f, r) {
  const lines = ["---"];
  const desc = (r.description || "").replace(/[.!?\s]+$/, "");
  lines.push(`description: ${desc}.`);
  const handle = twitterHandle(f.twitter_url);
  if (handle) lines.push(`twitter: ${handle}`);
  if (f.linkedin_url) lines.push(`linkedin: ${f.linkedin_url}`);
  if (f.birth_year) lines.push(`birth_year: ${f.birth_year}`);
  if (f.university) lines.push(`university: ${f.university}`);
  if (f.university_url) lines.push(`university_url: ${f.university_url}`);
  lines.push("---");
  return lines.join("\n");
}

function buildSocialLine(f) {
  const handle = twitterHandle(f.twitter_url);
  const bits = [];
  if (handle) bits.push(`**Twitter:** @${handle}`);
  if (f.linkedin_url) bits.push(`**LinkedIn:** ${f.linkedin_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`);
  return bits.join(" | ");
}

function buildMarkdown(f, r) {
  const fm = buildFrontmatter(f, r);
  const socialLine = buildSocialLine(f);
  const foundedLine = buildFoundedLine(f);
  const body = ensureTerminalPunctuation(r.body.trim());
  const sections = [fm, "", ...(socialLine ? [socialLine, ""] : []), foundedLine, "", body, "", "_Usage:_", "", `"${r.usage_question}"`, "", `"${r.usage_answer}"`];
  return sections.join("\n") + "\n";
}

const candidatesPath = path.join(outDir, "candidates.json");
const logPath = path.join(outDir, "generate-log.json");
const candidates = fs.existsSync(candidatesPath) ? JSON.parse(fs.readFileSync(candidatesPath, "utf8")) : [];
const log = fs.existsSync(logPath)
  ? JSON.parse(fs.readFileSync(logPath, "utf8"))
  : { total: 0, calls: 0, failures: [], flaggedProse: [] };

const doneIds = new Set(candidates.map(e => e.user_id));
const todo = enriched.filter(f => !doneIds.has(f.user_id));
log.total = enriched.length;
console.log(`${doneIds.size} already done, ${todo.length} left to generate`);

function writeIndex() {
  const all = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    "# YC 10-year mining — founders index",
    "",
    `${candidates.length}/${log.total} founder cards generated.`,
    "",
    "| Name | Companies | Description |",
    "|---|---|---|",
    ...all.map(e => `| ${e.name} | ${e.companies} | ${(e.description || "").replace(/\|/g, "\\|")} |`),
  ];
  fs.writeFileSync(path.join(outDir, "index.md"), lines.join("\n") + "\n");
}

function flush() {
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2));
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  writeIndex();
}

const FLAGS = [
  [/\b[Ww]e\b|\b[Oo]ur\b/, "residual first-person pronoun"],
];

for (let i = 0; i < todo.length; i++) {
  const f = todo[i];
  let r;
  try {
    log.calls++;
    r = await callLLM(f);
    if (!r.body || !r.usage_question || !r.usage_answer || !r.description) throw new Error("incomplete response fields");
  } catch (err) {
    console.error(`✗ ${f.full_name}: ${err.message}`);
    log.failures.push({ user_id: f.user_id, name: f.full_name, error: err.message });
    continue;
  }

  const md = buildMarkdown(f, r);
  const hits = FLAGS.filter(([re]) => re.test(md)).map(([, label]) => label);
  if (hits.length) { log.flaggedProse.push({ name: f.full_name, hits }); console.log(`  ! ${f.full_name}: ${hits.join(", ")}`); }

  candidates.push({
    user_id: f.user_id,
    name: f.full_name,
    slug: slugify(f.full_name),
    companies: f.companies.map(c => c.name).join(", "),
    description: (r.description || "").replace(/[.!?\s]+$/, ""),
    filename: `${safeFilename(f.full_name)}.md`,
    markdown: md,
  });
  console.log(`✓ [${i + 1}/${todo.length}] ${f.full_name}`);

  if (candidates.length % 10 === 0) flush();
}

flush();
console.log(`\nDone. ${candidates.length}/${enriched.length} founder cards generated, ${log.failures.length} failures, ${log.calls} calls.`);
