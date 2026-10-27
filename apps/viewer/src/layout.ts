import type { ProjectSpec } from "@scenario/core";

export const COL_WIDTH = 300;
export const ROW_HEIGHT = 92;

/**
 * Left-to-right tree layout driven by "contains" edges. Nodes with no parent
 * become their own roots, stacked top to bottom. A node's saved `position`
 * (set by a future editor) always wins over the computed one.
 */
export function layoutNodes(spec: ProjectSpec): Record<string, { x: number; y: number }> {
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of spec.edges) {
    if (e.kind !== "contains") continue;
    children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
    hasParent.add(e.to);
  }

  const pos: Record<string, { x: number; y: number }> = {};
  let row = 0;

  const place = (id: string, depth: number): number => {
    const kids = children.get(id) ?? [];
    let y: number;
    if (kids.length === 0) {
      y = row * ROW_HEIGHT;
      row++;
    } else {
      const ys = kids.map((k) => place(k, depth + 1));
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    pos[id] = { x: depth * COL_WIDTH, y };
    return y;
  };

  for (const n of spec.nodes) {
    if (!hasParent.has(n.id)) {
      place(n.id, 0);
      row += 0.6; // gap between independent trees
    }
  }

  for (const n of spec.nodes) {
    if (n.position) pos[n.id] = n.position;
  }
  return pos;
}
