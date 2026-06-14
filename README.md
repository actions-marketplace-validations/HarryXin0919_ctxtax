# ctxtax

**See exactly how many context tokens every MCP server and tool costs your Claude requests — before you say a single word.**

Each MCP tool you connect quietly injects its JSON schema into the model's context on *every* request. A handful of servers can burn 30–60k tokens of "context tax" before your first prompt — you pay for it on each turn, and it crowds out the window you actually wanted to use.

`ctxtax` connects to your MCP servers, reads their real tool definitions, and tells you what they cost — per tool, per server, in tokens and in dollars.

```
github  17.6k tokens (26 tools)  ≈ $0.08792/msg
  create_or_update_file      ████████████████████████████ 1.4k
  create_pull_request        ████████████████████████ 1.2k
  list_commits               ███████████████ 760
  ...
filesystem  4.1k tokens (11 tools)  ≈ $0.02050/msg
  ...
────────────────────────────────────────────────
TOTAL context tax: 21.7k tokens  ≈ $0.10842/msg  [model: claude-opus-4-8]
These tokens are sent on every request that exposes these tools (minus prompt caching).
```

## Why accurate counts matter (and why not tiktoken)

Most "token counter" tools reach for `tiktoken`. **That's OpenAI's tokenizer — it undercounts Claude by ~15–20% on normal text, and worse on JSON schemas and non-English.** A budgeting tool that's 20% wrong is worse than no tool.

`ctxtax` counts the way Claude actually counts: it calls Anthropic's official [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) endpoint (free, model-specific). Set `ANTHROPIC_API_KEY` and you get exact numbers. No key? You still get a clearly-labeled rough estimate — never a number pretending to be exact.

## How it works

1. **Discover** — reads your `.mcp.json` (or takes a server command directly).
2. **Connect** — speaks MCP over stdio or Streamable HTTP and calls `tools/list` to get the *real* schemas, exactly as your client sends them.
3. **Count** — converts each tool to the Anthropic tool shape and measures its **marginal** cost: `count_tokens(with the tool) − count_tokens(baseline)`. That's the number of tokens the tool's definition adds to every request, per the model's own tokenizer.
4. **Report** — a sorted bar chart per server, totals, and the $/message at your chosen model's input price.

## Install

```bash
npm install -g ctxtax     # or: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # optional but recommended for exact counts
```

## Usage

```bash
ctxtax                       # scan ./.mcp.json
ctxtax -c path/to/.mcp.json  # a specific config
ctxtax -s github             # just one server from the config
ctxtax -m claude-sonnet-4-6  # count/price against another model
ctxtax --json                # machine-readable output
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # one-off server (after --)
```

`.mcp.json` is the standard Claude Code / Claude Desktop format:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

## CI: enforce a context budget on PRs

`ctxtax ci` turns the budget into a check. It fails the build when your MCP context tax crosses a threshold, and posts a **diff** on the PR — *"this PR adds 4 tools = +3,200 tokens/msg."* (Claude Code's `/context` is great interactively, but it can't run in CI; this can.)

```bash
# locally: save a committed budget snapshot
ctxtax ci --save                       # writes .ctxtax.json

# in CI: fail if over budget, diff against the base branch's snapshot, comment on the PR
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

Drop-in GitHub Action:

```yaml
# .github/workflows/ctxtax.yml
name: ctxtax
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: <your-org>/ctxtax@v0           # this repo ships an action.yml
        with:
          max-tokens: "30000"
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # optional; exact counts
```

The action fetches the base branch's `.ctxtax.json`, renders the per-tool diff, posts/updates a single PR comment, writes a job summary, and fails the check if you blow the budget.

## Develop

```bash
npm install
npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp
npm run build && npm start
```

## Roadmap

- **Lint** — actionable suggestions for MCP **server authors**: over-long descriptions, redundant schema, "this could be ~400 tokens lighter."
- **Tool Search modelling** — `deferred` vs `alwaysLoad` comparison, so you see what's paid up-front vs on-demand.
- **HTML report** — a shareable, self-contained budget card + a README badge (`context cost: 2.1K ✓`).

## License

MIT
