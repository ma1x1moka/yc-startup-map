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
        ▼  scripts/prepare-data.mjs   (npm run prepare-data)
        ▼
mcp-server/data/startups.json   (committed — see below)
        │
        ▼  a static `import ... from "./data/startups.json"` in index.ts,
           so mcp-use's build inlines the data into the bundle itself —
           no runtime file path to get wrong once bundled.
```

**`mcp-server/data/startups.json` is committed, not gitignored.** Manufact's
"Root directory: mcp-server" deploy uploads *only that subdirectory* as the
build context — `../data/graph.json` genuinely does not exist there, so
`prepare-data.mjs` silently no-ops on that deploy and the server ships
with whatever snapshot is already committed. Locally, `npm run dev` /
`npm run build` still regenerate it fresh via the `predev`/`prebuild` hooks,
since a full checkout *does* have `../data/graph.json`.

This server never writes data — it's read-only over whatever snapshot it
shipped with. Freshness comes from upstream:
`.github/workflows/update-yc-batches.yml` runs daily and, when it finds new
companies, rebuilds both `data/graph.json` *and* `mcp-server/data/startups.json`
before opening its PR — merging that PR is what a redeploy here (auto, on
push to `main`, once Manufact's GitHub integration is connected) actually
picks up. Editing `content/` by hand needs the same two-step rebuild before
committing: `npm run graph` at the repo root, then `npm run prepare-data`
here.

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
