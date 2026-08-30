// Writes generated.json (from generate-cards.mjs) into content/*.md and
// appends each new slug to the right section in content/sections.json.
// Run `npm run graph && npm run build` afterwards to pick the changes up.
//
// Usage: node write-cards.mjs generated.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const contentDir = path.join(projectRoot, "content");
const sectionsPath = path.join(contentDir, "sections.json");

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: node write-cards.mjs generated.json");
  process.exit(1);
}

const out = JSON.parse(fs.readFileSync(inputPath));
const sections = JSON.parse(fs.readFileSync(sectionsPath));

let written = 0;
for (const o of out) {
  const filename = path.join(contentDir, `${o.name}.md`);
  if (fs.existsSync(filename)) {
    console.warn(`skip (already exists): ${o.name}.md`);
    continue;
  }
  fs.writeFileSync(filename, o.md);
  const sec = sections.sections.find(s => s.title === o.section);
  if (!sec) throw new Error(`unknown section "${o.section}" for ${o.name}`);
  if (!sec.slugs.includes(o.slug)) sec.slugs.push(o.slug);
  written++;
}

fs.writeFileSync(sectionsPath, JSON.stringify(sections, null, 2) + "\n");
console.log(`wrote ${written} files, updated sections.json`);
console.log("next: npm run graph && npm run build");
