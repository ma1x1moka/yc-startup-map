/* Wiring: data in, atlas and panel out, URL and keyboard in between.
 *
 * Two independent graphs ship in this build — the main atlas and the Review
 * Queue — switched via the tab bar. They never mix: switching tears down the
 * old Atlas/Panel (both have a clean `destroy()`) and mounts fresh ones for
 * the other graph's data, so a slug from one graph can never leak into the
 * other's camera, labels, or panel state. Search survives the switch (it has
 * no WebGL/DOM-listener lifecycle issue) via `setGraph()` instead of being
 * re-constructed, which would double up its event listeners.
 */

import { createStore } from "./store.js";
import { Atlas } from "./atlas/index.js";
import { nodeRadius } from "./atlas/nodes.js";
import { Panel } from "./ui/panel.js";
import { Search } from "./ui/search.js";
import { Sound } from "./ui/sound.js";
import { PALETTE, paperFor, inkFor } from "./palette.js";
import { escapeHtml, renderInline } from "./ui/markdown.js";

const COLOR_KEY = "atlas:section-color";

/* The build inlines both data/graph.json and data/graph-review.json here.
 * There is deliberately no fetch fallback: the app has to be bundled anyway
 * (bare module specifiers), so a fetch path would be code that can never
 * run — and it would undermine the build's guarantee that the output makes
 * no external requests. */
const GRAPHS = {
  main: globalThis.__ATLAS_GRAPH__,
  review: globalThis.__REVIEW_GRAPH__,
};
if (!GRAPHS.main || !GRAPHS.review) {
  throw new Error(
    "No graph found. Run `npm run graph:all && npm run build` and serve " +
      "dist/ — index.html at the repo root is a template, not a runnable page."
  );
}

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

function graphKeyFromUrl() {
  const value = safe(() => new URL(location.href).searchParams.get("graph"), null);
  return value === "review" ? "review" : "main";
}

function slugFromUrl(graph) {
  const value = safe(() => new URL(location.href).searchParams.get("term"), null);
  return value && graph.nodes.some((n) => n.slug === value) ? value : null;
}

function defaultSlugFor(graph) {
  return graph.nodes.reduce((best, n) => (n.inDegree > best.inDegree ? n : best), graph.nodes[0])
    .slug;
}

const store = createStore({
  activeGraph: "main",
  focusedSlug: null,
  hoveredSlug: null,
  matchSlugs: [],
  searchActive: false,
  query: "",
  sectionColorOn: safe(() => localStorage.getItem(COLOR_KEY) === "1", false),
  overviewSection: 0,
});

/* ---------- chrome that exists once, regardless of which graph is active ---------- */

const sound = new Sound(document.querySelector("#sound-toggle"));

let atlas = null;
let panel = null;
let order = [];
let legendEl = null;

const search = new Search(document.querySelector("#search"), {
  graph: GRAPHS[store.get().activeGraph],
  store,
  onSound: sound.play,
});

document.querySelector("#atlas-labels").addEventListener("click", (event) => {
  const label = event.target.closest(".atlas-label");
  if (!label) return;
  store.set({ focusedSlug: label.dataset.slug });
  sound.play("select");
});

/* ---------- tabs ---------- */

const tabButtons = [...document.querySelectorAll(".graph-tab")];
for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const key = button.dataset.graph;
    if (key !== store.get().activeGraph) mount(key, { useUrlTerm: false });
  });
}

function paintTabs(activeKey) {
  for (const button of tabButtons) {
    const isActive = button.dataset.graph === activeKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

/* ---------- colour mode ---------- */

const colorButton = document.querySelector("#color-toggle");

function paintTheme() {
  const graph = GRAPHS[store.get().activeGraph];
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
  colorButton?.setAttribute("aria-pressed", String(state.sectionColorOn));
  colorButton?.setAttribute(
    "aria-label",
    state.sectionColorOn ? "Switch to grayscale" : "Switch to section colours"
  );
}

colorButton?.addEventListener("click", () => {
  const graph = GRAPHS[store.get().activeGraph];
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

function renderInfo() {
  const graph = GRAPHS[store.get().activeGraph];
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
}

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

function syncUrl(state) {
  const url = new URL(location.href);
  if (state.focusedSlug) url.searchParams.set("term", state.focusedSlug);
  else url.searchParams.delete("term");
  // Keep the default tab's URLs clean — only stamp ?graph= for the non-default one.
  if (state.activeGraph === "review") url.searchParams.set("graph", "review");
  else url.searchParams.delete("graph");
  if (url.href !== location.href) {
    safe(() => history.pushState({ slug: state.focusedSlug, graph: state.activeGraph }, "", url));
  }
}

window.addEventListener("popstate", () => {
  const key = graphKeyFromUrl();
  mount(key, { useUrlTerm: true });
});

/* ---------- panel width / hint ---------- */

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
  atlas?.setPanelFraction(fraction);
}

/* ---------- mount: swap in a graph as the active one ---------- */

/** Tears down the previous Atlas/Panel (if any) and builds fresh ones around
 *  `key`'s graph. `useUrlTerm` is true only on first load / back-forward, so
 *  a manual tab click always lands on that graph's own hub node rather than
 *  trying to interpret the other graph's ?term= value. */
function mount(key, { useUrlTerm }) {
  const graph = GRAPHS[key];

  atlas?.destroy();
  panel?.destroy();
  if (legendEl) {
    legendEl.remove();
    legendEl = null;
  }

  order = graph.sections.flatMap((section) => section.slugs);
  const focusedSlug = (useUrlTerm && slugFromUrl(graph)) || defaultSlugFor(graph);

  // Reset every graph-scoped field *before* constructing the new Atlas/Panel
  // below — both subscribe to this store in their constructors, and a value
  // already in the store when something subscribes never fires that
  // subscriber (same reason the very first mount doesn't need special-casing).
  // Doing this after construction instead would let the new Panel's fresh
  // subscription see a transition FROM the old graph's leftover slug, which
  // isn't a node in the new graph — corrupting its breadcrumb trail.
  store.set({
    activeGraph: key,
    focusedSlug,
    hoveredSlug: null,
    matchSlugs: [],
    searchActive: false,
    query: "",
    overviewSection: 0,
  });

  document.querySelector("#wordmark").innerHTML = `<b>AI</b> ${escapeHtml(
    (graph.meta?.title ?? "Coding Dictionary").replace(/^The\s+AI\s+/i, "")
  )}`;

  atlas = new Atlas(document.querySelector("#atlas-canvas"), {
    graph,
    store,
    labelContainer: document.querySelector("#atlas-labels"),
    palette: PALETTE,
  });

  // Node size encodes debt, but nothing on screen said so — this is the key.
  // Dots are drawn at the same nodeRadius() scale as the wallets themselves,
  // so "this dot = $25M" is a true reading of the atlas, not a decorative guess.
  const sizeLegend = graph.meta?.sizeLegend;
  if (sizeLegend?.refs?.length) {
    const maxRadius = Math.max(...sizeLegend.refs.map((r) => nodeRadius(r.inDegree)));
    legendEl = document.createElement("div");
    legendEl.className = "legend";
    legendEl.setAttribute("aria-hidden", "true");
    legendEl.innerHTML = `
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
    document.body.appendChild(legendEl);
  }

  panel = new Panel(document.querySelector("#panel"), {
    graph,
    store,
    order,
    onSound: sound.play,
  });

  search.setGraph(graph);

  paintTabs(key);
  renderInfo();
  paintTheme();
  setPanelOpen(Boolean(focusedSlug));
  panel.render(focusedSlug);
  hint.hidden = Boolean(focusedSlug);
}

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

window.addEventListener("resize", () => atlas?.resize());

// The initial mount's own store.set() must not be seen by the reactions
// subscription below — a value already in the store when something
// subscribes never fires that subscriber, which is exactly what a fresh page
// load wants (no spurious history.pushState for a term that was never
// navigated to, just loaded). Subsequent mounts (tab clicks, popstate) run
// with the subscription already live, so they react normally.
mount(graphKeyFromUrl(), { useUrlTerm: true });

/* ---------- reactions ---------- */

store.subscribe((state, previous) => {
  if (state.focusedSlug !== previous.focusedSlug || state.activeGraph !== previous.activeGraph) {
    syncUrl(state);
  }
  if (state.focusedSlug !== previous.focusedSlug) {
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
