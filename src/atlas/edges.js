/* The edges: camera-facing bezier ribbons, with dots travelling along the
 * visible ones.
 *
 * Straight lines through a dense 3D cloud read as noise — parallel edges
 * overlap and you cannot tell which line belongs to which pair. Each edge
 * carries a control point from the pipeline that bows it outward, which
 * separates them and gives the dots a path with some shape.
 *
 * Unlike a GL line, a ribbon can carry *width* — so an edge's thickness
 * encodes its weight (here, USD flow) and its colour encodes its relation
 * (a loop borrow, an organic borrow, collateral, funding). Edges that carry
 * no `kind`/`weight` (e.g. the dictionary content) fall back to the old
 * uniform-ink hairline, so the layer stays general.
 *
 * Every edge is uploaded once; showing and hiding is done by writing per-vertex
 * alpha, never by rebuilding buffers.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";

const SEGMENTS = 20;
const DOTS_PER_EDGE = 4;
const MAX_DOTS = 900;

/* Relation -> ink. Tuned darker/greyer than a screen palette so the colours
 * still read as *ink on paper*, not neon, when they surface over the light
 * ground or a section's colour. */
const KIND_COLOR = {
  "borrow-loop": "#cf5a25",   // ember — leverage
  "borrow-organic": "#1f8f84", // teal — plain borrow
  collateral: "#3f9a57",       // green — sUSDe posted
  funds: "#7a5bd0",            // violet — seeding a loop wallet
};
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* Ribbon vertex: offset the centreline sideways in view space, along the
 * screen-space normal of the curve tangent, so the strip always faces the
 * camera at a width set per edge. */
const LINE_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aWidth;
  attribute vec3 aColor;
  attribute float aMix;
  attribute float aAlpha;
  uniform vec3 uColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;
  void main() {
    vColor = mix(uColor, aColor, aMix);
    vAlpha = aAlpha;
    vSide = aSide;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 t = (modelViewMatrix * vec4(aTangent, 0.0)).xyz;
    float tl = length(t);
    t = tl > 1e-5 ? t / tl : vec3(1.0, 0.0, 0.0);
    // normal perpendicular to tangent and the view direction (view space +z)
    vec3 n = cross(t, vec3(0.0, 0.0, 1.0));
    float nl = length(n);
    n = nl > 1e-4 ? n / nl : vec3(0.0, 1.0, 0.0);
    mv.xyz += n * aSide * aWidth;
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;
  void main() {
    // feather the two long edges of the ribbon so it anti-aliases
    float edge = smoothstep(1.0, 0.55, abs(vSide));
    float a = vAlpha * edge;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

const DOT_VERTEX = /* glsl */ `
  attribute vec3 iPos;
  attribute float iAlpha;
  attribute vec3 iColor;
  attribute float iScale;
  uniform float uSize;
  varying float vAlpha;
  varying vec3 vColor;
  varying vec2 vQuad;
  void main() {
    vec4 centre = modelViewMatrix * vec4(iPos, 1.0);
    vQuad = position.xy * 2.0;
    centre.xy += position.xy * 2.0 * uSize * iScale;
    vAlpha = iAlpha;
    vColor = iColor;
    gl_Position = projectionMatrix * centre;
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying vec3 vColor;
  varying vec2 vQuad;
  void main() {
    float d = length(vQuad);
    float alpha = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function bezier(out, a, control, b, t) {
  const u = 1 - t;
  const w0 = u * u, w1 = 2 * u * t, w2 = t * t;
  out[0] = w0 * a[0] + w1 * control[0] + w2 * b[0];
  out[1] = w0 * a[1] + w1 * control[1] + w2 * b[1];
  out[2] = w0 * a[2] + w1 * control[2] + w2 * b[2];
  return out;
}

export class EdgeLayer {
  constructor(edges, positionBySlug) {
    this.edges = edges;
    this.count = edges.length;

    // Weight -> half-width. sqrt keeps a very skewed distribution legible.
    const weights = edges.map((e) => e.weight ?? null);
    const maxW = Math.max(1, ...weights.map((w) => w ?? 0));
    const halfWidth = (e) =>
      e.weight == null ? 0.28 : 0.14 + 2.0 * Math.sqrt((e.weight || 0) / maxW);
    const colorOf = (e) => (e.kind && KIND_COLOR[e.kind] ? hex(KIND_COLOR[e.kind]) : [0, 0, 0]);
    const mixOf = (e) => (e.kind && KIND_COLOR[e.kind] ? 1 : 0);
    this.edgeColor = edges.map(colorOf);
    this.edgeWidth = edges.map(halfWidth);

    // Precompute the centreline of every curve once.
    this.curves = edges.map((edge) => {
      const a = positionBySlug.get(edge.source);
      const b = positionBySlug.get(edge.target);
      const pts = [];
      const scratch = [0, 0, 0];
      for (let i = 0; i <= SEGMENTS; i++) pts.push(bezier(scratch, a, edge.control, b, i / SEGMENTS).slice());
      return pts;
    });

    /* --- ribbons --- */
    const vpe = (SEGMENTS + 1) * 2; // two rail vertices per centreline point
    this.vertsPerEdge = vpe;
    const positions = new Float32Array(this.count * vpe * 3);
    const tangents = new Float32Array(this.count * vpe * 3);
    const sides = new Float32Array(this.count * vpe);
    const widths = new Float32Array(this.count * vpe);
    const colors = new Float32Array(this.count * vpe * 3);
    const mixes = new Float32Array(this.count * vpe);
    this.lineAlphas = new Float32Array(this.count * vpe);
    const index = new Uint32Array(this.count * SEGMENTS * 6);

    const tan = [0, 0, 0];
    this.curves.forEach((pts, e) => {
      const col = this.edgeColor[e], w = this.edgeWidth[e], m = mixOf(edges[e]);
      const base = e * vpe;
      for (let j = 0; j <= SEGMENTS; j++) {
        const prev = pts[Math.max(0, j - 1)];
        const next = pts[Math.min(SEGMENTS, j + 1)];
        tan[0] = next[0] - prev[0]; tan[1] = next[1] - prev[1]; tan[2] = next[2] - prev[2];
        for (const side of [0, 1]) {
          const vi = base + j * 2 + side;
          positions[vi * 3] = pts[j][0]; positions[vi * 3 + 1] = pts[j][1]; positions[vi * 3 + 2] = pts[j][2];
          tangents[vi * 3] = tan[0]; tangents[vi * 3 + 1] = tan[1]; tangents[vi * 3 + 2] = tan[2];
          sides[vi] = side === 0 ? 1 : -1;
          widths[vi] = w;
          colors[vi * 3] = col[0]; colors[vi * 3 + 1] = col[1]; colors[vi * 3 + 2] = col[2];
          mixes[vi] = m;
        }
      }
      let ii = e * SEGMENTS * 6;
      for (let i = 0; i < SEGMENTS; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        index[ii++] = a; index[ii++] = b; index[ii++] = c;
        index[ii++] = b; index[ii++] = d; index[ii++] = c;
      }
    });

    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aTangent", new BufferAttribute(tangents, 3));
    g.setAttribute("aSide", new BufferAttribute(sides, 1));
    g.setAttribute("aWidth", new BufferAttribute(widths, 1));
    g.setAttribute("aColor", new BufferAttribute(colors, 3));
    g.setAttribute("aMix", new BufferAttribute(mixes, 1));
    this.lineAlphaAttribute = new BufferAttribute(this.lineAlphas, 1);
    g.setAttribute("aAlpha", this.lineAlphaAttribute);
    g.setIndex(new BufferAttribute(index, 1));
    g.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e4);
    g.computeBoundingSphere = () => {};

    this.lineMaterial = new ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uColor: { value: new Vector3(0.1, 0.1, 0.1) } },
    });

    this.lines = new Mesh(g, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;

    /* --- travelling dots --- */
    const dotGeometry = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    dotGeometry.index = quad.index;
    dotGeometry.attributes = quad.attributes;
    dotGeometry.instanceCount = 0;

    this.dotPositions = new Float32Array(MAX_DOTS * 3);
    this.dotAlphas = new Float32Array(MAX_DOTS);
    this.dotColors = new Float32Array(MAX_DOTS * 3);
    this.dotScales = new Float32Array(MAX_DOTS);
    this.dotPositionAttribute = new InstancedBufferAttribute(this.dotPositions, 3);
    this.dotAlphaAttribute = new InstancedBufferAttribute(this.dotAlphas, 1);
    this.dotColorAttribute = new InstancedBufferAttribute(this.dotColors, 3);
    this.dotScaleAttribute = new InstancedBufferAttribute(this.dotScales, 1);
    dotGeometry.setAttribute("iPos", this.dotPositionAttribute);
    dotGeometry.setAttribute("iAlpha", this.dotAlphaAttribute);
    dotGeometry.setAttribute("iColor", this.dotColorAttribute);
    dotGeometry.setAttribute("iScale", this.dotScaleAttribute);
    dotGeometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e4);
    dotGeometry.computeBoundingSphere = () => {};

    this.dotMaterial = new ShaderMaterial({
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: { uSize: { value: 1.6 } },
    });

    this.dots = new Mesh(dotGeometry, this.dotMaterial);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    this.dotGeometry = dotGeometry;

    this.active = [];
  }

  /**
   * @param {Float32Array} perEdgeAlpha one alpha per edge
   * @param {number[]} active edge indices that should carry travelling dots
   */
  apply(perEdgeAlpha, active) {
    for (let e = 0; e < this.count; e++) {
      const start = e * this.vertsPerEdge;
      this.lineAlphas.fill(perEdgeAlpha[e], start, start + this.vertsPerEdge);
    }
    this.lineAlphaAttribute.needsUpdate = true;

    this.active = active.slice(0, Math.floor(MAX_DOTS / DOTS_PER_EDGE));
    // Colour + size each active edge's dots to match its ribbon.
    let i = 0;
    for (const e of this.active) {
      const col = this.edgeColor[e];
      const kinded = this.edgeColor[e][0] || this.edgeColor[e][1] || this.edgeColor[e][2];
      const scale = 0.7 + 1.1 * Math.min(1, this.edgeWidth[e] / 2.1);
      for (let d = 0; d < DOTS_PER_EDGE; d++) {
        this.dotColors[i * 3] = kinded ? col[0] : 0.1;
        this.dotColors[i * 3 + 1] = kinded ? col[1] : 0.1;
        this.dotColors[i * 3 + 2] = kinded ? col[2] : 0.1;
        this.dotScales[i] = scale;
        i++;
      }
    }
    this.dotColorAttribute.needsUpdate = true;
    this.dotScaleAttribute.needsUpdate = true;
    this.dotGeometry.instanceCount = this.active.length * DOTS_PER_EDGE;
  }

  /** Advance the dots along their curves. */
  update(time) {
    let i = 0;
    for (const e of this.active) {
      const pts = this.curves[e];
      for (let d = 0; d < DOTS_PER_EDGE; d++) {
        let t = (time * 0.16 + d / DOTS_PER_EDGE + e * 0.137) % 1;
        const idx = Math.min(SEGMENTS, Math.floor(t * SEGMENTS));
        const local = t * SEGMENTS - idx;
        const a = pts[idx];
        const b = pts[Math.min(SEGMENTS, idx + 1)];
        this.dotPositions[i * 3] = a[0] + (b[0] - a[0]) * local;
        this.dotPositions[i * 3 + 1] = a[1] + (b[1] - a[1]) * local;
        this.dotPositions[i * 3 + 2] = a[2] + (b[2] - a[2]) * local;
        this.dotAlphas[i] = Math.sin(t * Math.PI) * 0.9;
        i++;
      }
    }
    this.dotPositionAttribute.needsUpdate = true;
    this.dotAlphaAttribute.needsUpdate = true;
  }

  /** Ink for the kindless (uniform) edges; kinded edges keep their own colour. */
  setColor([r, g, b]) {
    this.lineMaterial.uniforms.uColor.value.set(r, g, b);
  }

  dispose() {
    this.lines.geometry.dispose();
    this.lineMaterial.dispose();
    this.dots.geometry.dispose();
    this.dotMaterial.dispose();
  }
}
