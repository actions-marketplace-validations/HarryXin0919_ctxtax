import { dollarsPerMessage } from "./count.js";
import type { ServerResult } from "./types.js";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

const BAR_WIDTH = 28;

function bar(value: number, max: number): string {
  if (max <= 0) return "";
  const filled = Math.max(1, Math.round((value / max) * BAR_WIDTH));
  return "█".repeat(filled);
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export interface RenderOptions {
  model: string;
  mode: "exact" | "estimate";
  color: boolean;
}

export function render(results: ServerResult[], opts: RenderOptions): string {
  const c = opts.color ? COLORS : new Proxy({}, { get: () => "" }) as typeof COLORS;
  const lines: string[] = [];
  const allTokens = results.flatMap((r) => r.tools.map((t) => t.tokens));
  const max = allTokens.length ? Math.max(...allTokens) : 0;

  let grandTotal = 0;
  for (const r of results) {
    lines.push("");
    if (r.error) {
      lines.push(`${c.bold}${r.server}${c.reset}  ${c.red}error: ${r.error}${c.reset}`);
      continue;
    }
    const usd = dollarsPerMessage(r.totalTokens, opts.model);
    const usdStr = usd === null ? "" : `  ${c.dim}≈ $${usd.toFixed(5)}/msg${c.reset}`;
    lines.push(
      `${c.bold}${r.server}${c.reset}  ${c.cyan}${fmt(r.totalTokens)} tokens${c.reset}` +
        ` ${c.dim}(${r.tools.length} tools)${c.reset}${usdStr}`,
    );
    grandTotal += r.totalTokens;
    const sorted = [...r.tools].sort((a, b) => b.tokens - a.tokens);
    for (const t of sorted) {
      const name = t.name.length > 26 ? t.name.slice(0, 25) + "…" : t.name.padEnd(26);
      lines.push(`  ${c.dim}${name}${c.reset} ${c.yellow}${bar(t.tokens, max)}${c.reset} ${fmt(t.tokens)}`);
    }
  }

  lines.push("");
  lines.push(`${"─".repeat(48)}`);
  const gUsd = dollarsPerMessage(grandTotal, opts.model);
  const gUsdStr = gUsd === null ? "" : `  ${c.dim}≈ $${gUsd.toFixed(5)}/msg${c.reset}`;
  lines.push(
    `${c.bold}${c.green}TOTAL context tax: ${fmt(grandTotal)} tokens${c.reset}${gUsdStr}  ${c.dim}[model: ${opts.model}]${c.reset}`,
  );
  if (opts.mode === "estimate") {
    lines.push(
      `${c.yellow}⚠  estimate only${c.reset} ${c.dim}— set ANTHROPIC_API_KEY for exact counts (free, via Anthropic count_tokens).${c.reset}`,
    );
  }
  lines.push(
    `${c.dim}These tokens are sent on every request that exposes these tools (minus prompt caching).${c.reset}`,
  );
  return lines.join("\n");
}
