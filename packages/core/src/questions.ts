import { z } from "zod";
import { IdSchema, ImportanceSchema, ProvenanceSchema, SourceSchema } from "./common.js";

/** The 14 planning stages from the brief, in order. */
export const STAGES = [
  { id: "problem", label: "문제 정의" },
  { id: "users", label: "사용자 정의" },
  { id: "competition", label: "경쟁 조사" },
  { id: "scope", label: "범위 설정" },
  { id: "stories", label: "사용자 스토리" },
  { id: "ia", label: "정보 구조" },
  { id: "flows", label: "사용자 플로우" },
  { id: "wireframes", label: "와이어프레임" },
  { id: "interactions", label: "상호작용 정의" },
  { id: "data", label: "데이터/API" },
  { id: "stack", label: "기술 스택/아키텍처" },
  { id: "design_system", label: "디자인 시스템" },
  { id: "tasks", label: "로드맵/태스크 분해" },
  { id: "risks", label: "리스크/가정" },
] as const;

export const StageIdSchema = z.enum([
  "problem",
  "users",
  "competition",
  "scope",
  "stories",
  "ia",
  "flows",
  "wireframes",
  "interactions",
  "data",
  "stack",
  "design_system",
  "tasks",
  "risks",
]);
export type StageId = z.infer<typeof StageIdSchema>;

export const AnswerValueSchema = z.union([z.string(), z.boolean(), z.array(z.string())]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/** Shown only when another question has been answered (optionally with a given value). */
export const QuestionConditionSchema = z.object({
  questionId: IdSchema,
  equals: AnswerValueSchema.optional(),
});

/**
 * A question from the question bank. The bank is static content shipped with
 * core; it is NOT stored in project.json. Only answers are.
 */
export const QuestionSchema = z.object({
  id: IdSchema,
  stage: StageIdSchema,
  importance: ImportanceSchema,
  /** Korean prompt shown in the UI. */
  prompt: z.string().min(1),
  hint: z.string().optional(),
  examples: z.array(z.string()).default([]),
  kind: z.enum(["text", "choice", "multi", "boolean", "list"]).default("text"),
  choices: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
  when: QuestionConditionSchema.optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const ANSWER_STATES = ["answered", "skipped", "ai_decided", "user_edited"] as const;
export const AnswerStateSchema = z.enum(ANSWER_STATES);
export type AnswerState = z.infer<typeof AnswerStateSchema>;

export const AnswerHistoryEntrySchema = z.object({
  state: AnswerStateSchema,
  value: AnswerValueSchema.optional(),
  source: SourceSchema,
  at: z.string().datetime(),
});

/**
 * One answer record per question. No record means the question is still open.
 *  - skipped:     no value; the user delegated the decision to an agent
 *  - ai_decided:  agent filled a skipped question; needs provenance.rationale
 *  - user_edited: the user changed a value (previous values live in history)
 */
export const AnswerSchema = z
  .object({
    questionId: IdSchema,
    state: AnswerStateSchema,
    value: AnswerValueSchema.optional(),
    /** Output-language translation of value; filled by an agent (see brief §7). */
    valueEn: AnswerValueSchema.optional(),
    provenance: ProvenanceSchema,
    history: z.array(AnswerHistoryEntrySchema).default([]),
    /** Nodes created or updated from this answer. */
    nodeIds: z.array(IdSchema).default([]),
  })
  .superRefine((a, ctx) => {
    const fail = (message: string, path: string[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    if (a.state === "skipped" && a.value !== undefined) {
      fail("a skipped answer must not have a value", ["value"]);
    }
    if (a.state !== "skipped" && a.value === undefined) {
      fail(`a ${a.state} answer needs a value`, ["value"]);
    }
    if (a.state === "ai_decided") {
      if (a.provenance.source !== "ai") {
        fail("ai_decided requires provenance.source = ai", ["provenance", "source"]);
      }
      if (!a.provenance.rationale) {
        fail("ai_decided requires provenance.rationale", ["provenance", "rationale"]);
      }
    }
    if (a.state === "answered" && a.provenance.source === "ai") {
      fail("an answered answer cannot come from ai (use ai_decided)", ["provenance", "source"]);
    }
  });
export type Answer = z.infer<typeof AnswerSchema>;

export const RESOLVED_STATES: readonly AnswerState[] = ["answered", "ai_decided", "user_edited"];
