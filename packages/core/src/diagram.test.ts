import { describe, expect, it } from "vitest";
import {
  FOLDER_W,
  NODE_H,
  NODE_W,
  addEdge,
  addNode,
  anchorPoint,
  childrenOf,
  createSpec,
  edgePath,
  edgePolyline,
  laneFor,
  EDGE_KINDS,
  folderAt,
  folderBoxHeight,
  folderPath,
  layoutLevel,
  levelEdges,
  nearestAnchor,
  representative,
  routeEdges,
  snapForStraightLines,
  safeParseSpec,
  setEdgeAnchor,
  setFolder,
  setPosition,
  type ProjectSpec,
  type Rect,
  type Side,
  type XY,
} from "./index.js";

/** main: [feat-a, folder-auth{ screen-login, screen-signup, folder-inner{ task-x } }, screen-home] */
function sample(): ProjectSpec {
  let s = createSpec("Demo");
  s = addNode(s, { id: "feat-a", type: "feature", title: "A" });
  s = addNode(s, { id: "folder-auth", type: "folder", title: "Auth" });
  s = addNode(s, { id: "screen-login", type: "screen", title: "Login" });
  s = addNode(s, { id: "screen-signup", type: "screen", title: "Signup" });
  s = addNode(s, { id: "folder-inner", type: "folder", title: "Inner" });
  s = addNode(s, { id: "task-x", type: "task", title: "X" });
  s = addNode(s, { id: "screen-home", type: "screen", title: "Home" });
  s = setFolder(s, "screen-login", "folder-auth");
  s = setFolder(s, "screen-signup", "folder-auth");
  s = setFolder(s, "folder-inner", "folder-auth");
  s = setFolder(s, "task-x", "folder-inner");
  return s;
}

describe("levels", () => {
  it("shows only the direct children of a level", () => {
    const s = sample();
    expect(childrenOf(s, null).map((n) => n.id)).toEqual(["feat-a", "folder-auth", "screen-home"]);
    expect(childrenOf(s, "folder-auth").map((n) => n.id)).toEqual(["screen-login", "screen-signup", "folder-inner"]);
    expect(childrenOf(s, "folder-inner").map((n) => n.id)).toEqual(["task-x"]);
  });

  it("builds the path from the top level down", () => {
    expect(folderPath(sample(), "folder-inner")).toEqual(["folder-auth", "folder-inner"]);
    expect(folderPath(sample(), null)).toEqual([]);
  });

  it("stands a node in for by its folder at higher levels", () => {
    const s = sample();
    expect(representative(s, null, "task-x")).toBe("folder-auth");
    expect(representative(s, null, "feat-a")).toBe("feat-a");
    expect(representative(s, "folder-auth", "task-x")).toBe("folder-inner");
    expect(representative(s, "folder-auth", "screen-login")).toBe("screen-login");
    expect(representative(s, "folder-auth", "feat-a")).toBeUndefined(); // lives outside this level
  });
});

describe("level edges", () => {
  it("hands a member's lines to its folder and hides lines inside one folder", () => {
    let s = sample();
    s = addEdge(s, { from: "feat-a", to: "screen-login", kind: "relates" });
    s = addEdge(s, { from: "feat-a", to: "task-x", kind: "relates" });
    s = addEdge(s, { from: "screen-login", to: "screen-signup", kind: "navigates", label: "Next" });

    const main = levelEdges(s, null);
    // both feat-a lines now end at the folder and are one line of that kind
    expect(main.map((e) => e.key)).toEqual(["relates:feat-a>folder-auth"]);
    expect(main[0]!.count).toBe(2);
    expect(main[0]!.direct).toBeUndefined(); // not a real edge, so it cannot be edited
    // the navigation inside the folder is not drawn on the main diagram
    expect(main.some((e) => e.kind === "navigates")).toBe(false);

    const inner = levelEdges(s, "folder-auth");
    expect(inner.map((e) => e.key)).toEqual(["navigates:screen-login>screen-signup"]);
    expect(inner[0]!.direct).toBeDefined();
    expect(inner[0]!.label).toBe("Next");
  });

  it("keeps lines of different kinds between the same two things apart", () => {
    let s = sample();
    s = addEdge(s, { from: "feat-a", to: "screen-home", kind: "relates" });
    s = addEdge(s, { from: "feat-a", to: "screen-home", kind: "depends_on" });
    expect(levelEdges(s, null)).toHaveLength(2);
  });

  it("drops lines to nodes outside the level", () => {
    let s = sample();
    s = addEdge(s, { from: "feat-a", to: "screen-login", kind: "relates" });
    expect(levelEdges(s, "folder-auth")).toHaveLength(0);
  });
});

describe("layoutLevel", () => {
  it("sizes a folder box by its members and lists them in file order", () => {
    const l = layoutLevel(sample(), null);
    expect(l.members["folder-auth"]).toEqual(["screen-login", "screen-signup", "folder-inner"]);
    expect(l.size["folder-auth"]).toEqual({ width: FOLDER_W, height: folderBoxHeight(3) });
    expect(l.size["feat-a"]).toEqual({ width: NODE_W, height: NODE_H });
    expect(folderBoxHeight(0)).toBe(folderBoxHeight(1)); // an empty folder still shows a hint row
  });

  it("lays children to the right of their parent and honors saved positions", () => {
    let s = createSpec("T");
    s = addNode(s, { id: "feat-a", type: "feature", title: "A" });
    s = addNode(s, { id: "screen-a", type: "screen", title: "S" }, { parentId: "feat-a" });
    let l = layoutLevel(s, null);
    expect(l.pos["screen-a"]!.x).toBeGreaterThan(l.pos["feat-a"]!.x);
    s = setPosition(s, "screen-a", { x: 999, y: 111 });
    l = layoutLevel(s, null);
    expect(l.pos["screen-a"]).toEqual({ x: 999, y: 111 });
  });

  it("does not stack two nodes on top of each other", () => {
    const l = layoutLevel(sample(), null);
    const columns = new Map<number, { y: number; h: number }[]>();
    for (const id of l.ids) columns.set(l.pos[id]!.x, [...(columns.get(l.pos[id]!.x) ?? []), { y: l.pos[id]!.y, h: l.size[id]!.height }]);
    for (const rows of columns.values()) {
      rows.sort((p, q) => p.y - q.y);
      for (let i = 1; i < rows.length; i++) expect(rows[i]!.y).toBeGreaterThanOrEqual(rows[i - 1]!.y + rows[i - 1]!.h);
    }
  });

  it("puts each kind in its own column, left to right, and skips empty columns", () => {
    let s = createSpec("T");
    s = addNode(s, { id: "task-1", type: "task", title: "T" });
    s = addNode(s, { id: "scr-1", type: "screen", title: "S" });
    s = addNode(s, { id: "feat-1", type: "feature", title: "F" });
    s = addNode(s, { id: "feat-2", type: "feature", title: "F2" });
    const l = layoutLevel(s, null);
    expect(l.pos["feat-1"]!.x).toBe(0);
    expect(l.pos["feat-2"]!.x).toBe(0);
    expect(l.pos["scr-1"]!.x).toBeGreaterThan(0);
    expect(l.pos["task-1"]!.x).toBeGreaterThan(l.pos["scr-1"]!.x);
    expect(l.pos["feat-2"]!.y).toBeGreaterThan(l.pos["feat-1"]!.y);
  });

  it("orders a column by the lines that carry an order", () => {
    let s = createSpec("T");
    for (const id of ["scr-c", "scr-b", "scr-a"]) s = addNode(s, { id, type: "screen", title: id });
    s = addNode(s, { id: "task-2", type: "task", title: "2" });
    s = addNode(s, { id: "task-1", type: "task", title: "1" });
    s = addEdge(s, { from: "scr-a", to: "scr-b", kind: "navigates" });
    s = addEdge(s, { from: "scr-b", to: "scr-c", kind: "navigates" });
    s = addEdge(s, { from: "task-2", to: "task-1", kind: "depends_on" });
    const l = layoutLevel(s, null);
    expect(l.pos["scr-a"]!.y).toBeLessThan(l.pos["scr-b"]!.y);
    expect(l.pos["scr-b"]!.y).toBeLessThan(l.pos["scr-c"]!.y);
    expect(l.pos["task-1"]!.y).toBeLessThan(l.pos["task-2"]!.y); // task-2 needs task-1 first
  });

  it("does not hang on a cycle", () => {
    let s = createSpec("T");
    s = addNode(s, { id: "scr-a", type: "screen", title: "A" });
    s = addNode(s, { id: "scr-b", type: "screen", title: "B" });
    s = addEdge(s, { from: "scr-a", to: "scr-b", kind: "navigates" });
    s = addEdge(s, { from: "scr-b", to: "scr-a", kind: "navigates" });
    expect(Object.keys(layoutLevel(s, null).pos)).toHaveLength(2);
  });

  it("puts a folder in the column of what it mostly holds", () => {
    let s = createSpec("T");
    s = addNode(s, { id: "feat-1", type: "feature", title: "F" });
    s = addNode(s, { id: "folder-s", type: "folder", title: "Screens" });
    s = addNode(s, { id: "scr-1", type: "screen", title: "S" });
    s = setFolder(s, "scr-1", "folder-s");
    const l = layoutLevel(s, null);
    expect(l.pos["folder-s"]!.x).toBeGreaterThan(l.pos["feat-1"]!.x);
  });

  it("finds the folder under a point, ignoring what is excluded", () => {
    const s = sample();
    const l = layoutLevel(s, null);
    const at = l.pos["folder-auth"]!;
    const inside = { x: at.x + 20, y: at.y + 20 };
    expect(folderAt(l, s, inside, new Set())).toBe("folder-auth");
    expect(folderAt(l, s, inside, new Set(["folder-auth"]))).toBeUndefined();
    expect(folderAt(l, s, { x: -5000, y: -5000 }, new Set())).toBeUndefined();
  });

  it("clears a node's saved position when it changes level", () => {
    let s = sample();
    s = setPosition(s, "screen-home", { x: 10, y: 10 });
    s = setFolder(s, "screen-home", "folder-auth");
    expect(s.nodes.find((n) => n.id === "screen-home")!.position).toBeUndefined();
  });
});

const box = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h });

describe("routing lines", () => {
  const rects = { a: box(0, 0), b: box(300, 0), c: box(300, 200) };

  it("leaves toward the other end and enters from the facing side", () => {
    const r = routeEdges([{ key: "k", from: "a", to: "b", kind: "relates" }], rects)["k"]!;
    expect(r.from.side).toBe("right");
    expect(r.to.side).toBe("left");
    const down = routeEdges([{ key: "k", from: "b", to: "c", kind: "relates" }], rects)["k"]!;
    expect(down.from.side).toBe("bottom");
    expect(down.to.side).toBe("top");
  });

  it("puts different kinds at different spots on the same side", () => {
    const r = routeEdges(
      [
        { key: "1", from: "a", to: "b", kind: "relates" },
        { key: "2", from: "a", to: "b", kind: "depends_on" },
        { key: "3", from: "a", to: "b", kind: "contains" },
      ],
      rects,
    );
    const offsets = ["1", "2", "3"].map((k) => r[k]!.from.offset);
    expect(new Set(offsets).size).toBe(3);
    expect(Math.min(...offsets)).toBeGreaterThan(0);
    expect(Math.max(...offsets)).toBeLessThan(1);
    // and the same on the receiving side
    expect(new Set(["1", "2", "3"].map((k) => r[k]!.to.offset)).size).toBe(3);
  });

  it("lets lines of the same kind share a spot", () => {
    const r = routeEdges(
      [
        { key: "1", from: "a", to: "b", kind: "relates" },
        { key: "2", from: "a", to: "c", kind: "relates" },
      ],
      rects,
    );
    expect(r["1"]!.from).toEqual(r["2"]!.from);
  });

  it("uses a saved anchor as is and spreads the others around it", () => {
    const saved = { side: "top" as const, offset: 0.3 };
    const r = routeEdges(
      [
        { key: "1", from: "a", to: "b", kind: "relates", fromAnchor: saved },
        { key: "2", from: "a", to: "b", kind: "depends_on" },
      ],
      rects,
    );
    expect(r["1"]!.from).toEqual(saved);
    expect(r["2"]!.from.side).toBe("right");
    expect(r["2"]!.from.offset).toBe(0.5); // alone on that side now
  });

  it("skips lines whose ends are not on screen", () => {
    expect(routeEdges([{ key: "k", from: "a", to: "zzz", kind: "relates" }], rects)).toEqual({});
  });
});

describe("anchors", () => {
  const r = box(100, 100, 200, 80);

  it("computes the attachment point", () => {
    expect(anchorPoint(r, { side: "left", offset: 0.5 })).toEqual({ x: 100, y: 140 });
    expect(anchorPoint(r, { side: "right", offset: 0.25 })).toEqual({ x: 300, y: 120 });
    expect(anchorPoint(r, { side: "top", offset: 0.5 })).toEqual({ x: 200, y: 100 });
    expect(anchorPoint(r, { side: "bottom", offset: 1 })).toEqual({ x: 300, y: 180 });
  });

  it("snaps a dragged point to the nearest side and keeps it off the corners", () => {
    expect(nearestAnchor(r, { x: 50, y: 140 })).toEqual({ side: "left", offset: 0.5 });
    expect(nearestAnchor(r, { x: 350, y: 120 }).side).toBe("right");
    const top = nearestAnchor(r, { x: 150, y: 20 });
    expect(top.side).toBe("top");
    expect(top.offset).toBeCloseTo(0.25);
    expect(nearestAnchor(r, { x: -500, y: 500 }).offset).toBeGreaterThanOrEqual(0.08);
    expect(nearestAnchor(r, { x: -500, y: 500 }).offset).toBeLessThanOrEqual(0.92);
  });

  it("routes lines at right angles from one point to the other", () => {
    const cases: [Side, Side, XY, XY][] = [
      ["right", "left", { x: 0, y: 0 }, { x: 300, y: 120 }],
      ["left", "right", { x: 300, y: 0 }, { x: 0, y: 120 }],
      ["bottom", "top", { x: 0, y: 0 }, { x: 160, y: 300 }],
      ["right", "left", { x: 0, y: 0 }, { x: 30, y: 100 }], // no room between the boxes
      ["right", "right", { x: 0, y: 0 }, { x: 200, y: 100 }],
      ["right", "top", { x: 0, y: 0 }, { x: 300, y: 200 }],
    ];
    for (const [sa, sb, pa, pb] of cases) {
      const pts = edgePolyline({ pt: pa, side: sa }, { pt: pb, side: sb });
      expect(pts[0]).toEqual(pa);
      expect(pts[pts.length - 1]).toEqual(pb);
      for (let i = 1; i < pts.length; i++) {
        const same = pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y;
        expect(same, `${sa}->${sb} segment ${i} is not axis-aligned`).toBe(true);
      }
    }
  });

  it("leaves and enters straight out of the side it is attached to", () => {
    const pts = edgePolyline({ pt: { x: 0, y: 0 }, side: "right" }, { pt: { x: 300, y: 120 }, side: "left" });
    expect(pts[1]!.y).toBe(0); // first stretch is horizontal
    expect(pts[1]!.x).toBeGreaterThan(0);
    expect(pts[pts.length - 2]!.y).toBe(120); // last stretch is horizontal too
  });

  it("gives different kinds different lanes, the same kind the same lane", () => {
    const a = { pt: { x: 0, y: 0 }, side: "right" as const };
    const b = { pt: { x: 400, y: 200 }, side: "left" as const };
    const bendX = (kind: Parameters<typeof laneFor>[0]) => edgePolyline(a, b, laneFor(kind))[1]!.x;
    const kinds = EDGE_KINDS.map(bendX);
    expect(new Set(kinds).size).toBe(EDGE_KINDS.length);
    expect(bendX("relates")).toBe(bendX("relates"));
    expect(Math.min(...kinds)).toBeGreaterThan(a.pt.x + 20);
    expect(Math.max(...kinds)).toBeLessThan(b.pt.x - 20);
  });

  it("builds a rounded path and a label point on the route", () => {
    const { d, mid } = edgePath({ pt: { x: 0, y: 0 }, side: "right" }, { pt: { x: 200, y: 100 }, side: "left" });
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("200 100")).toBe(true);
    expect(d).toContain(" Q ");
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(200);
  });
});

describe("saving anchors", () => {
  const withEdge = () => {
    let s = createSpec("T");
    s = addNode(s, { id: "a-1", type: "feature", title: "A" });
    s = addNode(s, { id: "b-1", type: "feature", title: "B" });
    return addEdge(s, { from: "a-1", to: "b-1", kind: "relates" });
  };

  it("stores and clears an end's anchor", () => {
    const e = { from: "a-1", to: "b-1", kind: "relates" as const };
    let s = setEdgeAnchor(withEdge(), e, "from", { side: "bottom", offset: 0.123456 });
    expect(s.edges[0]!.fromAnchor).toEqual({ side: "bottom", offset: 0.123 });
    expect(s.edges[0]!.toAnchor).toBeUndefined();
    s = setEdgeAnchor(s, e, "from", undefined);
    expect(s.edges[0]!.fromAnchor).toBeUndefined();
  });

  it("rejects unknown edges and out-of-range offsets", () => {
    expect(() => setEdgeAnchor(withEdge(), { from: "b-1", to: "a-1", kind: "relates" }, "from", { side: "left", offset: 0.5 })).toThrow(/no relates edge/);
    const raw = JSON.parse(JSON.stringify(setEdgeAnchor(withEdge(), { from: "a-1", to: "b-1", kind: "relates" }, "from", { side: "left", offset: 0.5 })));
    raw.edges[0].fromAnchor.offset = 1.5;
    expect(safeParseSpec(raw).success).toBe(false);
  });
});

describe("snapping to straight lines", () => {
  // a on the left, b to its right; the line runs from a's right-middle to b's left-middle
  const rects = { a: box(0, 0), b: box(300, 8) };
  const edges = [{ key: "k", from: "a", to: "b" }];
  const routes = routeEdges([{ key: "k", from: "a", to: "b", kind: "relates" }], rects);
  const snap = (id: string, pos: { x: number; y: number }, threshold = 10) =>
    snapForStraightLines({ id, pos, rects, routes, edges, threshold });

  it("moves a node so the line between two nodes becomes straight", () => {
    // b is at y=8, so its left-middle is at 38 while a's right-middle is at 30
    expect(snap("b", { x: 300, y: 8 })).toEqual({ x: 300, y: 0 });
    expect(snap("a", { x: 0, y: 0 })).toEqual({ x: 0, y: 8 }); // works from the other end too
  });

  it("leaves the node alone when it is too far from straight", () => {
    expect(snap("b", { x: 300, y: 40 })).toEqual({ x: 300, y: 40 });
    expect(snap("b", { x: 300, y: 8 }, 4)).toEqual({ x: 300, y: 8 });
  });

  it("only moves along the axis that straightens the line", () => {
    expect(snap("b", { x: 333, y: 5 }).x).toBe(333);
  });

  it("snaps top-to-bottom lines on the left-right axis", () => {
    const r = { a: box(0, 0), b: box(6, 200) };
    const rt = routeEdges([{ key: "k", from: "a", to: "b", kind: "relates" }], r);
    expect(rt["k"]!.from.side).toBe("bottom");
    const out = snapForStraightLines({ id: "b", pos: { x: 6, y: 200 }, rects: r, routes: rt, edges, threshold: 10 });
    expect(out).toEqual({ x: 0, y: 200 });
  });

  it("ignores lines with a corner and lines to nodes that are not on screen", () => {
    const mixed = { k: { from: { side: "right" as const, offset: 0.5 }, to: { side: "top" as const, offset: 0.5 } } };
    expect(snapForStraightLines({ id: "b", pos: { x: 300, y: 8 }, rects, routes: mixed, edges, threshold: 10 })).toEqual({ x: 300, y: 8 });
    expect(snapForStraightLines({ id: "zzz", pos: { x: 1, y: 2 }, rects, routes, edges, threshold: 10 })).toEqual({ x: 1, y: 2 });
  });

  it("picks the closest of several straightening positions", () => {
    // b has two lines coming in from the left, at different heights on its left side
    const rs = { a: box(0, 0), b: box(300, 8), c: box(0, -10) };
    const es = [
      { key: "1", from: "a", to: "b" },
      { key: "2", from: "c", to: "b" },
    ];
    const rt = routeEdges(
      [
        { key: "1", from: "a", to: "b", kind: "relates" },
        { key: "2", from: "c", to: "b", kind: "depends_on" },
      ],
      rs,
    );
    const at = (y: number, key: string) => anchorPoint({ ...rs.b, y }, rt[key]!.to).y;
    const want = (key: string, from: string) => anchorPoint(rs[from as "a" | "c"], rt[key]!.from).y;
    const gap1 = want("1", "a") - at(8, "1");
    const gap2 = want("2", "c") - at(8, "2");
    expect(Math.abs(gap1)).not.toBe(Math.abs(gap2));

    const out = snapForStraightLines({ id: "b", pos: { x: 300, y: 8 }, rects: rs, routes: rt, edges: es, threshold: 25 });
    const closer = Math.abs(gap1) < Math.abs(gap2) ? gap1 : gap2;
    expect(out.y).toBeCloseTo(8 + closer);
    // and with a smaller threshold only the nearer line can pull it
    const tight = snapForStraightLines({ id: "b", pos: { x: 300, y: 8 }, rects: rs, routes: rt, edges: es, threshold: Math.abs(closer) + 0.5 });
    expect(tight.y).toBeCloseTo(8 + closer);
  });
});
