import {
  BookOpen,
  Database,
  ListChecks,
  MousePointerClick,
  Monitor,
  Puzzle,
  Scale,
  Target,
  TriangleAlert,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { EdgeKind, NodeType } from "@scenario/core";

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  vision: Target,
  persona: User,
  feature: Puzzle,
  story: BookOpen,
  screen: Monitor,
  interaction: MousePointerClick,
  flow: Workflow,
  entity: Database,
  decision: Scale,
  task: ListChecks,
  risk: TriangleAlert,
};

/** Prefix for generated ids, e.g. "feat-1". */
export const ID_PREFIX: Record<NodeType, string> = {
  vision: "vision",
  persona: "persona",
  feature: "feat",
  story: "story",
  screen: "screen",
  interaction: "int",
  flow: "flow",
  entity: "ent",
  decision: "dec",
  task: "task",
  risk: "risk",
};

/** Fields a node of this type cannot be created without. */
export const NODE_DEFAULTS: Partial<Record<NodeType, Record<string, unknown>>> = {
  interaction: { trigger: "무엇을 하면", result: "무슨 일이 생긴다" },
};

export const EDGE_STROKE: Record<EdgeKind, string> = {
  contains: "var(--edge-contains)",
  implements: "var(--edge-implements)",
  navigates: "var(--edge-navigates)",
  depends_on: "var(--edge-depends)",
  uses_data: "var(--edge-data)",
  blocks: "var(--edge-blocks)",
  relates: "var(--edge-relates)",
};

export const NODE_TYPES_ORDER: NodeType[] = [
  "vision",
  "persona",
  "feature",
  "story",
  "screen",
  "interaction",
  "flow",
  "entity",
  "decision",
  "task",
  "risk",
];
