import Anthropic from "@anthropic-ai/sdk";
import type { McpTool } from "./types.js";

/** Input price in USD per 1M tokens. Tool definitions are re-sent every request (unless cached). */
export const PRICING: Record<string, number> = {
  "claude-opus-4-8": 5,
  "claude-opus-4-7": 5,
  "claude-opus-4-6": 5,
  "claude-sonnet-4-6": 3,
  "claude-haiku-4-5": 1,
  "claude-fable-5": 10,
};

export const DEFAULT_MODEL = "claude-opus-4-8";

export interface Counter {
  /** "exact" = Anthropic count_tokens API; "estimate" = offline heuristic (no API key). */
  mode: "exact" | "estimate";
  /** Tokens added by this set of tool definitions, as Claude actually sees them. */
  count(tools: McpTool[]): Promise<number>;
}

function toAnthropicTool(t: McpTool) {
  return {
    name: t.name,
    description: t.description ?? "",
    input_schema: (t.inputSchema ?? { type: "object" }) as Anthropic.Tool.InputSchema,
  };
}

/**
 * Build a token counter.
 *
 * With ANTHROPIC_API_KEY set, uses Anthropic's /v1/messages/count_tokens — the only
 * accurate way to count Claude tokens (and it's free). We deliberately do NOT use
 * tiktoken: it's OpenAI's tokenizer and undercounts Claude by ~15-20% (worse on JSON).
 *
 * Without a key, falls back to a rough JSON-length heuristic, clearly labeled.
 */
export function makeCounter(model: string): Counter {
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    return {
      mode: "exact",
      async count(tools) {
        const params: Anthropic.MessageCountTokensParams = {
          model,
          messages: [{ role: "user", content: "." }],
        };
        if (tools.length) params.tools = tools.map(toAnthropicTool);
        const res = await client.messages.countTokens(params);
        return res.input_tokens;
      },
    };
  }
  return {
    mode: "estimate",
    async count(tools) {
      if (!tools.length) return 0;
      const chars = tools
        .map((t) => JSON.stringify(toAnthropicTool(t)))
        .reduce((n, s) => n + s.length, 0);
      return Math.round(chars / 3.5);
    },
  };
}

export function dollarsPerMessage(tokens: number, model: string): number | null {
  const price = PRICING[model];
  if (price === undefined) return null;
  return (tokens / 1_000_000) * price;
}
