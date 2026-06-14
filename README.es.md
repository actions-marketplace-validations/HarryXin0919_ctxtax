<div align="center">

# 🧮 ctxtax

### Mira exactamente cuántos tokens de contexto cuesta cada servidor y herramienta MCP en tus solicitudes a Claude —— *antes de decir una sola palabra.*

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contribuir)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)</samp>

[Por qué](#por-qué-importa-la-precisión) · [Cómo funciona](#cómo-funciona) · [Instalación](#instalación) · [Uso](#uso) · [Lint](#lint-para-autores-de-servidores-mcp) · [Tool Search](#modelado-de-tool-search) · [Puerta de CI](#ci-presupuesto-de-contexto-en-los-pr) · [Hoja de ruta](#hoja-de-ruta)

<img src="docs/hero.svg" alt="ctxtax — see your MCP context budget" width="760">

</div>

---

Cada herramienta MCP que conectas inyecta silenciosamente su esquema JSON en el contexto del modelo en **cada** solicitud. Unos pocos servidores pueden quemar de 30 a 60k tokens de "impuesto de contexto" antes de tu primer prompt —— lo pagas en cada turno y le quita espacio a la ventana que querías usar.

`ctxtax` se conecta a tus servidores MCP, lee sus definiciones de herramientas reales y te dice cuánto cuestan —— por herramienta, por servidor, en tokens y en dólares.

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

## Por qué importa la precisión

La mayoría de los "contadores de tokens" recurren a `tiktoken`. **Ese es el tokenizador de OpenAI: subestima a Claude en ~15–20% en texto normal, y peor en esquemas JSON y texto no inglés.** Una herramienta de presupuesto que se equivoca un 20% es peor que ninguna.

`ctxtax` cuenta como Claude cuenta de verdad: llama al endpoint oficial de Anthropic [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) (gratis, por modelo). Con `ANTHROPIC_API_KEY` obtienes cifras exactas. ¿Sin clave? Igual obtienes una estimación **claramente etiquetada** —— nunca un número que finge ser exacto.

## Cómo funciona

1. **Descubrir** —— lee tu `.mcp.json` (o toma un comando de servidor directamente).
2. **Conectar** —— habla MCP por stdio o Streamable HTTP y llama a `tools/list` para obtener los esquemas *reales*, exactamente como los envía tu cliente.
3. **Contar** —— convierte cada herramienta al formato de herramienta de Anthropic y mide su coste **marginal**: `count_tokens(con la herramienta) − count_tokens(línea base)`.
4. **Reportar** —— un gráfico de barras ordenado por servidor, totales y el $/mensaje al precio de entrada del modelo elegido.

## Instalación

```bash
npm install -g ctxtax          # o: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # opcional pero recomendado para cifras exactas
```

## Uso

```bash
ctxtax                       # escanea ./.mcp.json
ctxtax -c path/to/.mcp.json  # un archivo de configuración específico
ctxtax -s github             # solo un servidor de la configuración
ctxtax -m claude-sonnet-4-6  # contar/tasar contra otro modelo
ctxtax --json                # salida legible por máquina
ctxtax lint                  # consejos de ahorro de tokens para autores de servidores MCP
ctxtax toolsearch            # modela el coste deferred (Tool Search) vs always-loaded
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # servidor puntual (después de --)
```

`.mcp.json` es el formato estándar de Claude Code / Claude Desktop:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

### Lint (para autores de servidores MCP)

`ctxtax lint` señala qué encarece tus herramientas —— descripciones demasiado largas (medidas con exactitud), esquemas inflados, enums enormes, títulos redundantes —— con una estimación de los tokens que ahorrarías:

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
```

### Modelado de Tool Search

El [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) de Anthropic difiere las definiciones de herramientas —— se cargan bajo demanda en vez de todas por adelantado. `ctxtax toolsearch` estima lo que pagarías **por adelantado** con él activado frente al coste always-loaded:

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

Lo que revela: **los servidores stdio son diferibles, pero los servidores MCP HTTP/Streamable no se difieren hoy** ([claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)) —— pagan el precio completo por adelantado de todos modos. (Estimación: los servidores diferibles se modelan como si mantuvieran un stub de nombre + 1 línea en el índice de búsqueda.)

## CI: presupuesto de contexto en los PR

`ctxtax ci` convierte el presupuesto en una verificación. Falla la build cuando el impuesto de contexto MCP cruza un umbral y publica un **diff** en el PR —— *"este PR añade 4 herramientas = +3.200 tokens/msg"*. (El `/context` de Claude Code es genial de forma interactiva, pero no corre en CI; esto sí.)

```bash
# local: guarda una instantánea de presupuesto versionada
ctxtax ci --save                       # escribe .ctxtax.json

# en CI: falla si excede el presupuesto, compara con la instantánea de la rama base, comenta en el PR
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

GitHub Action lista para usar:

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # opcional; cifras exactas
```

La acción obtiene el `.ctxtax.json` de la rama base, renderiza el diff por herramienta, crea/actualiza un único comentario en el PR, escribe un resumen del job y falla la verificación si superas el presupuesto.

## Hoja de ruta

- **Informe HTML** —— una tarjeta de presupuesto autónoma y compartible + una insignia de README (`context cost: 2.1K ✓`).

## Contribuir

Issues y PRs bienvenidos. `npm install`, luego `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp` para probarlo en local.

## Licencia

[MIT](LICENSE) © Harry Xin
