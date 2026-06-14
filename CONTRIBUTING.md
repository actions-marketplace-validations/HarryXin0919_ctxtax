# Contributing to ctxtax

Thanks for your interest! ctxtax is a small, focused tool — issues and PRs are very welcome.

## Quick start

```bash
git clone https://github.com/HarryXin0919/ctxtax
cd ctxtax
npm install
# run against a real server without building:
npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp
# build + run the compiled CLI:
npm run build && node dist/cli.js -- npx -y @modelcontextprotocol/server-filesystem /tmp
```

Set `ANTHROPIC_API_KEY` for exact counts; without it you get a labeled estimate (handy for offline dev).

## Architecture

| File | Responsibility |
|---|---|
| `src/cli.ts` | Commander setup — the `scan` / `ci` / `lint` subcommands. |
| `src/mcp.ts` | Load `.mcp.json`, connect over stdio / Streamable HTTP, `tools/list`. |
| `src/count.ts` | Token counting — Anthropic `count_tokens` (exact) or a labeled heuristic. Pricing table. |
| `src/scan.ts` | Per-server, per-tool marginal token measurement. |
| `src/report.ts` | The terminal bar chart. |
| `src/ci.ts` | Snapshots, budget diffs, PR-comment markdown, GitHub step summary. |
| `src/lint.ts` | Token-saving suggestions for server authors. |
| `action.yml` | Composite GitHub Action wrapping `ctxtax ci`. |

## Guidelines

- **Never reach for `tiktoken`.** Claude's tokenizer ≠ OpenAI's. Exact counts go through `count_tokens`; anything offline must be clearly labeled an estimate.
- Keep dependencies minimal.
- Match the existing code style (strict TypeScript, ESM, small modules).
- New lint rules go in `src/lint.ts` as a `Finding`; include an `estSavings` when you can quantify it.

## Pull requests

- One focused change per PR.
- Run `npm run build` (must pass) before pushing.
- Describe what you changed and why; link any related issue.
