# ProjectScenario

프로젝트를 시작할 때 **기획을 질문으로 채워 가고**, 그 결과를 **AI 에이전트용 md 파일**로 내보내고, **기획과 개발 진행 상황을 다이어그램으로** 보는 도구입니다. 설계 배경과 결정 사항은 [docs/BRIEF.md](docs/BRIEF.md)를 보세요.

현재 상태: 코어, CLI, MCP 서버, PPT식 리본 UI의 편집 가능한 GUI까지 동작합니다. 아직 없는 것: Windows 설치형 앱 패키징, Figma/Notion/GitHub 연동, 화면 구성(와이어프레임) 에디터.

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
2. **`ask`**: 14단계 기획 질문(49개)을 한국어로 차례대로 묻습니다.
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

노드 종류: `vision persona feature story screen interaction flow entity decision task risk folder`

`folder`는 노드를 담아 두는 상자입니다. 담긴 노드는 `folderId`로 가리키며, 연결(`contains` 등)과는 별개입니다. 폴더의 상태는 담긴 노드들을 합쳐서 계산하고, md 파일에는 나오지 않습니다. 노드의 `position`은 그 노드가 보이는 다이어그램(폴더 안이면 그 폴더의 다이어그램) 기준 좌표입니다.
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
| 홈 | 선택한 노드의 상태 4종, AI 항목 승인 (실행 취소/다시 실행은 맨 위 빠른 실행 줄, 삭제는 `Delete` 키, 이름은 오른쪽 패널에서) |
| 삽입 | 노드 11종 추가(선택한 노드 아래에 생성), 연결 7종 만들기 |
| 기획 | 질문 답하기 / 건너뛴 질문 / AI 판단 검토 (배지에 남은 개수) |
| 디자인 | 테마(자동/라이트 테마/다크 테마), Figma 등 연동(준비 중) |
| 보기 | 확대/축소, 패널, 미니맵, AI 노드만 강조, 연결선 종류 표시 |
| 도구 | **정렬**(드롭다운), **자동 정렬**(종류별 열로 다시 배치), **종류별 폴더**(흩어진 노드를 폴더로 묶기), md 파일 내보내기, 미리보기, Mermaid/JSON 복사 |
| AI 에이전트 | MCP 연결 안내, 첫 지시문 복사, 검토 |

- 노드 색 dot은 진행 상태이고, 점선 테두리의 `AI` 배지는 에이전트가 정했지만 아직 검토하지 않은 항목입니다.
- 노드를 끌어 옮기면 위치가 저장되고, 도구 탭의 "자동 정렬"이나 캔버스 오른쪽 위 "자동 정렬" 버튼으로 다시 배치합니다. 기능, 화면, 데이터, 작업, 위험 같은 **종류별로 열**이 나뉘고, 한 열 안에서는 화면 이동·선행 필요 순서를 따릅니다. 노드가 많으면 도구 탭의 "종류별 폴더"로 종류마다(3개 이상) 폴더에 묶어 한눈에 보이게 할 수 있습니다.
- **폴더**: 삽입 탭의 폴더 버튼으로 만듭니다. 폴더에 담긴 노드는 카드가 아니라 폴더 상자 안에 한 줄짜리 알약(pill)으로 나열되고, 그 노드가 가진 관계선은 폴더가 대신 가집니다(폴더 안에서만 이어진 선은 폴더 밖에서는 안 보입니다).
  - 노드를 폴더 상자 위로 끌어다 놓으면 담기고, 알약의 × 로 빼면 한 단계 위로 나옵니다.
  - **폴더를 더블클릭하면** 그 폴더 안의 노드와 선만 보이는 다이어그램이 열립니다. 위쪽 경로(메인 › 폴더 › 하위 폴더)의 이름을 누르면 그 단계로, X 버튼은 메인으로 이동합니다.
- **관계선**: 직각선이고, 같은 노드에서 나가고 들어가는 선은 한 점에 몰리지 않고 종류(색)마다 다른 위치로 갈라집니다. 같은 색은 같은 위치를 써서 겹쳐도 되고, 다른 색은 겹치지 않게 서로 다른 줄로 달립니다.
- **일직선 스냅**: 노드를 끌다가 연결된 선이 거의 일직선이 되는 위치(두 끝의 높이 또는 좌우 위치가 화면 기준 10px 이내)에 오면 그 위치로 달라붙습니다. **Alt를 누른 채 끌면** 스냅이 꺼집니다.
- **선이 붙는 위치 옮기기**: 노드 가까이에서 선을 꾹(약 0.5초) 누른 채 끌면 그 선의 끝이 노드 가장자리를 따라 움직이고, 놓으면 저장됩니다. (폴더가 대신 가진 선은 폴더 안으로 들어가서 옮깁니다.)
- 노드를 누르면 오른쪽에서 이름, 설명, 유형별 필드를 직접 고칠 수 있습니다. AI가 만든 노드를 고치면 AI 표시가 사라집니다.
- **여러 노드 선택**: 캔버스에서 **오른쪽 마우스 버튼을 누른 채 끌면** 상자가 그려지고, 상자에 닿은 노드가 모두 선택됩니다. **Shift+클릭**으로 하나씩 더하거나 뺄 수도 있습니다. 선택한 노드들은 같이 움직이고, 상태 변경, 삭제, 복사, 정렬이 한꺼번에 적용됩니다. (이동 없는 오른쪽 클릭은 삽입 도구 취소)
- **복사/붙여넣기**: 노드를 선택하고 `Ctrl+C`, `Ctrl+V`. 복사본은 이름 뒤에 `(2)`가 붙고(다시 붙이면 `(3)`) **원본의 오른쪽**에 놓이며, 원본이 가진 연결도 같이 복사됩니다. 복사한 노드끼리 이어져 있었다면 복사본끼리 이어지고, 폴더를 복사하면 안의 노드도 함께 복사됩니다. 단, 복사본이 원본의 자식을 또 가져가지는 않습니다(부모는 하나뿐이므로).
- **정렬(도구 탭)**: 선택한 노드를 PowerPoint처럼 정렬합니다. 맞춤(왼쪽/가운데/오른쪽/위쪽/중간/아래쪽, 2개 이상)과 간격(가로/세로를 동일하게, 3개 이상).
- 왼쪽 패널의 **×** 로 패널을 닫을 수 있고, 보기 탭의 "왼쪽 패널"로 다시 엽니다.
- 단축키: `Ctrl+S` 저장, `Ctrl+Z`/`Ctrl+Y` 실행 취소/다시 실행, `Ctrl+C`/`Ctrl+V` 복사/붙여넣기, `Delete` 삭제, `Esc` 선택·연결·삽입 취소.
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
| `group_by_kind` | 흩어진 노드를 종류별 폴더로 묶어 다이어그램을 정리 (CLI: `scenario.cmd group`) |
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
