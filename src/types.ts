export interface StdioServer {
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface HttpServer {
  name: string;
  transport: "http";
  url: string;
  headers?: Record<string, string>;
}

export type ServerConfig = StdioServer | HttpServer;

/** A tool definition as returned by an MCP server's `tools/list`. `inputSchema` is JSON Schema. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCost {
  name: string;
  /** Marginal input tokens this tool's definition adds to every request. */
  tokens: number;
}

export interface ServerResult {
  server: string;
  tools: ToolCost[];
  /** Measured combined cost of all tools (≈ sum of per-tool, minus shared block overhead). */
  totalTokens: number;
  error?: string;
}
