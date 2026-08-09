/* Interface sounds, synthesized.
 *
 * Short sine blips through an exponential decay envelope — a marimba, roughly.
 * Synthesizing rather than shipping samples keeps the bundle self-contained
 * and means the palette is a table of numbers you can tune, not a binary.
 *
 * Off by default: a page that makes noise before you ask is a page people
 * close. The choice is remembered.
 */

const STORAGE_KEY = "atlas:sound";

/** [frequency in Hz, seconds, peak gain] */
const CUES = {
  hover: [880, 0.04, 0.025],
  select: [523.25, 0.12, 0.06],
  step: [659.25, 0.09, 0.05],
  open: [392, 0.1, 0.045],
  close: [329.63, 0.12, 0.04],
  toggle: [440, 0.11, 0.05],
};

export class Sound {
  constructor(button) {
    this.button = button;
    this.context = null;
    this.enabled = false;

    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* private mode; default to silence */
    }
    this._reflect();

    button.addEventListener("click", () => {
      this.enabled = !this.enabled;
      this._reflect();
      try {
        localStorage.setItem(STORAGE_KEY, this.enabled ? "1" : "0");
      } catch {
        /* nothing to do; the toggle still works for this session */
      }
      // Play the confirmation *after* enabling, so the click that turns sound
      // on is the first thing you hear.
      if (this.enabled) this.play("toggle");
    });

    this.play = this.play.bind(this);
  }

  _reflect() {
    this.button.setAttribute("aria-pressed", String(this.enabled));
    this.button.setAttribute(
      "aria-label",
      this.enabled ? "Mute interface sounds" : "Unmute interface sounds"
    );
  }

  play(name) {
    if (!this.enabled) return;
    const cue = CUES[name];
    if (!cue) return;

    try {
      // Created lazily: constructing an AudioContext before a user gesture is
      // blocked in most browsers and logs a warning.
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === "suspended") this.context.resume();

      const [frequency, duration, peak] = cue;
      const now = this.context.currentTime;

      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);

      // A hard start or stop on a gain node is an audible click.
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch {
      /* no audio available; the interface is not worse for it */
    }
  }
}
