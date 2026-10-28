import { describe, expect, it } from "vitest";
import {
  QUESTION_BANK,
  STAGES,
  answerPreview,
  getQuestion,
  questionLabel,
  questionsForStage,
} from "./index.js";

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

  it("gives every question a short name that fits a narrow list", () => {
    for (const q of QUESTION_BANK) {
      expect(q.short, `${q.id} needs a short name`).toBeTruthy();
      expect(q.short!.length, `${q.id}: "${q.short}"`).toBeLessThanOrEqual(12);
    }
  });

  it("previews answers with at most 20 characters", () => {
    expect(answerPreview("짧은 답")).toBe("짧은 답");
    expect(answerPreview("가".repeat(25))).toBe(`${"가".repeat(20)}…`);
    expect(answerPreview("줄\n바꿈   공백")).toBe("줄 바꿈 공백");
    expect(answerPreview(["a", "b"])).toBe("a, b");
    expect(answerPreview(true)).toBe("예");
    expect(answerPreview(undefined)).toBe("");
  });

  it("falls back to the prompt when a question has no short name", () => {
    const q = { ...getQuestion("problem-statement")!, short: undefined };
    expect(questionLabel(q)).toBe(`${q.prompt.slice(0, 14)}…`);
    expect(questionLabel(getQuestion("problem-statement")!)).toBe("해결할 문제");
  });

  it("has the questions that were split, added or removed in the copy review", () => {
    expect(getQuestion("wireframes-key-screen")).toBeUndefined();
    // each half of a split question only shows once its first half is answered
    expect(getQuestion("tasks-first-done")!.when).toEqual({ questionId: "tasks-first" });
    expect(getQuestion("data-fields")!.when).toEqual({ questionId: "data-entities" });
    expect(getQuestion("security-personal-data")).toMatchObject({ stage: "stack", importance: "P1" });
    // frequency is deliberately not asked, and mood lives in design-tone rather than wireframes-style
    expect(getQuestion("users-frequency")).toBeUndefined();
    expect(getQuestion("wireframes-style")!.choices.map((c) => c.value)).toEqual(["minimal", "dense"]);
  });

  it("uses the agreed terms in stage names and nothing of the old ones", () => {
    const names = STAGES.map((s) => s.label).join("|");
    for (const wanted of ["요구사항", "사용 흐름", "화면 동작", "화면 구성", "기술 선택", "위험과 가정"]) {
      expect(names, wanted).toContain(wanted);
    }
    for (const old of ["스토리", "플로우", "상호작용", "와이어프레임", "리스크", "태스크"]) {
      expect(names, old).not.toContain(old);
    }
  });

  it("keeps the ids used by the example project", () => {
    for (const id of ["problem-statement", "scope-mvp", "risks-main"]) {
      expect(getQuestion(id), id).toBeDefined();
    }
  });
});
