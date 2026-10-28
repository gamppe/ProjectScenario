import { z } from "zod";
import { QuestionSchema, type AnswerValue, type Question } from "./questions.js";

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
    short: "해결할 문제",
    stage: "problem",
    importance: "P0",
    prompt: "이 프로젝트는 누구의 어떤 문제를 해결하나요?",
    hint: "해결 방법보다 사용자가 겪는 문제를 한두 문장으로 적어주세요.",
    examples: ["자영업자는 예약 전화를 받느라 손님 응대에 집중하기 어렵다."],
  },
  {
    id: "problem-goals",
    short: "핵심 목표",
    stage: "problem",
    importance: "P0",
    kind: "list",
    prompt: "이 프로젝트에서 이루고 싶은 핵심 목표는 무엇인가요?",
    examples: ["손님이 온라인으로 예약할 수 있다","예약 확인에 걸리는 시간을 줄인다"],
  },
  {
    id: "problem-success",
    short: "성공 기준",
    stage: "problem",
    importance: "P1",
    kind: "list",
    prompt: "프로젝트가 성공했는지 어떤 기준으로 판단하나요?",
    hint: "가능하면 숫자나 직접 확인할 수 있는 결과로 적어주세요.",
  },
  {
    id: "problem-why-now",
    short: "시작 이유",
    stage: "problem",
    importance: "P2",
    prompt: "왜 지금 이 프로젝트를 시작하나요?",
  },

  // 2. 사용자 정의
  {
    id: "users-who",
    short: "주요 사용자",
    stage: "users",
    importance: "P0",
    kind: "list",
    prompt: "이 제품을 주로 사용할 사람은 누구인가요?",
    examples: ["혼자 일하는 프리랜서","동네 식당 운영자"],
  },
  {
    id: "users-jobs",
    short: "사용자 목적",
    stage: "users",
    importance: "P1",
    kind: "list",
    prompt: "주요 사용자는 이 제품으로 어떤 일을 해내고 싶어 하나요?",
    when: { questionId: "users-who" },
  },
  {
    id: "users-context",
    short: "사용 상황",
    stage: "users",
    importance: "P2",
    prompt: "주요 사용자는 어떤 상황에서 이 제품을 사용하나요?",
    when: { questionId: "users-who" },
  },

  // 3. 경쟁 조사
  {
    id: "competition-similar",
    short: "참고 제품",
    stage: "competition",
    importance: "P2",
    kind: "list",
    prompt: "비슷하거나 참고하고 싶은 제품이 있나요?",
  },
  {
    id: "competition-diff",
    short: "제품 차별점",
    stage: "competition",
    importance: "P1",
    prompt: "이 프로젝트는 앞서 적은 제품들과 어떤 점이 다른가요?",
    when: { questionId: "competition-similar" },
  },

  // 4. 범위 설정
  {
    id: "scope-mvp",
    short: "첫 버전 필수 기능",
    stage: "scope",
    importance: "P0",
    kind: "list",
    prompt: "첫 버전에 반드시 들어가야 할 기능은 무엇인가요?",
    hint: "없으면 첫 버전의 목적을 달성하기 어려운 기능만 적어주세요.",
  },
  {
    id: "scope-nongoals",
    short: "만들지 않을 것",
    stage: "scope",
    importance: "P0",
    kind: "list",
    prompt: "이번에 만들지 않을 기능이나 범위는 무엇인가요?",
    hint: "AI가 요청하지 않은 기능까지 만드는 것을 막는 데 도움이 돼요.",
    examples: ["팀 협업","클라우드 동기화"],
  },
  {
    id: "scope-should",
    short: "나중에 만들 기능",
    stage: "scope",
    importance: "P1",
    kind: "list",
    prompt: "있으면 좋지만 첫 버전 이후로 미뤄도 되는 기능은 무엇인가요?",
  },

  // 5. 요구사항
  {
    id: "stories-core",
    short: "핵심 행동",
    stage: "stories",
    importance: "P0",
    kind: "list",
    prompt: "사용자가 핵심 목적을 이루기 위해 가장 자주 하는 행동 2~3가지를 순서대로 적어주세요.",
    examples: ["가게를 찾는다 → 날짜를 고른다 → 예약한다"],
  },
  {
    id: "stories-acceptance",
    short: "행동 완료 기준",
    stage: "stories",
    importance: "P1",
    prompt: "각 핵심 행동이 제대로 완료됐다고 볼 기준은 무엇인가요?",
    hint: "어떤 상황에서 어떤 행동을 했을 때 어떤 결과가 나와야 하는지 적어주세요.",
    when: { questionId: "stories-core" },
  },
  {
    id: "stories-edge",
    short: "예외 상황",
    stage: "stories",
    importance: "P2",
    kind: "list",
    prompt: "예상되는 예외 상황이나 드문 사용 방식은 무엇인가요?",
  },

  // 6. 정보 구조
  {
    id: "ia-screens",
    short: "화면 목록",
    stage: "ia",
    importance: "P0",
    kind: "list",
    prompt: "필요한 화면을 모두 적어주세요.",
    examples: ["예약 목록","예약 상세","설정"],
  },
  {
    id: "ia-nav",
    short: "화면 이동 방식",
    stage: "ia",
    importance: "P1",
    kind: "choice",
    prompt: "사용자는 화면 사이를 주로 어떤 방식으로 이동하나요?",
    choices: [
      { value: "single", label: "한 화면만 사용" },
      { value: "sidebar", label: "옆쪽 메뉴" },
      { value: "tabs", label: "위쪽 또는 아래쪽 탭" },
      { value: "stack", label: "화면을 열고 뒤로 가기" },
    ],
  },
  {
    id: "ia-auth",
    short: "로그인 필요",
    stage: "ia",
    importance: "P1",
    kind: "boolean",
    prompt: "이 제품을 사용하려면 로그인이 필요한가요?",
  },
  {
    id: "ia-auth-method",
    short: "로그인 방식",
    stage: "ia",
    importance: "P1",
    prompt: "사용자는 어떤 방식으로 로그인하나요?",
    examples: ["이메일과 비밀번호","구글 계정"],
    when: { questionId: "ia-auth", equals: true },
  },

  // 7. 사용 흐름
  {
    id: "flows-main",
    short: "주요 사용 흐름",
    stage: "flows",
    importance: "P0",
    prompt: "처음 실행한 뒤 핵심 목적을 달성할 때까지 어떤 순서로 화면을 거치나요?",
    examples: ["가게 목록 → 가게 상세 → 예약 화면 → 예약 완료 화면"],
  },
  {
    id: "flows-onboarding",
    short: "첫 사용 안내",
    stage: "flows",
    importance: "P1",
    prompt: "처음 사용하는 사람에게 필요한 안내나 설정 단계는 무엇인가요?",
  },
  {
    id: "flows-error",
    short: "실패·이탈 처리",
    stage: "flows",
    importance: "P2",
    prompt: "사용 중 실패하거나 중간에 그만두면 어떻게 처리하나요?",
  },

  // 8. 화면 구성
  {
    id: "wireframes-style",
    short: "화면 정보 밀도",
    stage: "wireframes",
    importance: "P1",
    kind: "choice",
    prompt: "화면에 정보를 얼마나 빽빽하게 배치하고 싶나요?",
    choices: [
      { value: "minimal", label: "여백이 넉넉하고 단순한 화면" },
      { value: "dense", label: "정보가 촘촘하게 모인 화면" },
    ],
  },
  {
    id: "wireframes-reference",
    short: "참고 화면",
    stage: "wireframes",
    importance: "P2",
    kind: "list",
    prompt: "화면 배치를 참고하고 싶은 앱이나 웹사이트, 이미지가 있나요?",
  },

  // 9. 화면 동작
  {
    id: "interactions-states",
    short: "화면 상태",
    stage: "interactions",
    importance: "P0",
    kind: "multi",
    prompt: "화면을 설계할 때 따로 고려해야 할 상태를 골라주세요.",
    hint: "고르지 않은 상태는 AI가 알아서 정해요.",
    choices: [
      { value: "loading", label: "로딩 중" },
      { value: "empty", label: "비어 있음" },
      { value: "error", label: "오류" },
      { value: "offline", label: "오프라인" },
    ],
  },
  {
    id: "interactions-key",
    short: "화면 동작",
    stage: "interactions",
    importance: "P1",
    kind: "list",
    prompt: "사용자의 어떤 행동에 어떤 결과가 생기는지 적어주세요.",
    examples: ["예약 버튼을 누르면 → 예약 확인 화면이 열린다"],
  },
  {
    id: "interactions-feedback",
    short: "결과 알림",
    stage: "interactions",
    importance: "P2",
    prompt: "작업이 성공하거나 실패했을 때 사용자에게 어떻게 알려주나요?",
    examples: ["화면 아래에 잠깐 뜨는 알림","입력칸 아래에 표시되는 문구"],
  },
  {
    id: "interactions-shortcuts",
    short: "단축키·손동작",
    stage: "interactions",
    importance: "P2",
    kind: "list",
    prompt: "필요한 키보드 단축키나 손가락 동작은 무엇인가요?",
  },

  // 10. 데이터/API
  {
    id: "data-entities",
    short: "핵심 데이터",
    stage: "data",
    importance: "P0",
    kind: "list",
    prompt: "제품에서 다루는 핵심 데이터는 무엇인가요?",
    examples: ["예약","손님","가게"],
  },
  {
    id: "data-fields",
    short: "데이터 항목",
    stage: "data",
    importance: "P1",
    kind: "list",
    prompt: "각 데이터에는 어떤 정보를 담나요?",
    hint: "데이터마다 한 줄로 적어 주세요.",
    examples: ["예약: 손님 이름, 날짜, 인원"],
    when: { questionId: "data-entities" },
  },
  {
    id: "data-storage",
    short: "저장 위치",
    stage: "data",
    importance: "P0",
    kind: "choice",
    prompt: "데이터는 어디에 저장하나요?",
    choices: [
      { value: "memory", label: "실행 중에만 보관" },
      { value: "local-file", label: "기기의 파일 또는 브라우저에 저장" },
      { value: "sqlite", label: "기기에 데이터베이스로 저장(SQLite)" },
      { value: "cloud-db", label: "인터넷상의 데이터베이스에 저장" },
    ],
  },
  {
    id: "data-sync",
    short: "기기 동기화",
    stage: "data",
    importance: "P2",
    kind: "boolean",
    prompt: "여러 기기에서 같은 데이터를 볼 수 있도록 동기화해야 하나요?",
    when: { questionId: "data-storage", equals: "cloud-db" },
  },
  {
    id: "data-external",
    short: "외부 서비스 연결",
    stage: "data",
    importance: "P1",
    kind: "list",
    prompt: "연결해서 사용할 외부 서비스나 데이터 제공 기능(API)은 무엇인가요?",
  },

  // 11. 기술 선택
  {
    id: "stack-platform",
    short: "실행 환경",
    stage: "stack",
    importance: "P0",
    kind: "multi",
    prompt: "이 제품은 어떤 환경에서 실행되나요?",
    choices: [
      { value: "web", label: "웹" },
      { value: "windows", label: "Windows 데스크톱" },
      { value: "mobile", label: "모바일" },
      { value: "cli", label: "CLI" },
    ],
  },
  {
    id: "stack-language",
    short: "개발 언어·도구",
    stage: "stack",
    importance: "P0",
    prompt: "주로 사용할 프로그래밍 언어와 개발 틀(프레임워크)은 무엇인가요?",
    examples: ["TypeScript와 React, Vite"],
  },
  {
    id: "stack-conventions",
    short: "코딩 규칙",
    stage: "stack",
    importance: "P1",
    prompt: "AI가 코드를 만들 때 지켜야 할 규칙이나 금지 사항은 무엇인가요?",
    examples: ["any 사용 금지","새 라이브러리를 추가하기 전에 확인"],
  },
  {
    id: "stack-constraints",
    short: "제약 조건",
    stage: "stack",
    importance: "P1",
    prompt: "라이선스, 성능, 보안 등 지켜야 할 제약이 있나요?",
  },
  {
    id: "security-personal-data",
    short: "개인정보 보호",
    stage: "stack",
    importance: "P1",
    prompt: "개인정보(이름, 연락처, 위치 등)를 다룬다면 어떻게 보호해야 하나요?",
    hint: "다루지 않는다면 '없음'이라고 적어 주세요.",
    examples: ["비밀번호는 암호화해서 저장한다","개인정보는 기기 밖으로 보내지 않는다"],
  },
  {
    id: "stack-testing",
    short: "테스트 방식",
    stage: "stack",
    importance: "P2",
    prompt: "제품이 제대로 동작하는지 어떤 방식으로 확인하나요?",
  },

  // 12. 디자인 시스템
  {
    id: "design-theme",
    short: "테마",
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
    short: "디자인 분위기",
    stage: "design_system",
    importance: "P1",
    prompt: "전체적인 디자인은 어떤 분위기인가요?",
    examples: ["차분하고 정돈된 느낌에 강조 색상 하나"],
  },
  {
    id: "design-colors",
    short: "브랜드 색상",
    stage: "design_system",
    importance: "P2",
    kind: "list",
    prompt: "정해진 브랜드 색상은 무엇인가요?",
  },
  {
    id: "design-font",
    short: "글꼴",
    stage: "design_system",
    importance: "P2",
    prompt: "사용할 글꼴은 무엇인가요?",
  },

  // 13. 로드맵/작업 분해
  {
    id: "tasks-order",
    short: "작업 순서",
    stage: "tasks",
    importance: "P0",
    kind: "list",
    prompt: "먼저 동작해야 하는 것부터 어떤 순서로 만들면 좋을까요?",
  },
  {
    id: "tasks-first",
    short: "첫 목표",
    stage: "tasks",
    importance: "P1",
    prompt: "첫 번째로 완성할 목표는 무엇인가요?",
  },
  {
    id: "tasks-first-done",
    short: "첫 목표 완료 기준",
    stage: "tasks",
    importance: "P1",
    prompt: "그 첫 번째 목표가 끝났다고 볼 기준은 무엇인가요?",
    when: { questionId: "tasks-first" },
  },
  {
    id: "tasks-size",
    short: "작업 크기",
    stage: "tasks",
    importance: "P2",
    kind: "choice",
    prompt: "AI에게 한 번에 어느 정도의 작업을 맡기고 싶나요?",
    choices: [
      { value: "small", label: "작게: 파일 1~2개 정도" },
      { value: "medium", label: "중간: 기능 하나 정도" },
    ],
  },

  // 14. 위험과 가정
  {
    id: "risks-assumptions",
    short: "미확인 가정",
    stage: "risks",
    importance: "P1",
    kind: "list",
    prompt: "맞을 것이라고 생각하지만 아직 확인하지 못한 것은 무엇인가요?",
  },
  {
    id: "risks-main",
    short: "주요 위험",
    stage: "risks",
    importance: "P2",
    kind: "list",
    prompt: "프로젝트에서 가장 걱정되는 위험은 무엇인가요?",
  },
];

export const QUESTION_BANK: Question[] = z.array(QuestionSchema).parse(raw);

/** Short name for narrow lists; falls back to a trimmed prompt. */
export function questionLabel(q: Question, max = 14): string {
  if (q.short) return q.short;
  return q.prompt.length > max ? `${q.prompt.slice(0, max)}…` : q.prompt;
}

/** One-line preview of an answer, cut to `max` characters. */
export function answerPreview(value: AnswerValue | undefined, max = 20): string {
  if (value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "예" : "아니오") : Array.isArray(value) ? value.join(", ") : value;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function getQuestion(id: string): Question | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}

export function questionsForStage(stage: Question["stage"]): Question[] {
  return QUESTION_BANK.filter((q) => q.stage === stage);
}
