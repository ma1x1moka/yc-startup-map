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

const batchShort = b => (b === "Fall 2025" ? "F25" : b === "Winter 2026" ? "W26" : b);

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

// NOTE: known limitation — "We reverse engineer X" becomes "{Name} reverses
// engineer X" (phrasal verbs aren't handled). Grep the output for "reverses "
// and similar before writing files if the source text uses phrasal verbs.
function thirdPerson(text, name) {
  let usedName = false;
  let result = text.replace(/\bWe('re)?\s+(\w+)/g, (m, contraction, verb) => {
    const subject = usedName ? "it" : ((usedName = true), name);
    if (contraction) return `${subject} is ${verb}`;
    const lower = verb.toLowerCase();
    const conjugated = VERB_3P[lower] || (lower.endsWith("s") ? verb : verb + "s");
    return `${subject} ${conjugated}`;
  });
  result = result.replace(/\bOur\b/g, () => (usedName ? "its" : ((usedName = true), name + "'s")));
  result = result.replace(/\bwe\s+(\w+)/g, (m, verb) => {
    const lower = verb.toLowerCase();
    const conjugated = VERB_3P[lower] || (lower.endsWith("s") ? verb : verb + "s");
    return `it ${conjugated}`;
  });
  result = result.replace(/\bour\b/g, "its");
  result = result.replace(/(^|[.!?]\s+)(it|its)\b/g, (m, pre, word) => pre + word[0].toUpperCase() + word.slice(1));
  return result;
}

function cleanBody(desc, name) {
  const text = desc.replace(/\r\n/g, "\n");
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const narrative = paras.filter(p => !/^[-*•]/.test(p));
  const chosen = (narrative.length ? narrative : paras).slice(0, 3);
  return thirdPerson(chosen.join("\n\n"), name);
}

function classify(c) {
  const tags = (c.tags || []).map(t => t.toLowerCase());
  const inds = (c.industries || []).map(t => t.toLowerCase());
  const text = (c.one_liner + " " + c.long_description).toLowerCase();
  const has = (...words) => words.some(w => tags.includes(w) || inds.includes(w));

  if (has("hardware", "robotics", "drones", "space technology", "aerospace") || /\brobot|drone|silicon|semiconductor/.test(text)) {
    return "Hardware";
  }
  if (/defense|drones? that kill|mosquito|space solar|life.sciences|immigration law|government affairs|collectible|private markets/.test(text)) {
    return "New Frontiers";
  }
  if (has("infrastructure", "developer tools", "devops", "api", "databases", "dev tools", "open source", "cybersecurity", "security") || /\bapi\b|infrastructure|reliability|inference os|agent reliability|monitor/.test(text)) {
    return "AI Infrastructure";
  }
  return "Vertical AI";
}

const out = candidates.map(c => {
  const section = classify(c);
  const body = cleanBody(c.long_description || c.one_liner, c.name);
  const loc = c.all_locations ? c.all_locations.split(",")[0].trim() : "";
  const bs = batchShort(c.batch);
  const oneLiner = thirdPerson(c.one_liner.trim().replace(/[.\s]+$/, ""), c.name);
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
console.log("\nReview generated.json (esp. body prose) before running write-cards.mjs.");
