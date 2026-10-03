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
import { ICONS, svg } from "./icons.js";

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Cards open with a line like "**Website:** ndea.com | **Twitter:** @ndea |
 * **YC:** https://...". Rendered as plain bold-label text it reads as raw
 * data-entry; a paragraph made *entirely* of "**Label:** value" segments
 * joined by " | " is pulled out and rendered as a row of icon links instead
 * (see claude-tools/README.md's card format — this is the same line every
 * generate-cards.mjs-written card starts with). A label this doesn't
 * recognize (e.g. "YC partner", "Background") falls back to a plain,
 * non-linked chip rather than guessing a URL for it. */
const SOCIAL_LINK = {
  website: { icon: "website", href: (v) => normalizeUrl(v), text: (v) => v.replace(/^https?:\/\//i, "").replace(/\/+$/, "") },
  twitter: { icon: "twitter", href: (v) => `https://x.com/${handleOf(v)}`, text: (v) => `@${handleOf(v)}` },
  linkedin: { icon: "linkedin", href: (v) => normalizeUrl(v), text: () => "LinkedIn" },
  github: { icon: "link", href: (v) => normalizeUrl(v), text: () => "GitHub" },
  yc: { icon: "link", href: (v) => normalizeUrl(v), text: () => "YC" },
  docs: { icon: "link", href: (v) => normalizeUrl(v), text: () => "Docs" },
};

function normalizeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
function handleOf(value) {
  // Drops a trailing parenthetical ("@markhuqhes (CEO)") and a leading @.
  return value.replace(/\s*\([^)]*\)\s*$/, "").replace(/^@/, "");
}

/** A paragraph is a social line only if *every* " | "-separated segment
 *  parses as "**Label:** value" — one stray sentence anywhere in it and this
 *  returns null, falling back to ordinary paragraph rendering. */
function parseSocialLine(paragraph) {
  const segments = paragraph.split(/\s*\|\s*/).map((segment) => {
    const m = segment.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
    return m ? { label: m[1].trim(), value: m[2].trim() } : null;
  });
  return segments.every(Boolean) ? segments : null;
}

function renderSocialSegment({ label, value }) {
  const spec = SOCIAL_LINK[label.toLowerCase().replace(/\s+/g, "")];
  if (!spec) {
    return `<span class="social-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
  }
  return `<a class="social-link" href="${escapeHtml(spec.href(value))}" target="_blank" rel="noopener noreferrer">${svg(
    ICONS[spec.icon],
    "icon-sm"
  )}<span>${escapeHtml(spec.text(value))}</span></a>`;
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
    .map((raw) => {
      const paragraph = raw.trim();
      const social = parseSocialLine(paragraph);
      if (social) return `<p class="social-links">${social.map(renderSocialSegment).join("")}</p>`;
      return `<p>${renderInline(paragraph, exists)}</p>`;
    })
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
