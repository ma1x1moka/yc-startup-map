#!/bin/bash
# Scrapes the public YC companies directory page for its Algolia search
# credentials (window.AlgoliaOpts). This is a read-only, search-scoped key
# the site itself ships client-side for its own directory search — no auth
# needed, but the key can rotate, so re-scrape rather than hardcoding it.
#
# Usage: ./fetch-algolia-creds.sh
# Output: JSON {"app":"...","key":"..."} on stdout

set -euo pipefail

curl -s "https://www.ycombinator.com/companies" -A "Mozilla/5.0" \
  | grep -o 'window.AlgoliaOpts = {.*};' \
  | sed -e 's/^window.AlgoliaOpts = //' -e 's/;$//'
