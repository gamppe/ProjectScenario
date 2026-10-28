import { EDGE_KINDS, type Edge, type EdgeKind, type Side } from "./nodes.js";
import type { ProjectSpec } from "./spec.js";

/**
 * Everything the diagram needs to know that is not about drawing:
 *  - which nodes and lines a given folder level shows,
 *  - where they sit,
 *  - where on each node a line should attach.
 * Kept pure (no DOM) so it can be tested.
 */

export const NODE_W = 220;
export const NODE_H = 64;
export const FOLDER_W = 260;
/** Folder box: a header, then one pill per member. */
export const PILL = { head: 40, height: 26, gap: 6, bottom: 12 };
const COL_STEP = 320;
const ROW_GAP = 28;

export interface XY {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function folderBoxHeight(memberCount: number): number {
  return PILL.head + Math.max(1, memberCount) * (PILL.height + PILL.gap) + PILL.bottom;
}

/* ---------- levels ---------- */

/** Nodes shown at a level: the direct children of `view` (null = the main diagram). */
export function childrenOf(spec: ProjectSpec, view: string | null) {
  return spec.nodes.filter((n) => (n.folderId ?? null) === view);
}

/** Folder ids from the top level down to `id` itself, e.g. ["auth", "login-flow"]. */
export function folderPath(spec: ProjectSpec, id: string | null): string[] {
  const byId = new Map(spec.nodes.map((n) => [n.id, n] as const));
  const path: string[] = [];
  for (let cur = id, guard = 0; cur && guard < 50; guard++) {
    path.unshift(cur);
    cur = byId.get(cur)?.folderId ?? null;
  }
  return path;
}

/**
 * What stands for `id` at this level: itself if it is shown here, else the folder
 * that holds it (at any depth). Undefined if it lives outside this level entirely.
 */
export function representative(spec: ProjectSpec, view: string | null, id: string): string | undefined {
  const byId = new Map(spec.nodes.map((n) => [n.id, n] as const));
  let cur: string | undefined = id;
  for (let guard = 0; cur && guard < 50; guard++) {
    const node = byId.get(cur);
    if (!node) return undefined;
    if ((node.folderId ?? null) === view) return cur;
    cur = node.folderId;
  }
  return undefined;
}

export interface LevelEdge {
  /** Unique at this level: kind + the two things drawn. */
  key: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  /** How many underlying edges this line stands for (>1 when a folder collects several). */
  count: number;
  /** The real edge, when both ends are drawn as themselves. Only these can be edited. */
  direct?: Edge;
}

/**
 * The lines to draw at a level. A node inside a folder shows up as its folder, so its lines
 * belong to the folder; lines between two things inside the same folder are not drawn here.
 */
export function levelEdges(spec: ProjectSpec, view: string | null): LevelEdge[] {
  const byKey = new Map<string, LevelEdge>();
  for (const e of spec.edges) {
    const from = representative(spec, view, e.from);
    const to = representative(spec, view, e.to);
    if (!from || !to || from === to) continue;
    const key = `${e.kind}:${from}>${to}`;
    const isDirect = from === e.from && to === e.to;
    const hit = byKey.get(key);
    if (hit) {
      hit.count++;
      if (isDirect && !hit.direct) {
        hit.direct = e;
        hit.label = e.label;
      }
    } else {
      byKey.set(key, { key, from, to, kind: e.kind, count: 1, ...(isDirect ? { direct: e, label: e.label } : {}) });
    }
  }
  return [...byKey.values()];
}

export interface LevelLayout {
  /** Shown nodes, in file order. */
  ids: string[];
  pos: Record<string, XY>;
  size: Record<string, Size>;
  /** For each folder shown: its direct members, in file order (drawn as pills). */
  members: Record<string, string[]>;
}

/** Where everything at a level sits. Saved positions win; the rest is a left-to-right tree. */
export function layoutLevel(spec: ProjectSpec, view: string | null): LevelLayout {
  const nodes = childrenOf(spec, view);
  const ids = nodes.map((n) => n.id);
  const visible = new Set(ids);
  const size: Record<string, Size> = {};
  const members: Record<string, string[]> = {};

  for (const n of nodes) {
    if (n.type === "folder") {
      members[n.id] = spec.nodes.filter((m) => m.folderId === n.id).map((m) => m.id);
      size[n.id] = { width: FOLDER_W, height: folderBoxHeight(members[n.id]!.length) };
    } else {
      size[n.id] = { width: NODE_W, height: NODE_H };
    }
  }

  const kids = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of levelEdges(spec, view)) {
    if (e.kind !== "contains" || !visible.has(e.from) || !visible.has(e.to) || hasParent.has(e.to)) continue;
    kids.set(e.from, [...(kids.get(e.from) ?? []), e.to]);
    hasParent.add(e.to);
  }

  const pos: Record<string, XY> = {};
  const done = new Set<string>();
  let cursor = 0;

  /** Returns the vertical center of what it placed, so a parent can sit between its children. */
  const place = (id: string, depth: number): number => {
    done.add(id);
    const h = size[id]!.height;
    const children = (kids.get(id) ?? []).filter((k) => !done.has(k));
    let top: number;
    if (children.length === 0) {
      top = cursor;
      cursor += h + ROW_GAP;
    } else {
      const centers = children.map((k) => place(k, depth + 1));
      top = (centers[0]! + centers[centers.length - 1]!) / 2 - h / 2;
    }
    pos[id] = { x: depth * COL_STEP, y: top };
    return top + h / 2;
  };

  for (const id of ids) {
    if (!hasParent.has(id) && !done.has(id)) {
      place(id, 0);
      cursor += ROW_GAP;
    }
  }
  for (const id of ids) if (!done.has(id)) place(id, 0); // only reachable through a cycle

  for (const n of nodes) if (n.position) pos[n.id] = n.position;
  return { ids, pos, size, members };
}

/** The folder under `point` among the folders shown, smallest first; ignores `exclude`. */
export function folderAt(layout: LevelLayout, spec: ProjectSpec, point: XY, exclude: Set<string>): string | undefined {
  let best: { id: string; area: number } | undefined;
  for (const id of layout.ids) {
    const n = spec.nodes.find((x) => x.id === id);
    if (!n || n.type !== "folder" || exclude.has(id)) continue;
    const at = layout.pos[id]!;
    const sz = layout.size[id]!;
    if (point.x >= at.x && point.x <= at.x + sz.width && point.y >= at.y && point.y <= at.y + sz.height) {
      const area = sz.width * sz.height;
      if (!best || area < best.area) best = { id, area };
    }
  }
  return best?.id;
}

/* ---------- where lines attach ---------- */

export interface Anchor {
  side: Side;
  /** 0..1 along that side (top to bottom, or left to right). */
  offset: number;
}

export function anchorPoint(r: Rect, a: Anchor): XY {
  switch (a.side) {
    case "left":
      return { x: r.x, y: r.y + r.h * a.offset };
    case "right":
      return { x: r.x + r.w, y: r.y + r.h * a.offset };
    case "top":
      return { x: r.x + r.w * a.offset, y: r.y };
    case "bottom":
      return { x: r.x + r.w * a.offset, y: r.y + r.h };
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MIN_OFFSET = 0.08;

/** The spot on the box's outline closest to `p`, as an anchor. Used while dragging a line's end. */
export function nearestAnchor(r: Rect, p: XY): Anchor {
  const cx = clamp(p.x, r.x, r.x + r.w);
  const cy = clamp(p.y, r.y, r.y + r.h);
  const cands: { side: Side; dist: number; offset: number }[] = [
    { side: "left", dist: Math.hypot(p.x - r.x, p.y - cy), offset: (cy - r.y) / r.h },
    { side: "right", dist: Math.hypot(p.x - (r.x + r.w), p.y - cy), offset: (cy - r.y) / r.h },
    { side: "top", dist: Math.hypot(p.x - cx, p.y - r.y), offset: (cx - r.x) / r.w },
    { side: "bottom", dist: Math.hypot(p.x - cx, p.y - (r.y + r.h)), offset: (cx - r.x) / r.w },
  ];
  const best = cands.reduce((a, b) => (b.dist < a.dist ? b : a));
  return { side: best.side, offset: clamp(best.offset, MIN_OFFSET, 1 - MIN_OFFSET) };
}

export interface RouteInput {
  key: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** Saved by the user; used as is. */
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
}

export interface Route {
  from: Anchor;
  to: Anchor;
}

/**
 * Choose where each line leaves and enters its boxes.
 * The side comes from where the other end is. On one side of a box, lines of different kinds
 * (different colors) get different positions, evenly spread; lines of the same kind share one,
 * so same-colored lines may overlap but different colors stay apart.
 */
export function routeEdges(edges: RouteInput[], rects: Record<string, Rect>): Record<string, Route> {
  type Slot = { key: string; end: "from" | "to"; node: string; side: Side; kind: EdgeKind };
  const auto: Slot[] = [];
  const sides: Record<string, { from: Side; to: Side }> = {};

  for (const e of edges) {
    const a = rects[e.from];
    const b = rects[e.to];
    if (!a || !b) continue;
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const fromSide: Side = horizontal ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
    const toSide: Side = horizontal ? (dx >= 0 ? "left" : "right") : dy >= 0 ? "top" : "bottom";
    sides[e.key] = { from: e.fromAnchor?.side ?? fromSide, to: e.toAnchor?.side ?? toSide };
    if (!e.fromAnchor) auto.push({ key: e.key, end: "from", node: e.from, side: fromSide, kind: e.kind });
    if (!e.toAnchor) auto.push({ key: e.key, end: "to", node: e.to, side: toSide, kind: e.kind });
  }

  const groups = new Map<string, Slot[]>();
  for (const s of auto) {
    const g = `${s.node}|${s.side}`;
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  const offsets = new Map<string, number>();
  for (const slots of groups.values()) {
    const kinds = EDGE_KINDS.filter((k) => slots.some((s) => s.kind === k));
    for (const s of slots) offsets.set(`${s.key}|${s.end}`, (kinds.indexOf(s.kind) + 1) / (kinds.length + 1));
  }

  const out: Record<string, Route> = {};
  for (const e of edges) {
    const s = sides[e.key];
    if (!s) continue;
    out[e.key] = {
      from: e.fromAnchor ?? { side: s.from, offset: offsets.get(`${e.key}|from`) ?? 0.5 },
      to: e.toAnchor ?? { side: s.to, offset: offsets.get(`${e.key}|to`) ?? 0.5 },
    };
  }
  return out;
}

const NORMAL: Record<Side, XY> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** How far a line runs straight out of a node before it may turn. */
const STUB = 20;
/** Gap between the "lanes" of different line kinds that run side by side. */
const LANE_STEP = 8;

/**
 * Which lane a kind of line uses for its middle stretch. Different kinds (colors) get different
 * lanes so they do not run on top of each other; the same kind shares one lane and may overlap.
 */
export function laneFor(kind: EdgeKind): number {
  return (EDGE_KINDS.indexOf(kind) - (EDGE_KINDS.length - 1) / 2) * LANE_STEP;
}

const horizontalSide = (s: Side) => s === "left" || s === "right";
const between = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

type End = { pt: XY; side: Side };

/**
 * The right-angled route between two attachment points: it leaves and enters each box
 * straight, and turns only in between. `lane` shifts the middle stretch sideways.
 */
export function edgePolyline(a: End, b: End, lane = 0): XY[] {
  const na = NORMAL[a.side];
  const nb = NORMAL[b.side];
  const A = a.pt;
  const B = b.pt;
  const stubA = { x: A.x + na.x * STUB, y: A.y + na.y * STUB };
  const stubB = { x: B.x + nb.x * STUB, y: B.y + nb.y * STUB };

  if (horizontalSide(a.side) && horizontalSide(b.side)) {
    const facing = a.side !== b.side && na.x * (B.x - A.x) >= 2 * STUB;
    if (facing) {
      const x = between((A.x + B.x) / 2 + lane, stubA.x, stubB.x);
      return [A, { x, y: A.y }, { x, y: B.y }, B];
    }
    if (a.side === b.side) {
      const x = na.x > 0 ? Math.max(A.x, B.x) + STUB + Math.abs(lane) : Math.min(A.x, B.x) - STUB - Math.abs(lane);
      return [A, { x, y: A.y }, { x, y: B.y }, B];
    }
    const y = (A.y + B.y) / 2 + lane; // facing sides, but no room between the boxes: go around
    return [A, stubA, { x: stubA.x, y }, { x: stubB.x, y }, stubB, B];
  }

  if (!horizontalSide(a.side) && !horizontalSide(b.side)) {
    const facing = a.side !== b.side && na.y * (B.y - A.y) >= 2 * STUB;
    if (facing) {
      const y = between((A.y + B.y) / 2 + lane, stubA.y, stubB.y);
      return [A, { x: A.x, y }, { x: B.x, y }, B];
    }
    if (a.side === b.side) {
      const y = na.y > 0 ? Math.max(A.y, B.y) + STUB + Math.abs(lane) : Math.min(A.y, B.y) - STUB - Math.abs(lane);
      return [A, { x: A.x, y }, { x: B.x, y }, B];
    }
    const x = (A.x + B.x) / 2 + lane;
    return [A, stubA, { x, y: stubA.y }, { x, y: stubB.y }, stubB, B];
  }

  // one end on a left/right side, the other on a top/bottom side: a single corner
  return horizontalSide(a.side)
    ? [A, stubA, { x: stubB.x, y: stubA.y }, stubB, B]
    : [A, stubA, { x: stubA.x, y: stubB.y }, stubB, B];
}

/** The polyline as an SVG path with softly rounded corners, plus a point near its middle for a label. */
export function edgePath(a: End, b: End, lane = 0, radius = 6): { d: string; mid: XY } {
  const raw = edgePolyline(a, b, lane);
  const pts = raw.filter((p, i) => i === 0 || p.x !== raw[i - 1]!.x || p.y !== raw[i - 1]!.y);

  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const lin = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lout = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    const ein = { x: cur.x - ((cur.x - prev.x) / lin) * r, y: cur.y - ((cur.y - prev.y) / lin) * r };
    const eout = { x: cur.x + ((next.x - cur.x) / lout) * r, y: cur.y + ((next.y - cur.y) / lout) * r };
    d += ` L ${ein.x} ${ein.y} Q ${cur.x} ${cur.y} ${eout.x} ${eout.y}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x} ${last.y}`;

  // the point halfway along the route
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let left = lens.reduce((x, y) => x + y, 0) / 2;
  let mid = pts[0]!;
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i]!) {
      const t = lens[i]! === 0 ? 0 : left / lens[i]!;
      mid = { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t };
      break;
    }
    left -= lens[i]!;
  }
  return { d, mid };
}

/**
 * While a node is dragged: if moving it a little would make one of its lines run perfectly
 * straight (both ends at the same height, or the same left-right position), return that
 * position instead. `threshold` is how close, in diagram units, counts as "a little".
 *
 * Only lines whose two ends face the same way are considered (left/right to left/right, or
 * top/bottom to top/bottom); a line with a corner is not "almost straight" in this sense.
 * The closest candidate wins separately for each axis.
 */
export function snapForStraightLines(input: {
  id: string;
  pos: XY;
  rects: Record<string, Rect>;
  routes: Record<string, Route>;
  edges: { key: string; from: string; to: string }[];
  threshold: number;
}): XY {
  const { id, pos, rects, routes, edges, threshold } = input;
  const me = rects[id];
  if (!me) return pos;
  const moved: Rect = { ...me, x: pos.x, y: pos.y };

  let bestDx: number | undefined;
  let bestDy: number | undefined;
  for (const e of edges) {
    if (e.from !== id && e.to !== id) continue;
    const route = routes[e.key];
    const otherId = e.from === id ? e.to : e.from;
    const other = rects[otherId];
    if (!route || !other) continue;

    const mine = e.from === id ? route.from : route.to;
    const theirs = e.from === id ? route.to : route.from;
    if (horizontalSide(mine.side) !== horizontalSide(theirs.side)) continue;

    const a = anchorPoint(moved, mine);
    const b = anchorPoint(other, theirs);
    if (horizontalSide(mine.side)) {
      const dy = b.y - a.y; // same height = a horizontal straight line
      if (Math.abs(dy) <= threshold && (bestDy === undefined || Math.abs(dy) < Math.abs(bestDy))) bestDy = dy;
    } else {
      const dx = b.x - a.x; // same left-right position = a vertical straight line
      if (Math.abs(dx) <= threshold && (bestDx === undefined || Math.abs(dx) < Math.abs(bestDx))) bestDx = dx;
    }
  }
  return { x: pos.x + (bestDx ?? 0), y: pos.y + (bestDy ?? 0) };
}

/* ---------- aligning several nodes, like the Align menu in PowerPoint ---------- */

export type AlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distribute-h"
  | "distribute-v";

/** The fewest nodes each mode needs; spacing evenly takes three (two fixed ends and one to move). */
export function alignMinimum(mode: AlignMode): number {
  return mode === "distribute-h" || mode === "distribute-v" ? 3 : 2;
}

/**
 * New top-left positions that line the given nodes up. Edge modes line every node up with the
 * outermost one; "center" and "middle" use the middle of the whole group; the distribute modes
 * keep the two outermost nodes where they are and make the gaps between all of them equal.
 * Returns nothing when there are too few nodes.
 */
export function alignNodes(rects: Record<string, Rect>, ids: string[], mode: AlignMode): Record<string, XY> {
  const items = ids.filter((id) => rects[id]).map((id) => ({ id, r: rects[id]! }));
  if (items.length < alignMinimum(mode)) return {};

  const left = Math.min(...items.map((i) => i.r.x));
  const right = Math.max(...items.map((i) => i.r.x + i.r.w));
  const top = Math.min(...items.map((i) => i.r.y));
  const bottom = Math.max(...items.map((i) => i.r.y + i.r.h));
  const out: Record<string, XY> = {};

  if (mode === "distribute-h" || mode === "distribute-v") {
    const horizontal = mode === "distribute-h";
    const sorted = [...items].sort((a, b) => (horizontal ? a.r.x - b.r.x : a.r.y - b.r.y));
    const size = (i: (typeof items)[number]) => (horizontal ? i.r.w : i.r.h);
    const start = horizontal ? left : top;
    const end = horizontal ? right : bottom;
    const gap = (end - start - sorted.reduce((sum, i) => sum + size(i), 0)) / (sorted.length - 1);
    let at = start;
    for (const i of sorted) {
      out[i.id] = horizontal ? { x: at, y: i.r.y } : { x: i.r.x, y: at };
      at += size(i) + gap;
    }
    return out;
  }

  for (const { id, r } of items) {
    switch (mode) {
      case "left":
        out[id] = { x: left, y: r.y };
        break;
      case "right":
        out[id] = { x: right - r.w, y: r.y };
        break;
      case "center":
        out[id] = { x: (left + right) / 2 - r.w / 2, y: r.y };
        break;
      case "top":
        out[id] = { x: r.x, y: top };
        break;
      case "bottom":
        out[id] = { x: r.x, y: bottom - r.h };
        break;
      case "middle":
        out[id] = { x: r.x, y: (top + bottom) / 2 - r.h / 2 };
        break;
    }
  }
  return out;
}
