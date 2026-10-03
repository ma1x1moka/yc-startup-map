/* Shared outline-icon set (24x24, stroke currentColor, fill none) and the
 * `svg()` helper that wraps a path fragment in the right viewBox/attributes.
 * Used by panel.js (actions, dossier) and markdown.js (inline social links
 * parsed out of card prose) — one definition so the two never drift. */

export const ICONS = {
  close: `<path d="M7 7l10 10M17 7L7 17" stroke-linecap="round"/>`,
  left: `<path d="M14.5 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/>`,
  right: `<path d="M9.5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>`,
  chevron: `<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>`,
  share: `<path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" stroke-linecap="round" stroke-linejoin="round"/>`,
  copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15" stroke-linecap="round"/>`,
  link: `<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" stroke-linecap="round"/>`,
  twitter: `<path d="M4 4l16 16M4 20 20 4" stroke-linecap="round"/><path d="M9 4H4l4.5 6M15 4h5l-4.5 6M4 20h5l11-16" stroke-linecap="round" stroke-linejoin="round"/>`,
  linkedin: `<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v5M8 8v.5" stroke-linecap="round"/><path d="M12 16v-5m0 0c0-1.5 4-1.5 4 0v5" stroke-linecap="round"/>`,
  graduation: `<path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M6 11.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" stroke-linecap="round"/>`,
  website: `<circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.6 2.4 4 5.3 4 8.5s-1.4 6.1-4 8.5c-2.6-2.4-4-5.3-4-8.5s1.4-6.1 4-8.5z" stroke-linecap="round"/>`,
};

export const svg = (path, className = "") =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${path}</svg>`;
