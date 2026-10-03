// Turns raw YC Algolia company records (as produced by match-existing.mjs's
// missing.json) into draft content/*.md cards in this project's house style:
// frontmatter description, Website/YC links, a third-person body derived
// from long_description, and a closing _Usage:_ Q&A. Only uses facts present
// in the API payload — no invented founders, funding figures, or links.
//
// Usage: node generate-cards.mjs missing.json [--all] [outDir]
//   --all   skip the "notable" (money/ARR/raise mention) filter, include everyone
//
// Writes: <outDir>/generated.json  (name, slug, section, md per company)
// Review generated.json before running write-cards.mjs.

import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: node generate-cards.mjs missing.json [--all] [outDir]");
  process.exit(1);
}
const includeAll = process.argv.includes("--all");
const outDir = process.argv.find((a, i) => i > 2 && !a.startsWith("--")) || path.dirname(inputPath);

const list = JSON.parse(fs.readFileSync(inputPath));

function quality(c) {
  if (c.status && !["Active", "Public", "Acquired"].includes(c.status)) return false;
  if (!c.long_description || c.long_description.length < 80) return false;
  return true;
}
function notable(c) {
  return /\$[0-9]|ARR|raised|revenue|million|valuation/i.test(c.long_description || "");
}

const candidates = list.filter(quality).filter(c => includeAll || notable(c));

// Spring is disambiguated as "Sp" (not "S") because Summer already claimed
// "S" across every existing card in content/ (S16..S26) before Spring
// batches existed (Spring 2025 was YC's first) — reusing "S" for Spring
// would make e.g. "S26" ambiguous between Summer 2026 and Spring 2026.
const SEASON_CODE = { Winter: "W", Spring: "Sp", Summer: "S", Fall: "F" };
function batchShort(b) {
  const m = b.match(/^(Winter|Spring|Summer|Fall) (\d{4})$/);
  if (!m) return b;
  return `${SEASON_CODE[m[1]]}${m[2].slice(2)}`;
}

const VERB_3P = {
  build: "builds", use: "uses", are: "is", help: "helps", provide: "provides",
  integrate: "integrates", make: "makes", create: "creates", offer: "offers",
  enable: "enables", give: "gives", deliver: "delivers", need: "needs",
  believe: "believes", work: "works", ship: "ships", sell: "sells",
  connect: "connects", power: "powers", bring: "brings", turn: "turns",
  detect: "detects", monitor: "monitors", protect: "protects", automate: "automates",
  simulate: "simulates", solve: "solves", let: "lets", allow: "allows",
  transform: "transforms", replace: "replaces", combine: "combines",
  handle: "handles", run: "runs", train: "trains", process: "processes",
};

const MODALS = new Set(["can", "could", "will", "would", "shall", "should", "may", "might", "must"]);
function conjugate(verb) {
  const lower = verb.toLowerCase();
  if (MODALS.has(lower)) return verb; // modals are invariant in 3rd person: "it can", not "it cans"
  return VERB_3P[lower] || (lower.endsWith("s") ? verb : verb + "s");
}

// NOTE: known limitations (unfixed — not observed in real data yet, so not
// worth the complexity per YAGNI): phrasal verbs ("We reverse engineer X" ->
// "{Name} reverses engineer X" — grep output for "reverses " etc.), and
// negated contractions ("we don't/won't/can't X" — \w+ stops at the
// apostrophe, would produce "it dons't X"). Fix if/when they actually show up.
function thirdPerson(text, name) {
  let usedName = false;
  const subject = () => (usedName ? "it" : ((usedName = true), name));

  // normalize smart apostrophes (source text uses ’, e.g. "We're") before matching
  let result = text.replace(/[‘’]/g, "'");

  const CONTRACTIONS = { "'re": "is", "'ve": "has", "'ll": "will", "'d": "would" };
  result = result.replace(/\bWe('re|'ve|'ll|'d)\b/g, (m, c) => `${subject()} ${CONTRACTIONS[c]}`);
  result = result.replace(/\bwe('re|'ve|'ll|'d)\b/g, (m, c) => `it ${CONTRACTIONS[c]}`);

  result = result.replace(/\bWe\s+(\w+)/g, (m, verb) => `${subject()} ${conjugate(verb)}`);
  result = result.replace(/\bOur\b/g, () => (usedName ? "its" : ((usedName = true), name + "'s")));
  result = result.replace(/\bwe\s+(\w+)/g, (m, verb) => `it ${conjugate(verb)}`);
  result = result.replace(/\bour\b/g, "its");
  result = result.replace(/(^|[.!?]\s+)(it|its)\b/g, (m, pre, word) => pre + word[0].toUpperCase() + word.slice(1));

  // defensive cleanup: squash any accidental "word word" duplication,
  // whether introduced by this conversion or already present in the source
  // (e.g. a YC company's own typo'd one_liner). Same-line only ([ \t], not
  // \s) — \s would also match a paragraph-break newline and wrongly merge
  // two different paragraphs that happen to end/start with the same word.
  result = result.replace(/\b(\w+)[ \t]+\1\b/g, "$1");

  return result;
}

function cleanBody(desc, name) {
  const text = desc.replace(/\r\n/g, "\n");
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const narrative = paras.filter(p => !/^[-*•]/.test(p));
  const chosen = (narrative.length ? narrative : paras).slice(0, 3);
  return thirdPerson(chosen.join("\n\n"), name);
}

// Must return an exact title from content/sections.json — write-cards.mjs
// throws if classify() names a section that doesn't exist there. This list
// drifted out of sync with sections.json once before (classify() still said
// "Hardware"/"AI Infrastructure"/"Vertical AI" after the site reorganized
// into ten named sections) and crashed the first automated run
// (check-and-update-batches.mjs) on the first Hardware-tagged company it
// saw. Keep these strings matching content/sections.json's titles.
function classify(c) {
  const tags = (c.tags || []).map(t => t.toLowerCase());
  const inds = (c.industries || []).map(t => t.toLowerCase());
  const text = (c.one_liner + " " + c.long_description).toLowerCase();
  const has = (...words) => words.some(w => tags.includes(w) || inds.includes(w));

  if (has("hardware", "robotics", "drones", "space technology", "aerospace", "manufacturing and robotics", "3d printing", "advanced materials", "industrials") || /\brobot|drone|silicon|semiconductor|3d print/.test(text)) {
    return "Hardware, Robotics & Industrials";
  }
  if (has("fintech", "insurance", "finance", "asset management", "banking", "payments") || /\bfintech|insurance|payments?\b/.test(text)) {
    return "Fintech & Payments";
  }
  if (has("healthcare", "health", "biotech", "health & wellness", "life sciences", "medical") || /healthcare|biotech|\bclinical\b|\bpatient/.test(text)) {
    return "Healthcare & Biotech";
  }
  if (has("real estate", "housing", "construction", "real estate and construction")) {
    return "Real Estate & Construction";
  }
  if (has("supply chain", "logistics", "climate", "energy", "transportation") || /supply chain|logistics|\bclimate\b|renewable/.test(text)) {
    return "Logistics, Supply Chain & Climate";
  }
  if (has("education", "ai-enhanced learning", "edtech") || /\beducation\b|learning platform|edtech/.test(text)) {
    return "Education";
  }
  if (/defense|drones? that kill|mosquito|space solar|life.sciences|immigration law|government affairs|collectible|private markets/.test(text)) {
    return "New Frontiers";
  }
  if (has("infrastructure", "developer tools", "devops", "api", "databases", "dev tools", "open source", "cybersecurity", "security") || /\bapi\b|infrastructure|reliability|inference os|agent reliability|devsecops|monitor/.test(text)) {
    return "AI & Developer Tools";
  }
  if (has("human resources", "hr tech", "sales", "marketing", "operations", "enterprise software", "b2b", "smb") || /\bhr\b|\bsales\b|\bmarketing\b|enterprise software|\boperations\b/.test(text)) {
    return "Enterprise & Productivity";
  }
  return "Consumer & Marketplace";
}

const out = candidates.map(c => {
  const section = classify(c);
  const body = cleanBody(c.long_description || c.one_liner, c.name);
  const loc = c.all_locations ? c.all_locations.split(",")[0].trim() : "";
  const bs = batchShort(c.batch);
  const oneLiner = thirdPerson(c.one_liner.trim().replace(/[.!?\s]+$/, ""), c.name);
  const md = `---
description: ${oneLiner}. YC ${bs}.
---

**Website:** ${c.website || ""} | **YC:** https://www.ycombinator.com/companies/${c.slug}

${body}

_Usage:_

"What does ${c.name} do?"

"${oneLiner}. ${bs} batch${loc ? ". " + loc : ""}."
`;
  return { name: c.name, slug: c.slug, section, md };
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "generated.json"), JSON.stringify(out, null, 2));

const bySection = {};
for (const o of out) (bySection[o.section] ||= []).push(o.name);
console.log(`${out.length} candidates (of ${list.length} missing) -> ${outDir}/generated.json`);
for (const [s, names] of Object.entries(bySection)) console.log(`  ${s} (${names.length}): ${names.join(", ")}`);

// self-check: flag known failure signatures so they don't need a separate
// manual grep pass afterward. Not exhaustive (see limitations note above) —
// a clean report here is not proof of clean prose, just of no *known* bug.
const FLAGS = [
  [/\bWe\b|\bOur\b|\bwe\b|\bour\b/, "residual first-person pronoun"],
  [/\b(cans|coulds|wills|woulds|shalls|shoulds|mays|mights|musts)\b/, "modal verb wrongly conjugated"],
  [/[!?]\./, "double terminal punctuation"],
  // same-line only ([ \t], not \s) — \s would span the URL-slug -> body
  // newline and flag "companies/o11\n\no11 is..." as a false "duplicate"
  [/\b(\w+)[ \t]+\1\b/, "duplicate consecutive word"],
];
let flagged = 0;
for (const o of out) {
  const hits = FLAGS.filter(([re]) => re.test(o.md)).map(([, label]) => label);
  if (hits.length) { flagged++; console.log(`  ! ${o.name}: ${hits.join(", ")}`); }
}
console.log(flagged ? `\n${flagged} card(s) flagged above — check by hand.` : "\nNo known failure signatures found.");
console.log("Review generated.json before running write-cards.mjs regardless.");
