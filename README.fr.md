<div align="center">

# 🧮 ctxtax

### Voyez exactement combien de tokens de contexte chaque serveur et outil MCP coûte à vos requêtes Claude —— *avant même de dire un mot.*

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contribuer)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Português](README.pt-BR.md)</samp>

[Pourquoi](#pourquoi-la-précision-compte) · [Fonctionnement](#comment-ça-marche) · [Installation](#installation) · [Utilisation](#utilisation) · [Lint](#lint-pour-les-auteurs-de-serveurs-mcp) · [Tool Search](#modélisation-de-tool-search) · [Garde-fou CI](#budget-de-contexte-en-ci) · [Feuille de route](#feuille-de-route)

<img src="docs/hero.svg" alt="ctxtax — see your MCP context budget" width="760">

</div>

---

Chaque outil MCP que vous connectez injecte discrètement son schéma JSON dans le contexte du modèle à **chaque** requête. Quelques serveurs suffisent à brûler 30 à 60k tokens de « taxe de contexte » avant même votre premier prompt —— vous la payez à chaque tour, et elle grignote la fenêtre que vous vouliez utiliser.

`ctxtax` se connecte à vos serveurs MCP, lit leurs définitions d'outils réelles et vous indique leur coût —— par outil, par serveur, en tokens et en dollars.

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

## Pourquoi la précision compte

La plupart des « compteurs de tokens » s'appuient sur `tiktoken`. **C'est le tokeniseur d'OpenAI : il sous-estime Claude d'environ 15 à 20 % sur du texte normal, et davantage sur les schémas JSON et le texte non anglais.** Un outil de budget faux de 20 % est pire que pas d'outil du tout.

`ctxtax` compte comme Claude compte réellement : il appelle l'endpoint officiel d'Anthropic [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) (gratuit, par modèle). Avec `ANTHROPIC_API_KEY`, vous obtenez des chiffres exacts. Sans clé ? Vous obtenez quand même une estimation **clairement étiquetée** —— jamais un nombre qui se fait passer pour exact.

## Comment ça marche

1. **Découvrir** —— lit votre `.mcp.json` (ou prend directement une commande de serveur).
2. **Connecter** —— parle MCP via stdio ou Streamable HTTP et appelle `tools/list` pour récupérer les schémas *réels*, exactement tels que votre client les envoie.
3. **Compter** —— convertit chaque outil au format d'outil Anthropic et mesure son coût **marginal** : `count_tokens(avec l'outil) − count_tokens(référence)`.
4. **Rapporter** —— un graphique en barres trié par serveur, des totaux et le $/message au prix d'entrée du modèle choisi.

## Installation

```bash
npm install -g ctxtax          # ou : npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # facultatif mais recommandé pour des chiffres exacts
```

## Utilisation

```bash
ctxtax                       # analyse ./.mcp.json
ctxtax -c path/to/.mcp.json  # un fichier de configuration précis
ctxtax -s github             # un seul serveur de la configuration
ctxtax -m claude-sonnet-4-6  # compter/tarifer avec un autre modèle
ctxtax --json                # sortie lisible par machine
ctxtax lint                  # astuces d'économie de tokens pour les auteurs de serveurs MCP
ctxtax toolsearch            # modélise le coût deferred (Tool Search) vs always-loaded
ctxtax --html report.html --badge docs/context-cost.svg   # carte partageable + badge README
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # serveur ponctuel (après --)
```

`.mcp.json` est le format standard de Claude Code / Claude Desktop :

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

### Lint (pour les auteurs de serveurs MCP)

`ctxtax lint` repère ce qui rend vos outils coûteux —— descriptions trop longues (mesurées exactement), schémas gonflés, enums énormes, titres redondants —— avec une estimation des tokens économisables :

```text
filesystem / search_files
  ✖ [long-description] description is ~121 tokens (target ≤ 120). Keep only what Claude needs… (~1 token saveable)
  • [verbose-tool] the whole tool is ~206 tokens — among the most expensive; trim the schema or split it.
────────────────────────────────────────────────
27 findings  ~859 tokens/msg recoverable
```

### Modélisation de Tool Search

Le [Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) d'Anthropic diffère les définitions d'outils —— elles se chargent à la demande au lieu de tout en amont. `ctxtax toolsearch` estime ce que vous paieriez **en amont** une fois activé, face au coût always-loaded :

```text
  server                 always  deferred↑   note
  filesystem               4.1k        0.6k   stdio — deferrable
  github                  17.6k       17.6k   HTTP/Streamable — not deferred today (#40314)
always-loaded total: 21.7k tokens
deferred upfront:     18.2k tokens (−3.5k upfront; the rest loads on demand)
```

Ce qu'il révèle : **les serveurs stdio sont différables, mais les serveurs MCP HTTP/Streamable ne le sont pas aujourd'hui** ([claude-code#40314](https://github.com/anthropics/claude-code/issues/40314)) —— ils paient le plein tarif en amont quand même. (Estimation : les serveurs différables sont modélisés comme gardant un stub nom + 1 ligne dans l'index de recherche.)

### Rapport et badge partageables

`--html` écrit une carte de budget HTML autonome (ouvrez-la, partagez-la) ; `--badge` écrit un badge README.

```bash
ctxtax --html report.html              # une carte HTML partageable (sans ressources externes)
ctxtax --badge docs/context-cost.svg   # un badge SVG statique (ou .json pour un endpoint shields.io)
```

Ensuite, mettez-le dans votre README : `![context cost](docs/context-cost.svg)`.

## Budget de contexte en CI

`ctxtax ci` transforme le budget en vérification. Il fait échouer la build quand la taxe de contexte MCP dépasse un seuil et publie un **diff** sur la PR —— *« cette PR ajoute 4 outils = +3 200 tokens/msg »*. (Le `/context` de Claude Code est parfait en interactif, mais il ne tourne pas en CI ; celui-ci, si.)

```bash
# en local : sauvegarder un instantané de budget versionné
ctxtax ci --save                       # écrit .ctxtax.json

# en CI : échouer si dépassement, comparer à l'instantané de la branche de base, commenter la PR
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

GitHub Action prête à l'emploi :

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # facultatif ; chiffres exacts
```

L'action récupère le `.ctxtax.json` de la branche de base, rend le diff par outil, crée/met à jour un unique commentaire de PR, écrit un résumé de job et fait échouer la vérification si vous dépassez le budget.

## Feuille de route

`scan`, `ci`, `lint`, `toolsearch`, `--html`/`--badge` sont tous livrés. Prochaines idées (PR bienvenues) : des coûts tenant compte du prompt caching, une extension d'éditeur. Vous en avez une ? [Ouvrez une issue](../../issues).

## Contribuer

Issues et PR bienvenues. `npm install`, puis `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp` pour l'essayer en local.

## Licence

[MIT](LICENSE) © Harry Xin
