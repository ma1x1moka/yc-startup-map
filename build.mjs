/* Bundles the site into one self-contained HTML file at dist/index.html.
 *
 *   npm run build
 *
 * The output makes no external requests at all — styles, scripts, the graph
 * and the fonts are all inlined — so it runs from a file:// path, an email
 * attachment, or any host that will only serve a single page.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFile(join(here, path), "utf8");

/* --- scripts ------------------------------------------------------------- */

const bundled = await build({
  entryPoints: [join(here, "src/main.js")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
  logLevel: "warning",
});
const script = bundled.outputFiles[0].text;

/* --- styles, with the fonts inlined -------------------------------------- */

let css = await read("assets/styles.css");
for (const file of ["JetBrainsMono-Regular.woff2", "JetBrainsMono-Medium.woff2"]) {
  const base64 = (await readFile(join(here, "assets/fonts", file))).toString("base64");
  css = css.replaceAll(
    `url("fonts/${file}")`,
    `url("data:font/woff2;base64,${base64}")`
  );
}

/* --- data ---------------------------------------------------------------- */

// `</script>` anywhere in the content would close the tag early.
const graph = JSON.stringify(JSON.parse(await read("data/graph.json"))).replaceAll(
  "</",
  "<\\/"
);

/* --- assemble ------------------------------------------------------------ */

const html = await read("index.html");

// Replacer *functions*, not strings: the bundled script contains `$&` and
// `$1` from its own regex work, which String.replace would expand.
const out = html
  .replace(
    '<link rel="stylesheet" href="assets/styles.css" />',
    () => `<style>\n${css}\n</style>`
  )
  .replace(
    '<script type="module" src="assets/app.js"></script>',
    () =>
      `<script type="module">\nglobalThis.__ATLAS_GRAPH__ = ${graph};\n${script}\n</script>`
  );

/* --- guards -------------------------------------------------------------- */

for (const pattern of [/href="assets\//, /src="assets\//, /url\("fonts\//]) {
  if (pattern.test(out)) {
    throw new Error(`build: an asset reference survived inlining (${pattern})`);
  }
}
if (!out.includes("__ATLAS_GRAPH__")) {
  throw new Error("build: the graph was not inlined");
}

await mkdir(join(here, "dist"), { recursive: true });
await writeFile(join(here, "dist/index.html"), out);

const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(1)}kb`;
console.log(
  `dist/index.html  ${kb(out)}  (css ${kb(css)}, js ${kb(script)}, graph ${kb(graph)})`
);
