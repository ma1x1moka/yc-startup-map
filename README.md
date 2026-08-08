# AI Coding Dictionary — UI

A self-contained, dependency-free re-implementation of the
[aicodingdictionary.com](https://www.aicodingdictionary.com) interface: a
mono-type editorial layout, per-section colour theming, a 3D force-directed
term graph, and a deep-linkable term panel addressed as `?term=<slug>`.

Built to be re-skinned and re-pointed at your own content.

## Run it

No build step, no install. It only needs to be served over HTTP (the app
fetches its data as a module, so `file://` won't work):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Any static host will serve it as-is — GitHub Pages, Netlify, Vercel, S3.

## Files

```
index.html          markup shell
assets/styles.css   design tokens + all layout
assets/app.js       data loading, routing, search, panel
assets/graph.js     the 3D graph (standalone, no deps)
data/terms.json     all content
```

## Rendering your own data

Replace `data/terms.json`. Nothing in the code is hard-coded to the seed
content — sections, colours, cross-links and counts are all read from the file.

```jsonc
{
  "meta": { "title": "...", "tagline": "...", "footer": "..." },

  "sections": [
    // `paper`/`ink` theme the section band; `accent` colours its graph nodes.
    { "id": 1, "name": "The Model", "paper": "#eaeae8", "ink": "#1a1a19", "accent": "#b4462a" }
  ],

  "terms": [
    {
      "term": "Token",                       // display name
      "slug": "token",                       // optional; derived from `term` if absent
      "section": 1,                          // section id
      "description": "One-line definition.", // shown in the list and as the panel lede
      "body": ["Paragraph.", "Paragraph."],  // optional
      "avoid": "Word to avoid, and why.",    // optional
      "usage": ["\"Question?\"", "\"Answer.\""], // optional
      "related": ["model", "context-window"] // slugs; these become the graph edges
    }
  ]
}
```

Two things worth knowing:

- **`related` builds the graph.** Edges are de-duplicated and treated as
  undirected, so listing a link on one side is enough.
- **Unknown slugs in `related` are ignored**, so a partial dataset renders
  without errors.

### Adding a section

Append to `sections` with a new `id` and give its terms that id. Section count,
per-section term counts, the legend and the graph palette all follow
automatically. For dark mode, add a matching entry to the `DARK` arrays at the
top of `assets/app.js` (they're indexed by section order).

## Behaviour

| | |
|---|---|
| `?term=<slug>` | Opens that term directly; Back/Forward work |
| `/` | Focus search |
| `Esc` | Close the panel, or clear the search |
| `←` `→` | Previous/next term while the panel is open |
| Drag the graph | Rotate; auto-rotation stops on interaction |
| Hover a term row | Highlights that node and its neighbours in the graph |

Theme follows `prefers-color-scheme` and is overridable with the header
toggle, persisted to `localStorage`.

## Implementation notes

- **No dependencies and no build.** ES modules, one stylesheet, one JSON file.
- **The graph is plain canvas 2D.** Nodes are laid out by a small spring /
  repulsion simulation in 3D, rotated, perspective-projected and painted
  back-to-front. It auto-fits the frame, so a layout that spreads still stays
  in view. Node radius tracks link degree.
- **Theming is token-driven.** Everything derives from `--paper` and `--ink`
  via `color-mix`, so a section (or the whole site) re-themes by changing two
  colours. `--section-paper` / `--section-ink` are registered with `@property`
  so they interpolate rather than snap.
- **Rendering is string-templated** into `innerHTML`, with all interpolated
  content escaped in `esc()`. If you swap in untrusted data, keep that.

## Content

The seed dataset covers 69 terms across 7 sections. The term list and section
taxonomy follow the public structure of the original; **all definitions here
were written from scratch for this repo** and are not copied from it.

The upstream content repository,
[`mattpocock/dictionary-of-ai-coding`](https://github.com/mattpocock/dictionary-of-ai-coding),
publishes no licence, so its text is not reproduced here. The site's own UI is
not open source — this is an independent implementation, not a fork. If you
intend to publish this with the original wording, ask the author first.
