/* Parsing for the content format.
 *
 * A term lives at content/<Title>.md and looks like this:
 *
 *   ---
 *   description: One-line definition, shown as the panel lede.
 *   aliases: away from keyboard, AFK (away from keyboard)
 *   ---
 *
 *   Body prose with [inline links](./Other%20Term.md) to other terms.
 *
 *   _Avoid:_ The word to avoid, and why.
 *
 *   _Usage:_
 *
 *   "A question."
 *
 *   "The answer."
 *
 * The filename is the display title, so the folder reads as a glossary. The
 * Avoid and Usage blocks are pulled out into their own fields, which is why
 * both `body` (everything) and `prose` (everything except those two blocks)
 * end up in the graph — the panel renders prose, and `body` is what the
 * "copy as markdown" action hands you.
 */

/* One definition of the slug rules, shared with the runtime — if the two ever
 * disagreed, every inline link would resolve to nothing. */
export { slugify, slugFromHref } from "../src/slug.js";
import { slugify, slugFromHref } from "../src/slug.js";

function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, rest: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, rest: source.slice(match[0].length) };
}

/** Strip one layer of matching quotes, straight or curly. */
function unquote(text) {
  const m = /^["“](.*)["”]$/s.exec(text.trim());
  return m ? m[1].trim() : text.trim();
}

export function parseTerm(source, title) {
  const { data, rest } = parseFrontmatter(source);
  const body = rest.trim();

  // Split on blank lines so a paragraph is the unit, then peel off the two
  // trailing labelled blocks. Everything before them is the prose.
  const paragraphs = body.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);

  let avoid = "";
  const usage = [];
  const prose = [];
  let mode = "prose";

  for (const para of paragraphs) {
    const avoidMatch = /^_Avoid:_\s*([\s\S]*)$/.exec(para);
    const usageMatch = /^_Usage:_\s*([\s\S]*)$/.exec(para);

    if (avoidMatch) {
      avoid = avoidMatch[1].trim();
      mode = "avoid";
    } else if (usageMatch) {
      mode = "usage";
      if (usageMatch[1].trim()) usage.push(unquote(usageMatch[1]));
    } else if (mode === "usage") {
      usage.push(unquote(para));
    } else if (mode === "avoid") {
      // A continuation paragraph of the Avoid block.
      avoid += "\n\n" + para;
    } else {
      prose.push(para);
    }
  }

  const links = [];
  for (const m of body.matchAll(/\[[^\]]*\]\((\.\/[^)]+\.md)\)/g)) {
    const slug = slugFromHref(m[1]);
    if (slug && !links.includes(slug)) links.push(slug);
  }

  return {
    slug: slugify(title),
    title,
    description: data.description ?? "",
    body,
    prose: prose.join("\n\n"),
    aliases: data.aliases
      ? data.aliases.split(",").map((a) => a.trim()).filter(Boolean)
      : [],
    links,
    usage,
    avoid,
    // Dossier fields — optional, used by founders/people nodes
    linkedin:         data.linkedin         ?? null,
    twitter:          data.twitter          ?? null,
    birth_year:       data.birth_year       ? parseInt(data.birth_year, 10) : null,
    university:       data.university       ?? null,
    university_url:   data.university_url   ?? null,
    university_logo:  data.university_logo  ?? null,
    photo:            data.photo            ?? null,
  };
}

/** The inverse, used by the migration and by anyone generating content. */
export function formatTerm({ description, aliases = [], prose, avoid, usage = [] }) {
  const front = [`description: ${description}`];
  if (aliases.length) front.push(`aliases: ${aliases.join(", ")}`);

  const parts = [`---\n${front.join("\n")}\n---`, prose];
  if (avoid) parts.push(`_Avoid:_ ${avoid}`);
  if (usage.length) parts.push("_Usage:_", ...usage.map((u) => `"${u}"`));

  return parts.join("\n\n") + "\n";
}
