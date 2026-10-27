import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeCompleteness,
  computeRollup,
  parseSpec,
  safeParseSpec,
  type ProjectSpecInput,
  type Question,
} from "./index.js";

const examplePath = fileURLToPath(
  new URL("../../../examples/todo-app/project.json", import.meta.url),
);
const example = (): ProjectSpecInput => JSON.parse(readFileSync(examplePath, "utf8"));

function messages(data: unknown): string[] {
  const r = safeParseSpec(data);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("ProjectSpec parsing", () => {
  it("accepts the example project", () => {
    const spec = parseSpec(example());
    expect(spec.nodes.length).toBeGreaterThan(10);
    expect(spec.project.outputLanguage).toBe("en");
  });

  it("applies defaults (status planned, empty tags)", () => {
    const spec = parseSpec(example());
    const detail = spec.nodes.find((n) => n.id === "screen-detail");
    expect(detail?.status).toBe("planned");
    expect(detail?.tags).toEqual([]);
  });

  it("rejects duplicate node ids", () => {
    const d = example();
    d.nodes!.push({ ...d.nodes![0]! });
    expect(messages(d).join()).toContain("duplicate node id");
  });

  it("rejects edges to unknown nodes", () => {
    const d = example();
    d.edges!.push({ from: "vision", to: "nope-node", kind: "relates" });
    expect(messages(d).join()).toContain('unknown node "nope-node"');
  });

  it("rejects a node with two parents", () => {
    const d = example();
    d.edges!.push({ from: "vision", to: "screen-list", kind: "contains" });
    expect(messages(d).join()).toContain("two parents");
  });

  it("rejects contains cycles", () => {
    const d = example();
    d.edges!.push({ from: "int-add", to: "vision", kind: "contains" });
    expect(messages(d).join()).toContain("form a cycle");
  });

  it("rejects depends_on cycles", () => {
    const d = example();
    d.edges!.push({ from: "task-list-ui", to: "task-storage", kind: "depends_on" });
    expect(messages(d).join()).toContain("form a cycle");
  });

  it("allows navigates cycles (screens link back and forth)", () => {
    expect(messages(example())).toEqual([]);
  });

  it("rejects answers pointing at unknown nodes", () => {
    const d = example();
    d.answers![0]!.nodeIds = ["ghost"];
    expect(messages(d).join()).toContain('unknown node "ghost"');
  });

  it("requires a rationale on ai_decided answers", () => {
    const d = example();
    const ai = d.answers!.find((a) => a.state === "ai_decided")!;
    delete (ai.provenance as { rationale?: string }).rationale;
    expect(messages(d).join()).toContain("rationale");
  });

  it("rejects a value on skipped answers", () => {
    const d = example();
    const skipped = d.answers!.find((a) => a.state === "skipped")!;
    skipped.value = "something";
    expect(messages(d).join()).toContain("must not have a value");
  });

  it("rejects ids that are not slugs", () => {
    const d = example();
    d.nodes![0]!.id = "Has Spaces";
    expect(safeParseSpec(d).success).toBe(false);
  });
});

describe("computeRollup", () => {
  it("lets a blocked child block its ancestors", () => {
    const spec = parseSpec(example());
    const r = computeRollup(spec);
    // task-storage is blocked but not under vision, so vision is unaffected by it
    expect(r["task-storage"]).toBe("blocked");
    expect(r["task-list-ui"]).toBe("in_progress");
  });

  it("marks a parent done only when all children are done", () => {
    const d = example();
    for (const n of d.nodes!) if (["screen-list", "screen-detail", "story-add-task"].includes(n.id)) n.status = "done";
    for (const n of d.nodes!) if (n.id === "int-add") n.status = "done";
    expect(computeRollup(parseSpec(d))["feat-tasks"]).toBe("done");
  });

  it("is in_progress when children are mixed done/planned", () => {
    const r = computeRollup(parseSpec(example()));
    // story done, screen-list in_progress (child done), screen-detail planned
    expect(r["feat-tasks"]).toBe("in_progress");
    expect(r["vision"]).toBe("in_progress");
  });

  it("propagates blocked upward", () => {
    const d = example();
    d.nodes!.find((n) => n.id === "int-add")!.status = "blocked";
    const r = computeRollup(parseSpec(d));
    expect(r["screen-list"]).toBe("blocked");
    expect(r["feat-tasks"]).toBe("blocked");
    expect(r["vision"]).toBe("blocked");
  });

  it("is planned when every child is planned", () => {
    const d = example();
    for (const n of d.nodes!) n.status = "planned";
    expect(computeRollup(parseSpec(d))["vision"]).toBe("planned");
  });
});

describe("computeCompleteness", () => {
  const questions: Question[] = [
    { id: "problem-statement", stage: "problem", importance: "P0", prompt: "무엇이 문제인가요?", examples: [], kind: "text", choices: [] },
    { id: "scope-mvp", stage: "scope", importance: "P0", prompt: "MVP 범위는?", examples: [], kind: "list", choices: [] },
    { id: "risks-main", stage: "risks", importance: "P2", prompt: "가장 큰 리스크는?", examples: [], kind: "text", choices: [] },
    { id: "users-who", stage: "users", importance: "P1", prompt: "누가 쓰나요?", examples: [], kind: "text", choices: [] },
    {
      id: "users-detail",
      stage: "users",
      importance: "P1",
      prompt: "더 자세히?",
      examples: [],
      kind: "text",
      choices: [],
      when: { questionId: "users-who" },
    },
  ];

  it("tallies by importance and flags review items", () => {
    const c = computeCompleteness(questions, parseSpec(example()));
    expect(c.byImportance.P0).toEqual({ total: 2, resolved: 2, skipped: 0, open: 0 });
    expect(c.byImportance.P2).toEqual({ total: 1, resolved: 0, skipped: 1, open: 0 });
    expect(c.byImportance.P1.open).toBe(1); // users-who is open
    expect(c.needsReview).toEqual(["scope-mvp"]);
  });

  it("hides conditional questions until their condition is met", () => {
    const c = computeCompleteness(questions, parseSpec(example()));
    expect(c.byImportance.P1.total).toBe(1); // users-detail not counted
  });

  it("lists skipped and open P0 questions as missing", () => {
    const d = example();
    d.answers = d.answers!.filter((a) => a.questionId !== "problem-statement");
    const c = computeCompleteness(questions, parseSpec(d));
    expect(c.missingP0).toEqual(["problem-statement"]);
  });
});
