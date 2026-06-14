import type { McpTool, ServerConfig } from "./types.js";
import { type Counter, dollarsPerMessage } from "./count.js";

export interface ModeResult {
  server: string;
  deferrable: boolean;
  reason: string;
  /** Full tool definitions in context on every request (Tool Search off). */
  alwaysTokens: number;
  /** Upfront context with Tool Search on: search-index stubs for deferrable servers; full cost otherwise. */
  deferredUpfrontTokens: number;
  error?: string;
}

/** A search-index "stub": name + a one-line description, no input schema. */
function stub(t: McpTool): McpTool {
  const first = (t.description ?? "").split(/(?<=[.!?。！？\n])/)[0] ?? "";
  const trimmed = first.length > 100 ? first.slice(0, 100) + "…" : first;
  return { name: t.name, description: trimmed.trim(), inputSchema: { type: "object" } };
}

/**
 * Model Anthropic's Tool Search: with it on, deferrable servers keep only a
 * lightweight stub in context upfront and load full schemas on demand.
 *
 * Caveat (honest estimate): stdio MCP servers are deferrable; HTTP/Streamable
 * servers are NOT deferred today (github.com/anthropics/claude-code/issues/40314),
 * so they pay their full cost upfront regardless.
 */
export async function modelToolSearch(
  server: ServerConfig,
  tools: McpTool[],
  counter: Counter,
): Promise<ModeResult> {
  const baseline = await counter.count([]);
  const always = tools.length ? Math.max(0, (await counter.count(tools)) - baseline) : 0;

  const deferrable = server.transport === "stdio";
  let upfront = always;
  let reason = "HTTP/Streamable — not deferred today (#40314)";
  if (deferrable) {
    upfront = tools.length ? Math.max(0, (await counter.count(tools.map(stub))) - baseline) : 0;
    reason = "stdio — deferrable";
  }
  return { server: server.name, deferrable, reason, alwaysTokens: always, deferredUpfrontTokens: upfront };
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export interface ModesRenderOptions {
  model: string;
  mode: "exact" | "estimate";
  color: boolean;
}

export function renderModes(results: ModeResult[], opts: ModesRenderOptions): string {
  const c = opts.color ? C : (new Proxy({}, { get: () => "" }) as typeof C);
  const lines: string[] = [];
  lines.push(`${c.bold}Tool Search modelling${c.reset} ${c.dim}(estimate)${c.reset}`);
  lines.push("");
  lines.push(`  ${"server".padEnd(20)} ${"always".padStart(8)} ${"deferred↑".padStart(10)}   note`);
  lines.push(`  ${"─".repeat(20)} ${"─".repeat(8)} ${"─".repeat(10)}   ${"─".repeat(34)}`);

  let alwaysTotal = 0;
  let upfrontTotal = 0;
  for (const r of results) {
    if (r.error) {
      lines.push(`  ${r.server.padEnd(20)} ${c.yellow}error: ${r.error}${c.reset}`);
      continue;
    }
    alwaysTotal += r.alwaysTokens;
    upfrontTotal += r.deferredUpfrontTokens;
    const tag = r.deferrable ? `${c.green}${r.reason}${c.reset}` : `${c.yellow}${r.reason}${c.reset}`;
    lines.push(
      `  ${r.server.slice(0, 20).padEnd(20)} ${fmt(r.alwaysTokens).padStart(8)} ${fmt(r.deferredUpfrontTokens).padStart(10)}   ${tag}`,
    );
  }

  const saved = alwaysTotal - upfrontTotal;
  const aUsd = dollarsPerMessage(alwaysTotal, opts.model);
  lines.push("");
  lines.push("─".repeat(58));
  lines.push(
    `${c.bold}always-loaded total:${c.reset} ${c.cyan}${fmt(alwaysTotal)} tokens${c.reset}` +
      (aUsd === null ? "" : ` ${c.dim}≈ $${aUsd.toFixed(4)}/msg${c.reset}`),
  );
  lines.push(
    `${c.bold}deferred upfront:${c.reset}    ${c.green}${fmt(upfrontTotal)} tokens${c.reset}` +
      (saved > 0 ? ` ${c.dim}(−${fmt(saved)} upfront; the rest loads on demand)${c.reset}` : ""),
  );
  lines.push("");
  lines.push(
    `${c.dim}Estimate: assumes deferrable servers keep a name + 1-line stub in the search index.${c.reset}`,
  );
  lines.push(
    `${c.dim}HTTP/Streamable MCP servers are not deferred today — see anthropics/claude-code#40314.${c.reset}`,
  );
  if (opts.mode === "estimate") {
    lines.push(`${c.yellow}⚠  token estimate — set ANTHROPIC_API_KEY for exact counts.${c.reset}`);
  }
  return lines.join("\n");
}
