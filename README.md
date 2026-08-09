# AI Coding Dictionary — atlas UI

A fixed-viewport term atlas: a 3D WebGL graph of terms filling the window, with
a deep-linkable detail panel in the right third. Built to be re-pointed at your
own content — the graph, its layout, the section colours and the term count all
come from a folder of markdown.

An independent implementation of the interface at
[aicodingdictionary.com](https://www.aicodingdictionary.com). See
[Content and provenance](#content-and-provenance) before publishing it.

## Run it

```bash
npm install
npm run build      # -> dist/index.html
npm run dev        # build, then serve dist/ on :8100
```

`dist/index.html` is a single self-contained file — styles, scripts, fonts and
the whole dataset inlined, no external requests. It works over `file://`, as an
email attachment, or on any static host.

There is a build step; the `index.html` at the repo root is a template, not a
runnable page. The app imports `three` by bare specifier, so it has to be
bundled either way.

## Editing the content

One markdown file per term in `content/`. The filename is the display title.

```markdown
---
description: One-line definition, shown as the panel lede.
aliases: away from keyboard, AFK (away from keyboard)
---

Body prose, with [inline links](./Other%20Term.md) to other terms.

_Avoid:_ The word to avoid, and why.

_Usage:_

"A question."

"The answer."
```

- **The links build the graph.** Wherever one entry links to another, an edge
  appears. Cross-references live in the prose that motivates them rather than
  in a parallel list that drifts out of sync. Edges are undirected and
  deduplicated, so naming a link on one side is enough.
- **Links to terms that do not exist** render as plain text and are dropped from
  the graph, so a half-written folder still renders.
- **`aliases` are searchable**, which is how "away from keyboard" finds AFK.
- **Section membership and order** live in `content/sections.json`. That file
  fixes the reading order too — the `07 / 69` index and what prev/next do.

Then:

```bash
npm run graph      # content/ -> data/graph.json
npm run build
```

The pipeline fails loudly if a term is in no section, or if a section names a
file that is not there.

### Adding a section

Append to `sections.json` with a title and its slugs. Counts, the atlas
clustering and the "07 / 69" numbering all follow. Colour mode cycles through
the seven pairs in `src/palette.js` and wraps, so an eighth section works
without touching the code — add a pair if you want it to be distinct.

## How it works

**The layout is baked, not simulated.** `npm run graph` runs a seeded,
section-clustered force simulation offline and writes each term's `[x, y, z]`
into `data/graph.json`, along with a bezier control point per edge and a
centroid and radius per section. A live simulation settles differently on every
load, which means the composition can never be tuned or trusted; a baked layout
is the same atlas every time and costs the runtime nothing on a cold start. The
pipeline is reproducible — repeated runs produce a byte-identical file.

Sections are seated around a **ring** rather than over a sphere. A sphere puts
two of them at the poles and stretches the cloud vertically, which is the axis a
screen has least of.

**Depth of field is per sprite.** Nodes are instanced billboards whose fragment
shader softens and dims each disc by its distance from the focal plane. For a
scene made entirely of discs this is indistinguishable from a real bokeh pass,
and it avoids a full-screen composer, depth sorting, and a second render target.
Nodes in front of the focal plane are never hazed, so whatever you are looking
at is always full-strength ink.

**Labels are HTML over the canvas.** Text in WebGL means a glyph atlas that goes
soft at some zoom; DOM elements stay crisp, are focusable, and land in the
accessibility tree. Which labels show is decided by a `d3-quadtree` collision
pass — nearer, better-connected and in-focus terms claim their rectangle first,
so the visible set stays stable as the camera moves instead of flickering.

**One store, two consumers.** `src/store.js` is a small observable holding the
focused, hovered, matched and colour-mode state. The atlas and the panel both
read and write it, so clicking a node, a Connects-to chip, an inline link or a
search result are all the same operation.

**Everything derives from two colours.** `--section-paper` and `--section-ink`
are registered with `@property` so colour mode crossfades rather than snaps;
the surfaces and rules are `color-mix` of those. There is deliberately **no dark
theme** — this is a paper-and-ink design, and a dark inversion is a different
design, not a variant.

## Controls

| | |
|---|---|
| `?term=<slug>` | Opens that term; Back/Forward work |
| `/` | Search |
| `Esc` | Close the modal, the search, then the panel |
| `←` `→` | Previous/next term in reading order |
| Drag | Rotate; auto-rotation resumes after a pause |
| Scroll | Zoom |
| Click empty space | Close the panel |

## Layout

```
content/            one .md per term, plus sections.json
pipeline/           content -> data/graph.json (markdown, layout, build-graph)
data/graph.json     generated and committed; the site runs without the pipeline
src/atlas/          three.js scene: nodes, edges, labels, camera
src/ui/             panel, search, markdown, sound
src/                store, palette, slug rules, main
assets/             stylesheet and fonts
build.mjs           esbuild + inlining -> dist/index.html
```

`src/slug.js` is shared by the pipeline and the runtime on purpose: if the two
ever disagreed about how a title becomes a slug, every inline link would resolve
to nothing.

## Notes

- **Desktop only.** There is no mobile layout, by request.
- **The bundle is large** — about 760kb, three quarters of it three.js. It
  compresses to roughly a fifth of that; serve it gzipped.
- **Markdown rendering is deliberately minimal** (`src/ui/markdown.js`):
  paragraphs, in-collection links, emphasis, bold, inline code. Everything is
  escaped first and only those constructs are reintroduced, so there is no path
  from content to markup. A general parser would pass raw HTML through and need
  a sanitiser alongside it. Keep it this way if you point this at content you
  did not write.
- **Sounds are synthesized** with the Web Audio API and off by default.

## Content and provenance

The 69 seed definitions **were written for this repo** and are not copied from
the original. The term list and section taxonomy follow its public structure,
which is why the two read as the same collection.

The upstream content repository,
[`mattpocock/dictionary-of-ai-coding`](https://github.com/mattpocock/dictionary-of-ai-coding),
publishes **no licence**, so none of its text appears here. The site's interface
is not open source either; this is an independent implementation, not a fork. If
you intend to publish this with the original wording, ask the author first.

The section colour pairs in `src/palette.js` were matched to the original's, on
the basis that the point of the exercise was reproducing that interface. Change
them if you would rather not.

Fonts: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) under the SIL Open
Font License (`assets/fonts/LICENSE-JetBrainsMono.txt`). Prose uses the system
Helvetica stack, with no webfont.
