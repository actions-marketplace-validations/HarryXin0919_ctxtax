<div align="center">

# 🧮 ctxtax

### Sieh genau, wie viele Kontext-Tokens jeder MCP-Server und jedes Tool deine Claude-Anfragen kostet —— *bevor du ein Wort sagst.*

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#mitwirken)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português](README.pt-BR.md)</samp>

[Warum](#warum-genaue-zählung-zählt) · [Funktionsweise](#funktionsweise) · [Installation](#installation) · [Verwendung](#verwendung) · [Lint](#lint-für-mcp-server-autoren) · [Tool Search](#tool-search-modellierung) · [CI-Gate](#kontextbudget-in-ci) · [Roadmap](#roadmap)

<img src="docs/hero.svg" alt="ctxtax — see your MCP context budget" width="760">

</div>

---

Jedes MCP-Tool, das du verbindest, schleust sein JSON-Schema bei **jeder** Anfrage still in den Kontext des Modells ein. Schon ein paar Server können 30–60k Tokens „Kontextsteuer" verbrennen, bevor du deinen ersten Prompt schreibst —— du zahlst sie in jeder Runde, und sie verdrängt das Fenster, das du eigentlich nutzen wolltest.

`ctxtax` verbindet sich mit deinen MCP-Servern, liest ihre echten Tool-Definitionen und sagt dir, was sie kosten —— pro Tool, pro Server, in Tokens und in Dollar.

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

## Warum genaue Zählung zählt

Die meisten „Token-Zähler" greifen zu `tiktoken`. **Das ist OpenAIs Tokenizer – er unterschätzt Claude bei normalem Text um ~15–20 %, bei JSON-Schemata und nicht-englischem Text noch mehr.** Ein Budget-Tool, das 20 % danebenliegt, ist schlimmer als gar keins.

`ctxtax` zählt so, wie Claude tatsächlich zählt: Es ruft Anthropics offiziellen Endpoint [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) auf (kostenlos, modellspezifisch). Mit `ANTHROPIC_API_KEY` bekommst du exakte Zahlen. Kein Key? Du bekommst trotzdem eine **klar gekennzeichnete** Schätzung —— nie eine Zahl, die vorgibt, exakt zu sein.

## Funktionsweise

1. **Entdecken** —— liest deine `.mcp.json` (oder nimmt direkt einen Server-Befehl).
2. **Verbinden** —— spricht MCP über stdio oder Streamable HTTP und ruft `tools/list` auf, um die *echten* Schemata zu erhalten, genau so, wie dein Client sie sendet.
3. **Zählen** —— konvertiert jedes Tool ins Anthropic-Tool-Format und misst seine **marginalen** Kosten: `count_tokens(mit dem Tool) − count_tokens(Baseline)`.
4. **Berichten** —— ein sortiertes Balkendiagramm pro Server, Summen und die $/Nachricht zum Eingabepreis des gewählten Modells.

## Installation

```bash
npm install -g ctxtax          # oder: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # optional, aber für exakte Zahlen empfohlen
```

## Verwendung

```bash
ctxtax                       # scannt ./.mcp.json
ctxtax -c path/to/.mcp.json  # eine bestimmte Konfigurationsdatei
ctxtax -s github             # nur ein Server aus der Konfiguration
ctxtax -m claude-sonnet-4-6  # gegen ein anderes Modell zählen/bepreisen
ctxtax --json                # maschinenlesbare Ausgabe
ctxtax lint                  # Token-Spartipps für MCP-Server-Autoren
ctxtax toolsearch            # modelliert deferred (Tool Search) vs always-loaded Kosten
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # einmaliger Server (nach --)
```

`.mcp.json` ist das Standardformat von Claude Code / Claude Desktop:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

### Lint (für MCP-Server-Autoren)

`ctxtax lint` zeigt, was deine Tools teuer macht —— zu lange Descriptions (exakt gemessen), aufgeblähte Schemata, riesige Enums, redundante Titel —— mitsamt einer Schätzung der einsparbaren Tokens:

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
```

### Tool-Search-Modellierung

Anthropics [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) lädt Tool-Definitionen verzögert —— bei Bedarf statt alles vorab. `ctxtax toolsearch` schätzt, was du mit aktiviertem Tool Search **vorab** zahlst, im Vergleich zu den always-loaded Kosten:

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

Was es aufdeckt: **stdio-Server sind aufschiebbar, aber HTTP/Streamable-MCP-Server werden heute nicht aufgeschoben** ([claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)) —— sie zahlen trotzdem den vollen Preis vorab. (Schätzung: aufschiebbare Server werden so modelliert, als behielten sie nur einen Name-+-1-Zeilen-Stub im Suchindex.)

## Kontextbudget in CI

`ctxtax ci` macht aus dem Budget eine Prüfung. Es lässt den Build fehlschlagen, wenn die MCP-Kontextsteuer einen Schwellenwert überschreitet, und postet einen **Diff** auf dem PR —— *„dieser PR fügt 4 Tools hinzu = +3.200 Tokens/Nachricht"*. (Das `/context` von Claude Code ist interaktiv großartig, läuft aber nicht in CI; dieses schon.)

```bash
# lokal: einen versionierten Budget-Snapshot speichern
ctxtax ci --save                       # schreibt .ctxtax.json

# in CI: bei Überschreitung fehlschlagen, gegen den Snapshot des Base-Branch diffen, am PR kommentieren
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

Sofort einsatzbereite GitHub Action:

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # optional; exakte Zahlen
```

Die Action holt die `.ctxtax.json` des Base-Branch, rendert den Diff pro Tool, erstellt/aktualisiert einen einzigen PR-Kommentar, schreibt eine Job-Zusammenfassung und lässt die Prüfung fehlschlagen, wenn du das Budget sprengst.

## Roadmap

- **HTML-Bericht** —— eine teilbare, eigenständige Budget-Karte + ein README-Badge (`context cost: 2.1K ✓`).

## Mitwirken

Issues und PRs willkommen. `npm install`, dann `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp`, um es lokal auszuprobieren.

## Lizenz

[MIT](LICENSE) © Harry Xin
