/* Bundles the site into one self-contained HTML file at dist/index.html.
 *
 *   node build.mjs
 *
 * The output has no external requests at all — CSS, both scripts and the
 * whole dataset are inlined — so it runs from a file:// path, an email
 * attachment, or any host that only accepts a single page.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFile(join(here, p), "utf8");

const [html, css, graph, app, data] = await Promise.all([
  read("index.html"),
  read("assets/styles.css"),
  read("assets/graph.js"),
  read("assets/app.js"),
  read("data/terms.json"),
]);

// Both modules become one inline script, so the export/import pair that
// links them across files has to go.
const graphInline = graph.replace(/^export class TermGraph/m, "class TermGraph");
const appInline = app.replace(
  /^import \{ TermGraph \} from "\.\/graph\.js";\n/m,
  ""
);

// `</script>` inside the JSON would close the tag early.
const dataInline = JSON.stringify(JSON.parse(data)).replace(/<\//g, "<\\/");

// Replacer *functions*, not strings: the inlined JS contains `$&` (a regex
// escape in hl()), which String.replace would expand as the matched text.
const out = html
  .replace(
    '<link rel="stylesheet" href="assets/styles.css" />',
    () => `<style>\n${css}\n</style>`
  )
  .replace(
    '<script type="module" src="assets/app.js"></script>',
    () =>
      `<script type="module">\nglobalThis.__ACD_DATA__ = ${dataInline};\n\n${graphInline}\n\n${appInline}\n</script>`
  );

if (out.includes("assets/") ) {
  throw new Error("build: an asset reference survived inlining");
}

await mkdir(join(here, "dist"), { recursive: true });
await writeFile(join(here, "dist/index.html"), out);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)}kb`;
console.log(`dist/index.html  ${kb(out)}  (css ${kb(css)}, js ${kb(graphInline + appInline)}, data ${kb(dataInline)})`);
