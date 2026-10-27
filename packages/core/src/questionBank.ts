import { z } from "zod";
import { QuestionSchema, type Question } from "./questions.js";

/**
 * Built-in question bank, grouped by planning stage (see brief §6).
 * Prompts are Korean; ids are stable and referenced from saved answers, so
 * never rename an id once released.
 *
 * P0 = needed before export, P1 = recommended, P2 = optional.
 */
const raw: z.input<typeof QuestionSchema>[] = [
  // 1. 문제 정의
  {
    id: "problem-statement",
    stage: "problem",
    importance: "P0",
    prompt: "이 프로젝트는 누구의 어떤 문제를 해결하나요?",
    hint: "한두 문장으로. 해결책이 아니라 문제부터 적어주세요.",
    examples: ["기존 할 일 앱은 너무 무거워서 빠른 메모용으로 쓰기 어렵다."],
  },
  {
    id: "problem-goals",
    stage: "problem",
    importance: "P0",
    kind: "list",
    prompt: "이 프로젝트의 핵심 목표 1~3개는 무엇인가요?",
    examples: ["할 일을 3초 안에 추가한다"],
  },
  {
    id: "problem-success",
    stage: "problem",
    importance: "P1",
    kind: "list",
    prompt: "성공했다고 판단할 기준은 무엇인가요?",
    hint: "가능하면 확인할 수 있는 형태로.",
  },
  {
    id: "problem-why-now",
    stage: "problem",
    importance: "P2",
    prompt: "왜 지금 이 프로젝트를 시작하나요?",
  },

  // 2. 사용자 정의
  {
    id: "users-who",
    stage: "users",
    importance: "P0",
    kind: "list",
    prompt: "주요 사용자는 누구인가요?",
    examples: ["혼자 일하는 프리랜서", "AI 에이전트로 개발하는 1인 개발자"],
  },
  {
    id: "users-jobs",
    stage: "users",
    importance: "P1",
    kind: "list",
    prompt: "그 사용자가 이 제품으로 해내고 싶은 일은 무엇인가요?",
    when: { questionId: "users-who" },
  },
  {
    id: "users-context",
    stage: "users",
    importance: "P2",
    prompt: "어떤 상황에서, 얼마나 자주 쓰게 되나요?",
    when: { questionId: "users-who" },
  },

  // 3. 경쟁 조사
  {
    id: "competition-similar",
    stage: "competition",
    importance: "P2",
    kind: "list",
    prompt: "비슷한 제품이나 참고할 만한 앱이 있나요?",
  },
  {
    id: "competition-diff",
    stage: "competition",
    importance: "P1",
    prompt: "그 제품들과 다른 점은 무엇인가요?",
    when: { questionId: "competition-similar" },
  },

  // 4. 범위 설정
  {
    id: "scope-mvp",
    stage: "scope",
    importance: "P0",
    kind: "list",
    prompt: "첫 버전(MVP)에 반드시 들어가야 할 기능은 무엇인가요?",
    hint: "없으면 첫 버전이 의미 없는 것만 적어주세요.",
  },
  {
    id: "scope-nongoals",
    stage: "scope",
    importance: "P0",
    kind: "list",
    prompt: "이번에 하지 않을 것(Non-goals)은 무엇인가요?",
    hint: "AI 에이전트가 시키지 않은 기능까지 만드는 것을 막아줍니다.",
    examples: ["팀 협업", "클라우드 동기화"],
  },
  {
    id: "scope-should",
    stage: "scope",
    importance: "P1",
    kind: "list",
    prompt: "있으면 좋지만 MVP 이후로 미뤄도 되는 기능은 무엇인가요?",
  },

  // 5. 사용자 스토리
  {
    id: "stories-core",
    stage: "stories",
    importance: "P0",
    kind: "list",
    prompt: "사용자가 가장 자주 하는 핵심 행동 2~3가지를 순서대로 적어주세요.",
    examples: ["앱을 열고 → 할 일을 입력하고 → 완료로 체크한다"],
  },
  {
    id: "stories-acceptance",
    stage: "stories",
    importance: "P1",
    prompt: "핵심 행동마다 '이렇게 되면 완료'라고 볼 기준은 무엇인가요?",
    hint: "상황 → 행동 → 결과 형태로 적으면 좋습니다.",
    when: { questionId: "stories-core" },
  },
  {
    id: "stories-edge",
    stage: "stories",
    importance: "P2",
    kind: "list",
    prompt: "예외 상황이나 드문 사용 방식이 있나요?",
  },

  // 6. 정보 구조
  {
    id: "ia-screens",
    stage: "ia",
    importance: "P0",
    kind: "list",
    prompt: "필요한 화면(페이지)을 모두 나열해주세요.",
    examples: ["목록", "상세", "설정"],
  },
  {
    id: "ia-nav",
    stage: "ia",
    importance: "P1",
    kind: "choice",
    prompt: "화면 사이 이동은 어떤 방식인가요?",
    choices: [
      { value: "single", label: "단일 화면" },
      { value: "sidebar", label: "사이드바" },
      { value: "tabs", label: "상단/하단 탭" },
      { value: "stack", label: "화면 쌓기(뒤로가기)" },
    ],
  },
  {
    id: "ia-auth",
    stage: "ia",
    importance: "P1",
    kind: "boolean",
    prompt: "로그인이 필요한가요?",
  },
  {
    id: "ia-auth-method",
    stage: "ia",
    importance: "P1",
    prompt: "로그인 방식은 무엇인가요?",
    when: { questionId: "ia-auth", equals: true },
    examples: ["이메일+비밀번호", "소셜 로그인"],
  },

  // 7. 사용자 플로우
  {
    id: "flows-main",
    stage: "flows",
    importance: "P0",
    prompt: "처음 실행해서 핵심 목적을 달성하기까지 어떤 순서로 화면을 거치나요?",
    examples: ["목록 → (입력) → 목록에 추가됨 → 상세 → 완료 처리"],
  },
  {
    id: "flows-onboarding",
    stage: "flows",
    importance: "P1",
    prompt: "처음 사용하는 사람에게 필요한 안내나 설정 단계가 있나요?",
  },
  {
    id: "flows-error",
    stage: "flows",
    importance: "P2",
    prompt: "흐름이 실패하거나 중간에 이탈하면 어떻게 되나요?",
  },

  // 8. 와이어프레임
  {
    id: "wireframes-style",
    stage: "wireframes",
    importance: "P1",
    kind: "choice",
    prompt: "화면의 전체적인 밀도와 느낌은 어떤가요?",
    choices: [
      { value: "minimal", label: "여백 많은 미니멀" },
      { value: "dense", label: "정보가 촘촘한 대시보드형" },
      { value: "playful", label: "가볍고 친근한" },
    ],
  },
  {
    id: "wireframes-key-screen",
    stage: "wireframes",
    importance: "P1",
    prompt: "가장 중요한 화면은 무엇이고, 그 화면에 꼭 있어야 할 요소는 무엇인가요?",
  },
  {
    id: "wireframes-reference",
    stage: "wireframes",
    importance: "P2",
    kind: "list",
    prompt: "참고하고 싶은 화면 레이아웃(앱, 사이트, 이미지)이 있나요?",
  },

  // 9. 상호작용 정의
  {
    id: "interactions-states",
    stage: "interactions",
    importance: "P0",
    kind: "multi",
    prompt: "화면마다 별도로 설계해야 할 상태를 골라주세요.",
    hint: "고르지 않은 상태는 AI 에이전트가 임의로 채우게 됩니다.",
    choices: [
      { value: "loading", label: "로딩 중" },
      { value: "empty", label: "비어 있음" },
      { value: "error", label: "오류" },
      { value: "offline", label: "오프라인" },
    ],
  },
  {
    id: "interactions-key",
    stage: "interactions",
    importance: "P1",
    kind: "list",
    prompt: "핵심 상호작용을 '무엇을 하면 → 무슨 일이 생긴다' 형태로 적어주세요.",
    examples: ["Enter를 누르면 → 할 일이 추가되고 입력창이 비워진다"],
  },
  {
    id: "interactions-feedback",
    stage: "interactions",
    importance: "P2",
    prompt: "작업 성공/실패를 사용자에게 어떻게 알려주나요?",
    examples: ["토스트 메시지", "인라인 문구"],
  },
  {
    id: "interactions-shortcuts",
    stage: "interactions",
    importance: "P2",
    kind: "list",
    prompt: "키보드 단축키나 제스처가 필요한가요?",
  },

  // 10. 데이터/API
  {
    id: "data-entities",
    stage: "data",
    importance: "P0",
    kind: "list",
    prompt: "앱이 다루는 핵심 데이터(엔티티)는 무엇이고, 각각 어떤 정보를 가지나요?",
    examples: ["할 일: 제목, 완료 여부, 마감일"],
  },
  {
    id: "data-storage",
    stage: "data",
    importance: "P0",
    kind: "choice",
    prompt: "데이터는 어디에 저장하나요?",
    choices: [
      { value: "memory", label: "저장 안 함" },
      { value: "local-file", label: "로컬 파일/브라우저 저장소" },
      { value: "sqlite", label: "로컬 DB(SQLite)" },
      { value: "cloud-db", label: "클라우드 DB" },
    ],
  },
  {
    id: "data-sync",
    stage: "data",
    importance: "P2",
    kind: "boolean",
    prompt: "여러 기기 간 동기화가 필요한가요?",
    when: { questionId: "data-storage", equals: "cloud-db" },
  },
  {
    id: "data-external",
    stage: "data",
    importance: "P1",
    kind: "list",
    prompt: "연동할 외부 서비스나 API가 있나요?",
  },

  // 11. 기술 스택/아키텍처
  {
    id: "stack-platform",
    stage: "stack",
    importance: "P0",
    kind: "multi",
    prompt: "어떤 환경에서 실행되나요?",
    choices: [
      { value: "web", label: "웹" },
      { value: "windows", label: "Windows 데스크톱" },
      { value: "mobile", label: "모바일" },
      { value: "cli", label: "CLI" },
    ],
  },
  {
    id: "stack-language",
    stage: "stack",
    importance: "P0",
    prompt: "주 사용 언어와 프레임워크는 무엇인가요?",
    examples: ["TypeScript + React + Vite"],
  },
  {
    id: "stack-conventions",
    stage: "stack",
    importance: "P1",
    prompt: "AI 에이전트가 지켜야 할 코딩 규칙이나 금지 사항이 있나요?",
    examples: ["any 사용 금지", "새 라이브러리 추가 전 확인"],
  },
  {
    id: "stack-constraints",
    stage: "stack",
    importance: "P1",
    prompt: "라이선스, 성능, 보안 등 지켜야 할 제약이 있나요?",
  },
  {
    id: "stack-testing",
    stage: "stack",
    importance: "P2",
    prompt: "테스트는 어떤 방식으로 하나요?",
  },

  // 12. 디자인 시스템
  {
    id: "design-theme",
    stage: "design_system",
    importance: "P1",
    kind: "choice",
    prompt: "라이트/다크 테마는 어떻게 하나요?",
    choices: [
      { value: "light", label: "라이트만" },
      { value: "dark", label: "다크만" },
      { value: "both", label: "둘 다" },
    ],
  },
  {
    id: "design-tone",
    stage: "design_system",
    importance: "P1",
    prompt: "전체적인 디자인 분위기를 설명해주세요.",
    examples: ["차분하고 정돈된 느낌, 포인트 컬러 하나"],
  },
  {
    id: "design-colors",
    stage: "design_system",
    importance: "P2",
    kind: "list",
    prompt: "정해진 브랜드 색상이 있나요?",
  },
  {
    id: "design-font",
    stage: "design_system",
    importance: "P2",
    prompt: "사용할 글꼴이 있나요?",
  },

  // 13. 로드맵/태스크 분해
  {
    id: "tasks-order",
    stage: "tasks",
    importance: "P0",
    kind: "list",
    prompt: "어떤 순서로 만들면 좋을까요? 먼저 동작해야 하는 것부터 적어주세요.",
  },
  {
    id: "tasks-first",
    stage: "tasks",
    importance: "P1",
    prompt: "첫 번째 마일스톤은 무엇이고, 어떤 상태면 끝난 건가요?",
  },
  {
    id: "tasks-size",
    stage: "tasks",
    importance: "P2",
    kind: "choice",
    prompt: "AI에게 한 번에 맡길 작업 크기는 어느 정도가 좋나요?",
    choices: [
      { value: "small", label: "작게 (파일 1~2개)" },
      { value: "medium", label: "중간 (기능 하나)" },
    ],
  },

  // 14. 리스크/가정
  {
    id: "risks-assumptions",
    stage: "risks",
    importance: "P1",
    kind: "list",
    prompt: "맞다고 가정하고 있지만 확인하지 못한 것은 무엇인가요?",
  },
  {
    id: "risks-main",
    stage: "risks",
    importance: "P2",
    kind: "list",
    prompt: "가장 걱정되는 위험(기술, 일정, 데이터 등)은 무엇인가요?",
  },
];

export const QUESTION_BANK: Question[] = z.array(QuestionSchema).parse(raw);

export function getQuestion(id: string): Question | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}

export function questionsForStage(stage: Question["stage"]): Question[] {
  return QUESTION_BANK.filter((q) => q.stage === stage);
}
