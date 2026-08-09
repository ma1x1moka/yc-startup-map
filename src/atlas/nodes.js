/* The nodes: one instanced billboard per term, with depth of field.
 *
 * The blur is computed per sprite in the fragment shader rather than by a
 * post-processing pass. A defocused disc *is* just a softer, dimmer disc, so
 * for a scene made entirely of discs the analytic version is indistinguishable
 * from a real bokeh pass — and it avoids a full-screen composer, keeps
 * transparency working without depth sorting, and costs one extra varying.
 */

import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from "three";

const VERTEX = /* glsl */ `
  attribute vec3 iPos;
  attribute float iRadius;
  attribute vec3 iColor;
  attribute float iAlpha;

  uniform float uFocusDist;
  uniform float uFocusRange;
  uniform vec3 uPaper;
  uniform float uDepthFade;
  uniform float uHazeRadius;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  varying vec2 vQuad;

  void main() {
    vec4 centre = modelViewMatrix * vec4(iPos, 1.0);
    float dist = -centre.z;

    // 0 at the focal plane, 1 at the edge of the range and beyond.
    float blur = clamp(abs(dist - uFocusDist) / uFocusRange, 0.0, 1.0);

    // Softness as a fraction of the sprite radius. The floor keeps every disc
    // antialiased rather than stair-stepped.
    vSoft = 0.05 + blur * 0.95;

    // Grow the quad so the soft edge has room, or the blur gets clipped into
    // a square.
    float scale = iRadius * (1.0 + vSoft);
    vQuad = position.xy * 2.0;
    centre.xy += position.xy * 2.0 * scale;

    // Distance haze: nodes *behind* the focal plane wash toward the paper,
    // which separates the front of the cloud from the back when everything is
    // one colour. Nothing in front of the plane is hazed, so whatever you are
    // looking at is always full-strength ink — centring the ramp on the plane
    // instead would leave the subject itself half washed out.
    float haze = clamp((dist - uFocusDist) / uHazeRadius, 0.0, 1.0);
    vColor = mix(iColor, uPaper, haze * uDepthFade);

    // Spreading the same energy over a larger disc means a dimmer disc.
    vAlpha = iAlpha / (1.0 + blur * 2.5);

    gl_Position = projectionMatrix * centre;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  varying vec2 vQuad;

  void main() {
    float d = length(vQuad);
    float alpha = (1.0 - smoothstep(1.0 - vSoft, 1.0, d)) * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/** Node size from link count. Log-scaled so hubs read as hubs without
 *  swamping the leaves; matches the original's curve. */
export function nodeRadius(inDegree) {
  return 2.2 + (Math.log1p(inDegree) / Math.log1p(37)) * 6.5;
}

export class NodeLayer {
  constructor(nodes) {
    this.nodes = nodes;
    this.count = nodes.length;

    const geometry = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    geometry.index = quad.index;
    geometry.attributes = quad.attributes;
    geometry.instanceCount = this.count;

    const positions = new Float32Array(this.count * 3);
    const radii = new Float32Array(this.count);
    nodes.forEach((node, i) => {
      positions[i * 3] = node.layout[0];
      positions[i * 3 + 1] = node.layout[1];
      positions[i * 3 + 2] = node.layout[2];
      radii[i] = nodeRadius(node.inDegree);
    });

    this.colors = new Float32Array(this.count * 3);
    this.alphas = new Float32Array(this.count).fill(1);

    geometry.setAttribute("iPos", new InstancedBufferAttribute(positions, 3));
    geometry.setAttribute("iRadius", new InstancedBufferAttribute(radii, 1));
    this.colorAttribute = new InstancedBufferAttribute(this.colors, 3);
    this.alphaAttribute = new InstancedBufferAttribute(this.alphas, 1);
    geometry.setAttribute("iColor", this.colorAttribute);
    geometry.setAttribute("iAlpha", this.alphaAttribute);

    // Instanced geometry's bounds are those of the single quad, not of the
    // instances, so three would cull the whole layer the moment that quad
    // left the frustum. Frustum culling is switched off on the mesh below;
    // this keeps the bounds honest for anything else that asks.
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e4);
    geometry.computeBoundingSphere = () => {};

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uFocusDist: { value: 600 },
        uFocusRange: { value: 4000 },
        uPaper: { value: new Vector3(0.92, 0.92, 0.91) },
        uDepthFade: { value: 0.86 },
        uHazeRadius: { value: 250 },
      },
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;

    this.radii = radii;
    this.positions = positions;
  }

  /** @param {Float32Array} colors rgb triples, 0..1 @param {Float32Array} alphas */
  apply(colors, alphas) {
    this.colors.set(colors);
    this.alphas.set(alphas);
    this.colorAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  setPaper([r, g, b]) {
    this.material.uniforms.uPaper.value.set(r, g, b);
  }

  setFocus(distance, range) {
    this.material.uniforms.uFocusDist.value = distance;
    this.material.uniforms.uFocusRange.value = range;
  }

  /** Half-depth of the cloud, so the haze ramp spans it exactly. */
  setHazeRadius(radius) {
    this.material.uniforms.uHazeRadius.value = radius;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
