/* The top menu — one entry per sphere of activity.
 *
 * The timeline's mirror image: it writes `section` into the store and nothing
 * else. Between them they supply the two halves of a selection, and only
 * main.js decides that two halves make a graph.
 *
 * The counts are the part that earns its keep. With a year chosen, each entry
 * reports how many companies that year actually holds, and the empty ones go
 * disabled — so you can see that 2016 has no AI tooling *before* clicking into
 * an empty graph and wondering whether it broke.
 *
 * Hidden until a year is picked. That is the whole of the "click a date and a
 * web opens to the spheres" idea from this side of it: this menu doesn't
 * become the second hop of that web until there is a first hop for it to be
 * the second half of. src/ui/web.js draws the actual connecting lines; this
 * class only ever toggles opacity, never removes the pills from layout, so
 * their real screen position is always there for that other module to read.
 */

import { escapeHtml } from "./markdown.js";

export class Nav {
  constructor(root, { index, store, onSound }) {
    this.root = root;
    this.index = index;
    this.store = store;
    this.onSound = onSound ?? (() => {});

    this._render();

    this.root.addEventListener("click", (event) => {
      const item = event.target.closest("[data-section]");
      // The CSS hides these pills with opacity, not display, so a keyboard
      // user tabbing through the page can still reach and activate one while
      // it's invisible. Without this guard that would set `section` with no
      // `year` underneath it — the exact orphaned state that used to make a
      // pill light up with no year selected and no web to draw.
      if (!item || item.disabled || this.store.get().year == null) return;
      const section = Number(item.dataset.section);
      const current = this.store.get().section;
      this.store.set({ section: section === current ? null : section });
      this.onSound(section === current ? "toggle" : "select");
    });

    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.section !== previous.section) this._paint();
      if (state.year !== previous.year) {
        this._paintCounts();
        this._paintVisibility();
      }
    });
  }

  _render() {
    this.root.innerHTML = `
      <div class="nav-row" role="group" aria-label="Choose a sphere of activity">
        ${this.index.sections
          .map(
            (section) => `
          <button type="button" class="nav-item" data-section="${section.index}" aria-pressed="false">
            <span class="nav-name">${escapeHtml(section.title)}</span>
            <span class="nav-count" data-count-for="${section.index}">${section.total}</span>
          </button>`
          )
          .join("")}
      </div>`;
    this.row = this.root.querySelector(".nav-row");
    this._paint();
    // Not only on a year *change*: a deep link can arrive with a year already
    // set, and the counts would otherwise sit on the whole-collection totals
    // (and the pills stay hidden) until the user happened to touch the
    // timeline.
    this._paintCounts();
    this._paintVisibility();
  }

  _paintVisibility() {
    const visible = this.store.get().year != null;
    this.row.classList.toggle("is-visible", visible);
    // Belt and braces alongside the click guard above: a hidden pill should
    // not even be a tab stop, or a keyboard user walks past eleven invisible
    // buttons on the way to the timeline.
    for (const item of this.root.querySelectorAll("[data-section]")) {
      item.tabIndex = visible ? 0 : -1;
    }
  }

  _paint() {
    const { section } = this.store.get();
    for (const item of this.root.querySelectorAll("[data-section]")) {
      const on = Number(item.dataset.section) === section;
      item.classList.toggle("is-active", on);
      item.setAttribute("aria-pressed", String(on));
    }
  }

  /** Counts narrow to the chosen year, and widen back to the whole collection
   *  when the year is cleared. */
  _paintCounts() {
    const { year } = this.store.get();
    for (const item of this.root.querySelectorAll("[data-section]")) {
      const index = Number(item.dataset.section);
      const count =
        year == null ? this.index.sections[index].total : this.index.countFor(year, index);
      item.querySelector("[data-count-for]").textContent = count;
      item.disabled = count === 0;
    }
  }

  destroy() {
    this.unsubscribe();
  }
}
