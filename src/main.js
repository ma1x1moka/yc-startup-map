/* Wiring: data in, atlas and panel out, URL and keyboard in between.
 *
 * The page has two states and one rule connecting them. Closed, it is a
 * masthead, a menu of spheres and a line of years — no graph, nothing moving,
 * nothing to read past. The graph opens only once a year *and* a sphere have
 * both been chosen, and it opens showing that intersection alone.
 *
 * `sync()` is the only place that decides which state the page is in. Every
 * control — the menu, the timeline, the close button, the back button — does
 * nothing but write its own field into the store; sync() reads the result and
 * derives the rest. That is what keeps "when does the graph open" a single
 * sentence of code instead of a rule each control has to remember.
 */

import { createStore } from "./store.js";
import { buildIndex } from "./selection.js";
import { Atlas } from "./atlas/index.js";
import { nodeRadius } from "./atlas/nodes.js";
import { Panel } from "./ui/panel.js";
import { Search } from "./ui/search.js";
import { Nav } from "./ui/nav.js";
import { Timeline } from "./ui/timeline.js";
import { Web } from "./ui/web.js";
import { Burst } from "./ui/burst.js";
import { Sound } from "./ui/sound.js";
import { Hint } from "./ui/hint.js";
import { PanelResizer } from "./ui/panel-resize.js";
import { PALETTE, paperFor, inkFor } from "./palette.js";
import { escapeHtml, renderInline } from "./ui/markdown.js";

const COLOR_KEY = "atlas:section-color";

/* The build inlines data/graph.json here. There is deliberately no fetch
 * fallback: the app has to be bundled anyway (bare module specifiers), so a
 * fetch path would be code that can never run — and it would undermine the
 * build's guarantee that the output makes no external requests. */
const graph = globalThis.__ATLAS_GRAPH__;
if (!graph) {
  throw new Error(
    "No graph found. Run `npm run build` and serve dist/ — index.html at the " +
      "repo root is a template, not a runnable page."
  );
}

const index = buildIndex(graph);
const bySlug = new Map(graph.nodes.map((n) => [n.slug, n]));

/** Reading order: sections in order, terms in the order the section lists
 *  them. This drives the "07 / 69" index and prev/next. */
const order = graph.sections.flatMap((section) => section.slugs);

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/* ---------- routing ---------- */

/** The whole of the page's state that is worth a URL: which year, which
 *  sphere, which term. Anything invalid is dropped rather than rejected, so a
 *  hand-edited or stale link still lands somewhere sensible. */
function readUrl() {
  const params = safe(() => new URL(location.href).searchParams, new URLSearchParams());

  const year = Number(params.get("year"));
  const section = Number(params.get("section"));
  const term = params.get("term");

  const validYear = index.years.includes(year) ? year : null;
  return {
    year: validYear,
    // A sphere means nothing without a year underneath it — a hand-edited or
    // stale ?section= with no ?year= would otherwise land on exactly the
    // broken "pill lit up, no dot lit up" state a full year-collapse now
    // guards against everywhere else.
    section:
      validYear != null && Number.isInteger(section) && section >= 0 && section < graph.sections.length
        ? section
        : null,
    focusedSlug: term && bySlug.has(term) ? term : null,
  };
}

function writeUrl(replace = false) {
  const { year, section, focusedSlug } = store.get();
  const url = new URL(location.href);
  const set = (key, value) => {
    if (value === null || value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  };
  set("year", year);
  set("section", section);
  set("term", focusedSlug);
  if (url.href === location.href) return;
  safe(() => (replace ? history.replaceState(null, "", url) : history.pushState(null, "", url)));
}

const store = createStore({
  ...readUrl(),
  hoveredSlug: null,
  matchSlugs: [],
  searchActive: false,
  query: "",
  /** The slugs the atlas is allowed to draw; null means "all of them". */
  isolateSlugs: null,
  sectionColorOn: safe(() => localStorage.getItem(COLOR_KEY) === "1", false),
  overviewSection: 0,
});

/* ---------- chrome ---------- */

const sound = new Sound(document.querySelector("#sound-toggle"));

// Bold the title's first word for a touch of emphasis — not a hardcoded
// "AI" prefix (that was a leftover from this project's original "AI Coding
// Dictionary" branding and had nothing to do with the YC Atlas pivot; it
// rendered as "AI YC Atlas — 10 Years" in the wordmark, independent of
// whatever graph.meta.title actually said).
const title = graph.meta?.title ?? "Atlas";
const [firstWord, ...rest] = title.split(" ");
document.querySelector("#wordmark").innerHTML = `<b>${escapeHtml(firstWord)}</b>${
  rest.length ? " " + escapeHtml(rest.join(" ")) : ""
}`;
document.title = title;

const atlas = new Atlas(document.querySelector("#atlas-canvas"), {
  graph,
  store,
  labelContainer: document.querySelector("#atlas-labels"),
  palette: PALETTE,
});

/* ---------- size legend ---------- */
/* Node size encodes debt, but nothing on screen said so — this is the key.
 * Dots are drawn at the same nodeRadius() scale as the wallets themselves, so
 * "this dot = $25M" is a true reading of the atlas, not a decorative guess. */
const sizeLegend = graph.meta?.sizeLegend;
if (sizeLegend?.refs?.length) {
  const maxRadius = Math.max(...sizeLegend.refs.map((r) => nodeRadius(r.inDegree)));
  const el = document.createElement("div");
  el.className = "legend";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <p class="legend-title">Node size <span>·</span> ${escapeHtml(sizeLegend.encodes ?? "")}</p>
    <div class="legend-scale">
      ${sizeLegend.refs
        .map((r) => {
          const d = Math.max(6, Math.round((nodeRadius(r.inDegree) / maxRadius) * 30));
          return `<span class="legend-ref">
            <span class="legend-dot" style="width:${d}px;height:${d}px"></span>
            <span class="legend-val">${escapeHtml(r.text)}</span>
          </span>`;
        })
        .join("")}
    </div>`;
  document.body.appendChild(el);
}

const panel = new Panel(document.querySelector("#panel"), {
  graph,
  store,
  order,
  onSound: sound.play,
});

// Reads any saved width and writes --panel-fraction before setPanelOpen()
// below ever has a reason to read it (a cold load landing straight on a
// ?term= deep link opens the panel on its very first sync()).
const panelResizer = new PanelResizer(document.querySelector("#panel-resizer"), {
  atlas,
  store,
});
document.querySelector("#panel-collapse").addEventListener("click", () => {
  store.set({ focusedSlug: null });
  sound.play("toggle");
});

const search = new Search(document.querySelector("#search"), {
  graph,
  store,
  onSound: sound.play,
});

const nav = new Nav(document.querySelector("#nav"), {
  index,
  store,
  onSound: sound.play,
});

const timeline = new Timeline(document.querySelector("#timeline"), {
  index,
  store,
  onSound: sound.play,
});

const web = new Web(document.querySelector("#web"), {
  store,
  timeline,
  navRoot: document.querySelector("#nav"),
});

// The shell compacts (or expands back) over 0.7s whenever the stage flips —
// a purely CSS-driven move that carries every pill and the timeline itself
// along with it, without any store field changing to tell Web to redraw.
// Web's own year/section subscription already redraws once at the start of
// that move; this catches where it actually ends up.
document.querySelector("#shell").addEventListener("transitionend", (event) => {
  if (event.propertyName === "padding-top" || event.propertyName === "gap") {
    web.redraw();
  }
});

/* ---------- opening and closing the graph ---------- */

const crumb = document.querySelector("#cue-crumb");
const hint = new Hint(document.querySelector("#hint"), {
  canvas: document.querySelector("#atlas-canvas"),
});
const atlasEl = document.querySelector("#atlas");
const burstFx = new Burst(document.querySelector("#burst"));

/** How long the quick collapse-and-reopen (switching between two already-open
 *  selections) takes before the new one starts opening. Matches the
 *  .atlas.is-refolding transition in the stylesheet, plus a hair of slack so
 *  the timer never fires a frame ahead of the CSS actually finishing. */
const REFOLD_MS = 460;

/**
 * What the atlas may draw, or null for "nothing — stay closed".
 *
 * Three ways in, in order of authority. A chosen year and sphere is the front
 * door and outranks the rest, so searching inside an open graph narrows it
 * rather than replacing it. A search on its own is the side door: typing from
 * the landing page opens a graph of the matches, because a filter over a graph
 * nobody can see is just a disabled control. A term on its own is the deep
 * link — a shared ?term= URL should land on something.
 */
function subsetFor(state) {
  if (state.year != null && state.section != null) {
    const slugs = index.slugsFor(state.year, state.section);
    return slugs.length ? slugs : null;
  }
  if (state.searchActive && state.matchSlugs.length) {
    return state.matchSlugs;
  }
  if (state.focusedSlug) {
    return [state.focusedSlug, ...atlas.neighboursOf(state.focusedSlug)];
  }
  return null;
}

/** Where a selection's dot is on screen right now — the point the graph
 *  unfolds out of and folds back into. A year has an exact dot; anything
 *  else (search, a bare ?term= link) has no single stop to point at, so it
 *  falls back to the timeline's own centre rather than the corner of the
 *  screen. Read *before* the stage flips, while the layout the user was
 *  actually looking at is still in effect — read after, and this would
 *  report the compact "graph" position for a click that happened on the
 *  spread-out landing page. */
function originForState(state) {
  // The web's second hop: a year *and* a sphere both chosen means the pill is
  // what was actually clicked, so that is where the atlas unfolds from —
  // continuing the same line the web already drew toward it, rather than
  // reaching back to the year's dot underneath it.
  if (state.year != null && state.section != null) {
    const pill = document.querySelector(`.nav-item[data-section="${state.section}"]`);
    if (pill) {
      const r = pill.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  const dot = state.year != null ? timeline.originFor(state.year) : null;
  if (dot) return dot;
  const rect = document.querySelector("#timeline").getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function applyOrigin(origin) {
  const root = document.documentElement;
  root.style.setProperty("--unfold-x", `${Math.round(origin.x)}px`);
  root.style.setProperty("--unfold-y", `${Math.round(origin.y)}px`);
}

/** Open the graph on a subset, unfolding from wherever that subset's own dot
 *  is right now. `animate: false` is the cold-load path — land on it directly,
 *  no burst, no camera swoop. */
function openGraph(state, subset, { animate = true } = {}) {
  const origin = originForState(state);
  applyOrigin(origin);
  document.body.dataset.stage = "graph";
  atlas.setActive(true);
  atlas.frameSubset(subset, { burst: animate });
  if (animate) burstFx.open(origin, subset.length);
  if (!state.focusedSlug) hint.peek();
}

/** The panel width is one source of truth, read by the atlas for its lens
 *  shift and by the stylesheet for the right-hand controls. */
function setPanelOpen(open) {
  const fraction = open
    ? parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--panel-fraction")
      ) || 1 / 3
    : 0;
  document.body.dataset.panel = open ? "open" : "closed";
  atlas.setPanelFraction(fraction);
}

let lastSubsetKey = null;
let transitionToken = 0;
let syncing = false;

/**
 * Derive everything visible from the selection.
 *
 * Re-entrant by nature — it writes to the store, and the store is what calls
 * it — so the guard is load-bearing rather than defensive: without it, setting
 * `isolateSlugs` here would immediately call this function again.
 */
function sync({ animate = true, replaceUrl = false } = {}) {
  if (syncing) return;
  syncing = true;
  try {
    // Following a connection out of the open bucket moves the bucket to match,
    // rather than leaving the menus describing a view you have already walked
    // out of. The atlas only has coordinates for the isolated set, so a term
    // outside it genuinely has nowhere to appear.
    const arriving = store.get().focusedSlug ? bySlug.get(store.get().focusedSlug) : null;
    if (arriving?.year != null) {
      const { year, section } = store.get();
      if (year != null && section != null && (arriving.year !== year || arriving.section !== section)) {
        store.set({ year: arriving.year, section: arriving.section });
      }
    }

    const state = store.get();
    let subset = subsetFor(state);
    // Last resort for the handful of terms with no year at all: whatever else
    // is on screen, the term the panel is showing has to be on it.
    if (subset && state.focusedSlug && !subset.includes(state.focusedSlug)) {
      subset = [...subset, state.focusedSlug];
    }

    // Keyed on the drawn set itself, not on the selection that produced it:
    // the set is what the layout and the framing are functions of, and two
    // different selections that draw the same nodes should not re-shuffle
    // them. Opening a term inside an unchanged set leaves both alone, and
    // narrowing with search inside an open graph never touches this at all.
    const key = subset ? subset.join(" ") : null;

    if (key !== lastSubsetKey) {
      const wasOpen = lastSubsetKey !== null;
      lastSubsetKey = key;
      transitionToken++;
      const myToken = transitionToken;
      // A stale mid-flight switch, abandoned in favour of whatever this call
      // is about to do, would otherwise leave the atlas permanently pinned
      // to invisible by is-refolding's !important rules — nothing else ever
      // clears the class.
      atlasEl.classList.remove("is-refolding");

      if (!subset) {
        if (wasOpen && animate) burstFx.close();
        atlas.clearSubset();
        atlas.setActive(false);
        document.body.dataset.stage = "idle";
      } else if (!wasOpen || !animate) {
        openGraph(state, subset, { animate });
      } else {
        // Switching between two already-open selections: fold the current
        // one away first, then open the new one from its own dot — never a
        // straight cut, and never a slide between two unrelated layouts.
        atlasEl.classList.add("is-refolding");
        burstFx.close();
        setTimeout(() => {
          if (myToken !== transitionToken) return; // superseded already
          atlasEl.classList.remove("is-refolding");
          openGraph(state, subset);
        }, REFOLD_MS);
      }
    }

    if (!subset) {
      store.set({
        isolateSlugs: null,
        focusedSlug: null,
        matchSlugs: [],
        searchActive: false,
        query: "",
      });
      setPanelOpen(false);
      hint.hide();
      writeUrl(replaceUrl);
      return;
    }

    store.set({ isolateSlugs: subset });

    const section = state.section != null ? graph.sections[state.section] : null;
    const pair = state.year != null && section;
    crumb.textContent = pair
      ? `${state.year} · ${section.title} · ${subset.length}`
      : state.searchActive && state.matchSlugs.length
        ? `Search · ${subset.length} ${subset.length === 1 ? "match" : "matches"}`
        : `${bySlug.get(state.focusedSlug)?.title ?? ""} · connections`;

    setPanelOpen(Boolean(state.focusedSlug));
    if (state.focusedSlug) hint.hide();
    writeUrl(replaceUrl);
  } finally {
    syncing = false;
  }
}

/** Steps back one hop in the web — out of the company graph, to the sphere
 *  fan still open around the chosen year — rather than all the way out to
 *  the bare timeline. Clicking the year's own dot again (Timeline's own
 *  toggle) is the move that clears the year and collapses the whole web. */
function closeGraph() {
  store.set({ section: null, focusedSlug: null });
  sound.play("toggle");
}

document.querySelector("#close-graph").addEventListener("click", closeGraph);

/* ---------- clicking a label is clicking its node ---------- */

document.querySelector("#atlas-labels").addEventListener("click", (event) => {
  const label = event.target.closest(".atlas-label");
  if (!label) return;
  store.set({ focusedSlug: label.dataset.slug });
  sound.play("select");
});

/* ---------- colour mode ---------- */

const colorButton = document.querySelector("#color-toggle");

function paintTheme() {
  const state = store.get();
  const root = document.documentElement;

  if (!state.sectionColorOn) {
    root.style.setProperty("--section-paper", PALETTE.paper);
    root.style.setProperty("--section-ink", PALETTE.ink);
  } else {
    // With a term open the subject is that term's section; otherwise it is
    // whichever sphere is selected, and failing that the toggle's own pick.
    const focused = state.focusedSlug ? bySlug.get(state.focusedSlug) : null;
    const index = focused ? focused.section : state.section ?? state.overviewSection;
    root.style.setProperty("--section-paper", paperFor(index));
    root.style.setProperty("--section-ink", inkFor(index));
  }

  document.body.dataset.sectionColor = state.sectionColorOn ? "on" : "off";
  colorButton?.setAttribute("aria-pressed", String(state.sectionColorOn));
  colorButton?.setAttribute(
    "aria-label",
    state.sectionColorOn ? "Switch to grayscale" : "Switch to section colours"
  );
}

colorButton?.addEventListener("click", () => {
  const on = !store.get().sectionColorOn;
  store.set({
    sectionColorOn: on,
    overviewSection: on
      ? Math.floor(Math.random() * graph.sections.length)
      : store.get().overviewSection,
  });
  safe(() => localStorage.setItem(COLOR_KEY, on ? "1" : "0"));
  sound.play("toggle");
});

/* ---------- about ---------- */

const info = document.querySelector("#info");
const meta = graph.meta ?? {};
document.querySelector("#info-title").textContent = meta.title ?? "About";
document.querySelector("#info-body").innerHTML = `
  ${(meta.about ?? [])
    .map((paragraph) => `<p>${renderInline(paragraph)}</p>`)
    .join("")}
  <dl>
    <dt>The collection</dt>
    <dd>
      <b>${graph.nodes.length} terms across ${graph.sections.length} sections</b>
      <small>${graph.edges.length} connections, drawn from the links in each definition.</small>
    </dd>
  </dl>`;

const openInfo = () => {
  info.hidden = false;
  info.querySelector("[data-close]")?.focus();
  sound.play("open");
};
const closeInfo = () => {
  info.hidden = true;
  document.querySelector("#info-open").focus();
};

document.querySelector("#info-open").addEventListener("click", openInfo);
info.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closeInfo();
});

/* ---------- reactions ---------- */

window.addEventListener("popstate", () => {
  store.set(readUrl());
});

store.subscribe((state, previous) => {
  const selectionChanged =
    state.year !== previous.year ||
    state.section !== previous.section ||
    state.focusedSlug !== previous.focusedSlug;
  // A search only re-derives the view while it is the thing holding the graph
  // open. Once a year and a sphere are chosen, typing filters inside that
  // graph and must not be allowed to re-frame the camera on every keystroke.
  const searchDrives =
    state.year == null ||
    state.section == null ||
    previous.year == null ||
    previous.section == null;

  if (selectionChanged || (searchDrives && state.query !== previous.query)) {
    sync();
  }
  if (
    state.sectionColorOn !== previous.sectionColorOn ||
    state.overviewSection !== previous.overviewSection ||
    state.section !== previous.section ||
    state.focusedSlug !== previous.focusedSlug
  ) {
    paintTheme();
  }
  if (state.hoveredSlug && state.hoveredSlug !== previous.hoveredSlug) {
    sound.play("hover");
  }
});

/* ---------- keyboard ---------- */

window.addEventListener("keydown", (event) => {
  const typing =
    event.target instanceof HTMLElement &&
    (event.target.tagName === "INPUT" || event.target.isContentEditable);

  if (event.key === "/" && !typing) {
    event.preventDefault();
    search.open();
    return;
  }

  if (event.key === "Escape") {
    // Outermost thing first: a dialog, then search, then the open term, and
    // only once none of those are in the way does Escape close the graph.
    if (!info.hidden) closeInfo();
    else if (search.isOpen) search.close();
    else if (store.get().focusedSlug) store.set({ focusedSlug: null });
    else if (document.body.dataset.stage === "graph") closeGraph();
    return;
  }

  if (typing || !store.get().focusedSlug) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    panel.goForward();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    panel.goPrec();
  }
});

/* ---------- lifecycle ---------- */

window.addEventListener("resize", () => atlas.resize());

paintTheme();
// No burst on a cold load: an unfold animation only means something as the
// answer to a click, and replaceState keeps a deep link out of the history as
// its own back-step.
sync({ animate: false, replaceUrl: true });
panel.render(store.get().focusedSlug);
