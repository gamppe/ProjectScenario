# ProjectScenario

프로젝트를 시작할 때 **기획을 질문으로 채워 가고**, 그 결과를 **AI 에이전트용 md 파일**로 내보내고, **기획과 개발 진행 상황을 다이어그램으로** 보는 도구입니다. 설계 배경과 결정 사항은 [docs/BRIEF.md](docs/BRIEF.md)를 보세요.

현재 상태: 코어, CLI, MCP 서버, PPT식 리본 UI의 편집 가능한 GUI까지 동작합니다. 아직 없는 것: Windows 설치형 앱 패키징, Figma/Notion/GitHub 연동, 와이어프레임 에디터.

## 준비

Node 20 이상과 pnpm이 필요합니다.

```bash
pnpm install
pnpm build
```

## 사용 흐름

`scenario.cmd`는 CLI를 설치 없이 실행하는 래퍼입니다. (macOS/Linux에서는 `pnpm scenario <명령>`)

```bash
scenario.cmd init "내 프로젝트" --lang ko
scenario.cmd ask
scenario.cmd status
scenario.cmd export --out docs-out
```

1. **`init`**: `project.json`을 만듭니다. `--lang`은 생성되는 md의 언어입니다(기본 `en`).
2. **`ask`**: 14단계 기획 질문(47개)을 한국어로 차례대로 묻습니다.
   - 답을 입력하면 저장됩니다. 목록이나 복수 선택은 `;`로 구분합니다.
   - `/s`는 건너뛰기입니다. 에이전트가 알아서 판단하라는 뜻이며, 필수(P0) 질문은 한 번 더 확인합니다.
   - `/q`는 종료입니다. 다시 `ask`를 실행하면 이어서 묻습니다.
3. **`export`**: `AGENTS.md`, `PRD.md`, `SCREENS.md`, `FLOWS.md`, `TASKS.md`를 만듭니다. 필수 질문이 비어 있으면 경고합니다.

### 건너뛴 질문을 에이전트가 채우게 하기

```bash
scenario.cmd questions --state skipped --json
scenario.cmd decide scope-mvp "tasks;tags" --why "가장 작은 쓸모 있는 범위" --confidence 0.7
```

`decide`로 채운 값은 항상 **AI 판단**으로 표시됩니다(뷰어의 AI 배지, md 안의 `AI-decided` 문구). 사용자가 `answer`로 고치면 표시가 사라지고 이전 값은 이력에 남습니다. 그대로 받아들이려면 `scenario.cmd review <질문id>`를 씁니다.

### 노드와 진행 상황

```bash
scenario.cmd add feature feat-login "로그인" --parent vision --data "{\"priority\":\"must\",\"inMvp\":true}"
scenario.cmd add task task-login-ui "로그인 화면" --data "{\"order\":1}"
scenario.cmd link task-login-ui feat-login implements
scenario.cmd status task-login-ui in_progress
scenario.cmd list
```

노드 종류: `vision persona feature story screen interaction flow entity decision task risk`
연결 종류: `contains implements navigates depends_on uses_data blocks relates`
상태: `planned`(회색) `in_progress`(파랑) `blocked`(노랑) `done`(초록)

부모 노드의 색은 자식 상태를 집계해서 정해집니다. 하나라도 막혔으면 노랑, 전부 끝났으면 초록입니다.

## GUI

```bash
view.cmd path\to\project.json
```

브라우저가 열립니다(곧 설치형 앱으로 대체될 예정). 경로를 주지 않으면 시작 화면에서 새로 만들기, 열기, 예시 보기를 고를 수 있습니다.

**리본 (PowerPoint 방식)** — 기능을 아이콘 버튼으로 묶어 탭별로 보여줍니다. 탭을 더블클릭하면 접힙니다.

| 탭 | 내용 |
|---|---|
| 파일 | 새로 만들기, 열기, 저장, 다른 이름으로 저장, 예시, 이름/산출물 언어 |
| 홈 | 실행 취소/다시 실행, 선택한 노드의 상태 4종, 이름 바꾸기, 삭제, AI 항목 승인 |
| 삽입 | 노드 11종 추가(선택한 노드 아래에 생성), 연결 7종 만들기 |
| 기획 | 질문 답하기 / 건너뛴 질문 / AI 판단 검토 (배지에 남은 개수) |
| 디자인 | 테마(자동/밝게/어둡게), 자동 정렬, Figma 등 연동(준비 중) |
| 보기 | 확대/축소, 패널, 미니맵, AI 노드만 강조, 연결선 종류 표시 |
| 내보내기 | md 파일 내보내기, 미리보기, Mermaid/JSON 복사 |
| AI 에이전트 | MCP 연결 안내, 첫 지시문 복사, 검토 |

- 노드 색 dot은 진행 상태이고, 점선 테두리의 `AI` 배지는 에이전트가 정했지만 아직 검토하지 않은 항목입니다.
- 노드를 끌어 옮기면 위치가 저장되고, 디자인 탭의 "자동 정렬"로 되돌립니다.
- 노드를 누르면 오른쪽에서 이름, 설명, 유형별 필드를 직접 고칠 수 있습니다. AI가 만든 노드를 고치면 AI 표시가 사라집니다.
- 단축키: `Ctrl+S` 저장, `Ctrl+Z`/`Ctrl+Y` 실행 취소/다시 실행, `Delete` 삭제, `Esc` 연결 취소.
- `view.cmd`로 연 파일은 편집할 때마다 바로 저장되고, 에이전트나 CLI가 파일을 바꾸면 1.5초 안에 화면에 반영됩니다.

## AI 에이전트 연결 (MCP)

에이전트가 같은 `project.json`을 읽고 쓰면서 체계적으로 기획을 이끌 수 있습니다.

```bash
pnpm build
claude mcp add scenario -- node "C:\...\ProjectScenario\packages\mcp\dist\index.js" --file "C:\...\project.json"
```

GUI의 **AI 에이전트 → MCP 연결 안내**에서 실제 경로가 채워진 명령과 설정 JSON을 복사할 수 있습니다.

| 도구 | 용도 |
|---|---|
| `next_steps` | 가장 먼저 호출. 사용자에게 물어볼 필수 질문, 결정할 건너뛴 질문, 아직 노드로 만들지 않은 답변을 우선순위로 보여줌 |
| `list_questions`, `get_project`, `get_node` | 읽기 |
| `record_user_answer` | **사용자가 실제로 한 답**만 기록 |
| `skip_question` → `decide_question` | 사용자가 건너뛰라고 한 항목을 에이전트가 근거와 함께 채움 (AI 판단으로 표시, 사용자 답변은 덮어쓸 수 없음) |
| `add_node`, `link_nodes`, `update_status`, `remove_node` | 구조와 진행 상태 |
| `translate_answer` | 영어 번역 저장 |
| `export_markdown` | AGENTS/PRD/SCREENS/FLOWS/TASKS 생성 |

MCP 프롬프트 `plan_project`는 "필수 질문은 한국어로 사용자에게 직접 묻고, 답을 지어내지 말고, 건너뛴 것만 판단한다"는 진행 방식을 에이전트에게 알려줍니다.

## 구조

```
packages/core      스키마(zod), 질문 은행, 상태 집계, 변경 연산, md 내보내기
packages/cli       scenario 명령
packages/mcp       에이전트용 MCP 서버
packages/adapters  (예정) Figma, Mermaid, GitHub 등 연동
apps/viewer        GUI (Vite + React + React Flow, 리본 UI)
examples/todo-app  예시 project.json
```

## 개발

```bash
pnpm test        # core, cli, mcp 테스트
pnpm typecheck   # 전체 빌드 + 타입체크
```
