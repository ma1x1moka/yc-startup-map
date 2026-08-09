/* Camera: orbit by drag, dolly by wheel, fly to a node on select.
 *
 * Written rather than pulled from OrbitControls because the interesting
 * behaviour here is the fly-to — the target has to travel to the selected node
 * while the distance closes, and both have to interrupt cleanly when the user
 * grabs the atlas mid-flight. Wiring that into OrbitControls is more code than
 * the spherical maths it would replace.
 */

import { Vector3 } from "three";

const MIN_DISTANCE = 90;
const MAX_DISTANCE = 1400;
/** Just short of the poles, where azimuth becomes meaningless and the atlas
 *  appears to spin about a point. */
const MAX_POLAR = Math.PI / 2 - 0.08;
const AUTO_ROTATE = 0.028; // radians/second
const IDLE_BEFORE_AUTO_ROTATE = 4000; // ms

export class Controls {
  constructor(camera, element, homeDistance = 560) {
    this.camera = camera;
    this.element = element;
    this.homeDistance = homeDistance;

    this.azimuth = 0.6;
    this.polar = 0.18;
    this.distance = homeDistance;
    this.target = new Vector3(0, 0, 0);

    // What we are easing toward. Actual values chase these every frame.
    this.goal = {
      azimuth: 0.6,
      polar: 0.18,
      distance: homeDistance,
      target: new Vector3(),
    };

    this.dragging = false;
    this.moved = 0;
    this.lastInteraction = 0;
    this.enabled = true;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    element.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    element.addEventListener("wheel", this._onWheel, { passive: false });
  }

  _onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;
    this.dragging = true;
    this.moved = 0;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.lastInteraction = performance.now();
    this.element.setPointerCapture?.(event.pointerId);
  }

  _onPointerMove(event) {
    if (!this.dragging) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.moved += Math.abs(dx) + Math.abs(dy);

    this.goal.azimuth -= dx * 0.005;
    this.goal.polar = Math.max(
      -MAX_POLAR,
      Math.min(MAX_POLAR, this.goal.polar + dy * 0.005)
    );
    this.lastInteraction = performance.now();
  }

  _onPointerUp() {
    this.dragging = false;
    this.lastInteraction = performance.now();
  }

  _onWheel(event) {
    if (!this.enabled) return;
    event.preventDefault();
    // Scale multiplicatively so a notch feels the same at every zoom level.
    const factor = Math.exp(event.deltaY * 0.0012);
    this.goal.distance = Math.max(
      MIN_DISTANCE,
      Math.min(MAX_DISTANCE, this.goal.distance * factor)
    );
    this.lastInteraction = performance.now();
  }

  /** True if the last pointer sequence was a click rather than a drag. */
  wasClick() {
    return this.moved < 6;
  }

  flyTo(position, distance) {
    this.goal.target.set(position[0], position[1], position[2]);
    this.goal.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
  }

  reset() {
    this.goal.target.set(0, 0, 0);
    this.goal.distance = this.homeDistance;
  }

  update(dt, now) {
    // Drift only once the user has stopped touching it, so the atlas reads as
    // alive without fighting anybody's hand.
    if (!this.dragging && now - this.lastInteraction > IDLE_BEFORE_AUTO_ROTATE) {
      this.goal.azimuth += AUTO_ROTATE * dt;
    }

    // Frame-rate independent exponential ease: the fraction of the remaining
    // gap closed per second is constant, whatever the frame time.
    const ease = 1 - Math.pow(0.0016, dt);
    this.azimuth += (this.goal.azimuth - this.azimuth) * ease;
    this.polar += (this.goal.polar - this.polar) * ease;
    this.distance += (this.goal.distance - this.distance) * ease;
    this.target.lerp(this.goal.target, ease);

    const cosPolar = Math.cos(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * cosPolar * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.sin(this.polar),
      this.target.z + this.distance * cosPolar * Math.cos(this.azimuth)
    );
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.element.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    this.element.removeEventListener("wheel", this._onWheel);
  }
}
