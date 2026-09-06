# claude-tools

Working scripts written by Claude while helping on this project, kept here so
they don't have to be re-derived (and re-tokened) from scratch each session.
Not part of the shipped site — `pipeline/` is the real content->graph build;
this is upstream of that, for pulling and vetting new source content.

## yc-api/

Pulls fresh company data from the same public Algolia index the
ycombinator.com/companies directory itself uses client-side (a read-only,
search-scoped key — no login needed, but re-scrape rather than hardcoding the
key since it can rotate).

### data/ — the data lake

`yc-api/data/*.json` holds **raw, untouched snapshots** of each batch pull,
named `{batch-slug}-{YYYY-MM-DD}.json` (e.g. `fall-2025-2026-08-30.json`).
These are committed and never edited in place — a new pull writes a new
dated file, it doesn't overwrite the old one. This is the source of truth
everything else (generated.json, the markdown cards) derives from: if a
downstream script has a bug, or the API schema shifts, you can always
re-derive from a known-good snapshot instead of re-fetching (and instead of
trusting whatever's live on YC's site *today*).

Costs ~0.4-0.5MB per batch per pull — acceptable for the reproducibility this
buys, but don't pull-and-commit on every session; only snapshot when you're
about to actually run the pipeline below.

Pipeline, in order:

```bash
# 1. pull a batch snapshot (repeat per batch, e.g. "Fall 2025", "Winter 2026")
DATE=$(date +%F)
./claude-tools/yc-api/fetch-batch.sh "Fall 2025" "claude-tools/yc-api/data/fall-2025-${DATE}.json"
./claude-tools/yc-api/fetch-batch.sh "Winter 2026" "claude-tools/yc-api/data/winter-2026-${DATE}.json"
node -e "
const fs = require('fs');
const files = fs.readdirSync('claude-tools/yc-api/data').filter(f => f.endsWith('-${DATE}.json'));
const all = files.flatMap(f => JSON.parse(fs.readFileSync('claude-tools/yc-api/data/' + f)).hits);
fs.writeFileSync('/tmp/all.json', JSON.stringify(all));
"

# 2. find what's genuinely not in content/ yet (catches "s2.dev" vs "S2.md" etc.)
node claude-tools/yc-api/match-existing.mjs /tmp/all.json /tmp/yc-out

# 3. draft markdown cards from the missing ones (money/ARR/raise-mention filter by default; --all for everyone)
node claude-tools/yc-api/generate-cards.mjs /tmp/yc-out/missing.json /tmp/yc-out

# 4. review /tmp/yc-out/generated.json by hand, THEN write it
node claude-tools/yc-api/write-cards.mjs /tmp/yc-out/generated.json

# 5. rebuild
npm run graph && npm run build
```

Known limitations of `generate-cards.mjs`'s prose generator (it's a
first-person -> third-person regex pass over `long_description`, not a
per-company rewrite):
- phrasal verbs break ("We reverse engineer X" -> "X reverses engineer X") —
  grep generated.json for "reverses " / other oddities before writing
- no founder names, funding figures, or cross-links — the Algolia company
  index doesn't carry founders; that lives on each company's own
  ycombinator.com/companies/{slug} page (a per-company fetch, not in this
  index) if it's ever worth pulling
- section classification (`classify()`) is a keyword heuristic — spot-check
  the printed breakdown before writing

Last real run: 2026-08-27, added 54 companies (see git log "Add 51/54
companies from YC API"). 2026-08-31: pulled 25 more batches (Winter 2016 -
Fall 2026, ~10 years), 5,269 companies total across 27 batches.

### generate-qa.mjs — the "intelligence" step

Replaces a card's templated `_Usage:_` Q&A with one tailored to what that
specific company's text actually emphasizes — a script can't judge that, an
LLM call per company can. Needs `GROQ_API_KEY` in `claude-tools/.env`.

```bash
node claude-tools/yc-api/generate-qa.mjs "Company Name.md"   # one card
node claude-tools/yc-api/generate-qa.mjs --all               # every card
node claude-tools/yc-api/generate-qa.mjs --from-file list.txt  # from a list
```

**Provider history (read before reaching for Gemini again):** this used
Google's Gemini API first. Its free tier turned out to be 20 requests/DAY
per project for `gemini-3.6-flash` (Google cut it from 250 on 2025-12-07,
citing abuse) — not a per-minute limit as the first 429 message's short
retry-delay misleadingly suggested. Rotating 3 personal Google accounts'
keys to multiply that quota mechanically works (quota is scoped per-project,
not per-key), but Google's ToS explicitly bans multi-account quota
circumvention, and a March 2026 anti-abuse crackdown has been zeroing out
flagged accounts' free-tier quota entirely. Switched to **Groq**
(api.groq.com, OpenAI-compatible endpoint, single free account, no card) —
14,400 requests/day, no multi-account gray area needed. See git log
2026-08-31 for the full incident if this comes up again.
