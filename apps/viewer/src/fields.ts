import type { NodeType } from "@scenario/core";

/**
 * Which fields the detail panel can edit for each node type. Fields that hold
 * lists of objects are edited as one line per item and converted here.
 */
export interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "textarea" | "lines" | "select" | "checkbox" | "number";
  options?: { value: string; label: string }[];
  hint?: string;
  /** stored value -> lines of text (for "lines" fields holding objects) */
  format?: (v: unknown) => string[];
  /** lines of text -> stored value */
  parse?: (lines: string[]) => unknown;
}

const LEVEL = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
];

const split = (line: string, sep: string): [string, string | undefined] => {
  const i = line.indexOf(sep);
  return i < 0 ? [line.trim(), undefined] : [line.slice(0, i).trim(), line.slice(i + sep.length).trim()];
};

export const FIELDS: Record<NodeType, FieldSpec[]> = {
  vision: [
    { key: "problem", label: "해결할 문제", kind: "textarea" },
    { key: "goals", label: "목표 (한 줄에 하나)", kind: "lines" },
    { key: "nonGoals", label: "하지 않을 것 (한 줄에 하나)", kind: "lines" },
  ],
  persona: [{ key: "jobsToBeDone", label: "해내고 싶은 일 (한 줄에 하나)", kind: "lines" }],
  feature: [
    {
      key: "priority",
      label: "우선순위",
      kind: "select",
      options: [
        { value: "must", label: "필수" },
        { value: "should", label: "권장" },
        { value: "could", label: "선택" },
        { value: "wont", label: "제외" },
      ],
    },
    { key: "inMvp", label: "MVP에 포함", kind: "checkbox" },
  ],
  story: [
    { key: "asA", label: "누가 (As a)", kind: "text" },
    { key: "iWant", label: "무엇을 (I want)", kind: "text" },
    { key: "soThat", label: "왜 (So that)", kind: "text" },
    {
      key: "acceptance",
      label: "완료 기준 (한 줄에 하나: 상황 | 행동 | 결과)",
      kind: "lines",
      format: (v) =>
        ((v as { given: string; when: string; then: string }[]) ?? []).map((a) => `${a.given} | ${a.when} | ${a.then}`),
      parse: (lines) =>
        lines.map((l) => {
          const [given = "", when = "", then = ""] = l.split("|").map((s) => s.trim());
          return { given, when, then };
        }),
    },
  ],
  screen: [
    { key: "route", label: "경로", kind: "text", hint: "/ 또는 /task/:id" },
    {
      key: "states",
      label: "상태 (한 줄에 하나: 이름: 설명)",
      kind: "lines",
      hint: "default, loading, empty, error",
      format: (v) =>
        ((v as { name: string; description?: string }[]) ?? []).map((s) =>
          s.description ? `${s.name}: ${s.description}` : s.name,
        ),
      parse: (lines) =>
        lines.map((l) => {
          const [name, description] = split(l, ":");
          return description ? { name, description } : { name };
        }),
    },
    { key: "wireframe", label: "화면 구성 파일", kind: "text" },
  ],
  interaction: [
    { key: "trigger", label: "무엇을 하면", kind: "text" },
    { key: "result", label: "무슨 일이 생기나", kind: "text" },
  ],
  flow: [{ key: "mermaid", label: "Mermaid (선택)", kind: "textarea" }],
  entity: [
    {
      key: "fields",
      label: "필드 (한 줄에 하나: 이름: 타입)",
      kind: "lines",
      format: (v) => ((v as { name: string; type: string }[]) ?? []).map((f) => `${f.name}: ${f.type}`),
      parse: (lines) =>
        lines.map((l) => {
          const [name, type] = split(l, ":");
          return { name, type: type || "string", required: true };
        }),
    },
  ],
  decision: [
    { key: "category", label: "분류", kind: "text", hint: "언어, 프레임워크, 저장소..." },
    { key: "choice", label: "선택", kind: "text" },
    { key: "alternatives", label: "대안 (한 줄에 하나)", kind: "lines" },
    { key: "rationale", label: "이유", kind: "textarea" },
  ],
  task: [
    { key: "order", label: "순서", kind: "number" },
    { key: "doneWhen", label: "완료 조건 (한 줄에 하나)", kind: "lines" },
  ],
  folder: [],
  risk: [
    { key: "likelihood", label: "가능성", kind: "select", options: LEVEL },
    { key: "impact", label: "영향", kind: "select", options: LEVEL },
    { key: "mitigation", label: "대응", kind: "textarea" },
  ],
};
