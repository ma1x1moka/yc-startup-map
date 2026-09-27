/* The web's first hop: real lines from the chosen year's dot up to each
 * sphere pill.
 *
 * Unlike src/ui/burst.js, this is not a one-shot flourish — it is structural,
 * staying up for as long as a year is chosen at all, whether or not a
 * sphere's own company-graph is currently open on top of it, and simply
 * redrawn (never re-animated) whenever the year or section changes or the
 * window resizes. Together with the pills becoming visible only once a year
 * is chosen (see nav.js), this is what turns "click a date" into "a web opens
 * toward the spheres": the lines and the pills appear together, anchored to
 * real screen positions rather than to a fixed layout.
 *
 * It draws to *every* pill, not only ones with a nonzero count for that year
 * — an empty sphere is still part of the web, just a faint line saying so,
 * which is more honest than a gap where a connection should be.
 */

export class Web {
  constructor(svg, { store, timeline, navRoot }) {
    this.svg = svg;
    this.store = store;
    this.timeline = timeline;
    this.navRoot = navRoot;

    this._onResize = () => this.redraw();
    window.addEventListener("resize", this._onResize);

    // Always a full redraw, never just a repaint of which line is "active":
    // a section change is exactly the moment the atlas may be about to open
    // and the shell about to compact underneath these lines, so the safe
    // assumption is that every pill's position is suspect, not just its
    // highlight.
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.year !== previous.year || state.section !== previous.section) {
        this.redraw();
      }
    });

    // A deep link can arrive with a year already set — the lines need to
    // exist from the first frame, not wait for a change event that already
    // happened before this ran.
    this.redraw();
  }

  /** Recompute every line from scratch. Safe to call any time — reads
   *  whatever is on screen right now, so it never needs to know *why* it is
   *  being asked to redraw. */
  redraw() {
    const { year, section } = this.store.get();
    if (year == null) {
      this.svg.replaceChildren();
      return;
    }
    const origin = this.timeline.originFor(year);
    const pills = [...this.navRoot.querySelectorAll(".nav-item")];
    if (!origin || !pills.length) {
      this.svg.replaceChildren();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const pill of pills) {
      const r = pill.getBoundingClientRect();
      // Bottom-centre: the edge nearest the timeline, so the line runs up
      // *into* the pill rather than crossing through its middle.
      const ax = r.left + r.width / 2;
      const ay = r.bottom;
      const dx = ax - origin.x;
      // A gentle S so the lines read as drawn, not ruled — leaving the dot
      // mostly upright before bending toward its pill.
      const midX = origin.x + dx * 0.5;
      const midY = origin.y - (origin.y - ay) * 0.62;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${origin.x} ${origin.y} Q ${midX} ${midY} ${ax} ${ay}`);
      const isActive = Number(pill.dataset.section) === section;
      path.setAttribute(
        "class",
        `web-line${pill.disabled ? " is-empty" : ""}${isActive ? " is-active" : ""}`
      );
      path.dataset.section = pill.dataset.section;
      frag.appendChild(path);
    }
    this.svg.replaceChildren(frag);
  }

  destroy() {
    window.removeEventListener("resize", this._onResize);
    this.unsubscribe();
  }
}
