// Daily freshness check for the N most recent YC batches, run by
// .github/workflows/update-yc-batches.yml.
//
// 1. One cheap Algolia facet query (hitsPerPage:0) returns a company count
//    for every batch YC has ever run — no need to hardcode which batches to
//    watch, or to page through hits just to count them.
// 2. Batch names ("Winter 2026") are parsed into a (year, season) order and
//    the N most recent with a real company count (>= MIN_BATCH_SIZE, which
//    excludes YC's placeholder future-batch stubs like "Winter 2027": 1)
//    become "watched" for this run.
// 3. Each watched batch's count is compared against the last-seen count in
//    data/batch-counts.json. Unchanged -> nothing to do.
// 4. A changed batch is re-fetched in full and run through the existing
//    match-existing.mjs -> generate-cards.mjs -> write-cards.mjs pipeline
//    (same one used for manual pulls, see claude-tools/README.md), then
//    npm run graph rebuilds data/graph.json.
//
// This script only *writes into the working tree* (content/*.md,
// content/sections.json, data/graph.json, data/batch-counts.json). It does
// not commit or push — the workflow's create-pull-request step turns
// whatever ends up modified into a PR, so a human reviews the generated
// prose (see claude-tools/README.md's "known limitations" of
// generate-cards.mjs) before it reaches main / gets deployed.
//
// Usage: node check-and-update-batches.mjs [--watch N] [--min-size N]

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const countsPath = join(here, "data", "batch-counts.json");

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
}
const WATCH_N = argValue("--watch", 2);
const MIN_BATCH_SIZE = argValue("--min-size", 5);

const SEASON_ORDER = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };
function parseBatch(name) {
  const m = name.match(/^(Winter|Spring|Summer|Fall) (\d{4})$/);
  if (!m) return null;
  return { name, season: m[1], year: Number(m[2]), rank: Number(m[2]) * 4 + SEASON_ORDER[m[1]] };
}

console.log("Fetching batch facet counts from Algolia...");
const creds = JSON.parse(
  execFileSync(join(here, "fetch-algolia-creds.sh"), { encoding: "utf8" })
);
const res = execFileSync(
  "curl",
  [
    "-s",
    `https://${creds.app}-dsn.algolia.net/1/indexes/YCCompany_production/query`,
    "-H", `X-Algolia-API-Key: ${creds.key}`,
    "-H", `X-Algolia-Application-Id: ${creds.app}`,
    "-H", "Content-Type: application/json",
    "--data", JSON.stringify({ query: "", hitsPerPage: 0, facets: ["batch"], maxValuesPerFacet: 200 }),
  ],
  { encoding: "utf8" }
);
const facets = JSON.parse(res).facets?.batch ?? {};

const parsedBatches = Object.entries(facets)
  .map(([name, count]) => ({ ...parseBatch(name), count }))
  .filter((b) => b.name !== undefined && b.rank !== undefined && b.count >= MIN_BATCH_SIZE)
  .sort((a, b) => b.rank - a.rank);

const watched = parsedBatches.slice(0, WATCH_N);
console.log(`Watching ${WATCH_N} most recent real batches: ${watched.map((b) => `${b.name} (${b.count})`).join(", ")}`);

const priorCounts = existsSync(countsPath) ? JSON.parse(readFileSync(countsPath, "utf8")) : {};
const changed = watched.filter((b) => priorCounts[b.name] !== b.count);

if (changed.length === 0) {
  console.log("No change in watched batches — nothing to do.");
  process.exit(0);
}

// Only persist counts for the batches actually watched this run, so
// batch-counts.json (and the PR diff it produces) only ever changes when
// one of the top-WATCH_N batches actually moved — not on incidental drift
// in some unrelated historical batch this run never looked at.
const nextCounts = { ...priorCounts };
for (const b of watched) nextCounts[b.name] = b.count;
writeFileSync(countsPath, JSON.stringify(nextCounts, null, 2) + "\n");

console.log(`Changed: ${changed.map((b) => `${b.name} ${priorCounts[b.name] ?? "(new)"} -> ${b.count}`).join(", ")}`);

const scratch = mkdtempSync(join(tmpdir(), "yc-batch-check-"));
let totalWritten = 0;
const report = [];

for (const b of changed) {
  const batchOut = join(scratch, b.name.replace(/\s+/g, "-").toLowerCase());
  const rawFile = join(batchOut, "raw.json");
  console.log(`\n=== ${b.name} ===`);

  execFileSync(join(here, "fetch-batch.sh"), [b.name, rawFile], { stdio: "inherit" });
  const hits = JSON.parse(readFileSync(rawFile, "utf8")).hits;
  writeFileSync(join(batchOut, "all.json"), JSON.stringify(hits));

  execFileSync("node", [join(here, "match-existing.mjs"), join(batchOut, "all.json"), batchOut], {
    stdio: "inherit",
  });

  const missingPath = join(batchOut, "missing.json");
  const missingCount = JSON.parse(readFileSync(missingPath, "utf8")).length;
  if (missingCount === 0) {
    report.push(`- **${b.name}**: count changed (${priorCounts[b.name] ?? "new"} -> ${b.count}) but no genuinely new companies after dedup.`);
    continue;
  }

  execFileSync("node", [join(here, "generate-cards.mjs"), missingPath, batchOut], { stdio: "inherit" });
  const generatedPath = join(batchOut, "generated.json");
  const generated = JSON.parse(readFileSync(generatedPath, "utf8"));

  execFileSync("node", [join(here, "write-cards.mjs"), generatedPath], { cwd: repoRoot, stdio: "inherit" });

  totalWritten += generated.length;
  report.push(
    `- **${b.name}**: count changed (${priorCounts[b.name] ?? "new"} -> ${b.count}). Added ${generated.length} card(s): ${generated.map((g) => g.name).join(", ")}`
  );
}

if (totalWritten > 0) {
  console.log("\nRebuilding data/graph.json...");
  execFileSync("npm", ["run", "graph"], { cwd: repoRoot, stdio: "inherit" });
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const summary = `## YC batch check\n\n${report.join("\n")}\n\n${
  totalWritten > 0
    ? "generate-cards.mjs's prose is a regex first-person -> third-person pass, not a per-company rewrite — spot-check the diff for phrasal-verb breakage before merging (see claude-tools/README.md)."
    : "No new content/*.md written."
}\n`;
if (summaryPath) writeFileSync(summaryPath, summary, { flag: "a" });
console.log("\n" + summary);
