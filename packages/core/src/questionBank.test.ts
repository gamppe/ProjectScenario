import { describe, expect, it } from "vitest";
import { QUESTION_BANK, STAGES, getQuestion, questionsForStage } from "./index.js";

describe("question bank", () => {
  it("has unique ids", () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every planning stage", () => {
    for (const s of STAGES) {
      expect(questionsForStage(s.id).length, `stage ${s.id}`).toBeGreaterThan(0);
    }
  });

  it("has at least one P0 question in the core stages", () => {
    for (const stage of ["problem", "scope", "ia", "flows", "interactions", "data", "stack", "tasks"] as const) {
      const p0 = questionsForStage(stage).filter((q) => q.importance === "P0");
      expect(p0.length, `stage ${stage}`).toBeGreaterThan(0);
    }
  });

  it("only references existing questions in `when`, defined earlier in the bank", () => {
    QUESTION_BANK.forEach((q, i) => {
      if (!q.when) return;
      const depIndex = QUESTION_BANK.findIndex((d) => d.id === q.when!.questionId);
      expect(depIndex, `${q.id} depends on ${q.when.questionId}`).toBeGreaterThanOrEqual(0);
      expect(depIndex, `${q.id} must come after its dependency`).toBeLessThan(i);
    });
  });

  it("gives choice/multi questions at least two choices", () => {
    for (const q of QUESTION_BANK.filter((x) => x.kind === "choice" || x.kind === "multi")) {
      expect(q.choices.length, q.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the ids used by the example project", () => {
    for (const id of ["problem-statement", "scope-mvp", "risks-main"]) {
      expect(getQuestion(id), id).toBeDefined();
    }
  });
});
