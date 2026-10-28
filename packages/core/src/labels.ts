import type { EdgeKind, NodeType } from "./nodes.js";

/**
 * User-facing Korean names and one-line explanations for node and edge kinds.
 * The GUI shows them in the ribbon and tooltips; scripts/export-questions.mjs
 * puts them in the text-review request, so edit them here only.
 * Names stay within 6 characters (ribbon buttons) and hints within 25.
 */
export const NODE_LABELS: Record<NodeType, string> = {
  vision: "목표",
  persona: "사용자",
  feature: "기능",
  story: "요구사항",
  screen: "화면",
  interaction: "화면 동작",
  flow: "사용 흐름",
  entity: "데이터",
  decision: "기술 선택",
  task: "작업",
  risk: "위험",
  folder: "폴더",
};

export const NODE_HINTS: Record<NodeType, string> = {
  vision: "해결할 문제와 목표, 만들지 않을 것",
  persona: "사용자와 사용자가 해내고 싶은 일",
  feature: "제품이 제공할 기능과 우선순위",
  story: "누가 무엇을 왜 원하는지와 완료 기준",
  screen: "화면 하나의 구성과 상태",
  interaction: "사용자 행동에 따른 화면의 반응",
  flow: "사용자가 거치는 화면과 순서",
  entity: "다루는 데이터와 그 안의 정보",
  decision: "선택한 기술과 대안, 선택 이유",
  task: "만들 작업의 순서와 완료 조건",
  risk: "예상되는 위험과 영향, 대응 방법",
  folder: "묶어 보관, 더블클릭해서 열기",
};

export const EDGE_LABELS: Record<EdgeKind, string> = {
  contains: "포함",
  implements: "구현",
  navigates: "화면 이동",
  depends_on: "선행 필요",
  uses_data: "데이터 사용",
  blocks: "진행 방해",
  relates: "관련",
};

export const EDGE_HINTS: Record<EdgeKind, string> = {
  contains: "상위 항목 아래에 하위 항목 묶기",
  implements: "작업이 만드는 기능이나 요구사항 연결",
  navigates: "한 화면에서 다른 화면으로 이동",
  depends_on: "한 작업 전에 끝나야 할 작업 연결",
  uses_data: "화면이나 기능이 사용하는 데이터 연결",
  blocks: "다른 항목의 진행을 막는 관계 표시",
  relates: "다른 연결에 속하지 않는 연관 표시",
};
