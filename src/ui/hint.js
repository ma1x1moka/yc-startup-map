/* "Drag to rotate · Scroll to zoom" — a contextual nudge, not a permanent
 * fixture. It pulses 2-3 times whenever a fresh graph opens, and again on
 * canvas hover, then fades out on its own; once the visitor has actually
 * dragged or scrolled the canvas, it has nothing left to teach them and
 * stops volunteering itself for the rest of the session. */
export class Hint {
  constructor(element, { canvas }) {
    this.element = element;
    this.hasInteracted = false;

    element.addEventListener("animationend", (event) => {
      if (event.animationName !== "hint-pulse") return;
      element.classList.remove("is-pulsing");
      element.hidden = true;
    });

    const markInteracted = () => {
      this.hasInteracted = true;
    };
    canvas.addEventListener("pointerdown", markInteracted);
    canvas.addEventListener("wheel", markInteracted, { passive: true });
    canvas.addEventListener("pointerenter", () => this.peek());
  }

  /** Show, pulse, fade. Calling it again while a pulse is already playing
   *  restarts it, so a hover mid-fade reads as "still here", not jumpy. */
  peek() {
    if (this.hasInteracted) return;
    this.element.hidden = false;
    this.element.classList.remove("is-pulsing");
    void this.element.offsetWidth; // force a reflow so the animation restarts
    this.element.classList.add("is-pulsing");
  }

  /** Force-hide — used whenever a term is focused, a state the hint never
   *  belongs in regardless of where a pulse was mid-flight. */
  hide() {
    this.element.classList.remove("is-pulsing");
    this.element.hidden = true;
  }
}
