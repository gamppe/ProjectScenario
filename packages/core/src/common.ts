import { z } from "zod";

export const SCHEMA_VERSION = 1;

/** Lowercase slug used for node ids and question ids, e.g. "feat-login". */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/, "id must be a lowercase slug (a-z, 0-9, _ or -), 2-64 chars");

export const STATUSES = ["planned", "in_progress", "blocked", "done"] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

/** Who produced a value. "import" = pulled from an external tool (Figma, Notion, ...). */
export const SourceSchema = z.enum(["user", "ai", "import"]);
export type Source = z.infer<typeof SourceSchema>;

export const ImportanceSchema = z.enum(["P0", "P1", "P2"]);
export type Importance = z.infer<typeof ImportanceSchema>;

/**
 * Where a value came from. Anything with source "ai" and reviewed=false is
 * surfaced in the UI and exported md as "AI-decided, needs review".
 */
export const ProvenanceSchema = z.object({
  source: SourceSchema,
  rationale: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  decidedAt: z.string().datetime().optional(),
  reviewed: z.boolean().default(false),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** Links from a node to the same thing in an external tool. */
export const ExternalRefsSchema = z.object({
  figmaFileKey: z.string().optional(),
  figmaNodeId: z.string().optional(),
  githubIssue: z.string().optional(),
  notionPageId: z.string().optional(),
  linearIssueId: z.string().optional(),
  other: z.record(z.string(), z.string()).optional(),
});
export type ExternalRefs = z.infer<typeof ExternalRefsSchema>;

export const PositionSchema = z.object({ x: z.number(), y: z.number() });
