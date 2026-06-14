<div align="center">

# 🧮 ctxtax

### 一条命令，看清你接的每个 MCP server / 每个工具，在每次 Claude 请求里吃掉多少 context token —— *还没开口就已经付费。*

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#参与贡献)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)</samp>

[为什么要精确](#为什么必须精确计数) · [工作原理](#工作原理) · [安装](#安装) · [使用](#使用) · [Lint](#lint给-mcp-server-作者) · [Tool Search 建模](#tool-search-建模) · [CI 预算闸](#在-ci-中强制-context-预算) · [路线图](#路线图)

</div>

---

你每接一个 MCP 工具，它的 JSON schema 就会被塞进模型上下文，**每一次**请求都重发。几个 server 叠起来，轻松在你发出第一句话之前就吃掉 3–6 万 token 的「上下文税」—— 每一轮都在付，还挤占你真正想用的窗口。

`ctxtax` 连接你的 MCP server，读取它们真实的工具定义，按工具、按 server 告诉你成本 —— token 数 + 美元。

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

## 为什么必须精确计数

大多数「token 计数」工具用的是 `tiktoken`。**那是 OpenAI 的分词器 —— 对 Claude 会低估约 15–20%，对 JSON schema 和非英文更糟。** 一个差 20% 的预算工具，比没有还糟。

`ctxtax` 按 Claude 真正的计数方式来：调用 Anthropic 官方的 [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) 接口（免费、按模型区分）。设了 `ANTHROPIC_API_KEY` 就是精确值；没有 key 也会给一个**明确标注**的估算 —— 绝不拿一个数字假装精确。

## 工作原理

1. **发现** —— 读取你的 `.mcp.json`（或直接给一个 server 命令）。
2. **连接** —— 通过 stdio 或 Streamable HTTP 走 MCP，调用 `tools/list` 拿到**真实** schema，与你的客户端发给模型的完全一致。
3. **计数** —— 把每个工具转成 Anthropic 工具格式，测它的**边际**成本：`count_tokens(带该工具) − count_tokens(基线)`。
4. **报告** —— 按 server 输出排序条形图、总计，以及按你所选模型输入价算出的 $/条消息。

## 安装

```bash
npm install -g ctxtax          # 或：npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # 可选，但建议设置以获得精确计数
```

## 使用

```bash
ctxtax                       # 扫描 ./.mcp.json
ctxtax -c path/to/.mcp.json  # 指定配置文件
ctxtax -s github             # 只扫配置里的某一个 server
ctxtax -m claude-sonnet-4-6  # 按另一个模型计数/计价
ctxtax --json                # 机器可读输出
ctxtax lint                  # 给 MCP server 作者的省 token 建议
ctxtax toolsearch            # 模拟 deferred(Tool Search) 与 always-loaded 成本
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # 临时跑一个 server（放在 -- 之后）
```

`.mcp.json` 就是 Claude Code / Claude Desktop 的标准格式：

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

### Lint（给 MCP server 作者）

`ctxtax lint` 指出是什么让你的工具变贵 —— 过长的 description（精确测量）、臃肿的 schema、超大 enum、冗余 title —— 并估算你能省下的 token：

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
```

### Tool Search 建模

Anthropic 的 [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) 会延迟加载工具定义 —— 按需加载而非全部预先加载。`ctxtax toolsearch` 估算开启它后你**预先**要付多少，对比 always-loaded 成本：

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

它揭示的关键点：**stdio server 可延迟，但 HTTP/Streamable MCP server 目前不会被延迟**（[claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)）—— 它们无论如何都要预先付全价。（估算：可延迟的 server 被建模为在搜索索引里只保留 name + 一行 stub。）

## 在 CI 中强制 context 预算

`ctxtax ci` 把预算变成一道检查。当 MCP 上下文税超过阈值时让构建失败，并在 PR 上贴出**差异**——*“这个 PR 加了 4 个工具 = 每条消息 +3,200 tokens”*。（Claude Code 的 `/context` 交互时很好用，但它进不了 CI；这个可以。）

```bash
# 本地：保存一份提交进仓库的预算快照
ctxtax ci --save                       # 写入 .ctxtax.json

# CI 中：超预算就失败、与基线分支的快照做差异、在 PR 上评论
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

开箱即用的 GitHub Action：

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # 可选；用于精确计数
```

该 Action 会拉取基线分支的 `.ctxtax.json`，渲染逐工具的差异，创建/更新同一条 PR 评论，写入 job summary，并在你超预算时让检查失败。

## 路线图

- **HTML 报告** —— 可分享的自包含预算卡片 + README 徽章（`context cost: 2.1K ✓`）。

## 参与贡献

欢迎 Issue 与 PR。`npm install`，然后 `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp` 即可本地试用。

## 许可证

[MIT](LICENSE) © Harry Xin
