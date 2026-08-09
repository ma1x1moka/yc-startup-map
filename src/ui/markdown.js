/* A deliberately small markdown renderer.
 *
 * The content uses five constructs and no more: paragraphs, links to other
 * terms, emphasis, bold, and inline code. Pulling in a general parser to cover
 * the rest would mean shipping a sanitiser with it, because a real markdown
 * parser passes raw HTML through by default.
 *
 * Everything is escaped first and only these constructs are re-introduced, so
 * there is no path from content to markup. Keep it that way if you point this
 * at content you did not write.
 */

import { slugFromHref } from "../slug.js";

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {string} source markdown
 * @param {(slug: string) => boolean} exists so a link to a term that is not in
 *   the collection renders as plain text rather than a dead control
 */
export function renderMarkdown(source, exists = () => true) {
  if (!source) return "";
  return source
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${renderInline(paragraph.trim(), exists)}</p>`)
    .join("");
}

export function renderInline(text, exists = () => true) {
  // Split on code spans so their contents never see the emphasis rules, and
  // so no placeholder token is needed — a substitution marker would always be
  // something body text could contain.
  return text
    .split(/(`[^`]+`)/)
    .map((chunk) => {
      if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 1) {
        return `<code>${escapeHtml(chunk.slice(1, -1))}</code>`;
      }
      return formatted(escapeHtml(chunk), exists);
    })
    .join("");
}

function formatted(html, exists) {
  return (
    html
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
        // Only in-collection links are supported; anything else stays literal,
        // which keeps arbitrary URLs out of the document.
        if (!href.startsWith("./")) return whole;
        const slug = slugFromHref(href);
        if (!exists(slug)) return label;
        return `<a href="?term=${encodeURIComponent(slug)}" data-term="${escapeHtml(
          slug
        )}">${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      // Underscore emphasis only at a word boundary, so snake_case_names and
      // the _Avoid:_ markers in raw bodies do not get mangled mid-word.
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)!?]|$)/g, "$1<em>$2</em>")
  );
}
