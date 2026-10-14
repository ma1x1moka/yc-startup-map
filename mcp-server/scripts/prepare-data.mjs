// data/graph.json (repo root) -> mcp-server/data/startups.json
//
// The site's graph.json carries layout/edge/render fields (3D positions,
// bezier controls, inDegree) that an MCP client has no use for and that
// bloat every tool response. This strips those out and adds a best-effort
// `batch` (e.g. "W26") parsed from the description, which build-graph.mjs
// does not emit as a structured field today.
//
// Run via `npm run prepare-data` (also runs automatically before dev/build)
// whenever content/ changes and data/graph.json gets rebuilt.
//
// Manufact's "Root directory: mcp-server" setting uploads only this
// subdirectory as the build context — ../data/graph.json genuinely does not
// exist there, so this is a normal, expected skip on that deploy, not an
// error: it silently reuses whatever mcp-server/data/startups.json is
// already committed. That file therefore has to be committed (see
// .gitignore) and refreshed by hand (or by CI) after editing content/,
// unlike data/graph.json itself which a full local build always rebuilds.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mcpServerRoot = join(here, "..");
const repoRoot = join(mcpServerRoot, "..");
const graphPath = join(repoRoot, "data", "graph.json");

let graphRaw;
try {
  graphRaw = await readFile(graphPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log("prepare-data: ../data/graph.json not present (isolated build context) — keeping the committed mcp-server/data/startups.json as-is.");
  process.exit(0);
}
const graph = JSON.parse(graphRaw);

const sectionTitleByIndex = new Map(graph.sections.map((s) => [s.index, s.title]));

// Matches claude-tools/yc-api/generate-cards.mjs's SEASON_CODE: W/Sp/S/F
// (Sp for Spring, disambiguated from Summer's long-established "S").
function parseBatch(description) {
  const m = (description || "").match(/\bYC ((?:Sp|[WSF])\d{2})\b/);
  return m ? m[1] : undefined;
}

const startups = graph.nodes.map((n) => ({
  slug: n.slug,
  title: n.title,
  description: n.description,
  prose: n.prose,
  aliases: n.aliases,
  links: n.links,
  section: sectionTitleByIndex.get(n.section),
  kind: sectionTitleByIndex.get(n.section) === "Founders" ? "founder" : "company",
  year: n.year,
  batch: parseBatch(n.description),
}));

const out = {
  generatedFrom: "data/graph.json",
  generatedAt: new Date().toISOString(),
  count: startups.length,
  startups,
};

await mkdir(join(mcpServerRoot, "data"), { recursive: true });
await writeFile(join(mcpServerRoot, "data", "startups.json"), JSON.stringify(out));

const withBatch = startups.filter((s) => s.batch).length;
console.log(
  `mcp-server/data/startups.json  ${startups.length} entries  (${withBatch} with a parsed batch tag)`
);
