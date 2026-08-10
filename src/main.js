/* Wiring: data in, atlas and panel out, URL and keyboard in between. */

import { createStore } from "./store.js";
import { Atlas } from "./atlas/index.js";
import { Panel } from "./ui/panel.js";
import { Search } from "./ui/search.js";
import { Sound } from "./ui/sound.js";
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

/** Reading order: sections in order, terms in the order the section lists
 *  them. This drives the "07 / 69" index and prev/next. */
const order = graph.sections.flatMap((section) => section.slugs);

/* A wallet is always selected, so the panel is never empty. Default to the
 * most-connected node (the hub) when no ?term= is in the URL. */
const defaultSlug = graph.nodes.reduce(
  (best, n) => (n.inDegree > best.inDegree ? n : best),
  graph.nodes[0]
).slug;

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const slugFromUrl = () => {
  const value = safe(() => new URL(location.href).searchParams.get("term"), null);
  return value && graph.nodes.some((n) => n.slug === value) ? value : null;
};

const store = createStore({
  focusedSlug: slugFromUrl() ?? defaultSlug,
  hoveredSlug: null,
  matchSlugs: [],
  searchActive: false,
  query: "",
  sectionColorOn: safe(() => localStorage.getItem(COLOR_KEY) === "1", false),
  overviewSection: 0,
});

/* ---------- chrome ---------- */

const sound = new Sound(document.querySelector("#sound-toggle"));

document.querySelector("#wordmark").innerHTML = `<b>AI</b> ${escapeHtml(
  (graph.meta?.title ?? "Coding Dictionary").replace(/^The\s+AI\s+/i, "")
)}`;

const atlas = new Atlas(document.querySelector("#atlas-canvas"), {
  graph,
  store,
  labelContainer: document.querySelector("#atlas-labels"),
  palette: PALETTE,
});

const panel = new Panel(document.querySelector("#panel"), {
  graph,
  store,
  order,
  onSound: sound.play,
});

const search = new Search(document.querySelector("#search"), {
  graph,
  store,
  onSound: sound.play,
});

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
    // With a term open the subject is that term's section; with nothing open
    // it is whichever section the toggle landed on.
    const focused = state.focusedSlug
      ? graph.nodes.find((n) => n.slug === state.focusedSlug)
      : null;
    const index = focused ? focused.section : state.overviewSection;
    root.style.setProperty("--section-paper", paperFor(index));
    root.style.setProperty("--section-ink", inkFor(index));
  }

  document.body.dataset.sectionColor = state.sectionColorOn ? "on" : "off";
  colorButton.setAttribute("aria-pressed", String(state.sectionColorOn));
  colorButton.setAttribute(
    "aria-label",
    state.sectionColorOn ? "Switch to grayscale" : "Switch to section colours"
  );
}

colorButton.addEventListener("click", () => {
  const on = !store.get().sectionColorOn;
  store.set({
    sectionColorOn: on,
    // Landing on a different section each time makes the toggle a way to
    // wander the collection, not just a colour switch.
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

/* ---------- routing ---------- */

function syncUrl(slug) {
  const url = new URL(location.href);
  if (slug) url.searchParams.set("term", slug);
  else url.searchParams.delete("term");
  if (url.href !== location.href) {
    safe(() => history.pushState({ slug }, "", url));
  }
}

window.addEventListener("popstate", () => {
  store.set({ focusedSlug: slugFromUrl() ?? defaultSlug });
});

/* ---------- reactions ---------- */

const hint = document.querySelector("#hint");

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

store.subscribe((state, previous) => {
  if (state.focusedSlug !== previous.focusedSlug) {
    syncUrl(state.focusedSlug);
    // The atlas re-centres itself in whatever space the panel leaves, and the
    // right-hand controls ride in with its edge.
    setPanelOpen(Boolean(state.focusedSlug));
    hint.hidden = Boolean(state.focusedSlug);
  }
  if (
    state.sectionColorOn !== previous.sectionColorOn ||
    state.overviewSection !== previous.overviewSection ||
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
    if (!info.hidden) closeInfo();
    else if (search.isOpen) search.close();
    // No deselect: a wallet is always selected so the panel stays open.
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
setPanelOpen(Boolean(store.get().focusedSlug));
panel.render(store.get().focusedSlug);
hint.hidden = Boolean(store.get().focusedSlug);
