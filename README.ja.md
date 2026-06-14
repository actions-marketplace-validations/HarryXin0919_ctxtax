<div align="center">

# 🧮 ctxtax

### 接続した各 MCP サーバー / 各ツールが、Claude のリクエストごとにコンテキストトークンをどれだけ消費しているか —— *一言も話す前から* コマンド一つで可視化。

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#コントリビュート)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)</samp>

[なぜ正確さが重要か](#正確なカウントが重要な理由) · [仕組み](#仕組み) · [インストール](#インストール) · [使い方](#使い方) · [Lint](#lintmcp-サーバー作者向け) · [Tool Search](#tool-search-のモデリング) · [CI ゲート](#ci-でコンテキスト予算を強制する) · [ロードマップ](#ロードマップ)

<img src="docs/hero.svg" alt="ctxtax — see your MCP context budget" width="760">

</div>

---

MCP ツールを接続するたびに、その JSON スキーマが**毎回**のリクエストでモデルのコンテキストに静かに注入されます。サーバーが数個あるだけで、最初のプロンプトを送る前に 3〜6 万トークンもの「コンテキスト税」を消費しかねません —— ターンごとに支払い続け、本来使いたかったウィンドウを圧迫します。

`ctxtax` は MCP サーバーへ接続し、実際のツール定義を読み取って、ツール単位・サーバー単位のコストを —— トークン数とドルで —— 表示します。

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

## 正確なカウントが重要な理由

多くの「トークンカウンター」は `tiktoken` に頼ります。**しかしそれは OpenAI のトークナイザーで、Claude を通常テキストで約 15〜20%、JSON スキーマや非英語ではさらに大きく過小評価します。** 20% ずれる予算ツールは、無いより悪いのです。

`ctxtax` は Claude が実際に数えるとおりに数えます。Anthropic 公式の [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) エンドポイント（無料・モデル別）を呼び出します。`ANTHROPIC_API_KEY` を設定すれば正確な値が得られ、キーが無い場合も**明確にラベル付けされた**推定値を返します —— 正確なふりをした数字は決して出しません。

## 仕組み

1. **検出** —— `.mcp.json` を読み込みます（またはサーバーコマンドを直接指定）。
2. **接続** —— stdio または Streamable HTTP で MCP を話し、`tools/list` を呼んで、クライアントがモデルに送るのと**まったく同じ**実スキーマを取得します。
3. **カウント** —— 各ツールを Anthropic のツール形式に変換し、その**限界**コストを計測します：`count_tokens(そのツールあり) − count_tokens(ベースライン)`。
4. **レポート** —— サーバーごとのソート済み棒グラフ、合計、選択したモデルの入力単価による $/メッセージを出力します。

## インストール

```bash
npm install -g ctxtax          # または: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # 任意。正確なカウントのため推奨
```

## 使い方

```bash
ctxtax                       # ./.mcp.json をスキャン
ctxtax -c path/to/.mcp.json  # 特定の設定ファイル
ctxtax -s github             # 設定内の特定サーバーだけ
ctxtax -m claude-sonnet-4-6  # 別のモデルでカウント/価格計算
ctxtax --json                # 機械可読な出力
ctxtax lint                  # MCP サーバー作者向けの省トークン提案
ctxtax toolsearch            # deferred(Tool Search) と always-loaded のコストを試算
ctxtax --html report.html --badge docs/context-cost.svg   # 共有カード + README バッジ
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # 単発サーバー（-- の後ろに）
```

`.mcp.json` は Claude Code / Claude Desktop の標準形式です：

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

### Lint（MCP サーバー作者向け）

`ctxtax lint` はツールを高価にしている要因 —— 長すぎる description（正確に測定）、肥大化したスキーマ、巨大な enum、冗長な title —— を、節約できるトークンの見積もりとともに指摘します：

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
```

### Tool Search のモデリング

Anthropic の [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) はツール定義を遅延ロードします —— すべてを先読みせず、必要時にロードします。`ctxtax toolsearch` は、それをオンにしたときの**先払い**コストを always-loaded コストと比較して試算します：

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

ここで判明する要点：**stdio サーバーは遅延可能ですが、HTTP/Streamable MCP サーバーは現状遅延されません**（[claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)）—— いずれにせよ全額を先払いします。（試算：遅延可能なサーバーは検索インデックスに name + 1 行スタブのみを保持するものとしてモデル化。）

### 共有レポートとバッジ

`--html` は自己完結の HTML 予算カードを書き出し（開いて共有）、`--badge` は README バッジを書き出します。

```bash
ctxtax --html report.html              # 共有可能な HTML カード（外部アセットなし）
ctxtax --badge docs/context-cost.svg   # 静的 SVG バッジ（または .json で shields.io エンドポイント）
```

あとは README に貼るだけ：`![context cost](docs/context-cost.svg)`。

## CI でコンテキスト予算を強制する

`ctxtax ci` は予算をチェックに変えます。MCP のコンテキスト税がしきい値を超えるとビルドを失敗させ、PR に**差分**をコメントします —— *「この PR はツールを 4 個追加 = メッセージごとに +3,200 トークン」*。（Claude Code の `/context` は対話では便利ですが CI では動きません。こちらは動きます。）

```bash
# ローカル: コミットする予算スナップショットを保存
ctxtax ci --save                       # .ctxtax.json を書き出す

# CI: 予算超過なら失敗、ベースブランチのスナップショットと差分、PR にコメント
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

そのまま使える GitHub Action：

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # 任意; 正確なカウント用
```

この Action はベースブランチの `.ctxtax.json` を取得し、ツール単位の差分をレンダリングし、単一の PR コメントを作成/更新し、ジョブサマリーを書き込み、予算超過時にチェックを失敗させます。

## ロードマップ

`scan`、`ci`、`lint`、`toolsearch`、`--html`/`--badge` はすべて出荷済みです。次のアイデア（PR 歓迎）：プロンプトキャッシュを考慮したコスト、エディタ拡張。アイデアがあれば [issue を開いてください](../../issues)。

## コントリビュート

Issue・PR を歓迎します。`npm install` の後、`npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp` でローカル実行できます。

## ライセンス

[MIT](LICENSE) © Harry Xin
