import type { Importance } from "./common.js";
import {
  RESOLVED_STATES,
  type Answer,
  type AnswerValue,
  type Question,
} from "./questions.js";
import type { ProjectSpec } from "./spec.js";

export interface ImportanceTally {
  total: number;
  /** answered, ai_decided or user_edited */
  resolved: number;
  /** skipped and not yet filled in by an agent */
  skipped: number;
  /** no answer record at all */
  open: number;
}

export interface Completeness {
  byImportance: Record<Importance, ImportanceTally>;
  /** P0 questions that are open or skipped; export should warn about these. */
  missingP0: string[];
  /** ai_decided answers the user has not reviewed yet. */
  needsReview: string[];
}

function sameValue(a: AnswerValue | undefined, b: AnswerValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A question with a `when` condition only counts once its condition holds. */
export function isVisible(q: Question, answers: Map<string, Answer>): boolean {
  if (!q.when) return true;
  const dep = answers.get(q.when.questionId);
  if (!dep || !RESOLVED_STATES.includes(dep.state)) return false;
  return q.when.equals === undefined || sameValue(dep.value, q.when.equals);
}

export function computeCompleteness(questions: Question[], spec: ProjectSpec): Completeness {
  const answers = new Map(spec.answers.map((a) => [a.questionId, a] as const));
  const empty = (): ImportanceTally => ({ total: 0, resolved: 0, skipped: 0, open: 0 });
  const byImportance: Record<Importance, ImportanceTally> = {
    P0: empty(),
    P1: empty(),
    P2: empty(),
  };
  const missingP0: string[] = [];

  for (const q of questions) {
    if (!isVisible(q, answers)) continue;
    const tally = byImportance[q.importance];
    tally.total++;

    const a = answers.get(q.id);
    if (!a) {
      tally.open++;
      if (q.importance === "P0") missingP0.push(q.id);
    } else if (a.state === "skipped") {
      tally.skipped++;
      if (q.importance === "P0") missingP0.push(q.id);
    } else {
      tally.resolved++;
    }
  }

  const needsReview = spec.answers
    .filter((a) => a.state === "ai_decided" && !a.provenance.reviewed)
    .map((a) => a.questionId);

  return { byImportance, missingP0, needsReview };
}
