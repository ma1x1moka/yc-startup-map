/* Drag-to-resize splitter for the right-hand detail panel.
 *
 * `--panel-fraction` is already the single source of truth .panel's width,
 * the atlas's lens-shift and the corner controls' inset all read from (see
 * assets/styles.css's `body[data-panel="open"] { --panel-inset: ... }`) —
 * this just makes that variable draggable instead of a fixed constant, and
 * remembers what the visitor picked.
 */
const STORAGE_KEY = "atlas:panel-fraction";
const MIN_FRACTION = 0.22;
const MAX_FRACTION = 0.5;
const DEFAULT_FRACTION = 1 / 3;
const STEP = 0.02;

function readSaved() {
  try {
    const value = parseFloat(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) ? clamp(value) : null;
  } catch {
    return null;
  }
}

function persist(fraction) {
  try {
    localStorage.setItem(STORAGE_KEY, String(fraction));
  } catch {
    // Private browsing or a blocked store — the drag still works this visit.
  }
}

function clamp(fraction) {
  return Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, fraction));
}

export class PanelResizer {
  constructor(handle, { atlas, store }) {
    this.handle = handle;
    this.atlas = atlas;
    this.store = store;
    this.root = document.documentElement;
    this.dragging = false;

    this.fraction = readSaved() ?? DEFAULT_FRACTION;
    this._write(this.fraction);

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("is-resizing-panel");
      window.addEventListener("pointermove", this._onPointerMove);
      window.addEventListener("pointerup", this._onPointerUp);
    });

    // A real separator, not just a mouse affordance: arrow keys nudge it,
    // and a double-click/double-tap resets to the default width.
    handle.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") this._apply(this.fraction + STEP);
      else if (event.key === "ArrowRight") this._apply(this.fraction - STEP);
      else return;
      event.preventDefault();
    });
    handle.addEventListener("dblclick", () => this._apply(DEFAULT_FRACTION));
  }

  _onPointerMove(event) {
    if (!this.dragging) return;
    this._apply((window.innerWidth - event.clientX) / window.innerWidth);
  }

  _onPointerUp() {
    this.dragging = false;
    document.body.classList.remove("is-resizing-panel");
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    persist(this.fraction);
  }

  _apply(fraction) {
    this.fraction = clamp(fraction);
    this._write(this.fraction);
    // Only chases the atlas's lens-shift while a term is actually open —
    // otherwise there is no panel on screen to be making room for yet.
    if (this.store.get().focusedSlug) this.atlas.setPanelFraction(this.fraction);
  }

  _write(fraction) {
    this.root.style.setProperty("--panel-fraction", String(fraction));
    this.handle.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
  }
}
