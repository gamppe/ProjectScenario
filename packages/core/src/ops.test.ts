import { describe, expect, it } from "vitest";
import {
  QUESTION_BANK,
  aiDecide,
  answerQuestion,
  coerceValue,
  createSpec,
  exportMarkdown,
  getQuestion,
  markReviewed,
  openQuestions,
  reviewQueue,
  setStatus,
  setTranslation,
  skipQuestion,
  skippedQuestions,
  untranslated,
  addNode,
  removeNode,
  addEdge,
  updateNode,
  reviewNode,
  setPosition,
  clearPositions,
  removeEdge,
  uniqueNodeId,
  renameProject,
  setOutputLanguage,
  setFolder,
  moveNodes,
  folderDescendants,
  computeRollup,
  summarizeSpec,
  safeParseSpec,
} from "./index.js";

const base = () => createSpec("Demo");

describe("answer lifecycle", () => {
  it("answered -> stays answered when re-answered by the user", () => {
    let s = answerQuestion(base(), "problem-statement", "A");
    s = answerQuestion(s, "problem-statement", "B");
    const a = s.answers[0]!;
    expect(a.state).toBe("answered");
    expect(a.value).toBe("B");
    expect(a.history).toHaveLength(1);
  });

  it("skip -> ai_decided -> user_edited keeps history and drops the AI mark", () => {
    let s = skipQuestion(base(), "scope-mvp");
    expect(skippedQuestions(s).map((q) => q.id)).toEqual(["scope-mvp"]);

    s = aiDecide(s, "scope-mvp", ["tasks"], "smallest useful product", { confidence: 0.7 });
    expect(s.answers[0]!.state).toBe("ai_decided");
    expect(reviewQueue(s)).toHaveLength(1);

    s = answerQuestion(s, "scope-mvp", ["tasks", "tags"]);
    const a = s.answers[0]!;
    expect(a.state).toBe("user_edited");
    expect(a.provenance.source).toBe("user");
    expect(a.history.map((h) => h.state)).toEqual(["skipped", "ai_decided"]);
    expect(reviewQueue(s)).toHaveLength(0);
  });

  it("refuses to let an agent overwrite a user answer", () => {
    const s = answerQuestion(base(), "problem-statement", "mine");
    expect(() => aiDecide(s, "problem-statement", "theirs", "why")).toThrow(/already answered/);
  });

  it("requires a rationale for AI decisions", () => {
    expect(() => aiDecide(base(), "scope-mvp", ["x"], "  ")).toThrow(/rationale/);
  });

  it("markReviewed clears the review queue without changing the value", () => {
    let s = aiDecide(base(), "scope-mvp", ["x"], "because");
    s = markReviewed(s, "scope-mvp");
    expect(reviewQueue(s)).toHaveLength(0);
    expect(s.answers[0]!.state).toBe("ai_decided");
  });

  it("rejects unknown questions", () => {
    expect(() => answerQuestion(base(), "nope", "x")).toThrow(/unknown question/);
  });

  it("does not mutate its input", () => {
    const s = base();
    answerQuestion(s, "problem-statement", "x");
    expect(s.answers).toHaveLength(0);
  });
});

describe("question listing", () => {
  it("hides conditional questions until the condition is answered", () => {
    let s = base();
    expect(openQuestions(s).some((q) => q.id === "users-jobs")).toBe(false);
    s = answerQuestion(s, "users-who", ["devs"]);
    expect(openQuestions(s).some((q) => q.id === "users-jobs")).toBe(true);
  });

  it("answered questions leave the open list", () => {
    const before = openQuestions(base()).length;
    const after = openQuestions(answerQuestion(base(), "problem-statement", "x")).length;
    expect(after).toBe(before - 1);
  });
});

describe("coerceValue", () => {
  it("parses booleans, lists and choices", () => {
    expect(coerceValue(getQuestion("ia-auth")!, "예")).toBe(true);
    expect(coerceValue(getQuestion("scope-mvp")!, "a; b ;c")).toEqual(["a", "b", "c"]);
    expect(coerceValue(getQuestion("data-storage")!, "sqlite")).toBe("sqlite");
  });

  it("rejects invalid choices and booleans", () => {
    expect(() => coerceValue(getQuestion("data-storage")!, "tape")).toThrow(/valid choice/);
    expect(() => coerceValue(getQuestion("ia-auth")!, "maybe")).toThrow(/yes\/no/);
    expect(() => coerceValue(getQuestion("interactions-states")!, "loading;weird")).toThrow(/invalid/);
  });
});

describe("node ops", () => {
  it("adds, links, updates and removes nodes", () => {
    let s = addNode(base(), { id: "vision", type: "vision", title: "V" });
    s = addNode(s, { id: "feat-a", type: "feature", title: "A" }, { parentId: "vision" });
    s = setStatus(s, "feat-a", "done");
    expect(s.edges).toHaveLength(1);
    s = removeNode(s, "feat-a");
    expect(s.nodes).toHaveLength(1);
    expect(s.edges).toHaveLength(0);
  });

  it("rejects edges to missing nodes", () => {
    const s = addNode(base(), { id: "vision", type: "vision", title: "V" });
    expect(() => addEdge(s, { from: "vision", to: "ghost", kind: "relates" })).toThrow();
  });
});

describe("node editing", () => {
  const withAi = () =>
    addNode(base(), {
      id: "feat-ai",
      type: "feature",
      title: "Idea",
      provenance: { source: "ai", rationale: "implied", reviewed: false },
    });

  it("editing an AI node's content makes it the user's", () => {
    const s = updateNode(withAi(), "feat-ai", { title: "My idea", priority: "must" });
    const n = s.nodes[0]!;
    expect(n.title).toBe("My idea");
    expect(n.provenance).toBeUndefined();
  });

  it("changing only status or position keeps the AI mark", () => {
    let s = setStatus(withAi(), "feat-ai", "done");
    s = setPosition(s, "feat-ai", { x: 10.4, y: 20.6 });
    expect(s.nodes[0]!.provenance?.source).toBe("ai");
    expect(s.nodes[0]!.position).toEqual({ x: 10, y: 21 });
  });

  it("reviewNode keeps the node but clears the review flag", () => {
    const s = reviewNode(withAi(), "feat-ai");
    expect(s.nodes[0]!.provenance).toMatchObject({ source: "ai", reviewed: true });
  });

  it("refuses patches that break the node schema and cannot change type or id", () => {
    expect(() => updateNode(withAi(), "feat-ai", { priority: "sometimes" })).toThrow();
    const s = updateNode(withAi(), "feat-ai", { id: "other", type: "task", title: "T" });
    expect(s.nodes[0]).toMatchObject({ id: "feat-ai", type: "feature", title: "T" });
  });

  it("can clear positions for one diagram only", () => {
    let s = addNode(base(), { id: "folder-1", type: "folder", title: "F" });
    s = addNode(s, { id: "a-1", type: "feature", title: "A", folderId: "folder-1" });
    s = addNode(s, { id: "b-1", type: "feature", title: "B" });
    for (const id of ["folder-1", "a-1", "b-1"]) s = setPosition(s, id, { x: 5, y: 5 });
    const main = clearPositions(s, null);
    expect(main.nodes.find((n) => n.id === "b-1")!.position).toBeUndefined();
    expect(main.nodes.find((n) => n.id === "folder-1")!.position).toBeUndefined();
    expect(main.nodes.find((n) => n.id === "a-1")!.position).toEqual({ x: 5, y: 5 }); // inside the folder: untouched
    const inner = clearPositions(s, "folder-1");
    expect(inner.nodes.find((n) => n.id === "a-1")!.position).toBeUndefined();
    expect(inner.nodes.find((n) => n.id === "b-1")!.position).toEqual({ x: 5, y: 5 });
    expect(clearPositions(s).nodes.every((n) => n.position === undefined)).toBe(true);
  });

  it("clears positions, removes edges, makes unique ids, renames the project", () => {
    let s = addNode(base(), { id: "a-1", type: "feature", title: "A" });
    s = addNode(s, { id: "b-1", type: "feature", title: "B" });
    s = setPosition(s, "a-1", { x: 1, y: 2 });
    expect(clearPositions(s).nodes.every((n) => n.position === undefined)).toBe(true);
    s = addEdge(s, { from: "a-1", to: "b-1", kind: "relates" });
    expect(removeEdge(s, { from: "a-1", to: "b-1", kind: "relates" }).edges).toHaveLength(0);
    expect(() => removeEdge(s, { from: "b-1", to: "a-1", kind: "relates" })).toThrow();
    expect(uniqueNodeId(s, "a")).toBe("a-2");
    expect(uniqueNodeId(s, "z")).toBe("z-1");
    expect(renameProject(s, " New ").project.name).toBe("New");
    expect(setOutputLanguage(s, "ko").project.outputLanguage).toBe("ko");
  });
});

describe("folders", () => {
  const withFolder = () => {
    let s = addNode(base(), { id: "folder-1", type: "folder", title: "Auth" });
    s = addNode(s, { id: "screen-a", type: "screen", title: "Login" });
    s = addNode(s, { id: "screen-b", type: "screen", title: "Signup" });
    return s;
  };

  it("keeps nodes in a folder and takes them out again", () => {
    let s = setFolder(withFolder(), "screen-a", "folder-1");
    expect(s.nodes.find((n) => n.id === "screen-a")!.folderId).toBe("folder-1");
    s = setFolder(s, "screen-a", undefined);
    expect(s.nodes.find((n) => n.id === "screen-a")!.folderId).toBeUndefined();
  });

  it("rejects unknown folders, non-folders and loops", () => {
    expect(() => setFolder(withFolder(), "screen-a", "ghost")).toThrow(/unknown folder/);
    expect(() => setFolder(withFolder(), "screen-a", "screen-b")).toThrow(/not a folder/);
    let s = addNode(withFolder(), { id: "folder-2", type: "folder", title: "Inner" });
    s = setFolder(s, "folder-2", "folder-1");
    expect(() => setFolder(s, "folder-1", "folder-2")).toThrow(/cycle/);
    expect(() => setFolder(s, "folder-1", "folder-1")).toThrow();
  });

  it("deleting a folder keeps its contents", () => {
    let s = setFolder(withFolder(), "screen-a", "folder-1");
    s = removeNode(s, "folder-1");
    expect(s.nodes.map((n) => n.id)).toEqual(["screen-a", "screen-b"]);
    expect(s.nodes[0]!.folderId).toBeUndefined();
  });

  it("finds nested members and moves them together", () => {
    let s = addNode(withFolder(), { id: "folder-2", type: "folder", title: "Inner" });
    s = setFolder(s, "folder-2", "folder-1");
    s = setFolder(s, "screen-a", "folder-2");
    s = setFolder(s, "screen-b", "folder-1");
    expect(folderDescendants(s, "folder-1").sort()).toEqual(["folder-2", "screen-a", "screen-b"]);
    s = moveNodes(s, { "folder-1": { x: 10.4, y: 20 }, "screen-a": { x: 30, y: 40 } });
    expect(s.nodes.find((n) => n.id === "screen-a")!.position).toEqual({ x: 30, y: 40 });
    expect(s.nodes.find((n) => n.id === "folder-1")!.position).toEqual({ x: 10, y: 20 });
    expect(() => moveNodes(s, { ghost: { x: 0, y: 0 } })).toThrow(/unknown node/);
  });

  it("a folder takes the status of what is inside, members do not inherit", () => {
    let s = withFolder();
    s = setFolder(setFolder(s, "screen-a", "folder-1"), "screen-b", "folder-1");
    expect(computeRollup(s)["folder-1"]).toBe("planned");
    s = setStatus(s, "screen-a", "done");
    expect(computeRollup(s)["folder-1"]).toBe("in_progress");
    s = setStatus(s, "screen-b", "blocked");
    expect(computeRollup(s)["folder-1"]).toBe("blocked");
    expect(computeRollup(s)["screen-a"]).toBe("done");
  });

  it("folders are not counted as work items and do not break the md export", () => {
    const s = setFolder(withFolder(), "screen-a", "folder-1");
    const total = Object.values(summarizeSpec(s).nodes).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
    expect(() => exportMarkdown(s)).not.toThrow();
  });

  it("rejects a hand-edited file whose folderId points nowhere", () => {
    const raw = JSON.parse(JSON.stringify(withFolder()));
    raw.nodes[1].folderId = "nope";
    expect(safeParseSpec(raw).success).toBe(false);
  });
});

describe("translations", () => {
  it("tracks untranslated answers and stores valueEn", () => {
    let s = answerQuestion(base(), "problem-statement", "문제");
    expect(untranslated(s)).toHaveLength(1);
    s = setTranslation(s, "problem-statement", "problem");
    expect(untranslated(s)).toHaveLength(0);
  });
});

describe("exportMarkdown", () => {
  it("produces the five deliverables for an empty project", () => {
    const files = exportMarkdown(base());
    expect(Object.keys(files).sort()).toEqual(["AGENTS.md", "FLOWS.md", "PRD.md", "SCREENS.md", "TASKS.md"]);
    expect(files["PRD.md"]).toContain("Demo");
  });

  it("marks AI-decided answers and lists them as awaiting review", () => {
    let s = aiDecide(base(), "stack-conventions", ["no any"], "common default for TypeScript");
    const files = exportMarkdown(s);
    expect(files["AGENTS.md"]).toContain("AI-decided, not yet reviewed");
    expect(files["AGENTS.md"]).toContain("common default for TypeScript");
    expect(files["PRD.md"]).toContain("`stack-conventions`");

    s = markReviewed(s, "stack-conventions");
    expect(exportMarkdown(s)["AGENTS.md"]).not.toContain("not yet reviewed");
  });

  it("prefers the English translation when outputLanguage is en", () => {
    let s = answerQuestion(base(), "stack-conventions", "any 금지");
    s = setTranslation(s, "stack-conventions", "No any");
    expect(exportMarkdown(s)["AGENTS.md"]).toContain("No any");
    expect(exportMarkdown(s)["AGENTS.md"]).not.toContain("any 금지");
  });

  it("warns about untranslated answers in English output", () => {
    const s = answerQuestion(base(), "stack-conventions", "any 금지");
    expect(exportMarkdown(s)["AGENTS.md"]).toContain("no English translation");
  });

  it("renders Korean headings when outputLanguage is ko", () => {
    const s = createSpec("데모", "ko");
    expect(exportMarkdown(s)["PRD.md"]).toContain("제품 요구사항");
  });

  it("writes requirements in Korean without the English sentence frame", () => {
    const story = {
      id: "story-1",
      type: "story",
      title: "할 일 추가",
      asA: "혼자 일하는 사용자",
      iWant: "키 하나로 할 일을 추가하기",
      soThat: "생각이 끊기지 않게",
      acceptance: [{ given: "목록 화면에서", when: "Enter를 누르면", then: "맨 위에 추가된다" }],
    };
    const ko = exportMarkdown(addNode(createSpec("데모", "ko"), story))["PRD.md"]!;
    expect(ko).toContain("## 요구사항");
    expect(ko).toContain("- 누가: 혼자 일하는 사용자");
    expect(ko).toContain("- 원하는 일: 키 하나로 할 일을 추가하기");
    expect(ko).toContain("상황: 목록 화면에서 → 행동: Enter를 누르면 → 결과: 맨 위에 추가된다");
    expect(ko).not.toContain("As a");
    expect(ko).not.toContain("Given");

    const en = exportMarkdown(addNode(createSpec("Demo", "en"), story))["PRD.md"]!;
    expect(en).toContain("## Requirements");
    expect(en).toContain("As a 혼자 일하는 사용자, I want");
  });

  it("puts the personal-data answer under the rules and constraints in AGENTS.md", () => {
    const s = answerQuestion(base(), "security-personal-data", "비밀번호는 암호화해서 저장한다");
    expect(exportMarkdown(s)["AGENTS.md"]).toContain("비밀번호는 암호화해서 저장한다");
  });

  it("builds a mermaid graph and task checklist from the example shape", () => {
    let s = base();
    s = addNode(s, { id: "screen-a", type: "screen", title: "A" });
    s = addNode(s, { id: "screen-b", type: "screen", title: "B" });
    s = addEdge(s, { from: "screen-a", to: "screen-b", kind: "navigates", label: "Next" });
    s = addNode(s, { id: "task-one", type: "task", title: "One", order: 1, doneWhen: ["it works"] });
    s = setStatus(s, "task-one", "done");
    const files = exportMarkdown(s);
    expect(files["FLOWS.md"]).toContain("flowchart LR");
    expect(files["FLOWS.md"]).toContain('|"Next"|');
    expect(files["TASKS.md"]).toContain("- [x] **One**");
    expect(files["TASKS.md"]).toContain("it works");
  });

  it("covers every question id used by the exporter", () => {
    const ids = new Set(QUESTION_BANK.map((q) => q.id));
    for (const id of [
      "problem-statement", "problem-goals", "scope-nongoals", "users-who", "scope-mvp",
      "risks-assumptions", "ia-screens", "interactions-states", "flows-main", "tasks-order",
      "stack-platform", "stack-language", "data-storage", "stack-conventions",
      "stack-constraints", "stack-testing", "security-personal-data",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});
