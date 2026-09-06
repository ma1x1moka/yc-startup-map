// Step 1 of the founders pipeline: for each notable company, fetch its
// public YC company page and pull the embedded `founders` array out of the
// HTML-entity-encoded JSON blob YC ships inline in the page (there is no
// documented API for this — Algolia's company index, used by
// filter-notable.mjs, has no founders field at all).
//
// The page contains a literal substring `&quot;founders&quot;:[...]` inside
// a much larger encoded JSON payload. We locate that marker, HTML-unescape
// a window around it, then bracket-match from the `[` to find the exact end
// of the array (rather than trying to regex the whole blob), and JSON.parse
// just that slice.
//
// Fields kept per founder: user_id (dedup key), full_name, title,
// founder_bio, twitter_url, linkedin_url. avatar_thumb_url (a presigned S3
// URL, ~1hr expiry) and has_email/latest_yc_company are discarded — see
// README in staging-10yr/founders/ for why (never persisted, would rot or
// bloat the self-contained build).
//
// Usage: node extract-founders.mjs notable.json outFile.json
// Resumable: skips slugs already present as keys in outFile.json (whether
// they had founders or not — a company can genuinely have zero listed
// founders on its page, that's a valid, cached result, not a thing to
// retry). Flushes every 20 companies.

import fs from "node:fs";

const inputPath = process.argv[2];
const outPath = process.argv[3];
if (!inputPath || !outPath) {
  console.error("usage: node extract-founders.mjs notable.json outFile.json");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DELAY_MS = 1200;

// Generic HTML entity decoder: named entities we've actually observed plus
// numeric decimal/hex entities (accented names etc. could plausibly use
// these even though the sample page didn't).
const NAMED = { quot: '"', amp: "&", apos: "'", lt: "<", gt: ">", nbsp: " " };
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(quot|amp|apos|lt|gt|nbsp);/g, (_, n) => NAMED[n]);
}

function extractFounders(html) {
  const marker = "&quot;founders&quot;:[";
  const idx = html.indexOf(marker);
  if (idx === -1) return null; // no founders block on this page
  // Grab a generous window; bracket-match will find the true end. Company
  // pages with many founders + long bios can run long, so keep this large.
  const windowRaw = html.slice(idx, idx + 40000);
  const decoded = decodeEntities(windowRaw);
  const start = decoded.indexOf("[");
  if (start === -1) return null;
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < decoded.length; i++) {
    const c = decoded[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null; // window too small — shouldn't happen at 40k, but don't crash
  const arrText = decoded.slice(start, end + 1);
  let parsed;
  try {
    parsed = JSON.parse(arrText);
  } catch (err) {
    throw new Error(`founders array JSON.parse failed: ${err.message}`);
  }
  return parsed.map(f => ({
    user_id: f.user_id,
    full_name: f.full_name,
    title: f.title,
    founder_bio: f.founder_bio || "",
    twitter_url: f.twitter_url || "",
    linkedin_url: f.linkedin_url || "",
  }));
}

const notable = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const results = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
const log = { total: notable.length, fetched: 0, withFounders: 0, noFounders: 0, failures: [] };

const todo = notable.filter(c => !(c.slug in results));
console.log(`${Object.keys(results).length} already done, ${todo.length} left to fetch`);

function flush() {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
}

for (let i = 0; i < todo.length; i++) {
  const c = todo[i];
  const url = `https://www.ycombinator.com/companies/${c.slug}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.log(`✗ ${c.slug}: HTTP ${res.status}`);
      log.failures.push({ slug: c.slug, error: `HTTP ${res.status}` });
      // Don't mark as done — leave for a retry on the next run. Sleep and continue.
      await sleep(DELAY_MS);
      continue;
    }
    const html = await res.text();
    const founders = extractFounders(html);
    results[c.slug] = founders || [];
    log.fetched++;
    if (founders && founders.length) log.withFounders++; else log.noFounders++;
    console.log(`✓ ${c.slug}: ${founders ? founders.length : 0} founder(s)`);
  } catch (err) {
    console.log(`✗ ${c.slug}: ${err.message}`);
    log.failures.push({ slug: c.slug, error: err.message });
  }
  if ((i + 1) % 20 === 0) {
    flush();
    fs.writeFileSync(outPath.replace(/\.json$/, "-log.json"), JSON.stringify(log, null, 2));
  }
  await sleep(DELAY_MS);
}

flush();
fs.writeFileSync(outPath.replace(/\.json$/, "-log.json"), JSON.stringify(log, null, 2));
console.log(`\nDone. ${Object.keys(results).length}/${notable.length} companies have a cached result. ${log.failures.length} failures this run.`);
