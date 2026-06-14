<div align="center">

# 🧮 ctxtax

### 연결한 각 MCP 서버 / 각 도구가 Claude 요청마다 컨텍스트 토큰을 얼마나 먹는지 —— *한 마디 하기도 전에* 명령 한 번으로 확인하세요.

[![npm version](https://img.shields.io/npm/v/ctxtax?color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/ctxtax)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7C3AED)](https://modelcontextprotocol.io)
[![built for Claude](https://img.shields.io/badge/built%20for-Claude-D97757)](https://claude.com)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#기여하기)

`#mcp` · `#claude` · `#anthropic` · `#tokens` · `#context-window` · `#cli` · `#linter`

<samp>[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)</samp>

[정확성이 중요한 이유](#정확한-카운트가-중요한-이유) · [작동 방식](#작동-방식) · [설치](#설치) · [사용법](#사용법) · [CI 게이트](#ci에서-컨텍스트-예산-강제하기) · [로드맵](#로드맵)

</div>

---

MCP 도구를 연결할 때마다 그 JSON 스키마가 **매** 요청마다 모델 컨텍스트에 조용히 주입됩니다. 서버 몇 개만 있어도 첫 프롬프트를 보내기 전에 3~6만 토큰의 "컨텍스트 세금"을 태울 수 있습니다 —— 매 턴 비용을 내고, 정작 쓰려던 윈도를 잠식합니다.

`ctxtax`는 MCP 서버에 연결해 실제 도구 정의를 읽고, 도구별·서버별 비용을 —— 토큰과 달러로 —— 알려줍니다.

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

## 정확한 카운트가 중요한 이유

대부분의 "토큰 카운터"는 `tiktoken`을 씁니다. **하지만 그건 OpenAI의 토크나이저로, 일반 텍스트에서 Claude를 약 15~20% 과소 계산하며 JSON 스키마와 비영어에서는 더 심합니다.** 20% 틀리는 예산 도구는 없느니만 못합니다.

`ctxtax`는 Claude가 실제로 세는 방식 그대로 셉니다. Anthropic 공식 [`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting) 엔드포인트(무료, 모델별)를 호출합니다. `ANTHROPIC_API_KEY`를 설정하면 정확한 값을, 키가 없으면 **명확히 표시된** 추정값을 제공합니다 —— 정확한 척하는 숫자는 절대 내놓지 않습니다.

## 작동 방식

1. **탐색** —— `.mcp.json`을 읽습니다(또는 서버 명령을 직접 지정).
2. **연결** —— stdio 또는 Streamable HTTP로 MCP를 말하고 `tools/list`를 호출해, 클라이언트가 모델에 보내는 것과 **완전히 동일한** 실제 스키마를 가져옵니다.
3. **카운트** —— 각 도구를 Anthropic 도구 형식으로 변환해 **한계** 비용을 측정합니다: `count_tokens(해당 도구 포함) − count_tokens(기준선)`.
4. **리포트** —— 서버별 정렬 막대 차트, 합계, 선택한 모델 입력 단가 기준의 $/메시지를 출력합니다.

## 설치

```bash
npm install -g ctxtax          # 또는: npx ctxtax
export ANTHROPIC_API_KEY=sk-ant-...   # 선택 사항이나 정확한 카운트를 위해 권장
```

## 사용법

```bash
ctxtax                       # ./.mcp.json 스캔
ctxtax -c path/to/.mcp.json  # 특정 설정 파일
ctxtax -s github             # 설정의 특정 서버만
ctxtax -m claude-sonnet-4-6  # 다른 모델로 카운트/가격 계산
ctxtax --json                # 기계가 읽을 수 있는 출력
ctxtax -- npx -y @modelcontextprotocol/server-filesystem /tmp   # 일회성 서버(-- 뒤에)
```

`.mcp.json`은 Claude Code / Claude Desktop 표준 형식입니다:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "github": { "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

## CI에서 컨텍스트 예산 강제하기

`ctxtax ci`는 예산을 체크로 바꿉니다. MCP 컨텍스트 세금이 임계값을 넘으면 빌드를 실패시키고, PR에 **차이**를 코멘트합니다 —— *"이 PR은 도구 4개 추가 = 메시지당 +3,200 토큰"*. (Claude Code의 `/context`는 대화형으로는 훌륭하지만 CI에서는 실행되지 않습니다. 이건 됩니다.)

```bash
# 로컬: 커밋할 예산 스냅샷 저장
ctxtax ci --save                       # .ctxtax.json 작성

# CI: 예산 초과 시 실패, 베이스 브랜치 스냅샷과 비교, PR에 코멘트
ctxtax ci --max-tokens 30000 --baseline .ctxtax.base.json --comment out.md --summary
```

바로 쓰는 GitHub Action:

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # 선택; 정확한 카운트용
```

이 Action은 베이스 브랜치의 `.ctxtax.json`을 가져와 도구별 차이를 렌더링하고, 하나의 PR 코멘트를 생성/갱신하며, 잡 요약을 작성하고, 예산을 초과하면 체크를 실패시킵니다.

## 로드맵

- **Lint** —— MCP **서버 작성자**를 위한 실행 가능한 제안: 너무 긴 description, 중복 스키마, "여기서 약 400 토큰 절약 가능".
- **Tool Search 모델링** —— `deferred` vs `alwaysLoad` 비교로 선불 비용과 온디맨드 비용을 가시화.
- **HTML 리포트** —— 공유 가능한 자체 완결형 예산 카드 + README 배지(`context cost: 2.1K ✓`).

## 기여하기

Issue와 PR을 환영합니다. `npm install` 후 `npm run dev -- -- npx -y @modelcontextprotocol/server-filesystem /tmp`로 로컬에서 실행해 보세요.

## 라이선스

[MIT](LICENSE) © Harry Xin
