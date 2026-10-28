// Writes docs/question-review-request.md: the whole question bank plus a request
// that can be pasted into another LLM to judge whether these are the right questions
// (coverage, necessity, order, difficulty), not how they are worded.
// Run `pnpm build` first (this reads packages/core/dist), then `pnpm export:questions`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTION_BANK, STAGES } from "../packages/core/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "docs", "question-review-request.md");

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

const request = `# 질문 목록 검토 요청

이 파일은 두 부분입니다. 아래 **「부탁하는 글」** 을 다른 LLM에게 붙여넣고, 그 뒤에 이어지는 **「질문 목록」** 을 모두 이어서 붙여주세요.

---

## 부탁하는 글 (여기부터 LLM에게 붙여넣기)

당신은 소프트웨어 제품 기획과 AI 코딩 에이전트 활용에 경험이 많은 기획 컨설턴트입니다. 아래 「질문 목록」이 **적절한 질문인지** 검토해 주세요. **문구를 다듬는 일은 하지 않습니다.** 무엇을 묻는지, 빠진 것은 없는지, 순서와 중요도가 맞는지를 봐 주세요.

### 이 질문들은 무엇인가요
- "ProjectScenario"라는 프로젝트 기획 앱이 사용자에게 던지는 질문 ${QUESTION_BANK.length}개입니다. ${STAGES.length}개 단계(${STAGES.map((s) => s.label).join(" → ")})로 나뉘어 있습니다.
- 사용자는 AI 코딩 에이전트(Claude Code 등)와 함께 새 소프트웨어 프로젝트를 시작하려는 사람입니다. **개발 전문가가 아닐 수도 있습니다.** 혼자 만드는 개인 프로젝트부터 작은 팀까지를 생각합니다.
- 사용자의 답변은 AI 에이전트에게 주는 지시 문서(AGENTS.md, PRD.md, SCREENS.md, FLOWS.md, TASKS.md)가 됩니다. 답변이 모호하거나 빠지면 에이전트가 엉뚱한 것을 만들거나 멋대로 정하게 됩니다.
- 중요도는 필수(P0, 비어 있으면 내보내기 전에 경고), 권장(P1), 선택(P2)입니다.
- 사용자는 어떤 질문이든 건너뛸 수 있습니다. 건너뛰면 AI가 알아서 정하고 "AI 판단"으로 표시되어 나중에 검토할 수 있습니다. 그래서 **사용자만 답할 수 있는 질문**과 **AI가 합리적으로 정해도 되는 질문**을 구분하는 것이 중요합니다.
- 답변은 이후 AI가 화면, 기능, 작업 같은 항목(노드)을 만드는 재료가 됩니다. 각 질문의 「쓰임」에 어디에 반영되는지 적혀 있습니다.

### 이 목록은 이미 한 번 정리했습니다
이전에 질문 문구를 쉬운 말로 고쳤습니다. 그래서 **말투와 표현은 평가하지 않습니다.** 다만 문구가 질문의 뜻을 흐리는 경우에는 짚어 주세요.

### 검토해 주세요

1. **빠진 질문**: 새 프로젝트를 AI 에이전트에게 맡길 때 꼭 알려줘야 하는데 아직 묻지 않는 것이 있나요? (예: 배포, 접근성, 다국어, 성능, 법적/개인정보, 운영, 비용, 팀 규모 같은 영역)
2. **불필요하거나 겹치는 질문**: 답이 같은 말로 반복될 질문, 버려도 결과가 달라지지 않는 질문, 합치는 게 나은 질문.
3. **한 질문에 두 가지를 묻는 질문**: 나누는 게 좋은 질문.
4. **중요도**: 필수(P0)가 너무 많거나 적지 않은지, 필수여야 하는데 권장으로 된 것(또는 반대)이 있는지.
5. **사용자 질문 vs AI 판단**: 사용자가 반드시 직접 답해야 하는데 건너뛰기 쉬운 질문, 반대로 사용자에게 물을 필요 없이 AI가 정해도 되는 질문.
6. **순서와 단계**: 질문이 놓인 단계가 어색하거나, 앞 질문의 답이 있어야 뒤 질문이 의미 있는데 순서가 거꾸로인 곳. 조건(앞 질문에 따라 보이는 질문)이 필요한데 없거나 불필요한 곳.
7. **난이도**: 비전문가가 답하기 어려운 질문(전문 지식이 있어야 하거나, 무엇을 써야 할지 막막한 질문)과 그럴 때 어떻게 바꾸면 좋을지(예: 선택지로 바꾸기, 예시 늘리기).
8. **입력 방식**: 서술형/목록형/선택형/예·아니오가 적절한지.
9. **분량**: 처음부터 끝까지 답하기에 총 ${QUESTION_BANK.length}개가 많은지 적은지. 줄인다면 무엇을 뺄지, 단계별로 어디가 과한지.
10. **답이 문서로 쓰이는 방식**: 「쓰임」을 봤을 때 답변이 AI 에이전트에게 충분한 지시가 되는지, 답은 받는데 문서에 쓰이지 않는 질문은 없는지.

### 출력 형식
1. **총평**: 3~5줄. 이 목록을 그대로 써도 되는지.
2. **질문별 판정 표**: 모든 질문 id를 같은 순서로 한 줄씩. 열은 \`id | 판정(유지/수정/합침/삭제/나눔) | 중요도 의견(그대로/올림/내림) | 한 줄 이유\`. 유지인 질문은 이유를 짧게(또는 "-") 적어도 됩니다.
3. **추가하면 좋을 질문**: id 후보, 단계, 중요도, 입력 방식, 질문 문장, 왜 필요한지. 우선순위가 높은 것부터 최대 10개.
4. **순서/단계 변경 제안**: 옮길 질문과 옮길 위치.
5. **가장 먼저 고칠 3가지**: 영향이 큰 순서로.

의견은 근거와 함께 적고, 확신이 낮은 항목은 "확신 낮음"이라고 표시해 주세요. 일반론이 아니라 **이 목록의 id를 짚어서** 말해 주세요.

### 여기부터 아래를 이어서 붙여넣기 (질문 목록)
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
  lines.push(`- 힌트: ${q.hint ?? "(없음)"}`);
  lines.push(`- 예시: ${q.examples.length ? q.examples.join(" / ") : "(없음)"}`);
  if (q.choices.length) lines.push(`- 선택지: ${q.choices.map((c) => `${c.value}=${c.label}`).join(", ")}`);
  return lines.join("\n");
}

const body = STAGES.map((s, i) => {
  const qs = QUESTION_BANK.filter((q) => q.stage === s.id);
  return [`## ${i + 1}. ${s.label}`, "", qs.map(describe).join("\n\n")].join("\n");
}).join("\n\n");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${request}\n${body}\n`, "utf8");
console.log(`wrote ${out} (${QUESTION_BANK.length} questions)`);
