/* The atlas: scene, render loop, and the mapping from app state to what you
 * see. Everything visual that depends on selection, hover, search or colour
 * mode is decided in `restyle()` and written into attribute buffers — the
 * layers themselves hold no opinions about it.
 *
 * The canvas is transparent and the page's own background supplies the paper
 * colour. That keeps one source of truth for the palette (CSS), and sidesteps
 * colour-space conversion on the clear colour.
 */

import {
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

import { NodeLayer, nodeRadius } from "./nodes.js";
import { EdgeLayer } from "./edges.js";
import { LabelLayer } from "./labels.js";
import { Controls } from "./controls.js";

/** hex -> [r,g,b] in 0..1. */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* Both distances are multiples of the cloud's own radius, so the framing holds
 * for a content folder of any size. */
/** Close enough that a term's neighbourhood is the subject, far enough that
 *  the rest of the atlas still reads as context behind it. */
const FOCUS_DISTANCE = 1.55;
/** Depth of field when focused: shallow, but not so shallow that the
 *  neighbourhood itself goes soft. */
const FOCUS_RANGE = 1.8;
/** Framing for the overview, and a range wide enough to keep it all sharp. */
const HOME_DISTANCE = 2.3;
const HOME_RANGE = 12;

export class Atlas {
  constructor(canvas, { graph, store, labelContainer, palette }) {
    this.canvas = canvas;
    this.store = store;
    this.graph = graph;
    this.palette = palette;

    this.nodes = graph.nodes;
    this.indexBySlug = new Map(this.nodes.map((n, i) => [n.slug, i]));
    const positionBySlug = new Map(this.nodes.map((n) => [n.slug, n.layout]));

    this.neighbours = new Map(this.nodes.map((n) => [n.slug, new Set()]));
    graph.edges.forEach((edge) => {
      this.neighbours.get(edge.source)?.add(edge.target);
      this.neighbours.get(edge.target)?.add(edge.source);
    });

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearAlpha(0);
    // No conversion on the way out, so the colours here are the same sRGB
    // values the stylesheet uses.
    this.renderer.outputColorSpace = LinearSRGBColorSpace;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(45, 1, 1, 6000);

    this.nodeLayer = new NodeLayer(this.nodes);
    this.edgeLayer = new EdgeLayer(graph.edges, positionBySlug);
    this.labelLayer = new LabelLayer(labelContainer, this.nodes);
    this.labelLayer.setRadii(this.nodeLayer.radii);

    // How big the cloud is, so the depth ramp and the framing both scale with
    // whatever content is loaded rather than assuming this collection's size.
    // The 90th percentile, not the maximum: one far-flung term should not push
    // the camera back and shrink everything else.
    const radii = this.nodes
      .map((n) => Math.hypot(n.layout[0], n.layout[1], n.layout[2]))
      .sort((a, b) => a - b);
    this.cloudRadius = Math.max(1, radii[Math.floor(radii.length * 0.9)] ?? 1);
    this.nodeLayer.setHazeRadius(this.cloudRadius);

    // Framing: at a 45° field of view this puts the cloud across roughly
    // four-fifths of the frame, leaving room for the labels around its edge.
    this.controls = new Controls(this.camera, canvas, this.cloudRadius * HOME_DISTANCE);
    this.scene.add(this.edgeLayer.lines, this.edgeLayer.dots, this.nodeLayer.mesh);

    // Scratch buffers, reused every restyle so the loop allocates nothing.
    this.colors = new Float32Array(this.nodes.length * 3);
    this.alphas = new Float32Array(this.nodes.length);
    this.labelWeights = new Float32Array(this.nodes.length);
    this.edgeAlphas = new Float32Array(graph.edges.length);

    // A faint, weight-scaled resting visibility so the thick flows into the
    // hub read in the overview. Kindless/weightless edges (e.g. the dictionary
    // content) stay hidden until focus, as before.
    const edgeW = graph.edges.map((e) => e.weight ?? null);
    const maxEdgeW = Math.max(1, ...edgeW.map((w) => w ?? 0));
    this.edgeResting = graph.edges.map((e) =>
      e.weight == null ? 0 : 0.05 + 0.16 * Math.sqrt((e.weight || 0) / maxEdgeW)
    );

    this.lensShift = 0;
    this.lensShiftGoal = 0;
    this.width = 1;
    this.height = 1;
    this.projected = new Vector3();

    this._onClick = this._onClick.bind(this);
    this._onMove = this._onMove.bind(this);
    canvas.addEventListener("pointerup", this._onClick);
    canvas.addEventListener("pointermove", this._onMove);

    this.unsubscribe = store.subscribe(() => this.restyle());
    this.resize();
    this.restyle();

    this.clock = performance.now();
    this.running = true;
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  /* ---------- interaction ---------- */

  /** Nearest node to a screen point, or null. */
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // A world-space radius converts to this many pixels at distance d.
    const scale = this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));

    let best = null;
    let bestDistance = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.alphas[i] < 0.2) continue;
      const node = this.nodes[i];
      this.projected.set(node.layout[0], node.layout[1], node.layout[2]);
      const depth = this.camera.position.distanceTo(this.projected);
      this.projected.project(this.camera);
      if (this.projected.z > 1) continue;

      const sx = (this.projected.x + 1) * (this.width / 2);
      const sy = (1 - this.projected.y) * (this.height / 2);
      const radius = Math.max(10, (nodeRadius(node.inDegree) * scale) / depth);
      const d = Math.hypot(sx - x, sy - y);
      if (d < radius && d < bestDistance) {
        bestDistance = d;
        best = node.slug;
      }
    }
    return best;
  }

  _onClick(event) {
    if (!this.controls.wasClick()) return;
    const slug = this.pick(event.clientX, event.clientY);
    // A wallet is always selected — clicking a node moves the selection, but
    // clicking empty space keeps the current one so the panel is never empty.
    if (slug) this.store.set({ focusedSlug: slug });
  }

  _onMove(event) {
    if (this.controls.dragging) return;
    const slug = this.pick(event.clientX, event.clientY);
    this.canvas.style.cursor = slug ? "pointer" : "grab";
    this.store.set({ hoveredSlug: slug });
  }

  /* ---------- appearance ---------- */

  restyle() {
    const state = this.store.get();
    const { focusedSlug, hoveredSlug, matchSlugs, searchActive, sectionColorOn } = state;

    const focusedNode = focusedSlug ? this.graph.nodes[this.indexBySlug.get(focusedSlug)] : null;
    const activeSection = focusedNode
      ? focusedNode.section
      : state.overviewSection ?? 0;

    const paper = sectionColorOn
      ? rgb(this.palette.papers[activeSection])
      : rgb(this.palette.paper);
    const ink = sectionColorOn
      ? rgb(this.palette.inks[activeSection])
      : rgb(this.palette.ink);

    this.nodeLayer.setPaper(paper);
    this.edgeLayer.setColor(sectionColorOn ? mix(ink, paper, 0.35) : mix(ink, paper, 0.55));

    const matches = matchSlugs?.length ? new Set(matchSlugs) : null;
    const near = focusedSlug ? this.neighbours.get(focusedSlug) : null;
    const maxDegree = Math.max(1, ...this.nodes.map((n) => n.inDegree));

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const isFocused = node.slug === focusedSlug;
      const isNeighbour = near?.has(node.slug) ?? false;
      const isMatch = matches?.has(node.slug) ?? false;

      // In colour mode the active section is the subject and everything else
      // recedes into the paper; in grayscale everything is ink.
      let color = ink;
      if (sectionColorOn && node.section !== activeSection) {
        // Far enough toward the paper that the active section reads as the
        // subject even when its ink is white and the paper is a light colour.
        color = mix(ink, paper, 0.72);
      }
      if (node.slug === hoveredSlug || isFocused) color = mix(color, ink, 1);

      let alpha;
      let weight;
      if (searchActive) {
        alpha = isMatch ? 1 : 0.09;
        weight = isMatch ? 1 : 0;
      } else if (focusedSlug) {
        alpha = isFocused ? 1 : isNeighbour ? 0.92 : 0.34;
        weight = isFocused ? 1 : isNeighbour ? 0.8 : 0.22;
      } else {
        alpha = 1;
        // With nothing selected, let connectedness decide who gets a label —
        // the hubs are the map's landmarks.
        weight = 0.34 + 0.66 * (Math.log1p(node.inDegree) / Math.log1p(maxDegree));
      }
      if (node.slug === hoveredSlug) weight = Math.max(weight, 0.95);

      this.colors[i * 3] = color[0];
      this.colors[i * 3 + 1] = color[1];
      this.colors[i * 3 + 2] = color[2];
      this.alphas[i] = alpha;
      this.labelWeights[i] = weight;
    }

    const active = [];
    this.graph.edges.forEach((edge, e) => {
      const touchesFocus = edge.source === focusedSlug || edge.target === focusedSlug;
      const bothMatch = matches?.has(edge.source) && matches?.has(edge.target);

      let alpha = 0;
      if (searchActive) alpha = bothMatch ? 0.6 : 0;
      else if (focusedSlug) alpha = touchesFocus ? 0.7 : Math.min(this.edgeResting[e], 0.05);
      else alpha = this.edgeResting[e];

      this.edgeAlphas[e] = alpha;
      if (alpha > 0.3) active.push(e);
    });

    this.nodeLayer.apply(this.colors, this.alphas);
    this.edgeLayer.apply(this.edgeAlphas, active);

    // Only move the camera when the *selection* changes — restyle also runs on
    // hover and search, and re-flying on every one of those was yanking the
    // atlas back to the focus framing a beat after the user zoomed or panned.
    if (focusedSlug !== this.lastFocused) {
      if (focusedNode) this._frameNeighbourhood(focusedNode);
      else if (this.lastFocused) this.controls.reset();
    }
    this.lastFocused = focusedSlug;

    this.focusTight = Boolean(focusedSlug);
  }

  /** Fly to frame the focused node *together with everything it connects to*,
   *  so a wallet's collateral source and the reserve it borrows from land in
   *  the same frame — the relationship, not a lone dot floating in space. */
  _frameNeighbourhood(node) {
    const pts = [node.layout];
    let maxRadius = nodeRadius(node.inDegree);
    for (const slug of this.neighbours.get(node.slug) ?? []) {
      const n = this.nodes[this.indexBySlug.get(slug)];
      if (!n) continue;
      pts.push(n.layout);
      maxRadius = Math.max(maxRadius, nodeRadius(n.inDegree));
    }

    // Centroid of the neighbourhood, so the subject sits centred rather than
    // clinging to one edge of the frame (which left the big empty margin).
    const c = [0, 0, 0];
    for (const p of pts) {
      c[0] += p[0]; c[1] += p[1]; c[2] += p[2];
    }
    c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;

    // Radius that must fit, padded so discs and labels don't clip at the rim.
    let R = 0;
    for (const p of pts) R = Math.max(R, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    R += maxRadius * 2;

    // Fit R vertically and horizontally, the latter allowing for the panel that
    // eats the right third of the width when a term is open.
    const half = (this.camera.fov * Math.PI) / 360;
    const vExtent = Math.tan(half);
    const usableW = Math.max(0.35, 1 - this.lensShiftGoal);
    const fit = Math.max(R / vExtent, R / (vExtent * Math.max(0.5, this.camera.aspect) * usableW));
    const distance = Math.max(this.cloudRadius * FOCUS_DISTANCE, fit * 1.25);

    // Keep the depth of field wide enough that the whole neighbourhood stays
    // sharp even when it is spread across the layout.
    this.focusRangeWorld = Math.max(this.cloudRadius * FOCUS_RANGE, R * 2.2);
    this.controls.flyTo(c, distance);
  }

  /* ---------- frame ---------- */

  _frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this._frame);

    const dt = Math.min(0.05, (now - this.clock) / 1000);
    this.clock = now;

    this.controls.update(dt, now);
    this.camera.updateMatrixWorld();

    // Shift the frustum sideways so the atlas centres in the space the panel
    // is not covering, instead of hiding behind it.
    const ease = 1 - Math.pow(0.002, dt);
    this.lensShift += (this.lensShiftGoal - this.lensShift) * ease;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[8] += this.lensShift;

    const focusRange = this.focusTight
      ? this.focusRangeWorld ?? this.cloudRadius * FOCUS_RANGE
      : this.cloudRadius * HOME_RANGE;
    this.nodeLayer.setFocus(this.controls.distance, focusRange);
    this.edgeLayer.update(now / 1000);
    this.labelLayer.update(
      this.camera,
      this.width,
      this.height,
      this.labelWeights,
      this.controls.distance,
      focusRange
    );

    this.renderer.render(this.scene, this.camera);
  }

  /* ---------- layout ---------- */

  /**
   * Shift the frustum sideways so the atlas centres in the space the panel is
   * not covering.
   *
   * @param {number} fraction 0 when no panel, 1/3 when it is open
   */
  setPanelFraction(fraction) {
    // For a perspective matrix, ndc.x ends up offset by *minus* m02, so the
    // sign here is the opposite of the direction the content should move.
    this.lensShiftGoal = fraction;
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.width = width;
    this.height = height;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    this.running = false;
    this.unsubscribe();
    this.canvas.removeEventListener("pointerup", this._onClick);
    this.canvas.removeEventListener("pointermove", this._onMove);
    this.controls.dispose();
    this.labelLayer.dispose();
    this.nodeLayer.dispose();
    this.edgeLayer.dispose();
    this.renderer.dispose();
  }
}

