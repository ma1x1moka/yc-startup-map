/* Slug rules, shared by the build pipeline and the runtime.
 *
 * Both sides have to agree exactly: the pipeline turns a filename into a slug,
 * and the runtime turns a `./Term%20Name.md` link into one. If they ever
 * disagree, links resolve to nothing.
 */

/** Title to slug. A trailing `.md` in a title (AGENTS.md) is an extension. */
export function slugify(title) {
  return title
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** `./Term%20Name.md` -> `term-name`. */
export function slugFromHref(href) {
  let path = href.replace(/^\.\//, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    /* a stray % is not worth failing over */
  }
  return slugify(path.replace(/\.md$/i, ""));
}
