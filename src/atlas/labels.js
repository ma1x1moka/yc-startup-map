/* Term labels, as HTML over the canvas.
 *
 * Drawing text into WebGL means either a glyph atlas or a second 2D canvas,
 * and both end up blurry on a HiDPI screen or wrong at some zoom. Plain
 * absolutely-positioned elements stay crisp at every scale, are selectable,
 * and land in the accessibility tree for free.
 *
 * The interesting part is deciding *which* labels to show: 69 of them overlap
 * badly at most camera angles. Nodes are sorted front-to-back and each label
 * claims a rectangle in a quadtree; a label whose rectangle collides with one
 * already claimed is dropped. Nearer and better-connected terms win, so the
 * set stays stable as the camera moves instead of flickering.
 */

import { quadtree } from "d3-quadtree";
import { Vector3 } from "three";

/** Roughly how wide a character is at the label's size, in px. Cheap enough
 *  to be worth avoiding a per-frame measureText call per label. */
const CHAR_WIDTH = 6.4;
/** Vertical clearance between two labels. Larger than the text itself, so
 *  rows of labels do not sit shoulder to shoulder. */
const LABEL_HEIGHT = 22;
const PADDING = 10;

export class LabelLayer {
  constructor(container, nodes) {
    this.container = container;
    this.nodes = nodes;
    this.projected = new Vector3();

    this.elements = nodes.map((node) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "atlas-label";
      el.textContent = node.title;
      el.dataset.slug = node.slug;
      el.style.opacity = "0";
      el.style.visibility = "hidden";
      container.append(el);
      return el;
    });

    this.widths = nodes.map((node) => node.title.length * CHAR_WIDTH);
    this.visible = new Array(nodes.length).fill(false);
    this.lift = new Array(nodes.length).fill(14);
  }

  /** How far above each node its label should sit, in world units. Set once
   *  from the node radii; converted to pixels per frame, since a hub seen up
   *  close needs far more clearance than the same hub seen from across the
   *  atlas. */
  setRadii(radii) {
    this.radii = radii;
  }

  /**
   * @param {import('three').Camera} camera
   * @param {number} width viewport px
   * @param {number} height viewport px
   * @param {Float32Array} weight per node: 0 hides it, higher wins collisions
   */
  update(camera, width, height, weight, focusDistance, focusRange) {
    const half = { w: width / 2, h: height / 2 };
    // Pixels per world unit at distance d is scale/d.
    const scale = height / (2 * Math.tan((camera.fov * Math.PI) / 360));

    const candidates = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (weight[i] <= 0.02) continue;

      this.projected.set(
        this.nodes[i].layout[0],
        this.nodes[i].layout[1],
        this.nodes[i].layout[2]
      );
      const depth = camera.position.distanceTo(this.projected);
      this.projected.project(camera);

      // Behind the camera, or outside the frame with a margin.
      if (this.projected.z > 1) continue;
      const x = (this.projected.x + 1) * half.w;
      const y = (1 - this.projected.y) * half.h;
      if (x < -100 || x > width + 100 || y < -40 || y > height + 40) continue;

      const lift = 6 + ((this.radii?.[i] ?? 3) * scale) / depth;

      // A sharp label on a node that is a blurred smudge looks like a mistake.
      // Fade the text with its node, and let the sharp ones win collisions.
      const blur = focusRange
        ? Math.min(1, Math.abs(depth - focusDistance) / focusRange)
        : 0;
      const faded = weight[i] * (1 - 0.82 * blur);
      if (faded <= 0.02) continue;

      candidates.push({ i, x, y, lift, depth: this.projected.z, weight: faded });
    }

    // Front-to-back, then by weight, so the terms that matter claim space first.
    candidates.sort((a, b) => b.weight - a.weight || a.depth - b.depth);

    const claimed = quadtree()
      .x((d) => d.x)
      .y((d) => d.y);
    const shown = new Set();

    for (const candidate of candidates) {
      const halfWidth = this.widths[candidate.i] / 2 + PADDING;
      const reach = halfWidth + PADDING * 4;

      let collides = false;
      claimed.visit((quadNode, x0, y0, x1, y1) => {
        // Prune whole quadrants that cannot contain a colliding label.
        if (
          x0 > candidate.x + reach ||
          x1 < candidate.x - reach ||
          y0 > candidate.y + LABEL_HEIGHT ||
          y1 < candidate.y - LABEL_HEIGHT
        ) {
          return true;
        }
        if (!quadNode.length) {
          let leaf = quadNode;
          do {
            const other = leaf.data;
            const gapX = Math.abs(other.x - candidate.x);
            const gapY = Math.abs(other.y - candidate.y);
            if (
              gapX < halfWidth + other.halfWidth &&
              gapY < LABEL_HEIGHT
            ) {
              collides = true;
              return true;
            }
          } while ((leaf = leaf.next));
        }
        return collides;
      });

      if (collides) continue;
      claimed.add({ x: candidate.x, y: candidate.y, halfWidth });
      shown.add(candidate.i);

      const el = this.elements[candidate.i];
      el.style.transform = `translate3d(${Math.round(candidate.x)}px, ${Math.round(candidate.y)}px, 0)`;
      el.style.setProperty("--lift", `${Math.round(candidate.lift)}px`);
      el.style.opacity = candidate.weight.toFixed(3);
      if (!this.visible[candidate.i]) {
        el.style.visibility = "visible";
        this.visible[candidate.i] = true;
      }
    }

    for (let i = 0; i < this.elements.length; i++) {
      if (shown.has(i) || !this.visible[i]) continue;
      this.elements[i].style.visibility = "hidden";
      this.elements[i].style.opacity = "0";
      this.visible[i] = false;
    }
  }

  dispose() {
    for (const el of this.elements) el.remove();
  }
}
