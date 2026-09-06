// Step 2 of the founders pipeline: given the raw per-company founders
// extracted by extract-founders.mjs, dedupe founders by user_id (the same
// person can co-found more than one YC company across the 10-year window),
// then for each unique founder search the web (Gemini grounded search,
// falling back to Groq's groq/compound) for their university and
// approximate birth year. Never fabricates — a field is only kept if the
// model's answer wasn't literally "unknown" and (when given) confidence
// wasn't "low".
//
// Usage: node enrich-founders.mjs foundersRaw.json notable.json outDir
// Reads GROQ_API_KEY/GEMINI_API_KEY from claude-tools/.env.
// Writes (flushed every 5 successes):
//   <outDir>/enriched.json   [{user_id, full_name, title, founder_bio,
//     twitter_url, linkedin_url, companies:[{slug,name,one_liner}],
//     university, university_url, birth_year, search_status, search_provider}]
//   <outDir>/enrich-log.json  call/failure/provider stats
//
// Resumable: skips user_ids already present in enriched.json.

import fs from "node:fs";
import path from "node:path";
import {
  isGeminiSearchAvailable, geminiSearchGrounded,
  groqCompoundSearch, sleep,
} from "./search-clients.mjs";

const rawPath = process.argv[2];
const notablePath = process.argv[3];
const outDir = process.argv[4];
if (!rawPath || !notablePath || !outDir) {
  console.error("usage: node enrich-founders.mjs foundersRaw.json notable.json outDir");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
const notable = JSON.parse(fs.readFileSync(notablePath, "utf8"));
const companyBySlug = new Map(notable.map(c => [c.slug, c]));

// Build unique-founder map.
const founders = new Map(); // user_id -> record
for (const [slug, list] of Object.entries(raw)) {
  const c = companyBySlug.get(slug);
  for (const f of list) {
    if (!f.user_id) continue;
    let rec = founders.get(f.user_id);
    if (!rec) {
      rec = {
        user_id: f.user_id,
        full_name: f.full_name,
        title: f.title,
        founder_bio: f.founder_bio || "",
        twitter_url: f.twitter_url || "",
        linkedin_url: f.linkedin_url || "",
        companies: [],
      };
      founders.set(f.user_id, rec);
    }
    // Prefer a non-empty bio/socials if an earlier company had blanks.
    if (!rec.founder_bio && f.founder_bio) rec.founder_bio = f.founder_bio;
    if (!rec.twitter_url && f.twitter_url) rec.twitter_url = f.twitter_url;
    if (!rec.linkedin_url && f.linkedin_url) rec.linkedin_url = f.linkedin_url;
    if (!rec.companies.some(x => x.slug === slug)) {
      rec.companies.push({
        slug,
        name: c?.name || slug,
        one_liner: c?.one_liner || "",
      });
    }
  }
}

console.log(`${founders.size} unique founders across ${Object.keys(raw).length} companies`);

const outPath = path.join(outDir, "enriched.json");
const logPath = path.join(outDir, "enrich-log.json");
const enriched = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : [];
const log = fs.existsSync(logPath)
  ? JSON.parse(fs.readFileSync(logPath, "utf8"))
  : { total: 0, done: 0, found: 0, unknown: 0, failed: 0, providerCalls: { gemini: 0, groq: 0 }, failures: [], geminiDeadSince: null };
log.total = founders.size;
log.providerCalls ||= { gemini: 0, groq: 0 };

const doneIds = new Set(enriched.map(e => e.user_id));
const todo = [...founders.values()].filter(f => !doneIds.has(f.user_id));
console.log(`${doneIds.size} already enriched, ${todo.length} left`);

function flush() {
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

function buildPrompt(f) {
  const companyLines = f.companies
    .map(c => `- ${c.name}: ${c.one_liner || "(no description)"}`)
    .join("\n");
  return `You are a careful research assistant. Search the web for real, verifiable facts about this specific person — a startup founder who went through Y Combinator. Do NOT guess or fabricate; if you cannot find real information, say "unknown".

Name: ${f.full_name}
Role: ${f.title || "Founder"}
Company/companies they founded (use this to disambiguate from other people with the same name):
${companyLines}
Bio (from YC's own profile, may help disambiguate): ${f.founder_bio || "(none given)"}

Find:
1. Their university/college (undergraduate or most notable degree is fine).
2. Their approximate birth year. If you can only find their age, convert it to an approximate birth year using 2026 as the current year.

Reply ONLY in this exact format, one field per line, no other commentary:
UNIVERSITY: <official name, or literally "unknown">
UNIVERSITY_URL: <official homepage url of that university, or literally "unknown">
BIRTH_YEAR: <4-digit year, or literally "unknown">
CONFIDENCE: <high, medium, or low — how confident you are this is the RIGHT person, not a namesake>`;
}

function parseResponse(text) {
  const get = (label) => {
    const m = new RegExp(`${label}\\s*:\\s*(.+)`, "i").exec(text);
    if (!m) return null;
    // Compound/Gemini often bold the label AND leave "**" glued to the
    // start of the value (e.g. "**UNIVERSITY:** X") — strip stray leading
    // asterisks/whitespace from the captured value, iterating since a
    // single pass can leave "* X" behind ("**" then a lone "*" + space).
    let v = m[1].trim();
    while (/^\*/.test(v)) v = v.replace(/^\*+\s*/, "").trim();
    // Also drop a trailing markdown artifact if the model closed the line
    // with stray asterisks (rare, but seen on some paragraph-final bolds).
    v = v.replace(/\*+$/, "").trim();
    return v || null;
  };
  let university = get("UNIVERSITY");
  let universityUrl = get("UNIVERSITY_URL");
  let birthYearRaw = get("BIRTH_YEAR");
  let confidence = (get("CONFIDENCE") || "").toLowerCase();

  if (university && /^unknown$/i.test(university)) university = null;
  if (universityUrl && /^unknown$/i.test(universityUrl)) universityUrl = null;
  if (universityUrl && !/^https?:\/\//i.test(universityUrl)) universityUrl = null;

  let birthYear = null;
  if (birthYearRaw && !/unknown/i.test(birthYearRaw)) {
    const ym = /\b(19[3-9]\d|20[0-1]\d)\b/.exec(birthYearRaw);
    if (ym) birthYear = Number(ym[1]);
  }

  // Drop everything if the model explicitly flagged low confidence in
  // person-identity match — better no data than a wrong-person's data.
  if (confidence === "low") { university = null; universityUrl = null; birthYear = null; }

  return { university, universityUrl, birthYear, confidence: confidence || null };
}

async function searchOne(f, log) {
  const prompt = buildPrompt(f);
  if (isGeminiSearchAvailable()) {
    try {
      const text = await geminiSearchGrounded(prompt);
      log.providerCalls.gemini++;
      return { text, provider: "gemini" };
    } catch (err) {
      console.log(`  (Gemini grounded failed/exhausted for ${f.full_name}: ${err.message})`);
      if (!log.geminiDeadSince) log.geminiDeadSince = new Date().toISOString();
    }
  }
  const text = await groqCompoundSearch(prompt);
  log.providerCalls.groq++;
  return { text, provider: "groq/compound" };
}

for (let i = 0; i < todo.length; i++) {
  const f = todo[i];
  console.log(`[${i + 1}/${todo.length}] searching: ${f.full_name} (${f.companies.map(c => c.name).join(", ")})`);
  let entry;
  try {
    const { text, provider } = await searchOne(f, log);
    const parsed = parseResponse(text);
    entry = {
      ...f,
      university: parsed.university || undefined,
      university_url: parsed.universityUrl || undefined,
      birth_year: parsed.birthYear || undefined,
      search_status: (parsed.university || parsed.birthYear) ? "found" : "unknown",
      search_provider: provider,
    };
    log.found += entry.search_status === "found" ? 1 : 0;
    log.unknown += entry.search_status === "unknown" ? 1 : 0;
    console.log(`  -> [${provider}] university=${parsed.university || "unknown"} birth_year=${parsed.birthYear || "unknown"} confidence=${parsed.confidence || "?"}`);
  } catch (err) {
    // A TPD (daily-cap) cooldown is a whole-process condition, not a
    // per-founder one — every remaining founder this run would hit the
    // exact same wall instantly (search-clients.mjs fails fast during the
    // cooldown, no network call). Rather than burning through the entire
    // remaining todo list logging ~identical failures (and the outer
    // orchestrator restarting this script every few seconds, doing the
    // same full sweep again), stop this run's loop now — the orchestrator
    // will just wait and try again later, same as any other stall.
    if (/TPD/i.test(err.message)) {
      console.log(`  ✗ ${err.message}\n  (stopping this run early — daily cap needs real time to recover, not more attempts)`);
      break;
    }
    console.log(`  ✗ failed: ${err.message}`);
    log.failed++;
    log.failures.push({ user_id: f.user_id, name: f.full_name, error: err.message });
    // Deliberately NOT pushed to `enriched` / doneIds: a failure here is
    // presumed transient (rate limits, a timeout) rather than permanent, so
    // leaving the id out of doneIds means the next resumed run retries it
    // naturally instead of it being stuck "done" with no data forever.
    continue;
  }
  enriched.push(entry);
  log.done++;
  // Flush after every single success, not just every N: each success here
  // is expensive (a rate-limited web-search call that can take minutes
  // under contention), so losing several of them to a watchdog restart
  // between flushes would waste real quota, not just time.
  flush();
}

flush();
console.log(`\nDone. ${enriched.length}/${founders.size} founders processed. found=${log.found} unknown=${log.unknown} failed=${log.failed}. providerCalls=${JSON.stringify(log.providerCalls)}`);
