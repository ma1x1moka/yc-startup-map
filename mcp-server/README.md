# yc-startup-map MCP server

Exposes this repo's YC company/founder dataset as MCP tools (`search-startups`,
`get-startup`, `get-batch`, `list-batches`, `list-sections`), so any MCP
client — Claude, ChatGPT, a coding agent — can query it directly instead of
someone hand-copying facts out of `content/*.md`.

Built with [`mcp-use`](https://github.com/mcp-use/mcp-use), deployed on
[Manufact](https://manufact.com) (connect this repo, set **Root directory**
to `mcp-server` in the dashboard — see `docs.manufact.com/dashboard/deployments`).

## Data flow

```
data/graph.json (repo root, generated from content/ by `npm run graph`)
        │
        ▼  scripts/prepare-data.mjs   (npm run prepare-data — also runs
        │                              automatically before dev/build)
        ▼
mcp-server/data/startups.json   (gitignored — always rebuilt, never hand-edited)
```

This server never writes data — it's read-only over whatever
`data/graph.json` says at build time. Freshness comes from upstream:
`.github/workflows/update-yc-batches.yml` runs daily, and merging the PR it
opens (see its description) updates `data/graph.json`; a redeploy here (auto,
on push to `main`, once Manufact's GitHub integration is connected) picks it
up on the next build.

## `batch` is best-effort

`year` (calendar year) comes from `content/year-index.json` via the main
build and is reliable for every entry. `batch` (e.g. `"W26"`, `"Sp26"`) is
parsed with a regex off each card's description text (only cards written by
`claude-tools/yc-api/generate-cards.mjs` reliably have this) — `list-batches`
reports how many entries have no parseable batch so a client can fall back
to filtering by `year` instead.

## Local dev

```bash
npm install
npm run dev     # regenerates data, starts http://localhost:3000/mcp
                 # inspector at /mcp/inspector
```
