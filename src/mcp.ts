import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerConfig, McpTool } from "./types.js";

/** Strip a UTF-8 BOM (common on Windows-authored JSON) so JSON.parse doesn't choke. */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Parse an `.mcp.json` (Claude Code) / `claude_desktop_config.json` style file.
 * Supports stdio servers ({command, args, env}) and HTTP servers ({url, headers}).
 */
export async function loadConfig(path: string): Promise<ServerConfig[]> {
  const raw = stripBom(await readFile(path, "utf8"));
  const json = JSON.parse(raw) as Record<string, unknown>;
  const servers = (json.mcpServers ?? json.servers ?? {}) as Record<string, any>;
  const out: ServerConfig[] = [];
  for (const [name, entry] of Object.entries(servers)) {
    if (entry?.url) {
      out.push({ name, transport: "http", url: entry.url, headers: entry.headers });
    } else if (entry?.command) {
      out.push({
        name,
        transport: "stdio",
        command: entry.command,
        args: entry.args ?? [],
        env: entry.env,
      });
    }
  }
  return out;
}

function cleanEnv(extra?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") base[k] = v;
  }
  return { ...base, ...(extra ?? {}) };
}

/** Connect to one MCP server, list its tools, and disconnect. */
export async function listTools(server: ServerConfig): Promise<McpTool[]> {
  const client = new Client({ name: "ctxtax", version: "0.1.0" });
  const transport =
    server.transport === "stdio"
      ? new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: cleanEnv(server.env),
          stderr: "ignore",
        })
      : new StreamableHTTPClientTransport(
          new URL(server.url),
          server.headers ? { requestInit: { headers: server.headers } } : undefined,
        );

  try {
    await client.connect(transport);
    const res = await client.listTools();
    return (res.tools ?? []) as unknown as McpTool[];
  } finally {
    await client.close().catch(() => {});
  }
}
