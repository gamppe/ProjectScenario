// Writes docs/question-rewrite-request.md: the whole question bank plus a request
// that can be pasted into another LLM to rewrite the questions in plainer language.
// Run `pnpm build` first (this reads packages/core/dist), then `pnpm export:questions`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDGE_HINTS,
  EDGE_LABELS,
  NODE_HINTS,
  NODE_LABELS,
  QUESTION_BANK,
  STAGES,
} from "../packages/core/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "docs", "question-rewrite-request.md");

const KIND = {
  text: "서술형 (자유롭게 글로 입력)",
  list: "목록형 (한 줄에 하나씩 입력)",
  choice: "단일 선택",
  multi: "복수 선택",
  boolean: "예/아니오",
};
const IMPORTANCE = {
  P0: "필수 (비어 있으면 내보내기 전에 경고)",
  P1: "권장",
  P2: "선택",
};

// Where an answer ends up in the generated md files. Only ids the exporter reads directly are listed.
const USED_IN = {
  "problem-statement": "PRD.md의 '문제' 항목",
  "problem-goals": "PRD.md의 '목표' 항목",
  "scope-nongoals": "PRD.md의 '하지 않을 것'과 AGENTS.md의 '만들지 말 것' (AI 에이전트가 범위를 넘지 않게 하는 핵심 지시)",
  "users-who": "PRD.md의 '사용자' 항목",
  "scope-mvp": "PRD.md의 '기능' 항목",
  "risks-assumptions": "PRD.md의 '위험과 가정' 항목",
  "ia-screens": "SCREENS.md의 화면 목록",
  "interactions-states": "SCREENS.md의 화면 상태 목록 (로딩, 빈 화면, 오류 등)",
  "flows-main": "FLOWS.md의 '주요 사용 흐름'",
  "tasks-order": "TASKS.md의 작업 순서",
  "stack-platform": "AGENTS.md의 '기술 스택'",
  "stack-language": "AGENTS.md의 '기술 스택'",
  "data-storage": "AGENTS.md의 '기술 스택'",
  "stack-conventions": "AGENTS.md의 '규칙과 제약' (AI 에이전트가 지킬 코딩 규칙)",
  "stack-constraints": "AGENTS.md의 '규칙과 제약'",
  "security-personal-data": "AGENTS.md의 '규칙과 제약' (개인정보를 다루는 앱에서 AI가 지킬 보호 규칙)",
  "stack-testing": "AGENTS.md의 '규칙과 제약'",
};
const USED_DEFAULT = "AI 에이전트가 화면, 기능, 작업 같은 항목을 만들 때 참고하는 정보 (md 파일에 문장 그대로 들어가지는 않음)";

const byId = new Map(QUESTION_BANK.map((q) => [q.id, q]));

const request = `# 질문 문구 다듬기 요청

이 파일은 두 부분입니다. 아래 **「부탁하는 글」** 을 다른 LLM에게 붙여넣고, 그 뒤에 이어지는 **「질문 목록」** 과 **「노드와 연결 종류」** 를 모두 이어서 붙여주세요.

---

## 부탁하는 글 (여기부터 LLM에게 붙여넣기)

당신은 한국어 UX 라이터입니다. 아래 「질문 목록」과 「노드와 연결 종류」의 글을 **사용자 입장에서 이해하기 쉽게** 고쳐 써주세요.

### 이 질문들은 무엇인가요
- "ProjectScenario"라는 프로젝트 기획 앱이 사용자에게 던지는 질문 ${QUESTION_BANK.length}개입니다. 질문은 ${STAGES.length}개 단계(문제 정의 → 사용자 → 범위 → 화면 → 데이터 → 기술 스택 → 작업 순서 등)로 나뉘어 있습니다.
- 사용자는 AI 코딩 에이전트(Claude Code 등)와 함께 새 소프트웨어 프로젝트를 시작하려는 사람입니다. **개발 전문가가 아닐 수도 있습니다.**
- 사용자의 답변은 AI 에이전트에게 주는 지시 문서(AGENTS.md, PRD.md 등)가 됩니다. 그래서 답변이 모호하면 에이전트가 엉뚱한 것을 만들게 됩니다. 질문은 **구체적인 답을 끌어내야** 합니다.
- 사용자는 질문을 건너뛸 수 있습니다. 건너뛰면 AI가 알아서 정합니다.

### 화면에서 질문이 보이는 방식
- **짧은 이름**: 왼쪽 목록(폭이 좁음)에 한 줄로 표시됩니다. 이것만 봐도 무슨 질문인지 알아야 합니다.
- **질문**: 짧은 이름을 누르면 오른쪽에 전체 질문으로 표시됩니다.
- **힌트**: 질문 아래에 작은 글씨로 보입니다.
- **예시**: 질문 아래에 "예: …"로 보입니다.
- **선택지 라벨**: 선택형 질문의 보기 이름입니다.

### 고칠 것과 고치지 말 것
**고칠 것** (각 질문당 이 다섯 가지만)
1. 질문 — 사용자에게 보이는 전체 문장
2. 짧은 이름
3. 힌트
4. 예시
5. 선택지 라벨 (선택지가 있는 질문만)

**고치지 말 것**: id, 단계, 중요도, 입력 방식, 조건, 선택지의 \`value\` 값. 그대로 두세요.

### 글쓰기 규칙
1. 한 질문에는 **하나만** 묻습니다. 한두 문장으로 씁니다.
2. 전문용어(MVP, Non-goals, 엔티티, 스택, 컨벤션 등)는 쉬운 말로 풀어 씁니다. 꼭 필요하면 괄호로 짧게 설명합니다.
3. 존댓말(~요?)로 통일하고, 친절하되 가볍지 않게 씁니다.
4. **짧은 이름**은 한국어 12자 이내의 명사 위주로 씁니다. 예: "해결할 문제", "주요 사용자". 서로 다른 질문의 짧은 이름이 겹치지 않게 합니다.
5. 예시는 일상적이고 구체적으로, 1~3개만 씁니다. 모든 예시를 "할 일 앱" 같은 한 종류의 앱에 치우치지 않게 합니다.
6. 질문의 **의미와 범위를 바꾸지 않습니다.** 각 질문의 「쓰임」을 보고, 답변이 문서에서 어떻게 쓰이는지에 어긋나지 않게 합니다. (예: "하지 않을 것"은 "이번에 만들지 않을 것"을 묻는 질문입니다.)
7. 답이 "예/아니오"인 질문은 문장도 예/아니오로 답할 수 있게 씁니다.
8. 바꿀 필요가 없다고 판단한 항목도 **그대로 다시 적어서** 모든 질문을 빠짐없이 출력합니다.

### 출력 형식 (꼭 지켜주세요)
각 질문을 아래 형식의 마크다운으로 출력합니다. 입력과 같은 **id 순서**를 유지하고, 줄 이름(\`질문\`, \`짧은 이름\`, \`힌트\`, \`예시\`, \`선택지\`)은 바꾸지 마세요. 힌트나 예시가 없던 질문은 해당 줄을 \`(없음)\`으로 적습니다. 선택지는 \`value=라벨\`을 쉼표로 이어 쓰며, 선택지가 없는 질문에는 \`선택지\` 줄을 쓰지 않습니다.

\`\`\`
### problem-statement
- 질문: …
- 짧은 이름: …
- 힌트: …
- 예시: 예시1 / 예시2
\`\`\`

### 노드와 연결 종류 (이름과 설명)
앱 화면 위쪽 「삽입」 탭에는 사용자가 캔버스에 놓는 **노드 ${Object.keys(NODE_LABELS).length}종**(기획 요소)과, 노드끼리 잇는 **연결 ${Object.keys(EDGE_LABELS).length}종**(관계)이 아이콘 버튼으로 있습니다. 이 버튼의 **이름**과, 마우스를 올렸을 때 말풍선으로 뜨는 **한 줄 설명**을 고쳐 주세요. 사용자는 이 설명을 읽고 어떤 버튼을 누를지 고르므로, 서로 **헷갈리지 않게 구분**되어야 합니다. (특히 기능 / 요구사항 / 화면 동작, 포함 / 구현 / 관련)

- **이름**: 6자 이내. 버튼 아이콘 아래에 보입니다. 위쪽 「질문 목록」에서 같은 대상을 부르는 말과 **용어를 맞춰** 주세요.
- **설명**: 25자 이내의 한 줄. 개발 지식이 없어도 이해되게 쓰고, 무엇인지(또는 언제 쓰는지)가 드러나게 합니다.
- 각 항목의 「입력하는 내용」과 「쓰임」은 참고용입니다. 의미를 바꾸지 마세요.
- id(\`node:…\`, \`edge:…\`)는 그대로 둡니다. 출력 형식:

\`\`\`
### node:screen
- 이름: …
- 설명: …

### edge:navigates
- 이름: …
- 설명: …
\`\`\`

### 마지막에 덧붙일 것
모든 질문과 노드·연결 종류를 출력한 뒤, 맨 끝에 \`## 제안\` 제목으로 다음을 짧게 적어주세요. (없으면 "없음")
- 서로 겹치거나 합치는 게 좋은 질문
- 너무 어려워서 나누는 게 좋은 질문
- 빠져 있다고 느끼는 질문 (id 후보와 질문 문장)
- 질문 화면과 노드·연결 이름 사이에 용어가 어긋나는 곳

### 여기부터 아래를 이어서 붙여넣기 (질문 목록 + 노드와 연결 종류)
`;

function describe(q) {
  const lines = [`### ${q.id}`];
  lines.push(`- 단계: ${STAGES.find((s) => s.id === q.stage).label}`);
  lines.push(`- 중요도: ${IMPORTANCE[q.importance]}`);
  lines.push(`- 입력 방식: ${KIND[q.kind]}`);
  if (q.when) {
    const dep = byId.get(q.when.questionId);
    const cond = q.when.equals === undefined ? "답했을 때" : `"${q.when.equals}"(으)로 답했을 때`;
    lines.push(`- 조건: 「${dep?.short ?? q.when.questionId}」(\`${q.when.questionId}\`)에 ${cond}만 보임`);
  } else {
    lines.push("- 조건: 없음 (항상 보임)");
  }
  lines.push(`- 쓰임: ${USED_IN[q.id] ?? USED_DEFAULT}`);
  lines.push(`- 질문: ${q.prompt}`);
  lines.push(`- 짧은 이름: ${q.short ?? "(없음)"}`);
  lines.push(`- 힌트: ${q.hint ?? "(없음)"}`);
  lines.push(`- 예시: ${q.examples.length ? q.examples.join(" / ") : "(없음)"}`);
  if (q.choices.length) lines.push(`- 선택지: ${q.choices.map((c) => `${c.value}=${c.label}`).join(", ")}`);
  return lines.join("\n");
}

const body = STAGES.map((s, i) => {
  const qs = QUESTION_BANK.filter((q) => q.stage === s.id);
  return [`## ${i + 1}. ${s.label}`, "", qs.map(describe).join("\n\n")].join("\n");
}).join("\n\n");

// What each node kind holds and where it lands in the generated md (checked against exporter.ts).
const NODE_NOTES = {
  vision: ["해결할 문제, 목표, 하지 않을 것", "PRD.md의 문제 / 목표 / 하지 않을 것"],
  persona: ["사용자가 해내고 싶은 일", "PRD.md의 '사용자'"],
  feature: ["우선순위(필수·권장·선택·제외), MVP 포함 여부", "PRD.md의 '기능' 표"],
  story: ["누가 / 무엇을 / 왜, 완료 기준(상황·행동·결과)", "PRD.md의 '요구사항'"],
  screen: ["화면 경로, 화면 상태 목록(로딩·빈 화면·오류 등), 화면 구성 파일", "SCREENS.md와 FLOWS.md"],
  interaction: ["'무엇을 하면 / 무슨 일이 생기나' 한 줄", "SCREENS.md의 '화면 동작'"],
  flow: ["사용자가 이동하는 흐름 설명, 필요하면 Mermaid 도식", "FLOWS.md"],
  entity: ["데이터 이름과 필드(이름: 종류)", "SCREENS.md의 '사용 데이터'에 이름이 표시됨. AI 에이전트가 데이터 구조를 만들 때 참고"],
  decision: ["분류, 선택, 대안, 이유", "AGENTS.md의 '기술 스택'"],
  task: ["순서, 완료 조건", "TASKS.md의 체크리스트"],
  risk: ["가능성, 영향, 대응", "PRD.md의 '위험과 가정'"],
  folder: ["이름과 담긴 노드들. 화면에서는 상자 안에 담긴 노드가 한 줄짜리 알약(pill)으로 나열되고, 더블클릭하면 그 폴더 안의 다이어그램이 따로 열림", "md 파일에는 나오지 않음. 화면에서 노드를 정리하고, 담긴 노드의 진행 상황을 한눈에 요약하는 데만 쓰임"],
};
const EDGE_NOTES = {
  contains: ["부모-자식 구조를 만듦. 한 노드는 부모를 하나만 가질 수 있음", "부모의 진행 상태가 자식들의 상태를 합쳐서 정해짐"],
  implements: ["작업 → 기능/요구사항", "TASKS.md에 '구현 대상'으로 표시"],
  navigates: ["화면 → 화면. 이동하는 동작 이름을 붙일 수 있음", "FLOWS.md의 화면 이동 도식, SCREENS.md의 '이동'"],
  depends_on: ["A를 하려면 B가 먼저 끝나야 함", "TASKS.md에 '선행 작업'으로 표시"],
  uses_data: ["화면이나 기능 → 데이터", "SCREENS.md의 '사용 데이터'"],
  blocks: ["진행을 막는 관계", "표시용 (진행 상태를 바꾸지는 않음)"],
  relates: ["위 어디에도 속하지 않는 느슨한 연관", "표시용"],
};

const nodeBlock = (kind, label, hint, notes, prefix) =>
  [
    `### ${prefix}:${kind}`,
    `- ${prefix === "node" ? "입력하는 내용" : "의미"}: ${notes[kind][0]}`,
    `- 쓰임: ${notes[kind][1]}`,
    `- 이름: ${label}`,
    `- 설명: ${hint}`,
  ].join("\n");

const nodesSection = [
  "## 노드와 연결 종류",
  "",
  "### 노드 (기획 요소)",
  "",
  Object.keys(NODE_LABELS)
    .map((k) => nodeBlock(k, NODE_LABELS[k], NODE_HINTS[k], NODE_NOTES, "node"))
    .join("\n\n"),
  "",
  "### 연결 (노드 사이의 관계)",
  "",
  Object.keys(EDGE_LABELS)
    .map((k) => nodeBlock(k, EDGE_LABELS[k], EDGE_HINTS[k], EDGE_NOTES, "edge"))
    .join("\n\n"),
].join("\n");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${request}\n${body}\n\n${nodesSection}\n`, "utf8");
console.log(`wrote ${out} (${QUESTION_BANK.length} questions)`);
