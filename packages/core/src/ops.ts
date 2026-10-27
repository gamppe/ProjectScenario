import type { Status } from "./common.js";
import { isVisible } from "./completeness.js";
import { QUESTION_BANK, getQuestion } from "./questionBank.js";
import { NodeSchema, type Edge, type Node } from "./nodes.js";
import {
  RESOLVED_STATES,
  type Answer,
  type AnswerValue,
  type Question,
} from "./questions.js";
import { parseSpec, type ProjectSpec } from "./spec.js";

/**
 * Pure state transitions on a ProjectSpec. Every operation returns a new,
 * fully re-validated spec and never mutates its input.
 */

const nowIso = () => new Date().toISOString();

function change(spec: ProjectSpec, mutate: (draft: ProjectSpec) => void): ProjectSpec {
  const draft = structuredClone(spec);
  mutate(draft);
  return parseSpec(draft);
}

function requireQuestion(id: string): Question {
  const q = getQuestion(id);
  if (!q) throw new Error(`unknown question "${id}"`);
  return q;
}

/** Turn raw CLI/GUI text into the value type a question expects. */
export function coerceValue(q: Question, raw: string): AnswerValue {
  const text = raw.trim();
  switch (q.kind) {
    case "boolean": {
      if (/^(true|yes|y|1|예|네|응)$/i.test(text)) return true;
      if (/^(false|no|n|0|아니오|아니요|아니)$/i.test(text)) return false;
      throw new Error(`"${raw}" is not a yes/no value`);
    }
    case "list":
    case "multi": {
      const items = text.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      if (q.kind === "multi" && q.choices.length > 0) {
        const allowed = new Set(q.choices.map((c) => c.value));
        const bad = items.filter((i) => !allowed.has(i));
        if (bad.length) throw new Error(`invalid choice(s): ${bad.join(", ")}`);
      }
      return items;
    }
    case "choice": {
      if (q.choices.length > 0 && !q.choices.some((c) => c.value === text)) {
        throw new Error(
          `"${text}" is not a valid choice; use one of: ${q.choices.map((c) => c.value).join(", ")}`,
        );
      }
      return text;
    }
    default:
      return text;
  }
}

export function setStatus(spec: ProjectSpec, nodeId: string, status: Status): ProjectSpec {
  return change(spec, (d) => {
    const n = d.nodes.find((x) => x.id === nodeId);
    if (!n) throw new Error(`unknown node "${nodeId}"`);
    n.status = status;
  });
}

export function addNode(
  spec: ProjectSpec,
  node: unknown,
  opts: { parentId?: string } = {},
): ProjectSpec {
  const parsed: Node = NodeSchema.parse(node);
  return change(spec, (d) => {
    d.nodes.push(parsed);
    if (opts.parentId) d.edges.push({ from: opts.parentId, to: parsed.id, kind: "contains" });
  });
}

/**
 * Edit a node's content (title, summary, type-specific fields). The patch is
 * merged and the result re-validated against the node's schema. Changing
 * content that an agent wrote makes it the user's: the AI mark is dropped.
 * `id`, `type`, `status` and `position` cannot be changed here.
 */
export function updateNode(spec: ProjectSpec, nodeId: string, patch: Record<string, unknown>): ProjectSpec {
  return change(spec, (d) => {
    const i = d.nodes.findIndex((n) => n.id === nodeId);
    if (i < 0) throw new Error(`unknown node "${nodeId}"`);
    const prev = d.nodes[i]!;
    const { id: _id, type: _type, status: _status, position: _pos, ...content } = patch;
    const next: Record<string, unknown> = { ...prev, ...content };
    if (Object.keys(content).length > 0 && prev.provenance?.source === "ai") delete next.provenance;
    d.nodes[i] = NodeSchema.parse(next);
  });
}

/** The user accepts an agent-created node as it is. */
export function reviewNode(spec: ProjectSpec, nodeId: string): ProjectSpec {
  return change(spec, (d) => {
    const n = d.nodes.find((x) => x.id === nodeId);
    if (!n) throw new Error(`unknown node "${nodeId}"`);
    if (n.provenance) n.provenance.reviewed = true;
  });
}

export function setPosition(spec: ProjectSpec, nodeId: string, pos: { x: number; y: number }): ProjectSpec {
  return change(spec, (d) => {
    const n = d.nodes.find((x) => x.id === nodeId);
    if (!n) throw new Error(`unknown node "${nodeId}"`);
    n.position = { x: Math.round(pos.x), y: Math.round(pos.y) };
  });
}

/** Forget every saved position so the diagram re-lays itself out. */
export function clearPositions(spec: ProjectSpec): ProjectSpec {
  return change(spec, (d) => {
    for (const n of d.nodes) delete n.position;
  });
}

export function removeEdge(spec: ProjectSpec, edge: Pick<Edge, "from" | "to" | "kind">): ProjectSpec {
  return change(spec, (d) => {
    const before = d.edges.length;
    d.edges = d.edges.filter((e) => !(e.from === edge.from && e.to === edge.to && e.kind === edge.kind));
    if (d.edges.length === before) throw new Error(`no ${edge.kind} edge ${edge.from} -> ${edge.to}`);
  });
}

/** An id like "feat-3" that no node uses yet. */
export function uniqueNodeId(spec: ProjectSpec, base: string): string {
  const used = new Set(spec.nodes.map((n) => n.id));
  for (let i = 1; ; i++) {
    const id = `${base}-${i}`;
    if (!used.has(id)) return id;
  }
}

export function renameProject(spec: ProjectSpec, name: string): ProjectSpec {
  return change(spec, (d) => {
    if (!name.trim()) throw new Error("project name cannot be empty");
    d.project.name = name.trim();
  });
}

export function setOutputLanguage(spec: ProjectSpec, lang: "en" | "ko"): ProjectSpec {
  return change(spec, (d) => {
    d.project.outputLanguage = lang;
  });
}

export function addEdge(spec: ProjectSpec, edge: Edge): ProjectSpec {
  return change(spec, (d) => {
    d.edges.push(edge);
  });
}

export function removeNode(spec: ProjectSpec, nodeId: string): ProjectSpec {
  return change(spec, (d) => {
    if (!d.nodes.some((n) => n.id === nodeId)) throw new Error(`unknown node "${nodeId}"`);
    d.nodes = d.nodes.filter((n) => n.id !== nodeId);
    d.edges = d.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    for (const a of d.answers) a.nodeIds = a.nodeIds.filter((id) => id !== nodeId);
  });
}

function upsertAnswer(draft: ProjectSpec, next: Answer, at: string): void {
  const i = draft.answers.findIndex((a) => a.questionId === next.questionId);
  if (i >= 0) {
    const prev = draft.answers[i]!;
    next.history = [
      ...prev.history,
      { state: prev.state, value: prev.value, source: prev.provenance.source, at },
    ];
    next.nodeIds = next.nodeIds.length ? next.nodeIds : prev.nodeIds;
    draft.answers[i] = next;
  } else {
    draft.answers.push(next);
  }
}

/**
 * Record the user's own answer. If the question previously held an
 * AI-decided value, the result is "user_edited" (and the AI mark goes away).
 */
export function answerQuestion(
  spec: ProjectSpec,
  questionId: string,
  value: AnswerValue,
  opts: { nodeIds?: string[]; at?: string } = {},
): ProjectSpec {
  requireQuestion(questionId);
  const at = opts.at ?? nowIso();
  return change(spec, (d) => {
    const prev = d.answers.find((a) => a.questionId === questionId);
    // Replacing an AI value is an edit; everything else keeps/starts as the user's answer.
    const state = prev?.state === "ai_decided" || prev?.state === "user_edited" ? "user_edited" : "answered";
    upsertAnswer(
      d,
      {
        questionId,
        state,
        value,
        provenance: { source: "user", reviewed: true, decidedAt: at },
        history: [],
        nodeIds: opts.nodeIds ?? [],
      },
      at,
    );
  });
}

/** The user skips: an agent is expected to decide later. */
export function skipQuestion(spec: ProjectSpec, questionId: string, at = nowIso()): ProjectSpec {
  requireQuestion(questionId);
  return change(spec, (d) => {
    const prev = d.answers.find((a) => a.questionId === questionId);
    if (prev && prev.state !== "skipped") {
      throw new Error(`question "${questionId}" is already ${prev.state}; edit it instead of skipping`);
    }
    if (prev) return;
    d.answers.push({
      questionId,
      state: "skipped",
      provenance: { source: "user", reviewed: false, decidedAt: at },
      history: [],
      nodeIds: [],
    });
  });
}

/** An agent fills a skipped (or still open) question. Always marked as AI. */
export function aiDecide(
  spec: ProjectSpec,
  questionId: string,
  value: AnswerValue,
  rationale: string,
  opts: { confidence?: number; nodeIds?: string[]; at?: string } = {},
): ProjectSpec {
  requireQuestion(questionId);
  if (!rationale.trim()) throw new Error("an AI decision needs a rationale");
  const at = opts.at ?? nowIso();
  return change(spec, (d) => {
    const prev = d.answers.find((a) => a.questionId === questionId);
    if (prev && prev.state !== "skipped") {
      throw new Error(
        `question "${questionId}" is already ${prev.state}; agents may only fill skipped or open questions`,
      );
    }
    upsertAnswer(
      d,
      {
        questionId,
        state: "ai_decided",
        value,
        provenance: {
          source: "ai",
          rationale: rationale.trim(),
          confidence: opts.confidence,
          decidedAt: at,
          reviewed: false,
        },
        history: [],
        nodeIds: opts.nodeIds ?? [],
      },
      at,
    );
  });
}

/** The user confirms an AI decision as-is. */
export function markReviewed(spec: ProjectSpec, questionId: string): ProjectSpec {
  return change(spec, (d) => {
    const a = d.answers.find((x) => x.questionId === questionId);
    if (!a) throw new Error(`no answer for "${questionId}"`);
    a.provenance.reviewed = true;
  });
}

/** Store the output-language translation of an answer (filled by an agent). */
export function setTranslation(spec: ProjectSpec, questionId: string, valueEn: AnswerValue): ProjectSpec {
  return change(spec, (d) => {
    const a = d.answers.find((x) => x.questionId === questionId);
    if (!a) throw new Error(`no answer for "${questionId}"`);
    a.valueEn = valueEn;
  });
}

/** Visible questions that have no answer record yet, in bank (stage) order. */
export function openQuestions(spec: ProjectSpec, bank: Question[] = QUESTION_BANK): Question[] {
  const answers = new Map(spec.answers.map((a) => [a.questionId, a] as const));
  return bank.filter((q) => isVisible(q, answers) && !answers.has(q.id));
}

/** Skipped questions waiting for an agent to decide. */
export function skippedQuestions(spec: ProjectSpec, bank: Question[] = QUESTION_BANK): Question[] {
  const skipped = new Set(spec.answers.filter((a) => a.state === "skipped").map((a) => a.questionId));
  return bank.filter((q) => skipped.has(q.id));
}

/** AI-decided answers the user has not reviewed. */
export function reviewQueue(spec: ProjectSpec): Answer[] {
  return spec.answers.filter((a) => a.state === "ai_decided" && !a.provenance.reviewed);
}

/** Answered questions whose translation is still missing (for outputLanguage "en"). */
export function untranslated(spec: ProjectSpec): Answer[] {
  return spec.answers.filter(
    (a) => RESOLVED_STATES.includes(a.state) && a.value !== undefined && a.valueEn === undefined,
  );
}

/** Empty project with just a name. */
export function createSpec(name: string, outputLanguage: "en" | "ko" = "en"): ProjectSpec {
  return parseSpec({
    schemaVersion: 1,
    project: { name, outputLanguage, createdAt: nowIso() },
    nodes: [],
    edges: [],
    answers: [],
  });
}
