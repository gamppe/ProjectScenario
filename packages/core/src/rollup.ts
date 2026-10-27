import type { Status } from "./common.js";
import type { ProjectSpec } from "./spec.js";

/**
 * Effective status of every node, using "contains" edges.
 *
 * A node with children combines their statuses with its own (own "planned"
 * is ignored, since that is the default):
 *  - blocked if any input is blocked
 *  - done if every input is done
 *  - in_progress if some input is in_progress or done
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
      // The node's own status counts too once someone has set it past "planned",
      // so a screen marked in_progress is not reported done just because its
      // only interaction is.
      const inputs = kids.map(resolve);
      if (self !== "planned") inputs.push(self);
      if (inputs.includes("blocked")) status = "blocked";
      else if (inputs.every((s) => s === "done")) status = "done";
      else if (inputs.some((s) => s === "in_progress" || s === "done")) status = "in_progress";
      else status = "planned";
    }
    result[id] = status;
    return status;
  };

  for (const n of spec.nodes) resolve(n.id);
  return result;
}
