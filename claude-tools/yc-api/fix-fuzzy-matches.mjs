// Corrects a bug found in match-existing.mjs's fuzzy-match fallback at
// 10-year/5269-company scale: it substring-searches a candidate name across
// the FULL BODY TEXT of every existing card (not just titles), which was
// fine for the original narrow use case (catching "s2.dev" vs "S2.md" name-
// form drift within one small batch) but produces a huge false-positive
// rate once candidate names are short/common English words (Synth, Canvas,
// Tiny, Struct, Layers, item, ...) checked against 151 cards' worth of free
// prose. Measured on the 2026-08-31 10-year pull: of 314 fuzzy "already
// covered" matches, only ~24 were real name-form duplicates; ~290 were
// false positives (e.g. "Canvas" only matched because Cardboard.md's body
// prose happens to contain the common word "canvas") that would have
// wrongly suppressed genuinely new, not-yet-covered companies.
//
// This does NOT modify match-existing.mjs (kept reusable as-is per project
// convention) — it re-derives a corrected verdict for the fuzzy-match
// subset. First attempt: require candidate-name-vs-existing-TITLE prefix
// containment (rather than substring-anywhere-in-body-text) as a stronger
// duplicate signal. That still wasn't good enough — spot-checking the ~24
// "confirmed" title-prefix hits against their own one_liner text showed
// EVERY one was a coincidental short-prefix collision between two
// unrelated companies from different YC eras (e.g. "Boom" / Winter 2016,
// supersonic jets vs. the existing "Boom AI" card; "Cortex" / Winter 2020,
// an internal dev portal vs. the existing "Cortex AI" card, an unrelated
// F25 robotics-data company). With ~5,000+ short, often single-common-word
// YC company names spanning 10 years, prefix/substring collision is simply
// common and NOT a reliable duplicate signal on its own.
//
// The one fact that IS a reliable, zero-cost duplicate signal here: every
// company currently in content/ was sourced only from Fall 2025 / Winter
// 2026 pulls (this is the "YC F25 & W26 Atlas"), so a candidate record from
// any OTHER batch cannot possibly be a duplicate of existing content
// regardless of name similarity — it's simply a different company that
// happens to share a short name fragment. So: exact normalized-name/former-
// name match (match-existing.mjs's own primary path) is kept as the only
// exclusion signal; the entire fuzzy-substring fallback is treated as
// unreliable and all of it is recovered back into the candidate pool.
//
// Usage: node fix-fuzzy-matches.mjs missing.json rematched.json outDir
// Writes: <outDir>/missing-corrected.json (missing.json + all recovered fuzzy-flagged records)

import fs from "node:fs";
import path from "node:path";

const [missingPath, rematchedPath, outDir] = process.argv.slice(2);
if (!missingPath || !rematchedPath || !outDir) {
  console.error("usage: node fix-fuzzy-matches.mjs missing.json rematched.json outDir");
  process.exit(1);
}

const missing = JSON.parse(fs.readFileSync(missingPath));
const rematched = JSON.parse(fs.readFileSync(rematchedPath));
const fuzzy = rematched.filter(x => x.matchFile.includes("fuzzy:"));

// Need the ORIGINAL full company records for the recovered false positives.
// match-existing.mjs's missing.json only has the genuinely-missing records,
// so we need the full 10-year dump to look up the fuzzy-excluded ones by name.
const allPath = path.join(path.dirname(missingPath), "all-10yr.json");
const all = JSON.parse(fs.readFileSync(allPath));
const byName = new Map();
for (const c of all) (byName.get(c.name) || byName.set(c.name, []).get(c.name)).push(c);

const recovered = [];
let noRecordFound = 0;
for (const x of fuzzy) {
  const records = byName.get(x.name) || [];
  if (!records.length) { noRecordFound++; continue; }
  recovered.push(...records);
}

const seen = new Set(missing.map(c => c.id));
const correctedMissing = [...missing];
let added = 0;
for (const c of recovered) {
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  correctedMissing.push(c);
  added++;
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "missing-corrected.json"), JSON.stringify(correctedMissing));

console.log(`fuzzy matches examined: ${fuzzy.length} (all treated as unreliable and recovered — see file header comment)`);
console.log(`recovered and added back to the missing pool: ${added} (${noRecordFound} had no findable record by name, likely a duplicate-name collision — left excluded)`);
console.log(`corrected missing pool: ${correctedMissing.length} (was ${missing.length})`);
console.log(`-> wrote missing-corrected.json to ${outDir}`);
