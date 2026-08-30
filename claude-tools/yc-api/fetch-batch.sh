#!/bin/bash
# Fetches all companies in one YC batch from the public Algolia index that
# powers ycombinator.com/companies. Read-only, uses a search-scoped key
# (see fetch-algolia-creds.sh) — no login required.
#
# Usage: ./fetch-batch.sh "Fall 2025" out.json
#        ./fetch-batch.sh "Winter 2026" out.json

set -euo pipefail
ORIG_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BATCH="${1:?usage: fetch-batch.sh \"Fall 2025\" out.json}"
OUT="${2:?usage: fetch-batch.sh \"Fall 2025\" out.json}"
# resolve OUT relative to the caller's cwd, since we cd into the script dir next
case "$OUT" in
  /*) : ;;
  *) OUT="$ORIG_DIR/$OUT" ;;
esac
mkdir -p "$(dirname "$OUT")"

cd "$SCRIPT_DIR"

CREDS=$(./fetch-algolia-creds.sh)
APP_ID=$(echo "$CREDS" | node -pe 'JSON.parse(require("fs").readFileSync(0)).app')
API_KEY=$(echo "$CREDS" | node -pe 'JSON.parse(require("fs").readFileSync(0)).key')

curl -s "https://${APP_ID}-dsn.algolia.net/1/indexes/YCCompany_production/query" \
  -H "X-Algolia-API-Key: ${API_KEY}" \
  -H "X-Algolia-Application-Id: ${APP_ID}" \
  -H "Content-Type: application/json" \
  --data "{\"query\":\"\",\"facetFilters\":[[\"batch:${BATCH}\"]],\"hitsPerPage\":1000}" \
  -o "$OUT"

echo "wrote $(node -pe "JSON.parse(require('fs').readFileSync('$OUT')).nbHits") hits to $OUT"
