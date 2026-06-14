<div align="center">

# 🧮 ctxtax

### See exactly how many context tokens every MCP server and tool costs your Claude requests — *before you say a word.*

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)</samp>

[Why](#why-accurate-counts-matter) · [How it works](#how-it-works) · [Install](#install) · [Usage](#usage) · [Lint](#lint-for-mcp-server-authors) · [Tool Search](#tool-search-modelling) · [CI gate](#ci-enforce-a-context-budget-on-prs) · [Roadmap](#roadmap)

<img src="docs/hero.svg" alt="ctxtax — see your MCP context budget" width="760">

</div>

---

Every MCP tool you connect quietly injects its JSON schema into the model's context on **every** request. A handful of servers can burn 30–60k tokens of "context tax" before your first prompt — you pay it on each turn, and it crowds out the window you actually wanted to use.

`ctxtax` connects to your MCP servers, reads their real tool definitions, and tells you what they cost — per tool, per server, in tokens and in dollars.

```text
github  17.6k tokens (26 tools)  ≈ $0.0879/msg
  create_or_update_file      ████████████████████████████ 1.4k
  create_pull_request        ████████████████████████ 1.2k
  list_commits               ███████████████ 760
  ...
filesystem  4.1k tokens (11 tools)  ≈ $0.0205/msg
  ...
────────────────────────────────────────────────
TOTAL context tax: 21.7k tokens  ≈ $0.1084/msg  [model: claude-opus-4-8]
These tokens are sent on every request that exposes these tools (minus prompt caching).
```

<!-- Tip: drop a real screenshot at docs/hero.png and uncomment the line below for a prettier hero. -->
<!-- <div align="center"><img src="docs/hero.png" width="720" alt="ctxtax output"></div> -->

## Why accurate counts matter

Most "token counter" tools reach for `tiktoken`. **That's OpenAI's tokenizer — it undercounts Claude by ~15–20% on normal text, and worse on JSON schemas and non‑English.** A budgeting tool that's 20% wrong is worse than no tool.

`ctxtax` counts the way Claude actually counts: it calls Anthropic's official [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) endpoint (free, model‑specific). Set `ANTHROPIC_API_KEY` and you get exact numbers. No key? You still get a clearly‑labeled estimate — never a number pretending to be exact.

## How it works

1. **Discover** — reads your `.mcp.json` (or takes a server command directly).
2. **Connect** — speaks MCP over stdio or Streamable HTTP and calls `tools/list` to get the *real* schemas, exactly as your client sends them.
3. **Count** — converts each tool to the Anthropic tool shape and measures its **marginal** cost: `count_tokens(with the tool) − count_tokens(baseline)`.
4. **Report** — a sorted bar chart per server, totals, and the $/message at your chosen model's input price.

## Install

```bash
npm install -g ctxtax          # or: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # optional but recommended for exact counts
```

## Usage

```bash
ctxtax                       # scan ./.mcp.json
ctxtax -c path/to/.mcp.json  # a specific config
ctxtax -s github             # just one server from the config
ctxtax -m claude-sonnet-4-6  # count/price against another model
ctxtax --json                # machine-readable output
ctxtax lint                  # token-saving tips for MCP server authors
ctxtax toolsearch            # model deferred (Tool Search) vs always-loaded cost
ctxtax --html report.html --badge docs/context-cost.svg   # shareable card + README badge
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # one-off server (after --)
```

### Lint (for MCP server authors)

`ctxtax lint` flags what's making your tools expensive — over-long descriptions (measured exactly), bloated schemas, huge enums, redundant titles — with an estimate of the tokens you'd save:

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
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

### Tool Search modelling

Anthropic's [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) defers tool definitions — they load on demand instead of all upfront. `ctxtax toolsearch` estimates what you'd pay **upfront** with it on vs the always-loaded cost:

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

The catch it surfaces: **stdio servers are deferrable, but HTTP/Streamable MCP servers are not deferred today** ([claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)) — they pay full price upfront regardless. (Estimate: deferrable servers are modelled as keeping a name + 1-line stub in the search index.)

### Shareable report & badge

`--html` writes a self-contained HTML budget card (open it, share it); `--badge` writes a README badge.

```bash
ctxtax --html report.html              # a shareable HTML card (no external assets)
ctxtax --badge docs/context-cost.svg   # a static SVG badge (or .json for a shields.io endpoint)
```

Then drop it in your README: `![context cost](docs/context-cost.svg)`.

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
      - uses: HarryXin0919/ctxtax@v0.1.0
        with:
          max-tokens: "30000"
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # optional; exact counts
```

The action fetches the base branch's `.ctxtax.json`, renders the per-tool diff, posts/updates a single PR comment, writes a job summary, and fails the check if you blow the budget.

## Roadmap

`scan`, `ci`, `lint`, and `toolsearch` are all shipped. Next ideas (PRs welcome): prompt-caching-aware costs, an editor extension. Have one? [Open an issue](../../issues).

## Contributing

Issues and PRs welcome. `npm install`, then `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp` to try it locally.

## License

[MIT](LICENSE) © Harry Xin
