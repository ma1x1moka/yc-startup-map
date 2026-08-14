/* The term panel: the right third of the screen.
 *
 * Rendered as one string per term rather than diffed, because a term change is
 * a whole-panel transition anyway — the blocks stagger in and the title wipes
 * up, and restarting those animations is the point. `--dir` carries which way
 * the reader moved so prev and next slide in from opposite sides.
 */

import { renderMarkdown, renderInline, escapeHtml } from "./markdown.js";

const ICONS = {
  close: `<path d="M7 7l10 10M17 7L7 17" stroke-linecap="round"/>`,
  left: `<path d="M14.5 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/>`,
  right: `<path d="M9.5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>`,
  chevron: `<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>`,
  share: `<path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" stroke-linecap="round" stroke-linejoin="round"/>`,
  copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15" stroke-linecap="round"/>`,
  link: `<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" stroke-linecap="round"/>`,
};

const svg = (path, className = "") =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${path}</svg>`;

const money = (v) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B`
  : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K`
  : v > 0 ? `$${Math.round(v)}` : "";

/* Turn an edge into a plain-English flow, from the focused node's point of
 * view. `dir` is "out" when the focused node is the edge's source, "in" when
 * it is the target — that plus the kind is enough to say who posts what to
 * whom. This is what makes the graph legible: not "Yuzu Money — Aave reserve"
 * but "USDe borrowed · $75.3M". */
function describeFlow(kind, dir, weight) {
  switch (kind) {
    case "collateral":
      return dir === "in"
        ? { rel: "sUSDe collateral posted", amt: money(weight), tone: "collateral" }
        : { rel: "sUSDe backing this position", amt: money(weight), tone: "collateral" };
    case "borrow-loop":
    case "borrow-organic":
      return dir === "out"
        ? { rel: "USDe borrowed from reserve", amt: money(weight), tone: kind }
        : { rel: "USDe borrowed from here", amt: money(weight), tone: kind };
    case "funds":
      return dir === "in"
        ? { rel: "Gas / capital seeded in", amt: "seed", tone: "funds" }
        : { rel: "Gas / capital seeded out", amt: "seed", tone: "funds" };
    default:
      return { rel: "Connected", amt: money(weight), tone: "" };
  }
}

export class Panel {
  constructor(element, { graph, store, order, onSound }) {
    this.element = element;
    this.graph = graph;
    this.store = store;
    this.order = order; // slugs in reading order
    this.onSound = onSound ?? (() => {});

    this.bySlug = new Map(graph.nodes.map((n) => [n.slug, n]));
    this.positionOf = new Map(order.map((slug, i) => [slug, i]));
    this.lastPosition = null;

    // Navigation follows the graph, not the reading order: `trail` is the
    // breadcrumb of where you came from ("Prec"), and each node's neighbours —
    // its edges — are the forward choices, heaviest flow first.
    this.neighboursOf = new Map(graph.nodes.map((n) => [n.slug, []]));
    for (const e of graph.edges) {
      // `dir` is relative to the node whose list this is: "out" = it is the
      // edge's source, "in" = it is the target.
      this.neighboursOf.get(e.source)?.push({ slug: e.target, weight: e.weight ?? 0, kind: e.kind, dir: "out" });
      this.neighboursOf.get(e.target)?.push({ slug: e.source, weight: e.weight ?? 0, kind: e.kind, dir: "in" });
    }
    for (const list of this.neighboursOf.values()) list.sort((a, b) => b.weight - a.weight);
    this.trail = [];
    this._wentBack = false;

    this.element.addEventListener("click", (event) => this._onClick(event));
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.focusedSlug !== previous.focusedSlug) {
        this._track(previous.focusedSlug, state.focusedSlug);
        this.render(state.focusedSlug);
      }
    });
  }

  /** Maintain the breadcrumb. Returning to the last crumb pops it (a real
   *  back); going anywhere else pushes where you were. */
  _track(from, to) {
    if (this.trail.length && to === this.trail[this.trail.length - 1]) {
      this.trail.pop();
      this._wentBack = true;
    } else {
      if (from) this.trail.push(from);
      this._wentBack = false;
    }
  }

  get precSlug() {
    return this.trail.length ? this.trail[this.trail.length - 1] : null;
  }

  /** Back to where you came from. */
  goPrec() {
    if (this.precSlug) {
      this.store.set({ focusedSlug: this.precSlug });
      this.onSound("step");
    }
  }

  /** Forward to the heaviest connected edge that is not where you came from. */
  goForward() {
    const current = this.store.get().focusedSlug;
    const prec = this.precSlug;
    const choice = (this.neighboursOf.get(current) ?? []).find((n) => n.slug !== prec);
    if (choice) {
      this.store.set({ focusedSlug: choice.slug });
      this.onSound("step");
    }
  }

  _onClick(event) {
    const termLink = event.target.closest("[data-term]");
    if (termLink) {
      event.preventDefault();
      this.store.set({ focusedSlug: termLink.dataset.term, query: "", matchSlugs: [], searchActive: false });
      this.onSound("select");
      return;
    }

    const action = event.target.closest("[data-action]");
    if (!action) return;

    const { action: kind } = action.dataset;
    if (kind === "prec") {
      this.goPrec();
    } else if (kind === "toggle-edges") {
      const wrap = action.closest(".edge-choices");
      const open = wrap.toggleAttribute("data-expanded");
      action.setAttribute("aria-expanded", String(open));
      action.textContent = open ? "less" : `+${wrap.dataset.rest} more`;
    } else if (kind === "copy-markdown" || kind === "copy-link" || kind === "share") {
      this._share(kind, action);
    }
  }

  async _share(kind, button) {
    const node = this.bySlug.get(this.store.get().focusedSlug);
    if (!node) return;

    const url = new URL(location.href);
    url.search = `?term=${encodeURIComponent(node.slug)}`;

    try {
      if (kind === "share" && navigator.share) {
        await navigator.share({ title: node.title, text: node.description, url: url.href });
        return;
      }
      const text = kind === "copy-markdown" ? `# ${node.title}\n\n${node.body}` : url.href;
      await navigator.clipboard.writeText(text);
      this._flash(button, "Copied");
    } catch (error) {
      // A denied clipboard or a dismissed share sheet is not a failure worth
      // shouting about; say so on the button and move on.
      if (error?.name !== "AbortError") this._flash(button, "Press ⌘C");
    }
  }

  _flash(button, message) {
    const label = button.querySelector("span");
    if (!label || button.dataset.flashing) return;
    const original = label.textContent;
    button.dataset.flashing = "1";
    label.textContent = message;
    setTimeout(() => {
      label.textContent = original;
      delete button.dataset.flashing;
    }, 1400);
  }

  render(slug) {
    if (!slug) {
      this.element.hidden = true;
      this.element.innerHTML = "";
      this.lastPosition = null;
      return;
    }

    const node = this.bySlug.get(slug);
    if (!node) {
      this.element.hidden = true;
      return;
    }

    const position = this.positionOf.get(slug);
    const direction = this.lastPosition === null ? 0 : this._wentBack ? -1 : 1;
    this.lastPosition = position;

    const section = this.graph.sections[node.section];
    const total = this.order.length;
    const exists = (s) => this.bySlug.has(s);

    // Graph navigation: a breadcrumb back ("Prec"), then the node's other
    // edges — heaviest first — as the forward choices.
    const prec = this.precSlug ? this.bySlug.get(this.precSlug) : null;
    const choices = (this.neighboursOf.get(slug) ?? [])
      .filter((c) => c.slug !== this.precSlug)
      .map((c) => ({ node: this.bySlug.get(c.slug), flow: describeFlow(c.kind, c.dir, c.weight) }))
      .filter((c) => c.node);

    let i = 0;
    const blocks = [];

    if (node.stats?.length) {
      blocks.push(`
        <section class="block" style="--i:${++i}">
          <span class="rule"></span>
          <p class="label">Position</p>
          <dl class="stats">
            ${node.stats
              .map(
                (s) => `<div class="stat-row"${s.tone ? ` data-tone="${s.tone}"` : ""}>
                  <dt>${escapeHtml(s.k)}</dt>
                  <dd${s.mono ? ' class="mono"' : ""}>${escapeHtml(s.v)}</dd>
                </div>`
              )
              .join("")}
          </dl>
          ${
            node.address
              ? `<a class="action etherscan" href="https://etherscan.io/address/${escapeHtml(
                  node.address
                )}" target="_blank" rel="noopener"><span>View on Etherscan</span>${svg(ICONS.link)}</a>`
              : ""
          }
        </section>`);
    }

    if (node.usage?.length) {
      blocks.push(`
        <section class="block" style="--i:${++i}">
          <span class="rule"></span>
          <p class="label">Heard in the wild</p>
          <ul class="usage">
            ${node.usage
              .map(
                (line, index) =>
                  `<li class="bubble" data-role="${index % 2 === 0 ? "q" : "a"}">${renderInline(
                    line,
                    exists
                  )}</li>`
              )
              .join("")}
          </ul>
        </section>`);
    }

    if (node.avoid) {
      blocks.push(`
        <section class="block" style="--i:${++i}">
          <span class="rule"></span>
          <p class="label" data-tone="warn">Avoid</p>
          <p class="avoid">${renderInline(node.avoid, exists)}</p>
        </section>`);
    }

    if (node.prose) {
      blocks.push(`
        <section class="block" style="--i:${++i}">
          <span class="rule"></span>
          <p class="label">Full definition</p>
          <div class="prose">${renderMarkdown(node.prose, exists)}</div>
        </section>`);
    }

    this.element.innerHTML = `
      <div class="panel-scroll">
        <article class="slide" style="--dir:${direction}">
          <header class="panel-meta">
            <p class="panel-section">${escapeHtml(section?.title ?? "")}</p>
            <p class="panel-index">
              <em>${String(position + 1).padStart(2, "0")}</em> / ${total}
            </p>
          </header>
          <span class="rule"></span>
          <h2><span>${escapeHtml(node.title)}</span></h2>
          <p class="lede">${renderInline(node.description, exists)}</p>
          ${blocks.join("")}
          <details class="more" open>
            <summary>Read more ${svg(ICONS.chevron)}</summary>
            <div class="actions">
              <button type="button" class="action" data-action="share">
                <span>Share</span>${svg(ICONS.share)}
              </button>
              <button type="button" class="action" data-action="copy-link">
                <span>Copy link</span>${svg(ICONS.link)}
              </button>
              <button type="button" class="action" data-action="copy-markdown">
                <span>Copy markdown</span>${svg(ICONS.copy)}
              </button>
            </div>
          </details>
        </article>
      </div>
      <nav class="panel-nav graph-nav">
        <button type="button" class="prec" data-action="prec" ${prec ? "" : "disabled"}>
          <span class="arrow">${svg(ICONS.left)}</span>
          <span class="text">
            <small>Prec</small>
            <span>${prec ? escapeHtml(prec.title) : "Start of trail"}</span>
          </span>
        </button>
        <div class="edge-choices" data-rest="${Math.max(0, choices.length - 3)}">
          <div class="edge-head">
            <small>Flows in &amp; out</small>
            ${
              choices.length > 3
                ? `<button type="button" class="edge-toggle" data-action="toggle-edges" aria-expanded="false">+${
                    choices.length - 3
                  } more</button>`
                : ""
            }
          </div>
          <ul class="tags flows">
            ${
              choices.length
                ? choices
                    .map(
                      ({ node, flow }) =>
                        `<li><button type="button" class="flow" data-term="${escapeHtml(
                          node.slug
                        )}"${flow.tone ? ` data-tone="${flow.tone}"` : ""}>
                          <span class="flow-dot" aria-hidden="true"></span>
                          <span class="flow-main">
                            <span class="flow-rel">${escapeHtml(flow.rel)}</span>
                            <span class="flow-node">${escapeHtml(node.title)}</span>
                          </span>
                          ${flow.amt ? `<span class="flow-amt">${escapeHtml(flow.amt)}</span>` : ""}
                        </button></li>`
                    )
                    .join("")
                : `<li class="edge-empty">no other edges</li>`
            }
          </ul>
        </div>
      </nav>`;

    this.element.hidden = false;
    this.element.scrollTop = 0;
    const scroll = this.element.querySelector(".panel-scroll");
    if (scroll) scroll.scrollTop = 0;
  }

  destroy() {
    this.unsubscribe();
  }
}
