// MCP server over the yc-startup-map dataset (../data/graph.json, slimmed
// into ./data/startups.json by scripts/prepare-data.mjs). Read-only: this
// server serves the atlas's data, it does not write it — the daily refresh
// pipeline (claude-tools/yc-api/ + .github/workflows/update-yc-batches.yml)
// updates data/graph.json upstream and a redeploy here picks it up.
//
// `batch` (e.g. "W26") is a best-effort regex parse off each entry's
// description and is only present for entries whose card mentions
// "YC <batch>" in that exact form — most reliably true for cards generated
// by claude-tools/yc-api/generate-cards.mjs. `year` (calendar year) comes
// from content/year-index.json via the main pipeline and is far more
// complete; prefer it when `batch` is missing.
import { MCPServer } from "mcp-use";
import { readFileSync } from "node:fs";
import { z } from "zod";

const server = new MCPServer({
  name: "yc-startup-map",
  title: "YC Startup Map",
  version: "1.0.0",
  description:
    "Search and read Y Combinator company (and founder) data from the yc-startup-map atlas.",
});

type Startup = {
  slug: string;
  title: string;
  description: string;
  prose: string;
  aliases: string[];
  links: string[];
  section?: string;
  kind: "company" | "founder";
  year?: number;
  batch?: string;
};

type Dataset = {
  generatedFrom: string;
  generatedAt: string;
  count: number;
  startups: Startup[];
};

const dataset: Dataset = JSON.parse(
  readFileSync(new URL("./data/startups.json", import.meta.url), "utf8")
);
const bySlug = new Map(dataset.startups.map((s) => [s.slug, s]));

function summarize(s: Startup) {
  return {
    slug: s.slug,
    title: s.title,
    description: s.description,
    section: s.section,
    kind: s.kind,
    year: s.year,
    batch: s.batch,
  };
}

server.tool(
  {
    name: "search-startups",
    description:
      "Full-text search over YC company/founder titles, descriptions, aliases and body text. Optionally narrow by section, batch (e.g. \"W26\") or calendar year.",
    inputSchema: z.object({
      query: z.string().describe("Search text, matched case-insensitively against title/description/aliases/prose."),
      section: z.string().optional().describe("Exact section title, e.g. \"AI & Developer Tools\". Use list-sections to see options."),
      batch: z.string().optional().describe("Exact YC batch code, e.g. \"W26\" or \"F25\"."),
      year: z.number().optional().describe("Calendar year the company/founder entered YC."),
      kind: z.enum(["company", "founder"]).optional(),
      limit: z.number().min(1).max(100).default(20),
    }),
    outputSchema: z.object({
      total: z.number(),
      results: z.array(
        z.object({
          slug: z.string(),
          title: z.string(),
          description: z.string(),
          section: z.string().optional(),
          kind: z.string(),
          year: z.number().optional(),
          batch: z.string().optional(),
        })
      ),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, section, batch, year, kind, limit }) => {
    const q = query.trim().toLowerCase();
    let matches = dataset.startups.filter((s) => {
      if (section && s.section !== section) return false;
      if (batch && s.batch !== batch) return false;
      if (year !== undefined && s.year !== year) return false;
      if (kind && s.kind !== kind) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.aliases.some((a) => a.toLowerCase().includes(q)) ||
        s.prose.toLowerCase().includes(q)
      );
    });
    const total = matches.length;
    matches = matches.slice(0, limit);
    const results = matches.map(summarize);
    return {
      content: [{ type: "text", text: JSON.stringify({ total, results }) }],
      structuredContent: { total, results },
    };
  }
);

server.tool(
  {
    name: "get-startup",
    description: "Full detail for one company or founder by slug (as returned by search-startups).",
    inputSchema: z.object({ slug: z.string() }),
    outputSchema: z.object({
      found: z.boolean(),
      startup: z
        .object({
          slug: z.string(),
          title: z.string(),
          description: z.string(),
          prose: z.string(),
          aliases: z.array(z.string()),
          links: z.array(z.string()),
          section: z.string().optional(),
          kind: z.string(),
          year: z.number().optional(),
          batch: z.string().optional(),
        })
        .optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ slug }) => {
    const s = bySlug.get(slug);
    return {
      content: [{ type: "text", text: JSON.stringify(s ?? { error: "not found" }) }],
      structuredContent: { found: !!s, startup: s },
    };
  }
);

server.tool(
  {
    name: "get-batch",
    description: "All companies tagged with a given YC batch code (e.g. \"W26\", \"F25\").",
    inputSchema: z.object({ batch: z.string() }),
    outputSchema: z.object({
      batch: z.string(),
      total: z.number(),
      results: z.array(
        z.object({ slug: z.string(), title: z.string(), description: z.string() })
      ),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ batch }) => {
    const results = dataset.startups
      .filter((s) => s.batch === batch)
      .map((s) => ({ slug: s.slug, title: s.title, description: s.description }));
    return {
      content: [{ type: "text", text: JSON.stringify({ batch, total: results.length, results }) }],
      structuredContent: { batch, total: results.length, results },
    };
  }
);

server.tool(
  {
    name: "list-batches",
    description:
      "Every YC batch code present in the dataset, with a company count for each. Batch is a best-effort parse (see list-sections/search-startups docs); prefer this over guessing a batch string.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      batches: z.array(z.object({ batch: z.string(), count: z.number() })),
      untagged: z.number().describe("Entries with no parseable batch — filter by year instead."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const counts = new Map<string, number>();
    let untagged = 0;
    for (const s of dataset.startups) {
      if (s.kind !== "company") continue;
      if (!s.batch) { untagged++; continue; }
      counts.set(s.batch, (counts.get(s.batch) ?? 0) + 1);
    }
    const batches = [...counts.entries()]
      .map(([batch, count]) => ({ batch, count }))
      .sort((a, b) => a.batch.localeCompare(b.batch));
    return {
      content: [{ type: "text", text: JSON.stringify({ batches, untagged }) }],
      structuredContent: { batches, untagged },
    };
  }
);

server.tool(
  {
    name: "list-sections",
    description: "Every section title in the atlas (industry clusters, plus \"Founders\"), with entry counts.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      sections: z.array(z.object({ section: z.string(), count: z.number() })),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const counts = new Map<string, number>();
    for (const s of dataset.startups) {
      const key = s.section ?? "(none)";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sections = [...counts.entries()].map(([section, count]) => ({ section, count }));
    return {
      content: [{ type: "text", text: JSON.stringify({ sections }) }],
      structuredContent: { sections },
    };
  }
);

export default server;
