/* The unfold burst: a fan of lines that draws itself outward from a point
 * and retracts back into it — the "bundles of connections unfurling" effect
 * that plays on top of the atlas's own clip-path reveal.
 *
 * It carries no real edge data and knows nothing about the graph. That is
 * deliberate: the actual subset layout takes a real (if small) amount of
 * work and settles over time as the force layout cools, so anything trying
 * to draw *true* edges here would either wait on that or draw the wrong
 * picture. This is a flourish, generated fresh in a fraction of a millisecond,
 * timed to roughly cover the same span as the real reveal underneath it.
 */

const OPEN_DRAW_MS = 620;
const OPEN_STAGGER_MS = 16;
const CLOSE_DRAW_MS = 420;
const CLOSE_STAGGER_MS = 13;

export class Burst {
  constructor(svg) {
    this.svg = svg;
    this.paths = [];
    this._timers = [];
  }

  /** @param {{x:number,y:number}} origin @param {number} count roughly how
   *  many lines to draw — clamped to a range that always reads as "a bundle,"
   *  never one lonely thread or an unreadable thicket. */
  open(origin, count = 14) {
    this._clearTimers();
    if (!origin) return;
    this.svg.replaceChildren();

    const n = Math.max(9, Math.min(18, Math.round(count) || 14));
    const spread = Math.min(window.innerWidth, window.innerHeight);
    this.paths = [];

    for (let i = 0; i < n; i++) {
      // Mostly downward and outward — the graph appears below/around the
      // timeline, not above it — with enough angular jitter that the fan
      // doesn't read as a mechanical sunburst.
      const angle = ((-96 + (272 * (i + 0.5)) / n + (Math.random() - 0.5) * 20) * Math.PI) / 180;
      const length = spread * (0.14 + Math.random() * 0.3);
      const bow = (Math.random() - 0.5) * length * 0.6;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const nx = -dy;
      const ny = dx;
      const ex = origin.x + dx * length;
      const ey = origin.y + dy * length;
      const mx = origin.x + dx * length * 0.55 + nx * bow;
      const my = origin.y + dy * length * 0.55 + ny * bow;

      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("class", "burst-line");
      el.setAttribute("d", `M ${origin.x} ${origin.y} Q ${mx} ${my} ${ex} ${ey}`);
      this.svg.appendChild(el);
      this.paths.push(el);
    }

    this.svg.style.transition = "none";
    this.svg.style.opacity = "1";

    // Two frames: one to let the browser paint each path at strokeDashoffset
    // == its own length (fully undrawn), and only then start the transition
    // toward 0 — starting the transition on the same frame the dasharray is
    // set can get coalesced away and the line never visibly draws at all.
    requestAnimationFrame(() => {
      const lengths = this.paths.map((el) => el.getTotalLength());
      this.paths.forEach((el, i) => {
        el.style.strokeDasharray = `${lengths[i]}`;
        el.style.strokeDashoffset = `${lengths[i]}`;
      });
      requestAnimationFrame(() => {
        this.paths.forEach((el, i) => {
          const delay = i * OPEN_STAGGER_MS;
          el.style.transition = `stroke-dashoffset ${OPEN_DRAW_MS}ms cubic-bezier(0.16,0.8,0.24,1) ${delay}ms`;
          el.style.strokeDashoffset = "0";
        });
      });
    });

    const total = OPEN_DRAW_MS + n * OPEN_STAGGER_MS;
    this._after(total + 80, () => {
      this.svg.style.transition = "opacity 0.5s ease";
      this.svg.style.opacity = "0";
    });
    this._after(total + 80 + 550, () => this._clear());
  }

  /** Retract whatever is currently drawn back into `origin`. If nothing is
   *  drawn (closing without a preceding open — a cold-load deep link that
   *  closes before ever opening, say) this is a no-op. */
  close() {
    const paths = this.paths;
    if (!paths.length) {
      this._clearTimers();
      return;
    }
    this._clearTimers();

    this.svg.style.transition = "none";
    this.svg.style.opacity = "1";

    const n = paths.length;
    // Reverse stagger: the most recently drawn line is the first to
    // disappear, so the bundle reads as unravelling rather than as the same
    // animation played backwards.
    paths.forEach((el, i) => {
      const length = parseFloat(el.style.strokeDasharray) || el.getTotalLength();
      const delay = (n - 1 - i) * CLOSE_STAGGER_MS;
      el.style.transition = `stroke-dashoffset ${CLOSE_DRAW_MS}ms cubic-bezier(0.6,0,0.9,0.2) ${delay}ms`;
      el.style.strokeDashoffset = `${length}`;
    });

    const total = CLOSE_DRAW_MS + n * CLOSE_STAGGER_MS;
    this._after(total + 60, () => {
      this.svg.style.transition = "opacity 0.3s ease";
      this.svg.style.opacity = "0";
    });
    this._after(total + 60 + 350, () => this._clear());
  }

  _after(ms, fn) {
    this._timers.push(setTimeout(fn, ms));
  }

  _clearTimers() {
    for (const id of this._timers) clearTimeout(id);
    this._timers = [];
  }

  _clear() {
    this.svg.replaceChildren();
    this.svg.style.transition = "none";
    this.svg.style.opacity = "0";
    this.paths = [];
  }
}
