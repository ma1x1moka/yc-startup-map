/* A layout for the handful of nodes actually on screen.
 *
 * The baked layout in pipeline/layout.mjs places all 2,490 terms at once, and
 * it is the right layout for that job. It is the wrong one for this: a single
 * year × sphere is twenty nodes sampled out of a cloud nearly 900 units
 * across, so framing them means pulling the camera back past its own limit and
 * rendering twenty two-pixel specks with an ocean of empty space between them.
 * Hiding the other 2,470 nodes removes the clutter but not the emptiness.
 *
 * So the subset gets its own layout, computed when it is chosen: the same
 * spring/repulsion idea as the baked one, but over the visible nodes only, and
 * rescaled at the end to a radius that frames well at a readable node size.
 * It is the arrangement that carries the meaning — which of these twenty are
 * connected — and that survives being computed locally.
 *
 * Deterministic, like the offline one: the same subset always lays out the
 * same way, so going back to a year you already looked at shows you the
 * picture you remember.
 */

/** Same PRNG as the offline layout: seeded, and identical across platforms. */
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDEAL_EDGE = 78;
const REPULSION = 2600;
const DAMPING = 0.84;
const COHESION = 0.02;

/** Big sets need fewer passes to look settled and cost far more per pass, so
 *  the budget shrinks as the set grows. The whole thing has to finish inside a
 *  single click, not a progress bar. */
const iterationsFor = (n) => Math.round(Math.min(300, Math.max(90, 26000 / n)));

/** Where the cloud should end up, in world units, before the camera frames it.
 *  Grows with the cube root of the count — the nodes fill a volume — and is
 *  clamped so a pair of nodes is not microscopic and 260 are not a galaxy. */
const targetRadiusFor = (n) => Math.min(430, Math.max(105, 72 * Math.cbrt(n)));

/**
 * @param {string[]} slugs the nodes to place
 * @param {Array<{source:string,target:string}>} edges all edges; those with
 *   both ends inside the subset are used as springs, the rest are ignored
 * @returns {Map<string, number[]>} slug -> [x, y, z], centred on the origin
 */
export function layoutSubset(slugs, edges) {
  const n = slugs.length;
  const positions = new Map();
  if (n === 0) return positions;
  if (n === 1) {
    positions.set(slugs[0], [0, 0, 0]);
    return positions;
  }

  const indexOf = new Map(slugs.map((slug, i) => [slug, i]));
  // Seeded by the membership itself, so a given subset always starts — and so
  // ends — in the same place, whichever route the user took to open it.
  const random = mulberry32(0x5eed ^ (n * 2654435761));

  const pos = new Float64Array(n * 3);
  const vel = new Float64Array(n * 3);
  const force = new Float64Array(n * 3);

  /* Start on a golden-spiral sphere rather than in a random ball. An even
   * starting spread means the repulsion pass is correcting a good guess
   * instead of untangling a knot, which is most of why so few iterations are
   * enough here. */
  const golden = Math.PI * (3 - Math.sqrt(5));
  const startRadius = IDEAL_EDGE * Math.cbrt(n);
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    // A little jitter so perfectly regular starts don't survive to the end as
    // a visibly artificial shell.
    const jitter = () => (random() - 0.5) * IDEAL_EDGE * 0.3;
    pos[i * 3] = Math.cos(theta) * ring * startRadius + jitter();
    pos[i * 3 + 1] = y * startRadius * 0.72 + jitter();
    pos[i * 3 + 2] = Math.sin(theta) * ring * startRadius + jitter();
  }

  const links = [];
  for (const edge of edges) {
    const a = indexOf.get(edge.source);
    const b = indexOf.get(edge.target);
    if (a !== undefined && b !== undefined && a !== b) links.push(a, b);
  }

  const steps = iterationsFor(n);
  for (let step = 0; step < steps; step++) {
    force.fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i * 3] - pos[j * 3];
        let dy = pos[i * 3 + 1] - pos[j * 3 + 1];
        let dz = pos[i * 3 + 2] - pos[j * 3 + 2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) {
          dx = (random() - 0.5) * 0.1;
          dy = (random() - 0.5) * 0.1;
          dz = (random() - 0.5) * 0.1;
          d2 = dx * dx + dy * dy + dz * dz + 1e-6;
        }
        const d = Math.sqrt(d2);
        const f = REPULSION / d2 / d;
        const ux = dx * f;
        const uy = dy * f;
        const uz = dz * f;
        force[i * 3] += ux; force[i * 3 + 1] += uy; force[i * 3 + 2] += uz;
        force[j * 3] -= ux; force[j * 3 + 1] -= uy; force[j * 3 + 2] -= uz;
      }
    }

    for (let l = 0; l < links.length; l += 2) {
      const a = links[l];
      const b = links[l + 1];
      const dx = pos[b * 3] - pos[a * 3];
      const dy = pos[b * 3 + 1] - pos[a * 3 + 1];
      const dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const f = (d - IDEAL_EDGE) * 0.02;
      force[a * 3] += (dx / d) * f;
      force[a * 3 + 1] += (dy / d) * f;
      force[a * 3 + 2] += (dz / d) * f;
      force[b * 3] -= (dx / d) * f;
      force[b * 3 + 1] -= (dy / d) * f;
      force[b * 3 + 2] -= (dz / d) * f;
    }

    // Toward the origin: with no sections to separate, cohesion's only job is
    // to stop unconnected nodes being pushed out to infinity by repulsion.
    for (let k = 0; k < n * 3; k++) force[k] -= pos[k] * COHESION;

    const cool = 1 - step / steps;
    for (let k = 0; k < n * 3; k++) {
      vel[k] = (vel[k] + force[k] * 0.4) * DAMPING;
      pos[k] += vel[k] * cool;
    }
  }

  // Recentre, then rescale to the radius the camera framing expects. Doing the
  // scaling here rather than tuning the forces to land on it means the forces
  // only have to get the *shape* right.
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    mean[0] += pos[i * 3];
    mean[1] += pos[i * 3 + 1];
    mean[2] += pos[i * 3 + 2];
  }
  mean[0] /= n; mean[1] /= n; mean[2] /= n;

  let extent = 0;
  for (let i = 0; i < n; i++) {
    extent = Math.max(
      extent,
      Math.hypot(pos[i * 3] - mean[0], pos[i * 3 + 1] - mean[1], pos[i * 3 + 2] - mean[2])
    );
  }
  const scale = extent > 1e-3 ? targetRadiusFor(n) / extent : 1;

  for (let i = 0; i < n; i++) {
    positions.set(slugs[i], [
      (pos[i * 3] - mean[0]) * scale,
      (pos[i * 3 + 1] - mean[1]) * scale,
      (pos[i * 3 + 2] - mean[2]) * scale,
    ]);
  }
  return positions;
}
