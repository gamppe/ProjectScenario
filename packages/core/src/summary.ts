import type { Status } from "./common.js";
import { computeCompleteness, type ImportanceTally } from "./completeness.js";
import { reviewQueue, skippedQuestions, untranslated } from "./ops.js";
import { QUESTION_BANK } from "./questionBank.js";
import { computeRollup } from "./rollup.js";
import type { ProjectSpec } from "./spec.js";

export interface Summary {
  project: string;
  outputLanguage: "en" | "ko";
  nodes: Record<Status, number>;
  tasks: { done: number; total: number };
  questions: Record<"P0" | "P1" | "P2", ImportanceTally>;
  /** P0 questions that are open or skipped */
  missingRequired: string[];
  /** AI decisions the user has not reviewed */
  needsReview: string[];
  /** skipped questions waiting for an agent to decide */
  skippedWaitingForAgent: string[];
  /** answers without an output-language translation */
  untranslated: string[];
}

/** One-screen overview shared by the CLI, the MCP server and the viewer. */
export function summarizeSpec(spec: ProjectSpec): Summary {
  const rollup = computeRollup(spec);
  const comp = computeCompleteness(QUESTION_BANK, spec);
  const nodes: Record<Status, number> = { planned: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const n of spec.nodes) nodes[rollup[n.id] ?? "planned"]++;
  const tasks = spec.nodes.filter((n) => n.type === "task");

  return {
    project: spec.project.name,
    outputLanguage: spec.project.outputLanguage,
    nodes,
    tasks: { done: tasks.filter((n) => rollup[n.id] === "done").length, total: tasks.length },
    questions: comp.byImportance,
    missingRequired: comp.missingP0,
    needsReview: reviewQueue(spec).map((a) => a.questionId),
    skippedWaitingForAgent: skippedQuestions(spec).map((q) => q.id),
    untranslated: untranslated(spec).map((a) => a.questionId),
  };
}
