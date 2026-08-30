// Compares a raw YC Algolia company dump (from fetch-batch.sh, one or more
// batches concatenated into a single JSON array) against content/ to find
// companies that are genuinely NOT already covered — while catching
// duplicates hiding under a different name form (e.g. API name "s2.dev"
// vs. existing file "S2.md").
//
// Usage: node match-existing.mjs all.json [outDir]
// Writes: <outDir>/missing.json, <outDir>/rematched.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../../src/slug.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const contentDir = path.join(projectRoot, "content");

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: node match-existing.mjs all.json [outDir]");
  process.exit(1);
}
const outDir = process.argv[3] || path.dirname(inputPath);

const all = JSON.parse(fs.readFileSync(inputPath));
const sections = JSON.parse(fs.readFileSync(path.join(contentDir, "sections.json"))).sections;
const companySlugs = new Set();
for (const s of sections) {
  if (s.title === "Founders") continue;
  for (const sl of s.slugs) companySlugs.add(sl);
}

// strip a trailing domain-like suffix before slugifying, so "s2.dev" -> "s2"
function norm(name) {
  return name
    .toLowerCase()
    .replace(/\.(dev|ai|io|com|co|xyz|app|so|inc|hq)$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

const files = fs.readdirSync(contentDir).filter(f => f.endsWith(".md") && f !== "sections.json");
const existingByKey = new Map();
const existingText = new Map();
for (const f of files) {
  const title = f.replace(/\.md$/, "");
  const slug = slugify(title);
  if (!companySlugs.has(slug)) continue; // only companies, not founders
  existingByKey.set(norm(title), f);
  existingText.set(slug, fs.readFileSync(path.join(contentDir, f), "utf8"));
}

const seen = new Set();
const deduped = all.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));

const missing = [];
const rematched = [];
for (const c of deduped) {
  const keys = [norm(c.name), ...(c.former_names || []).map(norm)];
  let matchFile = keys.map(k => existingByKey.get(k)).find(Boolean);
  if (!matchFile) {
    const nameLower = c.name.toLowerCase();
    if (nameLower.length > 3) {
      for (const [slug, text] of existingText) {
        if (text.toLowerCase().includes(nameLower)) { matchFile = `${slug} (fuzzy:${nameLower})`; break; }
      }
    }
  }
  if (matchFile) rematched.push({ name: c.name, matchFile });
  else missing.push(c);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "missing.json"), JSON.stringify(missing, null, 2));
fs.writeFileSync(path.join(outDir, "rematched.json"), JSON.stringify(rematched, null, 2));

console.log("total unique in dump:", deduped.length);
console.log("existing companies in content/:", existingByKey.size);
console.log("rematched as existing (avoided false 'missing'):", rematched.length);
console.log("genuinely missing:", missing.length);
console.log(`-> wrote missing.json / rematched.json to ${outDir}`);
