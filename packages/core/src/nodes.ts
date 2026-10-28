import { z } from "zod";
import {
  ExternalRefsSchema,
  IdSchema,
  PositionSchema,
  ProvenanceSchema,
  StatusSchema,
} from "./common.js";

const NodeBase = z.object({
  id: IdSchema,
  title: z.string().min(1),
  summary: z.string().optional(),
  /** Output-language version of summary; filled by an agent (see brief §7). */
  summaryEn: z.string().optional(),
  status: StatusSchema.default("planned"),
  /** Absent means the user wrote it. */
  provenance: ProvenanceSchema.optional(),
  external: ExternalRefsSchema.optional(),
  /** Diagram position, owned by the GUI. Always absolute, even for nodes inside a folder. */
  position: PositionSchema.optional(),
  /** The folder this node is kept in. Purely organizational; unrelated to "contains" edges. */
  folderId: IdSchema.optional(),
  tags: z.array(z.string()).default([]),
});

export const VisionNodeSchema = NodeBase.extend({
  type: z.literal("vision"),
  problem: z.string().optional(),
  goals: z.array(z.string()).default([]),
  nonGoals: z.array(z.string()).default([]),
});

export const PersonaNodeSchema = NodeBase.extend({
  type: z.literal("persona"),
  jobsToBeDone: z.array(z.string()).default([]),
});

export const FeatureNodeSchema = NodeBase.extend({
  type: z.literal("feature"),
  priority: z.enum(["must", "should", "could", "wont"]).default("should"),
  inMvp: z.boolean().default(false),
});

export const AcceptanceCriterionSchema = z.object({
  given: z.string(),
  when: z.string(),
  then: z.string(),
});

export const StoryNodeSchema = NodeBase.extend({
  type: z.literal("story"),
  asA: z.string().optional(),
  iWant: z.string().optional(),
  soThat: z.string().optional(),
  acceptance: z.array(AcceptanceCriterionSchema).default([]),
});

export const ScreenStateSchema = z.object({
  name: z.string().min(1), // e.g. default, loading, empty, error
  description: z.string().optional(),
});

export const ScreenNodeSchema = NodeBase.extend({
  type: z.literal("screen"),
  route: z.string().optional(),
  states: z.array(ScreenStateSchema).default([]),
  /** Path to the wireframe file under design/. */
  wireframe: z.string().optional(),
});

export const InteractionNodeSchema = NodeBase.extend({
  type: z.literal("interaction"),
  trigger: z.string().min(1),
  result: z.string().min(1),
});

export const FlowNodeSchema = NodeBase.extend({
  type: z.literal("flow"),
  /** Optional hand-written Mermaid; otherwise derived from "navigates" edges. */
  mermaid: z.string().optional(),
});

export const EntityFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().default(true),
  description: z.string().optional(),
});

export const EntityNodeSchema = NodeBase.extend({
  type: z.literal("entity"),
  fields: z.array(EntityFieldSchema).default([]),
});

export const DecisionNodeSchema = NodeBase.extend({
  type: z.literal("decision"),
  category: z.string().optional(), // language, framework, storage, ...
  choice: z.string().optional(),
  alternatives: z.array(z.string()).default([]),
  rationale: z.string().optional(),
});

export const TaskNodeSchema = NodeBase.extend({
  type: z.literal("task"),
  order: z.number().int().optional(),
  doneWhen: z.array(z.string()).default([]),
});

export const RiskNodeSchema = NodeBase.extend({
  type: z.literal("risk"),
  likelihood: z.enum(["low", "medium", "high"]).default("medium"),
  impact: z.enum(["low", "medium", "high"]).default("medium"),
  mitigation: z.string().optional(),
});

/**
 * A box that keeps other nodes together, like a package. On the diagram it lists its
 * members as pills; double-clicking it opens a diagram of just its contents.
 * (`size` is from an earlier version where the box was resized by hand; it is ignored.)
 */
export const FolderNodeSchema = NodeBase.extend({
  type: z.literal("folder"),
  size: z.object({ width: z.number().min(120), height: z.number().min(80) }).optional(),
});

export const NodeSchema = z.discriminatedUnion("type", [
  VisionNodeSchema,
  PersonaNodeSchema,
  FeatureNodeSchema,
  StoryNodeSchema,
  ScreenNodeSchema,
  InteractionNodeSchema,
  FlowNodeSchema,
  EntityNodeSchema,
  DecisionNodeSchema,
  TaskNodeSchema,
  RiskNodeSchema,
  FolderNodeSchema,
]);
export type Node = z.infer<typeof NodeSchema>;
export type NodeType = Node["type"];

export const EDGE_KINDS = [
  "contains", // parent -> child; drives status rollup and the diagram tree
  "implements", // task -> feature/story
  "navigates", // screen -> screen (label = trigger)
  "depends_on", // a needs b first
  "uses_data", // screen/feature -> entity
  "blocks", // a is blocked by b
  "relates", // free association
] as const;
export const EdgeKindSchema = z.enum(EDGE_KINDS);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const SIDES = ["left", "right", "top", "bottom"] as const;
export type Side = (typeof SIDES)[number];

/** Where a line attaches to a node: a side, and how far along it (0..1). */
export const AnchorSchema = z.object({
  side: z.enum(SIDES),
  offset: z.number().min(0).max(1),
});

export const EdgeSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  kind: EdgeKindSchema,
  label: z.string().optional(),
  /** Set when the user drags the line's end elsewhere; otherwise the position is chosen automatically. */
  fromAnchor: AnchorSchema.optional(),
  toAnchor: AnchorSchema.optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;
