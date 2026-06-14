<div align="center">

# 🧮 ctxtax

### Veja exatamente quantos tokens de contexto cada servidor e ferramenta MCP custa nas suas requisições ao Claude —— *antes de dizer uma palavra.*

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contribuindo)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Português**</samp>

[Por quê](#por-que-a-contagem-precisa-importa) · [Como funciona](#como-funciona) · [Instalação](#instalação) · [Uso](#uso) · [Lint](#lint-para-autores-de-servidores-mcp) · [Tool Search](#modelagem-de-tool-search) · [Gate de CI](#orçamento-de-contexto-em-prs) · [Roteiro](#roteiro)

<img src="docs/hero.svg" alt="ctxtax — see your MCP context budget" width="760">

</div>

---

Cada ferramenta MCP que você conecta injeta silenciosamente seu schema JSON no contexto do modelo em **toda** requisição. Alguns servidores já bastam para queimar de 30 a 60k tokens de "imposto de contexto" antes do seu primeiro prompt —— você paga a cada turno, e isso espreme a janela que você realmente queria usar.

`ctxtax` se conecta aos seus servidores MCP, lê as definições reais das ferramentas e diz quanto elas custam —— por ferramenta, por servidor, em tokens e em dólares.

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

## Por que a contagem precisa importa

A maioria dos "contadores de tokens" recorre ao `tiktoken`. **Esse é o tokenizador da OpenAI: subestima o Claude em ~15–20% em texto normal, e pior em schemas JSON e texto não inglês.** Uma ferramenta de orçamento errada em 20% é pior do que nenhuma.

`ctxtax` conta como o Claude realmente conta: chama o endpoint oficial da Anthropic [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) (gratuito, por modelo). Com `ANTHROPIC_API_KEY` você obtém números exatos. Sem chave? Você ainda recebe uma estimativa **claramente rotulada** —— nunca um número fingindo ser exato.

## Como funciona

1. **Descobrir** —— lê seu `.mcp.json` (ou recebe um comando de servidor diretamente).
2. **Conectar** —— fala MCP via stdio ou Streamable HTTP e chama `tools/list` para obter os schemas *reais*, exatamente como seu cliente os envia.
3. **Contar** —— converte cada ferramenta para o formato de ferramenta da Anthropic e mede seu custo **marginal**: `count_tokens(com a ferramenta) − count_tokens(linha de base)`.
4. **Relatar** —— um gráfico de barras ordenado por servidor, totais e o $/mensagem ao preço de entrada do modelo escolhido.

## Instalação

```bash
npm install -g ctxtax          # ou: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # opcional, mas recomendado para números exatos
```

## Uso

```bash
ctxtax                       # escaneia ./.mcp.json
ctxtax -c path/to/.mcp.json  # um arquivo de configuração específico
ctxtax -s github             # apenas um servidor da configuração
ctxtax -m claude-sonnet-4-6  # contar/precificar com outro modelo
ctxtax --json                # saída legível por máquina
ctxtax lint                  # dicas de economia de tokens para autores de servidores MCP
ctxtax toolsearch            # modela o custo deferred (Tool Search) vs always-loaded
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # servidor avulso (depois de --)
```

`.mcp.json` é o formato padrão do Claude Code / Claude Desktop:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

### Lint (para autores de servidores MCP)

`ctxtax lint` aponta o que encarece suas ferramentas —— descrições longas demais (medidas com exatidão), schemas inchados, enums enormes, títulos redundantes —— com uma estimativa dos tokens que você economizaria:

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
```

### Modelagem de Tool Search

O [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) da Anthropic adia as definições de ferramentas —— elas carregam sob demanda em vez de tudo de uma vez. `ctxtax toolsearch` estima o que você pagaria **adiantado** com ele ligado, ante o custo always-loaded:

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

O que ele revela: **servidores stdio são adiáveis, mas servidores MCP HTTP/Streamable não são adiados hoje** ([claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)) —— eles pagam o preço cheio adiantado de qualquer forma. (Estimativa: servidores adiáveis são modelados como mantendo um stub de nome + 1 linha no índice de busca.)

## Orçamento de contexto em PRs

`ctxtax ci` transforma o orçamento em uma verificação. Faz o build falhar quando o imposto de contexto MCP cruza um limite e publica um **diff** no PR —— *"este PR adiciona 4 ferramentas = +3.200 tokens/msg"*. (O `/context` do Claude Code é ótimo de forma interativa, mas não roda em CI; este roda.)

```bash
# localmente: salve um snapshot de orçamento versionado
ctxtax ci --save                       # grava .ctxtax.json

# no CI: falha se exceder o orçamento, faz diff com o snapshot do branch base, comenta no PR
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

GitHub Action pronta para usar:

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # opcional; números exatos
```

A action busca o `.ctxtax.json` do branch base, renderiza o diff por ferramenta, cria/atualiza um único comentário no PR, escreve um resumo do job e falha a verificação se você estourar o orçamento.

## Roteiro

- **Relatório HTML** —— um cartão de orçamento autônomo e compartilhável + um selo de README (`context cost: 2.1K ✓`).

## Contribuindo

Issues e PRs são bem-vindos. `npm install`, depois `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp` para testar localmente.

## Licença

[MIT](LICENSE) © Harry Xin
