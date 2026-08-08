/* ==========================================================================
   The AI Coding Dictionary — app shell.

   Data in  : data/terms.json
   Data out : rendered sections, a 3D graph, and a deep-linkable term panel
              addressed as ?term=<slug>.

   To render your own data, replace data/terms.json. Nothing here is
   hard-coded to the seed content — sections, colors and cross-links all
   come from the file.
   ========================================================================== */

import { TermGraph } from "./graph.js";

const DATA_URL = new URL("../data/terms.json", import.meta.url);

/* Dark-mode counterparts for each section's paper/ink. Keyed by section id. */
const DARK = {
  paper: ["#131313", "#141413", "#121413", "#151212", "#111315", "#131215", "#131413"],
  ink: ["#e8e8e6", "#e8e8e4", "#e4e8e5", "#eae4e3", "#e3e7ea", "#e6e3ea", "#e7e8e4"],
  accent: ["#e0724f", "#c9a03f", "#5aa76b", "#d45a5a", "#5b93c9", "#8f72cf", "#7a9c52"],
};

const state = {
  data: null,
  terms: [],
  bySlug: new Map(),
  order: [],
  filtered: null,
  graph: null,
  current: null,
};

async function fetchData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Failed to load terms.json: ${res.status}`);
  return res.json();
}

/* Sandboxed frames can throw on history and storage access. Neither is
   essential, so degrade instead of taking the page down. */
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ============================== bootstrap ============================== */

init();

async function init() {
  initTheme();

  // A single-file build inlines the dataset; the source build fetches it.
  const data = globalThis.__ACD_DATA__ ?? (await fetchData());

  state.data = data;
  state.sections = new Map(data.sections.map((s) => [s.id, s]));
  state.terms = data.terms.map((t) => ({ ...t, slug: t.slug || slugify(t.term) }));
  state.bySlug = new Map(state.terms.map((t) => [t.slug, t]));

  // Sort alphabetically inside each section, sections in declared order.
  state.order = [...state.terms].sort(
    (a, b) => a.section - b.section || a.term.localeCompare(b.term)
  );

  renderChrome();
  renderSections(state.order);
  buildGraph();
  wireEvents();
  applyRoute();
}

/* ================================ chrome ================================ */

function renderChrome() {
  const { meta, sections } = state.data;
  document.title = meta.title;

  $("#hero-title").innerHTML = `<span class="the">The</span><span>AI Coding</span><span>Dictionary</span>`;
  $("#hero-tagline").textContent = meta.tagline;
  $("#stat-terms").textContent = state.terms.length;
  $("#stat-sections").textContent = sections.length;
  $("#footer-note").textContent = `${sections.length} ${meta.footer}`;

  $("#graph-legend").innerHTML = sections
    .map(
      (s) =>
        `<span style="color:${accentOf(s)}"><i></i>${esc(s.name)}</span>`
    )
    .join("");
}

function isDark() {
  return document.documentElement.dataset.theme === "dark";
}

function paperOf(s) {
  return isDark() ? DARK.paper[s.id - 1] || "#131313" : s.paper;
}
function inkOf(s) {
  return isDark() ? DARK.ink[s.id - 1] || "#e8e8e6" : s.ink;
}
function accentOf(s) {
  return isDark() ? DARK.accent[s.id - 1] || "#e0724f" : s.accent;
}

/* =============================== sections =============================== */

function renderSections(terms, query = "") {
  const root = $("#sections");

  if (!terms.length) {
    root.innerHTML = `<p class="empty">No terms match “${esc(query)}”</p>`;
    return;
  }

  const groups = new Map();
  for (const t of terms) {
    if (!groups.has(t.section)) groups.set(t.section, []);
    groups.get(t.section).push(t);
  }

  root.innerHTML = [...groups.entries()]
    .map(([id, list]) => {
      const s = state.sections.get(id);
      const style = `--sec-paper:${paperOf(s)};--sec-ink:${inkOf(s)};--sec-accent:${accentOf(s)}`;
      const rows = list
        .map(
          (t) => `
        <li>
          <button class="term-row" data-slug="${t.slug}">
            <span class="name">${hl(t.term, query)}</span>
            <span class="desc">${hl(t.description, query)}</span>
          </button>
        </li>`
        )
        .join("");

      return `
      <section class="section" data-section="${id}" style="${style}">
        <div class="section-head">
          <span class="num">${String(id).padStart(2, "0")}</span>
          <h2>${esc(s.name)}</h2>
          <span class="count">${list.length} terms</span>
        </div>
        <ul class="terms">${rows}</ul>
      </section>`;
    })
    .join("");
}

function hl(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return safe.replace(rx, "<mark>$1</mark>");
}

/* ================================= graph ================================= */

function buildGraph() {
  const nodes = state.terms.map((t) => ({
    id: t.slug,
    label: t.term,
    section: t.section,
    color: accentOf(state.sections.get(t.section)),
  }));

  const seen = new Set();
  const links = [];
  for (const t of state.terms) {
    for (const r of t.related || []) {
      if (!state.bySlug.has(r)) continue;
      const key = [t.slug, r].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: t.slug, target: r });
    }
  }

  state.graph = new TermGraph($("#graph"), {
    nodes,
    links,
    onSelect: (slug) => openTerm(slug),
  });
  syncGraphTheme();
}

function syncGraphTheme() {
  if (!state.graph) return;
  const cs = getComputedStyle(document.body);
  state.graph.setTheme({
    paper: cs.backgroundColor,
    ink: cs.color,
    dim: isDark() ? "#666" : "#999",
  });
  const map = {};
  for (const t of state.terms)
    map[t.slug] = accentOf(state.sections.get(t.section));
  state.graph.setColors(map);
}

/* ================================= panel ================================= */

function openTerm(slug, push = true) {
  const t = state.bySlug.get(slug);
  if (!t) return closeTerm();

  const s = state.sections.get(t.section);
  state.current = slug;

  const panel = $("#panel");
  panel.style.setProperty("--section-paper", paperOf(s));
  panel.style.setProperty("--section-ink", inkOf(s));
  panel.style.setProperty("--section-accent", accentOf(s));

  $("#panel-section").textContent = `${String(s.id).padStart(2, "0")} — ${s.name}`;

  const related = (t.related || [])
    .map((r) => state.bySlug.get(r))
    .filter(Boolean);

  $("#panel-body").innerHTML = `
    <h2>${esc(t.term)}</h2>
    <p class="lede">${esc(t.description)}</p>
    ${(t.body || []).map((p) => `<p>${esc(p)}</p>`).join("")}
    ${
      t.avoid
        ? `<div class="block"><span class="label">Avoid</span><p class="avoid">${esc(
            t.avoid
          )}</p></div>`
        : ""
    }
    ${
      (t.usage || []).length
        ? `<div class="block"><span class="label">In use</span><div class="usage">${t.usage
            .map((u) => `<p>${esc(u)}</p>`)
            .join("")}</div></div>`
        : ""
    }
    ${
      related.length
        ? `<div class="block"><span class="label">See also</span><div class="chips">${related
            .map(
              (r) =>
                `<button class="chip" data-slug="${r.slug}"><i></i>${esc(
                  r.term
                )}</button>`
            )
            .join("")}</div></div>`
        : ""
    }`;

  $("#panel-body").scrollTop = 0;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  $("#scrim").classList.add("open");
  document.body.style.overflow = "hidden";

  state.graph?.select(slug);
  $("#panel-close").focus({ preventScroll: true });

  if (push) {
    safe(() => {
      const url = new URL(location.href);
      url.searchParams.set("term", slug);
      history.pushState({ term: slug }, "", url);
    });
  }
}

function closeTerm(push = true) {
  state.current = null;
  $("#panel").classList.remove("open");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("open");
  document.body.style.overflow = "";
  state.graph?.select(null);

  if (push) {
    safe(() => {
      const url = new URL(location.href);
      url.searchParams.delete("term");
      history.pushState({}, "", url);
    });
  }
}

function step(dir) {
  if (!state.current) return;
  const list = state.filtered || state.order;
  const i = list.findIndex((t) => t.slug === state.current);
  if (i < 0) return;
  const next = list[(i + dir + list.length) % list.length];
  openTerm(next.slug);
}

function applyRoute() {
  const slug = new URL(location.href).searchParams.get("term");
  if (slug && state.bySlug.has(slug)) openTerm(slug, false);
  else closeTerm(false);
}

/* ================================ events ================================ */

function wireEvents() {
  // Term rows and "see also" chips share one delegated handler.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-slug]");
    if (el) {
      e.preventDefault();
      openTerm(el.dataset.slug);
    }
  });

  document.addEventListener("mouseover", (e) => {
    const row = e.target.closest(".term-row");
    state.graph?.setFocus(row ? row.dataset.slug : null);
  });

  $("#panel-close").addEventListener("click", () => closeTerm());
  $("#scrim").addEventListener("click", () => closeTerm());
  $("#panel-prev").addEventListener("click", () => step(-1));
  $("#panel-next").addEventListener("click", () => step(1));

  window.addEventListener("popstate", applyRoute);

  const search = $("#search-input");
  search.addEventListener("input", () => {
    const q = search.value.trim();
    if (!q) {
      state.filtered = null;
      renderSections(state.order);
      return;
    }
    const needle = q.toLowerCase();
    state.filtered = state.order.filter(
      (t) =>
        t.term.toLowerCase().includes(needle) ||
        t.description.toLowerCase().includes(needle)
    );
    renderSections(state.filtered, q);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.current) return closeTerm();
      if (document.activeElement === search) {
        search.value = "";
        search.dispatchEvent(new Event("input"));
        search.blur();
      }
    }
    if (e.key === "/" && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    }
    if (state.current && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      if (document.activeElement === search) return;
      step(e.key === "ArrowRight" ? 1 : -1);
    }
  });

  $("#theme-toggle").addEventListener("click", toggleTheme);
}

/* ================================= theme ================================= */

function initTheme() {
  const root = document.documentElement;
  // Respect a theme the host already stamped on the document.
  const stamped = root.dataset.theme;
  const saved = safe(() => localStorage.getItem("acd-theme"), null);
  const dark =
    stamped === "dark" ||
    (!stamped &&
      (saved === "dark" ||
        (!saved && matchMedia("(prefers-color-scheme: dark)").matches)));
  root.dataset.theme = dark ? "dark" : "light";
  updateThemeButton();
}

function toggleTheme() {
  const dark = !isDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  safe(() => localStorage.setItem("acd-theme", dark ? "dark" : "light"));
  updateThemeButton();
  renderSections(state.filtered || state.order, $("#search-input").value.trim());
  syncGraphTheme();
  if (state.current) openTerm(state.current, false);
}

function updateThemeButton() {
  const btn = $("#theme-toggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(isDark()));
  btn.setAttribute(
    "aria-label",
    isDark() ? "Switch to light theme" : "Switch to dark theme"
  );
}
