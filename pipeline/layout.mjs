/* Offline 3D layout.
 *
 * The atlas reads baked coordinates rather than simulating at runtime. That is
 * what makes it the *same* atlas on every load — a live sim settles differently
 * each time, so the composition can never be trusted or tuned. It also means
 * the runtime does no layout work at all on a cold start.
 *
 * Everything here is seeded and deterministic: same content in, same numbers
 * out. `npm run graph` is expected to be a no-op on unchanged content.
 */

/** Small, fast, seedable PRNG. Deterministic across platforms and versions. */
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Evenly spread N points over a sphere. Used to seat the section clusters. */
function fibonacciSphere(count, radius) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]);
  }
  return points;
}

const CLUSTER_RADIUS = 190; // how far section centres sit from the origin
const SPREAD = 55; // initial jitter of a node around its section centre
const ITERATIONS = 600;
const IDEAL_EDGE = 120; // spring rest length
const REPULSION = 5200; // node-node separation strength
const COHESION = 0.012; // pull toward a node's own section centre
const DAMPING = 0.86;

/**
 * @param {Array<{slug:string, section:number}>} nodes
 * @param {Array<{source:string, target:string}>} edges
 * @param {number} sectionCount
 * @returns {{positions: Map<string, number[]>, sections: Array<{centroid:number[], radius:number}>}}
 */
export function computeLayout(nodes, edges, sectionCount) {
  const random = mulberry32(0x5eed);
  const centres = fibonacciSphere(sectionCount, CLUSTER_RADIUS);

  const index = new Map(nodes.map((n, i) => [n.slug, i]));
  const pos = nodes.map((n) => {
    const c = centres[n.section] ?? [0, 0, 0];
    return [
      c[0] + (random() - 0.5) * SPREAD,
      c[1] + (random() - 0.5) * SPREAD,
      c[2] + (random() - 0.5) * SPREAD,
    ];
  });
  const vel = nodes.map(() => [0, 0, 0]);

  // Resolve edges to indices once; the inner loop runs 600 times.
  const links = [];
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }

  for (let step = 0; step < ITERATIONS; step++) {
    const force = nodes.map(() => [0, 0, 0]);

    // Repulsion. 69 nodes, so the naive O(n^2) pass is far cheaper than a tree.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = pos[i][0] - pos[j][0];
        let dy = pos[i][1] - pos[j][1];
        let dz = pos[i][2] - pos[j][2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) {
          // Coincident nodes have no defined direction; nudge them apart
          // deterministically rather than dividing by zero.
          dx = (random() - 0.5) * 0.1;
          dy = (random() - 0.5) * 0.1;
          dz = (random() - 0.5) * 0.1;
          d2 = dx * dx + dy * dy + dz * dz + 1e-6;
        }
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        const uz = (dz / d) * f;
        force[i][0] += ux; force[i][1] += uy; force[i][2] += uz;
        force[j][0] -= ux; force[j][1] -= uy; force[j][2] -= uz;
      }
    }

    // Springs along edges.
    for (const [a, b] of links) {
      const dx = pos[b][0] - pos[a][0];
      const dy = pos[b][1] - pos[a][1];
      const dz = pos[b][2] - pos[a][2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const f = (d - IDEAL_EDGE) * 0.02;
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      const uz = (dz / d) * f;
      force[a][0] += ux; force[a][1] += uy; force[a][2] += uz;
      force[b][0] -= ux; force[b][1] -= uy; force[b][2] -= uz;
    }

    // Cohesion toward the node's own section centre. This is what keeps the
    // sections legible as regions instead of one undifferentiated ball.
    for (let i = 0; i < nodes.length; i++) {
      const c = centres[nodes[i].section] ?? [0, 0, 0];
      force[i][0] += (c[0] - pos[i][0]) * COHESION;
      force[i][1] += (c[1] - pos[i][1]) * COHESION;
      force[i][2] += (c[2] - pos[i][2]) * COHESION;
    }

    // Integrate. Cooling lets the structure lock in rather than jitter forever.
    const cool = 1 - step / ITERATIONS;
    for (let i = 0; i < nodes.length; i++) {
      for (let k = 0; k < 3; k++) {
        vel[i][k] = (vel[i][k] + force[i][k] * 0.4) * DAMPING;
        pos[i][k] += vel[i][k] * cool;
      }
    }
  }

  // Recentre on the origin so the camera framing does not depend on which way
  // the simulation happened to drift.
  const mean = [0, 1, 2].map(
    (k) => pos.reduce((s, p) => s + p[k], 0) / (pos.length || 1)
  );
  for (const p of pos) for (let k = 0; k < 3; k++) p[k] -= mean[k];

  const round = (v) => Math.round(v * 100) / 100;
  const positions = new Map(
    nodes.map((n, i) => [n.slug, pos[i].map(round)])
  );

  // Per-section centroid and radius. The colour mode uses these to decide
  // which region of the atlas a section occupies.
  const sections = [];
  for (let s = 0; s < sectionCount; s++) {
    const members = nodes
      .map((n, i) => (n.section === s ? pos[i] : null))
      .filter(Boolean);
    if (!members.length) {
      sections.push({ centroid: [0, 0, 0], radius: 0 });
      continue;
    }
    const centroid = [0, 1, 2].map(
      (k) => members.reduce((sum, p) => sum + p[k], 0) / members.length
    );
    const radius = Math.max(
      ...members.map((p) => Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]))
    );
    sections.push({ centroid: centroid.map(round), radius: round(radius) });
  }

  return { positions, sections };
}

/**
 * A quadratic bezier control point per edge, bowed away from the origin.
 *
 * Straight lines through a dense 3D cloud read as noise — parallel edges
 * overlap and you cannot tell which line belongs to which pair. Bowing them
 * outward separates them visually and gives the travelling dots a path with
 * some shape to it. Measured against the original: the offset is a little over
 * a tenth of the edge length, directed radially outward.
 */
export function bezierControl(a, b) {
  const mid = [0, 1, 2].map((k) => (a[k] + b[k]) / 2);
  const length = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const midLength = Math.hypot(...mid);

  // An edge whose midpoint sits on the origin has no outward direction; a
  // straight line is the honest answer there.
  if (midLength < 1e-3) return mid.map((v) => Math.round(v * 100) / 100);

  const bow = length * 0.11;
  return mid
    .map((v, k) => v + (mid[k] / midLength) * bow)
    .map((v) => Math.round(v * 100) / 100);
}
