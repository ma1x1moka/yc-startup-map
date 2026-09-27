/* The year × sphere index.
 *
 * The landing page asks two questions — *when* and *what* — and the graph only
 * opens once both have an answer. Both the top menu and the timeline need the
 * same counts to answer them ("2023 has 20 AI tools, and no education"), so the
 * index is built once here rather than twice in two components that would then
 * have to agree with each other.
 *
 * Keyed by section *index*, not title: `node.section` is an index into
 * `graph.sections`, and going through the title would mean a lookup that breaks
 * silently the day two sections are renamed to the same thing.
 */

const key = (year, section) => `${year}:${section}`;

export function buildIndex(graph) {
  const buckets = new Map(); // "year:section" -> slug[]
  const perYear = new Map(); // year -> slug[]
  const perSection = new Map(); // section -> slug[]

  for (const node of graph.nodes) {
    if (node.year == null) continue;

    const k = key(node.year, node.section);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(node.slug);

    if (!perYear.has(node.year)) perYear.set(node.year, []);
    perYear.get(node.year).push(node.slug);

    if (!perSection.has(node.section)) perSection.set(node.section, []);
    perSection.get(node.section).push(node.slug);
  }

  const years = [...perYear.keys()].sort((a, b) => a - b);
  const sections = graph.sections.map((section, index) => ({
    index,
    title: section.title,
    total: perSection.get(index)?.length ?? 0,
  }));

  return {
    years,
    sections,

    /** Every slug in a year (all spheres), or [] . */
    slugsInYear: (year) => perYear.get(year) ?? [],

    /** Every slug in a sphere (all years), or []. */
    slugsInSection: (section) => perSection.get(section) ?? [],

    /** The intersection — what the graph actually draws. */
    slugsFor(year, section) {
      if (year == null || section == null) return [];
      return buckets.get(key(year, section)) ?? [];
    },

    countFor(year, section) {
      return this.slugsFor(year, section).length;
    },
  };
}
