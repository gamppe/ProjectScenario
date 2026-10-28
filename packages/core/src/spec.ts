import { z } from "zod";
import { SCHEMA_VERSION } from "./common.js";
import { EdgeSchema, NodeSchema, type Edge, type EdgeKind } from "./nodes.js";
import { AnswerSchema } from "./questions.js";

export const ProjectMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** Language of generated md files. Questions in the UI are always Korean. */
  outputLanguage: z.enum(["en", "ko"]).default("en"),
  createdAt: z.string().datetime().optional(),
});

const ProjectSpecShape = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  project: ProjectMetaSchema,
  nodes: z.array(NodeSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  answers: z.array(AnswerSchema).default([]),
});

/** Kinds that must not form a cycle. */
const ACYCLIC_KINDS: EdgeKind[] = ["contains", "depends_on"];

function findCycle(edges: Edge[], kind: EdgeKind): string[] | null {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== kind) continue;
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  }
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const n of next.get(id) ?? []) {
      if (state.get(n) === 1) return [...stack.slice(stack.indexOf(n)), n];
      if (!state.has(n)) {
        const found = visit(n);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const id of next.keys()) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

export const ProjectSpecSchema = ProjectSpecShape.superRefine((spec, ctx) => {
  const fail = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

  const ids = new Set<string>();
  spec.nodes.forEach((n, i) => {
    if (ids.has(n.id)) fail(`duplicate node id "${n.id}"`, ["nodes", i, "id"]);
    ids.add(n.id);
  });

  // folders: membership must point at an existing folder, never at the node itself, never in a loop
  const byId = new Map(spec.nodes.map((n) => [n.id, n] as const));
  spec.nodes.forEach((n, i) => {
    if (!n.folderId) return;
    const folder = byId.get(n.folderId);
    if (!folder) fail(`node "${n.id}" is in unknown folder "${n.folderId}"`, ["nodes", i, "folderId"]);
    else if (folder.type !== "folder") fail(`"${n.folderId}" is not a folder`, ["nodes", i, "folderId"]);
    else if (n.id === n.folderId) fail(`folder "${n.id}" cannot contain itself`, ["nodes", i, "folderId"]);
  });
  spec.nodes.forEach((n, i) => {
    const seen = new Set([n.id]);
    for (let cur = n.folderId; cur; cur = byId.get(cur)?.folderId) {
      if (seen.has(cur)) {
        fail(`folders form a cycle through "${cur}"`, ["nodes", i, "folderId"]);
        break;
      }
      seen.add(cur);
    }
  });

  const seenEdges = new Set<string>();
  const parentOf = new Map<string, string>();
  spec.edges.forEach((e, i) => {
    if (!ids.has(e.from)) fail(`edge from unknown node "${e.from}"`, ["edges", i, "from"]);
    if (!ids.has(e.to)) fail(`edge to unknown node "${e.to}"`, ["edges", i, "to"]);
    if (e.from === e.to) fail(`edge "${e.from}" points to itself`, ["edges", i]);

    const key = `${e.kind}:${e.from}>${e.to}`;
    if (seenEdges.has(key)) fail(`duplicate edge ${key}`, ["edges", i]);
    seenEdges.add(key);

    if (e.kind === "contains") {
      const prev = parentOf.get(e.to);
      if (prev !== undefined) {
        fail(`node "${e.to}" has two parents ("${prev}" and "${e.from}")`, ["edges", i, "to"]);
      }
      parentOf.set(e.to, e.from);
    }
  });

  for (const kind of ACYCLIC_KINDS) {
    const cycle = findCycle(spec.edges, kind);
    if (cycle) fail(`"${kind}" edges form a cycle: ${cycle.join(" -> ")}`, ["edges"]);
  }

  const seenAnswers = new Set<string>();
  spec.answers.forEach((a, i) => {
    if (seenAnswers.has(a.questionId)) {
      fail(`duplicate answer for question "${a.questionId}"`, ["answers", i, "questionId"]);
    }
    seenAnswers.add(a.questionId);
    a.nodeIds.forEach((id, j) => {
      if (!ids.has(id)) fail(`answer references unknown node "${id}"`, ["answers", i, "nodeIds", j]);
    });
  });
});

export type ProjectSpec = z.infer<typeof ProjectSpecSchema>;
export type ProjectSpecInput = z.input<typeof ProjectSpecSchema>;

/** Parse and validate; throws a ZodError listing every problem. */
export function parseSpec(data: unknown): ProjectSpec {
  return ProjectSpecSchema.parse(data);
}

export function safeParseSpec(data: unknown) {
  return ProjectSpecSchema.safeParse(data);
}
