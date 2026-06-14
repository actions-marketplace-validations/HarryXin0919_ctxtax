import { listTools } from "./mcp.js";
import { makeCounter } from "./count.js";
import type { ServerConfig, ServerResult } from "./types.js";

export interface ScanResult {
  model: string;
  mode: "exact" | "estimate";
  results: ServerResult[];
  total: number;
}

/** Connect to each server, list its tools, and measure each tool's marginal token cost. */
export async function scan(servers: ServerConfig[], model: string): Promise<ScanResult> {
  const counter = makeCounter(model);
  const baseline = await counter.count([]); // fixed request overhead, subtracted out

  const results: ServerResult[] = [];
  for (const server of servers) {
    try {
      const tools = await listTools(server);
      const toolCosts = [];
      for (const t of tools) {
        const tokens = Math.max(0, (await counter.count([t])) - baseline);
        toolCosts.push({ name: t.name, tokens });
      }
      const totalTokens = tools.length ? Math.max(0, (await counter.count(tools)) - baseline) : 0;
      results.push({ server: server.name, tools: toolCosts, totalTokens });
    } catch (err) {
      results.push({
        server: server.name,
        tools: [],
        totalTokens: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const total = results.reduce((n, r) => n + r.totalTokens, 0);
  return { model, mode: counter.mode, results, total };
}
