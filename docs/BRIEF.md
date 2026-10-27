# ProjectScenario — Brief

> 이 문서는 설계 논의의 기준 문서다. 결정이 바뀌면 이 파일을 먼저 고친다.
> 마지막 갱신: 2026-10-28

## 1. 한 줄 정의
프로젝트를 새로 시작할 때 **바이브코딩용 지시 md 파일과 디자인 결과물**을 만들어주는 Windows 데스크톱 앱.
기획 스케치, 개발 진행 추적, AI 에이전트 연동을 한 앱에서 다룬다.

## 2. 핵심 기능
| 영역 | 내용 |
|---|---|
| 기획 스케치 | 전체 틀, 방향성, 기능, 상호작용을 설계하고 스케치 |
| 가이드 질문 | 기획 단계별로 필요한 것을 세세하게 질문 (아래 5절) |
| 산출물 생성 | `AGENTS.md`/`CLAUDE.md`, `PRD.md`, `SCREENS.md`, `FLOWS.md`, `TASKS.md`, `design/` |
| 다이어그램형 GUI | 기능, 화면, 플로우, 데이터의 상관관계를 노드와 연결선으로 표시 |
| 진행 상황 | 기획뿐 아니라 개발 진행도까지 같은 다이어그램에 표시 |
| 기존 프로젝트 열기 | 진행 중인 프로젝트를 열면 현재 어디까지 됐는지 파악 |
| AI 에이전트 호환 | CLI와 MCP 서버로 에이전트가 읽고 쓰기 가능 |
| 외부 연동 | Figma(양방향), Mermaid, GitHub Issues, Notion, Linear 등에서 정보 가져오기/내보내기 |

## 3. 결정 사항
- **대상:** 개인용으로 시작, 결과가 좋으면 다듬어서 배포
- **언어:** TypeScript 모노레포 (`core` / `cli` / `mcp` / `app` / `adapters`)
- **플랫폼:** 우선 Windows
- **LLM API:** 앱에 넣지 않는다. 판단과 생성은 사용자가 쓰는 에이전트(Claude Code 등)가 MCP/CLI로 수행한다. 나중에 선택 기능으로 LLM 어댑터를 열어둘 수 있게만 설계한다.
- **구조 원칙:** GUI보다 먼저 `project.json` 스펙 모델을 만든다. GUI, CLI, MCP, 어댑터는 모두 같은 코어를 공유한다.
- **참고 도구:** Spec Kit, OpenSpec은 코드 의존 없이 **구조 참고 + 내보내기 형식 호환**으로만 활용한다.
- **GUI 개발 순서:** 코어/CLI가 돌아간 뒤에 얇게 올린다. 먼저 읽기 전용 뷰어, 이후 편집. 처음엔 Vite 웹앱, Windows 패키징(Electron/Tauri)은 마지막.

## 4. 데이터 모델 원칙
- 노드(기능, 화면, 플로우, 엔티티, 태스크 등)와 **연결(edge)** 을 모두 명시적으로 저장한다.
- 모든 노드는 `status`를 가진다.
- 부모 노드의 상태는 자식 상태를 집계해서 코어가 계산한다. 하나라도 `blocked`면 blocked, 전부 `done`이면 done. GUI는 표시만 한다.
- 외부 연동용 필드(`figmaNodeId` 등)를 처음부터 둔다.

### 상태 dot
| status | dot | 의미 |
|---|---|---|
| `planned` | 회색 | 미진행 |
| `in_progress` | 파랑 (임시, 미확정) | 진행 중 |
| `blocked` | 노랑 | 막힘 |
| `done` | 초록 | 완료 |

- 색은 디자인 토큰(`--status-done` 등)으로 분리한다.
- 색만으로 구분하지 않도록 hover 시 상태 이름을 보여준다.

### 진행 상황 파악
- 1차: 수동 갱신(사용자/에이전트) + `TASKS.md` 체크박스 동기화
- 이후: 프로젝트 폴더 스캔(git 커밋, 파일 존재 여부)으로 추정

## 5. 가이드 질문 시스템
기획 단계마다 필요한 것을 세세하게 묻는다.

### 질문
```
question: { id, 단계, 중요도, 질문 문구, 선택지/예시, 노출 조건, 연결된 노드 }
answer:   { 상태, 값, 값_en, 출처, 근거, 수정 이력 }
```

### 답변 상태
| 상태 | 의미 | 표시 |
|---|---|---|
| `answered` | 사용자가 직접 답함 | 기본 |
| `skipped` | 건너뜀. 에이전트가 알아서 판단하라는 뜻으로 해석 | 회색 점선 |
| `ai_decided` | 건너뛴 항목을 에이전트가 판단해 채움 | **AI 마크 + 근거** |
| `user_edited` | AI가 정한 값을 사용자가 수정 | 기본 (이력 보존) |

- AI가 채운 값은 `source: "ai"`, 판단 근거 한 줄, 판단 시점을 반드시 저장한다.
- GUI: 노드/필드에 AI 배지, "AI가 판단한 항목만 보기" 필터.
- 생성된 md에도 AI 판단 표식을 남긴다. 구현 에이전트가 확정과 추정을 구분할 수 있게 한다.
- 사용자가 수정하면 출처가 `user`로 바뀌고 AI 마크는 사라지되, 이전 값은 이력에 남는다.

### 중요도
- **필수(P0):** 문제 정의, 범위/Non-goals, 기술 스택, 핵심 플로우 등. 비어 있으면 내보내기 전 경고. 건너뛰면 "AI가 판단하게 둘까요?" 재확인.
- **권장(P1):** 페르소나, 상호작용 상태, 데이터 모델 등
- **선택(P2):** 경쟁 분석, 리스크 등
- 완성도 표시: "필수 8/10, 권장 5/12" 형태

### 에이전트용 MCP 도구 (초안)
`list_open_questions`, `answer_question`, `get_context`, `list_untranslated`, `submit_translation`

## 6. 기획 단계 (질문 은행의 뼈대)
| # | 단계 | 핵심 질문 | 산출물 |
|---|---|---|---|
| 1 | 문제 정의 | 누구의 어떤 문제를 풀까? | PRD |
| 2 | 사용자 정의 | 누가 쓰나? (Persona, JTBD) | PRD |
| 3 | 경쟁 조사 | 비슷한 게 있나? 차별점은? | PRD |
| 4 | 범위 설정 | MVP, Non-goals, MoSCoW | PRD, TASKS |
| 5 | 사용자 스토리 | 사용자가 무엇을 하고 싶은가? Acceptance Criteria | SCREENS |
| 6 | 정보 구조 | 화면들이 어떻게 조직되나? | SCREENS |
| 7 | 사용자 플로우 | 화면 사이를 어떻게 이동하나? | FLOWS (Mermaid) |
| 8 | 와이어프레임 | 각 화면은 어떻게 생겼나? | design/ |
| 9 | 상호작용 정의 | 클릭하면 무슨 일이? 로딩/에러/빈 상태 | SCREENS |
| 10 | 데이터/API | 어떤 데이터가 필요한가? | 스키마, OpenAPI |
| 11 | 기술 스택/아키텍처 | 무엇으로 만드나? (ADR) | AGENTS.md |
| 12 | 디자인 시스템 | 색, 타이포, 컴포넌트 | Figma, CSS |
| 13 | 로드맵/태스크 분해 | 어떤 순서로? | TASKS |
| 14 | 리스크/가정 | 무엇이 틀릴 수 있나? | PRD |

바이브코딩에서 특히 중요한 것: **Non-goals, 상태별 상호작용, Acceptance Criteria, 작은 단위 태스크 분해.**

## 7. 언어
- **질문 UI:** 한국어
- **산출물 언어:** `outputLanguage` 설정, 기본값 영어 (개인용으로 `ko` 전환 가능)
- 구조(제목, 섹션명, 고정 안내문)는 앱이 영어 템플릿으로 생성한다.
- 사용자 답변은 `value`(원문)와 `value_en`(선택)으로 저장한다. 내보낼 때 `value_en`이 있으면 쓰고, 없으면 원문을 쓴다.
- `value_en`은 에이전트가 MCP/CLI로 채운다. AI 번역도 `source: ai`로 표시한다.
- 산출물 언어가 영어인데 번역이 빈 항목이 있으면 내보내기 전에 개수를 경고한다.

## 8. 외부 연동
어댑터 인터페이스로 `import`/`export`를 분리한다. 코어는 `project.json`만 안다.

```ts
interface Adapter {
  id: string
  import?(source): Promise<Partial<ProjectSpec>>
  export?(spec: ProjectSpec): Promise<void>
}
```

| 우선순위 | 도구 | 방향 |
|---|---|---|
| 1 | Mermaid | 양방향 |
| 1 | Figma / FigJam (공식 MCP 우선 활용) | 양방향 |
| 1 | GitHub Issues | 내보내기 |
| 2 | Notion / Linear / Jira | 양방향 |
| 2 | Excalidraw / tldraw | 가져오기 |
| 3 | OpenAPI, ERD | 양방향 |
| 호환 | Spec Kit(`.specify/`), OpenSpec(`openspec/changes/`) 형식 | 내보내기 |

Figma: 앱의 Screen/Flow를 프레임으로 내보내기, Figma 프레임을 읽어 Screen 스펙으로 가져오기, 노드에 `figmaNodeId` 저장.

## 9. 참고 프로젝트
- [github/spec-kit](https://github.com/github/spec-kit) (MIT): constitution → specify → plan → tasks → implement 흐름, presets/extensions 구조
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) (MIT): `openspec/specs`(현재 상태)와 `openspec/changes/<이름>/`(proposal, specs, design, tasks) 분리
- BMAD-METHOD: 역할별 에이전트 방법론
- Figma MCP 계열: figmind, Talk To Figma MCP, Framelink Figma MCP, figma-designer-mcp
- 빈틈: 화면/상호작용/플로우를 시각적으로 스케치하고 md와 Figma로 동시에 내보내는 로컬 앱은 검색에서 찾지 못했다. (검색 한 번의 결과라 단정은 아님)

## 10. 미정 사항
- MVP에 넣을 기획 단계 범위
- 진행 상황 자동 감지 범위
- 데스크톱 래퍼 (Electron / Tauri)
- 와이어프레임 에디터를 직접 만들지, 기존 라이브러리(tldraw 등)를 쓸지
- `in_progress` dot 색 확정
- Spec Kit / OpenSpec 템플릿의 정확한 파일 구성 확인 (저장소의 `spec-driven.md`, 템플릿 폴더 열람 필요)

## 11. 다음 단계
1. 모노레포 세팅 (`core`, `cli`, `mcp`, `app`, `adapters`)
2. `project.json` 스키마(zod): 노드, 연결, status, 질문/답변, 출처 포함
3. 14단계 질문 은행 초안 (한국어, 중요도 포함)
4. CLI → 읽기 전용 GUI 뷰어 → GUI 편집 → MCP/Figma 어댑터
