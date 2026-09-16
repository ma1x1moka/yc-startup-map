/* The year navigator — a metro-line of YC batch years across the top of the
 * screen. Collapsed by default (a straight line of dots, one per year);
 * clicking a year expands it into its spheres-of-activity sub-stops.
 *
 * This does NOT re-render the atlas or introduce a second filtering system —
 * clicking a year or a sphere just writes into the same `matchSlugs` /
 * `searchActive` store fields that `/` search already drives. The atlas
 * doesn't know or care whether a match came from typing or from this;
 * "highlight this subset, dim the rest" is one mechanism with two front ends.
 */

import { escapeHtml } from "./markdown.js";

export class Timeline {
  constructor(root, { graph, store, onSound }) {
    this.root = root;
    this.store = store;
    this.onSound = onSound ?? (() => {});
    this.expandedYear = null;

    this.setGraph(graph);

    this.root.addEventListener("click", (event) => this._onClick(event));
    this.unsubscribe = store.subscribe((state, previous) => {
      // A real search takes over matchSlugs — collapse so the line doesn't
      // show a stale "expanded" year while search is actually driving things.
      if (state.query && state.query !== previous.query && this.expandedYear !== null) {
        this.expandedYear = null;
        this._render();
      }
    });
  }

  /** Rebuilds the year -> sphere -> slugs index for a different graph. */
  setGraph(graph) {
    this.graph = graph;
    this.expandedYear = null;
    this.byYear = new Map(); // year -> Map(sectionTitle -> slug[])
    for (const node of graph.nodes) {
      if (!node.year) continue;
      const title = graph.sections[node.section]?.title ?? "Other";
      if (!this.byYear.has(node.year)) this.byYear.set(node.year, new Map());
      const bySection = this.byYear.get(node.year);
      if (!bySection.has(title)) bySection.set(title, []);
      bySection.get(title).push(node.slug);
    }
    this.years = [...this.byYear.keys()].sort((a, b) => a - b);
    this._render();
  }

  _onClick(event) {
    const yearBtn = event.target.closest("[data-year]");
    if (yearBtn) {
      this._toggleYear(Number(yearBtn.dataset.year));
      return;
    }
    const sphereBtn = event.target.closest("[data-sphere]");
    if (sphereBtn) {
      const year = Number(sphereBtn.closest("[data-year-group]").dataset.yearGroup);
      this._selectSphere(year, sphereBtn.dataset.sphere);
    }
  }

  _toggleYear(year) {
    const collapsing = this.expandedYear === year;
    this.expandedYear = collapsing ? null : year;
    if (collapsing) {
      this.store.set({ matchSlugs: [], searchActive: false, query: "" });
    } else {
      const bySection = this.byYear.get(year);
      const allSlugs = [...bySection.values()].flat();
      this.store.set({ matchSlugs: allSlugs, searchActive: true, query: "" });
    }
    this._render();
    this.onSound(collapsing ? "toggle" : "open");
  }

  _selectSphere(year, sphereTitle) {
    const slugs = this.byYear.get(year)?.get(sphereTitle) ?? [];
    this.store.set({ matchSlugs: slugs, searchActive: true, query: "" });
    this.onSound("select");
  }

  _render() {
    const spheresHtml = this.expandedYear !== null ? this._renderSpheres(this.expandedYear) : "";
    this.root.innerHTML = `
      <div class="timeline-line" role="tablist" aria-label="Filter by YC batch year">
        ${this.years
          .map((y) => {
            const active = y === this.expandedYear;
            return `<button type="button" class="timeline-stop${active ? " is-active" : ""}" data-year="${y}" role="tab" aria-selected="${active}">
              <span class="timeline-dot" aria-hidden="true"></span>
              <span class="timeline-label">${y}</span>
            </button>`;
          })
          .join("")}
      </div>
      ${spheresHtml}
    `;
  }

  _renderSpheres(year) {
    const bySection = this.byYear.get(year);
    if (!bySection) return "";
    const entries = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length);
    return `<div class="timeline-spheres" data-year-group="${year}">
      ${entries
        .map(
          ([title, slugs]) => `<button type="button" class="timeline-sphere" data-sphere="${escapeHtml(title)}">
            <span>${escapeHtml(title)}</span>
            <em>${slugs.length}</em>
          </button>`
        )
        .join("")}
    </div>`;
  }

  destroy() {
    this.unsubscribe();
  }
}
