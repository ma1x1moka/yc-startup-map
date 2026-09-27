/* The timeline — one dot per YC batch year, 2016 to 2026.
 *
 * Deliberately dumb: it writes `year` into the store and nothing else. It does
 * not know what a sphere is, what the graph is, or when the graph should open.
 * That rule is what lets the top menu be its mirror image — two controls, one
 * each for the two halves of a selection, neither aware of the other.
 *
 * It does own one piece of geometry, though: `originFor(year)` reports where a
 * year's dot sits on screen, because the graph unfolds *out of that dot* and
 * only the timeline knows where its own dots ended up after wrapping.
 */

export class Timeline {
  constructor(root, { index, store, onSound }) {
    this.root = root;
    this.index = index;
    this.store = store;
    this.onSound = onSound ?? (() => {});

    this._render();

    this.root.addEventListener("click", (event) => {
      const stop = event.target.closest("[data-year]");
      if (!stop) return;
      const year = Number(stop.dataset.year);
      const current = this.store.get().year;
      const collapsing = year === current;
      // Clicking the active year steps back out of it, so the line is its own
      // "undo" — there is no separate deselect control to hunt for. It has to
      // take the whole web down with it, not just the year: a sphere or an
      // open term left behind with no year underneath it is a pill lit up
      // with nothing to point at.
      this.store.set(
        collapsing ? { year: null, section: null, focusedSlug: null } : { year }
      );
      this.onSound(collapsing ? "toggle" : "select");
    });

    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.year !== previous.year) this._paint();
    });
  }

  /** Screen-space centre of a year's dot, for the unfold origin. */
  originFor(year) {
    const dot = this.root.querySelector(`[data-year="${year}"] .timeline-dot`);
    if (!dot) return null;
    const rect = dot.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  _render() {
    this.root.innerHTML = `
      <div class="timeline-rail" role="group" aria-label="Choose a year">
        ${this.index.years
          .map(
            (year) => `
          <button type="button" class="timeline-stop" data-year="${year}" aria-pressed="false">
            <span class="timeline-dot" aria-hidden="true"></span>
            <span class="timeline-label">${year}</span>
          </button>`
          )
          .join("")}
      </div>`;
    this._paint();
  }

  /** Selection is repainted in place rather than re-rendered: the dots are the
   *  unfold origin, and rebuilding the DOM under an in-flight animation would
   *  leave it anchored to an element that no longer exists. */
  _paint() {
    const { year } = this.store.get();
    for (const stop of this.root.querySelectorAll("[data-year]")) {
      const on = Number(stop.dataset.year) === year;
      stop.classList.toggle("is-active", on);
      stop.setAttribute("aria-pressed", String(on));
    }
  }

  destroy() {
    this.unsubscribe();
  }
}
