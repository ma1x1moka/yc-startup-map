/* data/aave-usde-source.json  ->  data/graph.json
 *
 *   node pipeline/build-aave-graph.mjs
 *
 * Re-points the atlas at Aave v3's USDe borrow book. Emits graph.json in the
 * exact schema the runtime reads (same as pipeline/build-graph.mjs), so the
 * WebGL atlas, colour mode, panel and layout all work unchanged — only the
 * data is swapped.
 *
 * Source is the on-chain reserve census from
 *   CV/papers/aave/bd/task1/data/usde-borrower-census-2026-08-07.json
 * (+ funding graph), pre-flattened into data/aave-usde-source.json.
 *
 * Node SIZE encodes USDe debt (sqrt-scaled into the atlas's inDegree->radius
 * curve), so the biggest depositors read as the biggest nodes. Section = role
 * (core / loop / organic / funders), which drives colour.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLayout, bezierControl } from "./layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(await readFile(join(root, "data/aave-usde-source.json"), "utf8"));

/* --- sections (index === colour) ---------------------------------------- */
// palette.js papers: 0 #4500B3 purple · 1 #EB4347 red · 2 #9DD395 green · 3 #D3C2FE lavender
const SECTIONS = [
  { title: "Aave v3 core", key: "core" },        // reserve + collateral hubs
  { title: "Ethena leverage loops", key: "loop" }, // the looped e-mode borrowers
  { title: "Organic borrowers", key: "organic" },  // plain USDe borrowers
  { title: "Funding wallets", key: "funder" },     // seeded the loop wallets
];
const sectionIndex = { core: 0, loop: 1, organic: 2, funder: 3 };

function sectionOf(n) {
  if (n.kind === "reserve" || n.kind === "collateral") return 0;
  if (n.kind === "funder") return 3;
  return n.loop ? 1 : 2;
}

/* --- helpers ------------------------------------------------------------- */
const fmt = (v) =>
  v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B"
  : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M"
  : v >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "K"
  : "$" + Math.round(v);
const short = (a) => (/^0x[0-9a-f]{40}$/i.test(a) ? a.slice(0, 6) + "…" + a.slice(-4) : a);

const borrowers = src.nodes.filter((n) => n.kind === "borrower");
const vmax = Math.max(...borrowers.map((n) => n.valueUsd));

// Map a node to the atlas inDegree field, which nodeRadius() turns into size.
// sqrt so the skewed debt distribution still spreads across the radius curve.
function sizeProxy(n) {
  if (n.kind === "reserve") return 80;
  if (n.kind === "collateral") return 52;
  if (n.kind === "funder") return 1;
  return Math.max(1, Math.round(Math.sqrt(n.valueUsd / vmax) * 34));
}

/* --- adjacency (for node.links + panel "related") ----------------------- */
const nbr = new Map(src.nodes.map((n) => [n.id, new Set()]));
for (const e of src.edges) {
  if (nbr.has(e.source) && nbr.has(e.target)) {
    nbr.get(e.source).add(e.target);
    nbr.get(e.target).add(e.source);
  }
}

/* --- structured facts per node ------------------------------------------ */
// Each node carries `stats` (a list of {k, v, tone?, mono?} the panel renders
// as a proper key/value block) and `address` (drives the Etherscan button).
const addressOf = (id) => (/^0x[0-9a-f]{40}$/i.test(id) ? id : null);

function walletStats(n) {
  const s = [
    { k: "USDe debt", v: fmt(n.valueUsd) },
    { k: "Collateral", v: fmt(n.collateral || 0) },
  ];
  if (n.hf != null) {
    s.push({ k: "Health factor", v: n.hf.toFixed(3), tone: n.hf < 1.05 ? "warn" : n.hf < 1.2 ? "watch" : "ok" });
  }
  if (n.ltv != null) s.push({ k: "Effective LTV", v: (n.ltv * 100).toFixed(1) + "%" });
  const lev = n.collateral && n.collateral > n.valueUsd ? n.collateral / (n.collateral - n.valueUsd) : null;
  if (lev && lev > 1.2 && lev < 100) s.push({ k: "Leverage", v: "≈ " + lev.toFixed(1) + "×" });
  s.push({ k: "Strategy", v: n.loop ? "Leverage loop" : "Organic", tone: n.loop ? "loop" : "organic" });
  if (n.emode && n.emode !== "none") s.push({ k: "E-mode", v: n.emode, mono: true });
  s.push({ k: "Account", v: n.is_contract ? "Contract" : "EOA" });
  return s;
}

function nodeFields(n) {
  if (n.kind === "reserve") {
    const pct = ((src.meta.loop_debt / src.meta.total_debt_usde) * 100).toFixed(1);
    return {
      title: "Aave v3 · USDe reserve",
      description: `${fmt(n.valueUsd)} of USDe borrowed across ${(n.meta?.borrowers || 0).toLocaleString()} wallets — the sink every borrower on this map pipes into.`,
      stats: [
        { k: "Total USDe borrowed", v: fmt(n.valueUsd) },
        { k: "Live borrowers", v: (n.meta?.borrowers || 0).toLocaleString() },
        { k: "Loop share", v: `${fmt(src.meta.loop_debt)} (${pct}%)`, tone: "loop" },
        { k: "Organic share", v: fmt(src.meta.organic_debt), tone: "organic" },
      ],
      address: null,
    };
  }
  if (n.kind === "collateral") {
    return {
      title: "sUSDe collateral",
      description: `${fmt(n.valueUsd)} of staked-USDe posted as collateral by the looping wallets — Ethena yield backing the whole trade.`,
      stats: [{ k: "sUSDe pledged (top 60)", v: fmt(n.valueUsd) }],
      address: null,
    };
  }
  if (n.kind === "funder") {
    return {
      title: short(n.id),
      description: `Funding wallet — seeded gas or capital to a loop wallet before its first Aave action.`,
      stats: [{ k: "Role", v: "Seeds a leverage-loop wallet" }],
      address: addressOf(n.id),
    };
  }
  // borrower
  const attributed = n.attributed && !/^0x/.test(n.label);
  const lede = n.loop
    ? `${fmt(n.valueUsd)} USDe borrowed in a leveraged Ethena loop${n.hf != null ? `, held at HF ${n.hf.toFixed(3)}` : ""}.`
    : `${fmt(n.valueUsd)} USDe borrowed as an organic position${n.hf != null ? `, HF ${n.hf.toFixed(2)}` : ""}.`;
  return {
    title: attributed ? n.label : short(n.id),
    description: lede,
    stats: walletStats(n),
    address: addressOf(n.id),
  };
}

// Plain-text stats for the "Copy markdown" action.
const statsToBody = (f) =>
  f.stats.map((s) => `- ${s.k}: ${s.v}`).join("\n") +
  (f.address ? `\n\nhttps://etherscan.io/address/${f.address}` : "");

/* --- build nodes --------------------------------------------------------- */
const nodes = src.nodes
  // funders with a 0x fallback label only clutter; keep them (they show funding trails)
  .map((n) => {
    const f = nodeFields(n);
    return {
      slug: n.id,
      title: f.title,
      description: f.description,
      body: statsToBody(f),
      prose: "",
      stats: f.stats,
      address: f.address,
      aliases: /^0x[0-9a-f]{40}$/i.test(n.id) ? [n.id] : [],
      links: [...nbr.get(n.id)].filter((t) => t !== n.id),
      usage: [],
      avoid: "",
      section: sectionOf(n),
      inDegree: sizeProxy(n),
      _kind: n.kind,
    };
  });

// order nodes by section then debt desc — fixes the "07 / 69" reading order
const kindRank = { reserve: 0, collateral: 1 };
nodes.sort((a, b) => a.section - b.section || (bDebt(b) - bDebt(a)));
function bDebt(node) {
  const s = src.nodes.find((x) => x.id === node.slug);
  return s ? (kindRank[s.kind] != null ? 1e12 - kindRank[s.kind] : s.valueUsd || 0) : 0;
}

/* --- edges --------------------------------------------------------------- */
// Per-edge `kind` drives colour, `weight` (USD) drives ribbon thickness.
const srcById = new Map(src.nodes.map((n) => [n.id, n]));
function edgeKind(e) {
  if (e.kind === "borrows") return srcById.get(e.source)?.loop ? "borrow-loop" : "borrow-organic";
  if (e.kind === "collateralizes") return "collateral";
  if (e.kind === "funds") return "funds";
  return e.kind;
}
const slugSet = new Set(nodes.map((n) => n.slug));
const seen = new Set();
const edges = [];
for (const e of src.edges) {
  if (!slugSet.has(e.source) || !slugSet.has(e.target) || e.source === e.target) continue;
  const key = [e.source, e.target].sort().join(" ");
  if (seen.has(key)) continue;
  seen.add(key);
  edges.push({ source: e.source, target: e.target, kind: edgeKind(e), weight: e.valueUsd });
}

/* --- layout (reuse the atlas's own deterministic solver) ----------------- */
const { positions, sections: geom } = computeLayout(nodes, edges, SECTIONS.length);
for (const n of nodes) n.layout = positions.get(n.slug);
for (const e of edges) e.control = bezierControl(positions.get(e.source), positions.get(e.target));

/* --- section slug lists (reading order) ---------------------------------- */
const sectionSlugs = SECTIONS.map((_, i) => nodes.filter((n) => n.section === i).map((n) => n.slug));

/* --- assemble ------------------------------------------------------------ */
const m = src.meta;
const graph = {
  generatedFrom: "data/aave-usde-source.json (task1 on-chain census)",
  meta: {
    title: "Aave v3 · USDe Borrow Book",
    tagline: `${fmt(m.total_debt_usde)} borrowed · block ${m.block.toLocaleString()} · ${m.time_utc.slice(0, 10)}`,
    about: [
      "Aavescan tracks Aave's rates and liquidity. This is the layer underneath: every wallet borrowing USDe on Aave v3, drawn as a graph and sized by debt.",
      `${fmt(m.loop_debt)} of the ${fmt(m.total_debt_usde)} book (${((m.loop_debt / m.total_debt_usde) * 100).toFixed(0)}%) is a single leveraged trade — sUSDe posted as collateral, USDe borrowed against it, restaked — stacked into a handful of named desks.`,
      "Nodes are wallets, sized by USDe debt. Red = leverage loops, green = organic borrowers, purple = the Aave reserve they all feed. Click a node to see its position; drag to rotate, scroll to zoom.",
      `On-chain census pinned at block ${m.block.toLocaleString()} (${m.time_utc.slice(0, 16).replace("T", " ")} UTC). Top 60 of ${m.live_borrowers.toLocaleString()} borrowers shown.`,
    ],
  },
  sections: SECTIONS.map((s, index) => ({
    title: s.title,
    index,
    slugs: sectionSlugs[index],
    ...geom[index],
  })),
  nodes: nodes.map((n) => ({
    slug: n.slug,
    title: n.title,
    description: n.description,
    body: n.body,
    prose: n.prose,
    stats: n.stats,
    address: n.address,
    aliases: n.aliases,
    links: n.links,
    usage: n.usage,
    avoid: n.avoid,
    section: n.section,
    inDegree: n.inDegree,
    layout: n.layout,
  })),
  edges,
};

await writeFile(join(root, "data/graph.json"), JSON.stringify(graph) + "\n");
const kb = (Buffer.byteLength(JSON.stringify(graph)) / 1024).toFixed(1);
console.log(
  `data/graph.json  ${kb}kb  (${graph.nodes.length} wallets, ${graph.sections.length} sections, ${graph.edges.length} edges)`
);
console.log(
  `  sections: ` +
    SECTIONS.map((s, i) => `${s.title} ${sectionSlugs[i].length}`).join(" · ")
);
