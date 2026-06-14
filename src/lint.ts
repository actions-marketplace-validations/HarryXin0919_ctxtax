import type { McpTool } from "./types.js";
import type { Counter } from "./count.js";

export interface Finding {
  server: string;
  tool: string;
  rule: string;
  severity: "warn" | "info";
  message: string;
  /** Rough tokens-per-message recoverable if the suggestion is applied. */
  estSavings: number;
}

export interface LintOptions {
  maxDescTokens: number;
  maxToolTokens: number;
}

function estTokens(s: string): number {
  return Math.round(s.length / 3.5);
}

/**
 * Heuristic suggestions for MCP server *authors* to shrink their tools' context cost.
 * Description cost is measured exactly (with vs without description) via the counter;
 * per-property findings use a cheap length heuristic to avoid an API call per field.
 */
export async function lintTools(
  server: string,
  tools: McpTool[],
  counter: Counter,
  opts: LintOptions,
): Promise<Finding[]> {
  const out: Finding[] = [];
  const baseline = await counter.count([]);

  for (const t of tools) {
    const toolTokens = Math.max(0, (await counter.count([t])) - baseline);

    // 1. Description: the single biggest lever. Measure its exact cost.
    if (t.description && t.description.trim()) {
      const noDesc = { ...t, description: "" };
      const descTokens = Math.max(0, toolTokens - Math.max(0, (await counter.count([noDesc])) - baseline));
      if (descTokens > opts.maxDescTokens) {
        out.push({
          server,
          tool: t.name,
          rule: "long-description",
          severity: "warn",
          message: `description is ~${descTokens} tokens (target ≤ ${opts.maxDescTokens}). Keep only what Claude needs to decide when to call this tool.`,
          estSavings: descTokens - opts.maxDescTokens,
        });
      }
    } else {
      out.push({
        server,
        tool: t.name,
        rule: "no-description",
        severity: "warn",
        message: `no description — Claude can't reliably tell when to call this tool.`,
        estSavings: 0,
      });
    }

    // 2. Per-property schema smells.
    const props = (t.inputSchema?.properties ?? {}) as Record<string, any>;
    for (const [pname, p] of Object.entries(props)) {
      if (typeof p?.description === "string") {
        const est = estTokens(p.description);
        if (est > 60) {
          out.push({
            server,
            tool: t.name,
            rule: "long-param-description",
            severity: "info",
            message: `param "${pname}" description is ~${est} tokens — trim it.`,
            estSavings: est - 60,
          });
        }
      }
      if (Array.isArray(p?.enum) && p.enum.length > 20) {
        out.push({
          server,
          tool: t.name,
          rule: "large-enum",
          severity: "info",
          message: `param "${pname}" has ${p.enum.length} enum values — large enums are pricey; consider a freeform string or fewer values.`,
          estSavings: 0,
        });
      }
      const norm = (s: string) => s.replace(/[_\s]/g, "").toLowerCase();
      if (typeof p?.title === "string" && norm(p.title) === norm(pname)) {
        out.push({
          server,
          tool: t.name,
          rule: "redundant-title",
          severity: "info",
          message: `param "${pname}" has a title that just repeats its name — drop the title.`,
          estSavings: 0,
        });
      }
    }

    // 3. Whole-tool size.
    if (toolTokens > opts.maxToolTokens) {
      out.push({
        server,
        tool: t.name,
        rule: "verbose-tool",
        severity: "info",
        message: `the whole tool is ~${toolTokens} tokens — among the most expensive; trim the schema or split it.`,
        estSavings: 0,
      });
    }
  }

  return out;
}

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
};

export function renderLint(findings: Finding[], color = true): string {
  const c = color ? COLORS : (new Proxy({}, { get: () => "" }) as typeof COLORS);
  if (!findings.length) return `${c.green}✓ No lint findings — your tools are lean.${c.reset}`;

  const lines: string[] = [];
  let totalSavings = 0;
  const byTool = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.server} / ${f.tool}`;
    if (!byTool.has(key)) byTool.set(key, []);
    byTool.get(key)!.push(f);
    totalSavings += f.estSavings;
  }

  for (const [key, fs] of byTool) {
    lines.push("");
    lines.push(`${c.bold}${key}${c.reset}`);
    for (const f of fs) {
      const icon = f.severity === "warn" ? `${c.red}✖${c.reset}` : `${c.yellow}•${c.reset}`;
      const save = f.estSavings > 0 ? ` ${c.dim}(~${f.estSavings} tokens saveable)${c.reset}` : "";
      lines.push(`  ${icon} ${c.dim}[${f.rule}]${c.reset} ${f.message}${save}`);
    }
  }

  lines.push("");
  lines.push("─".repeat(48));
  lines.push(
    `${c.bold}${findings.length} findings${c.reset}` +
      (totalSavings > 0 ? `  ${c.green}~${totalSavings} tokens/msg recoverable${c.reset}` : ""),
  );
  return lines.join("\n");
}
