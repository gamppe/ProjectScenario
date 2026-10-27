import type { Status } from "./common.js";
import type { ProjectSpec } from "./spec.js";

/**
 * Effective status of every node, using "contains" edges.
 *
 * A node with children takes its status from them:
 *  - blocked if it, or any child, is blocked
 *  - done if every child is done
 *  - in_progress if some child is in_progress or done
 *  - planned otherwise
 * A leaf keeps its own status.
 *
 * Assumes a validated spec (contains edges are a forest), which parseSpec guarantees.
 */
export function computeRollup(spec: ProjectSpec): Record<string, Status> {
  const own = new Map(spec.nodes.map((n) => [n.id, n.status] as const));
  const children = new Map<string, string[]>();
  for (const e of spec.edges) {
    if (e.kind === "contains") children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
  }

  const result: Record<string, Status> = {};
  const resolve = (id: string): Status => {
    const cached = result[id];
    if (cached) return cached;

    const kids = children.get(id);
    const self = own.get(id) ?? "planned";
    let status: Status;
    if (!kids || kids.length === 0) {
      status = self;
    } else {
      const sub = kids.map(resolve);
      if (self === "blocked" || sub.includes("blocked")) status = "blocked";
      else if (sub.every((s) => s === "done")) status = "done";
      else if (sub.some((s) => s === "in_progress" || s === "done")) status = "in_progress";
      else status = "planned";
    }
    result[id] = status;
    return status;
  };

  for (const n of spec.nodes) resolve(n.id);
  return result;
}
