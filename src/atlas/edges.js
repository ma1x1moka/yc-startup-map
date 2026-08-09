/* The edges: quadratic beziers, with dots travelling along the visible ones.
 *
 * Straight lines through a dense 3D cloud read as noise — parallel edges
 * overlap and you cannot tell which line belongs to which pair. Each edge
 * carries a control point from the pipeline that bows it outward, which
 * separates them and gives the dots a path with some shape.
 *
 * Every edge is uploaded once as a single geometry; showing and hiding is done
 * by writing per-vertex alpha, never by rebuilding buffers.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LineSegments,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";

/** Points along one bezier. More segments on longer curves would be nicer,
 *  but a fixed count keeps the buffer layout trivial to index into. */
const SEGMENTS = 20;
const DOTS_PER_EDGE = 4;
/** Cap on simultaneously animated dots — only the focused neighbourhood and
 *  search matches ever show them, so this is generous. */
const MAX_DOTS = 900;

const LINE_VERTEX = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.004) discard;
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

const DOT_VERTEX = /* glsl */ `
  attribute vec3 iPos;
  attribute float iAlpha;
  uniform float uSize;
  varying float vAlpha;
  varying vec2 vQuad;
  void main() {
    vec4 centre = modelViewMatrix * vec4(iPos, 1.0);
    vQuad = position.xy * 2.0;
    centre.xy += position.xy * 2.0 * uSize;
    vAlpha = iAlpha;
    gl_Position = projectionMatrix * centre;
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vAlpha;
  varying vec2 vQuad;
  void main() {
    float d = length(vQuad);
    float alpha = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function bezier(out, a, control, b, t) {
  const u = 1 - t;
  const w0 = u * u;
  const w1 = 2 * u * t;
  const w2 = t * t;
  out[0] = w0 * a[0] + w1 * control[0] + w2 * b[0];
  out[1] = w0 * a[1] + w1 * control[1] + w2 * b[1];
  out[2] = w0 * a[2] + w1 * control[2] + w2 * b[2];
  return out;
}

export class EdgeLayer {
  constructor(edges, positionBySlug) {
    this.edges = edges;
    this.count = edges.length;

    // Precompute every curve once. 233 edges x 20 segments is small, and it
    // means showing an edge later is a memcpy into an alpha array.
    this.curves = edges.map((edge) => {
      const a = positionBySlug.get(edge.source);
      const b = positionBySlug.get(edge.target);
      const points = [];
      const scratch = [0, 0, 0];
      for (let i = 0; i <= SEGMENTS; i++) {
        bezier(scratch, a, edge.control, b, i / SEGMENTS);
        points.push(scratch.slice());
      }
      return points;
    });

    /* --- lines --- */
    const vertsPerEdge = SEGMENTS * 2; // one pair per segment
    const positions = new Float32Array(this.count * vertsPerEdge * 3);
    this.lineAlphas = new Float32Array(this.count * vertsPerEdge);

    this.curves.forEach((points, e) => {
      let v = (e * vertsPerEdge) * 3;
      for (let i = 0; i < SEGMENTS; i++) {
        positions[v++] = points[i][0];
        positions[v++] = points[i][1];
        positions[v++] = points[i][2];
        positions[v++] = points[i + 1][0];
        positions[v++] = points[i + 1][1];
        positions[v++] = points[i + 1][2];
      }
    });

    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    this.lineAlphaAttribute = new BufferAttribute(this.lineAlphas, 1);
    lineGeometry.setAttribute("aAlpha", this.lineAlphaAttribute);
    lineGeometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e4);
    lineGeometry.computeBoundingSphere = () => {};

    this.lineMaterial = new ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new Vector3(0.1, 0.1, 0.1) } },
    });

    this.lines = new LineSegments(lineGeometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;
    this.vertsPerEdge = vertsPerEdge;

    /* --- travelling dots --- */
    const dotGeometry = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    dotGeometry.index = quad.index;
    dotGeometry.attributes = quad.attributes;
    dotGeometry.instanceCount = 0;

    this.dotPositions = new Float32Array(MAX_DOTS * 3);
    this.dotAlphas = new Float32Array(MAX_DOTS);
    this.dotPositionAttribute = new InstancedBufferAttribute(this.dotPositions, 3);
    this.dotAlphaAttribute = new InstancedBufferAttribute(this.dotAlphas, 1);
    dotGeometry.setAttribute("iPos", this.dotPositionAttribute);
    dotGeometry.setAttribute("iAlpha", this.dotAlphaAttribute);
    dotGeometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e4);
    dotGeometry.computeBoundingSphere = () => {};

    this.dotMaterial = new ShaderMaterial({
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: new Vector3(0.1, 0.1, 0.1) },
        uSize: { value: 1.6 },
      },
    });

    this.dots = new Mesh(dotGeometry, this.dotMaterial);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    this.dotGeometry = dotGeometry;

    /** Indices of edges currently drawn, i.e. the ones that get dots. */
    this.active = [];
    this.scratch = [0, 0, 0];
  }

  /**
   * @param {Float32Array} perEdgeAlpha one alpha per edge
   * @param {number[]} active edge indices that should carry travelling dots
   */
  apply(perEdgeAlpha, active) {
    for (let e = 0; e < this.count; e++) {
      const alpha = perEdgeAlpha[e];
      const start = e * this.vertsPerEdge;
      this.lineAlphas.fill(alpha, start, start + this.vertsPerEdge);
    }
    this.lineAlphaAttribute.needsUpdate = true;

    this.active = active.slice(0, Math.floor(MAX_DOTS / DOTS_PER_EDGE));
    this.dotGeometry.instanceCount = this.active.length * DOTS_PER_EDGE;
  }

  /** Advance the dots. Cheap: a few hundred bezier evaluations. */
  update(time) {
    let i = 0;
    for (const e of this.active) {
      const points = this.curves[e];
      for (let d = 0; d < DOTS_PER_EDGE; d++) {
        // Stagger by dot and by edge so the flow does not pulse in lockstep.
        let t = (time * 0.16 + d / DOTS_PER_EDGE + e * 0.137) % 1;
        const index = Math.min(SEGMENTS, Math.floor(t * SEGMENTS));
        const local = t * SEGMENTS - index;
        const a = points[index];
        const b = points[Math.min(SEGMENTS, index + 1)];

        this.dotPositions[i * 3] = a[0] + (b[0] - a[0]) * local;
        this.dotPositions[i * 3 + 1] = a[1] + (b[1] - a[1]) * local;
        this.dotPositions[i * 3 + 2] = a[2] + (b[2] - a[2]) * local;

        // Fade in and out at the ends so dots appear to emerge and arrive
        // rather than blinking on at a node.
        this.dotAlphas[i] = Math.sin(t * Math.PI) * 0.85;
        i++;
      }
    }
    this.dotPositionAttribute.needsUpdate = true;
    this.dotAlphaAttribute.needsUpdate = true;
  }

  setColor([r, g, b]) {
    this.lineMaterial.uniforms.uColor.value.set(r, g, b);
    this.dotMaterial.uniforms.uColor.value.set(r, g, b);
  }

  dispose() {
    this.lines.geometry.dispose();
    this.lineMaterial.dispose();
    this.dots.geometry.dispose();
    this.dotMaterial.dispose();
  }
}
