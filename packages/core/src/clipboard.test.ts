import { describe, expect, it } from "vitest";
import {
  addEdge,
  addNode,
  alignMinimum,
  alignNodes,
  copyNodes,
  createSpec,
  pasteNodes,
  setFolder,
  setPosition,
  type ProjectSpec,
  type Rect,
  groupByKind,
} from "./index.js";

const sample = (): ProjectSpec => {
  let s = createSpec("T");
  s = addNode(s, { id: "feat-1", type: "feature", title: "Login", external: { figmaNodeId: "1:2" } });
  s = addNode(s, { id: "screen-1", type: "screen", title: "Home" });
  s = addNode(s, { id: "task-1", type: "task", title: "Build" });
  s = setPosition(s, "feat-1", { x: 100, y: 50 });
  s = setPosition(s, "screen-1", { x: 400, y: 50 });
  s = addEdge(s, { from: "feat-1", to: "screen-1", kind: "relates", label: "opens" });
  s = addEdge(s, { from: "task-1", to: "feat-1", kind: "implements" });
  return s;
};

const title = (s: ProjectSpec, id: string) => s.nodes.find((n) => n.id === id)!.title;

describe("copy and paste", () => {
  it("adds a copy with (2) after the name, to the right of the original", () => {
    const s = sample();
    const clip = copyNodes(s, ["feat-1"]);
    const { spec, ids } = pasteNodes(s, clip, { dx: 260 });
    expect(ids).toHaveLength(1);
    const copy = spec.nodes.find((n) => n.id === ids[0])!;
    expect(copy.title).toBe("Login (2)");
    expect(copy.type).toBe("feature");
    expect(copy.position).toEqual({ x: 360, y: 50 });
    expect(spec.nodes).toHaveLength(4);
    expect(title(spec, "feat-1")).toBe("Login"); // the original is untouched
  });

  it("numbers further copies instead of stacking (2) (2)", () => {
    let s = sample();
    const clip = copyNodes(s, ["feat-1"]);
    s = pasteNodes(s, clip).spec;
    s = pasteNodes(s, clip).spec;
    const titles = s.nodes.map((n) => n.title).filter((t) => t.startsWith("Login"));
    expect(titles.sort()).toEqual(["Login", "Login (2)", "Login (3)"]);
    const again = pasteNodes(s, copyNodes(s, [s.nodes.find((n) => n.title === "Login (2)")!.id])).spec;
    expect(again.nodes.some((n) => n.title === "Login (2) (2)")).toBe(false);
    expect(again.nodes.some((n) => n.title === "Login (4)")).toBe(true);
  });

  it("gives copies fresh ids and drops links to external tools", () => {
    const s = sample();
    const { spec, ids } = pasteNodes(s, copyNodes(s, ["feat-1"]));
    expect(ids[0]).toBe("feat-2");
    expect(new Set(spec.nodes.map((n) => n.id)).size).toBe(spec.nodes.length);
    expect(spec.nodes.find((n) => n.id === ids[0])!.external).toBeUndefined();
    expect(s.nodes.find((n) => n.id === "feat-1")!.external).toBeDefined();
  });

  it("copies lines to the same other nodes", () => {
    const s = sample();
    const { spec, ids } = pasteNodes(s, copyNodes(s, ["feat-1"]));
    const mine = spec.edges.filter((e) => e.from === ids[0] || e.to === ids[0]);
    expect(mine).toEqual(
      expect.arrayContaining([
        { from: ids[0], to: "screen-1", kind: "relates", label: "opens" },
        { from: "task-1", to: ids[0], kind: "implements" },
      ]),
    );
    expect(mine).toHaveLength(2);
  });

  it("connects copies to each other when both ends were copied", () => {
    const s = sample();
    const { spec, ids } = pasteNodes(s, copyNodes(s, ["feat-1", "screen-1"]));
    const [f, h] = [ids[0]!, ids[1]!];
    expect(spec.edges).toContainEqual({ from: f, to: h, kind: "relates", label: "opens" });
    expect(spec.edges).not.toContainEqual({ from: f, to: "screen-1", kind: "relates", label: "opens" });
  });

  it("does not make a copied parent adopt children that were not copied", () => {
    let s = sample();
    s = addEdge(s, { from: "feat-1", to: "task-1", kind: "contains" });
    const { spec, ids } = pasteNodes(s, copyNodes(s, ["feat-1"]));
    expect(spec.edges.filter((e) => e.kind === "contains" && e.to === "task-1")).toHaveLength(1);
    expect(spec.edges.some((e) => e.kind === "contains" && e.from === ids[0])).toBe(false);
  });

  it("gives a copied child the same parent", () => {
    let s = sample();
    s = addEdge(s, { from: "feat-1", to: "screen-1", kind: "contains" });
    const { spec, ids } = pasteNodes(s, copyNodes(s, ["screen-1"]));
    expect(spec.edges).toContainEqual({ from: "feat-1", to: ids[0], kind: "contains" });
  });

  it("copies everything inside a folder along with it", () => {
    let s = sample();
    s = addNode(s, { id: "folder-1", type: "folder", title: "Auth" });
    s = setFolder(s, "screen-1", "folder-1");
    const clip = copyNodes(s, ["folder-1"]);
    expect(clip.nodes.map((n) => n.id).sort()).toEqual(["folder-1", "screen-1"]);
    expect(clip.roots).toEqual(["folder-1"]);

    const { spec, ids } = pasteNodes(s, clip);
    const folderCopy = spec.nodes.find((n) => n.id === ids[0])!;
    expect(folderCopy.title).toBe("Auth (2)");
    const inside = spec.nodes.filter((n) => n.folderId === folderCopy.id);
    expect(inside).toHaveLength(1);
    expect(inside[0]!.title).toBe("Home"); // things inside keep their names
    expect(spec.nodes.find((n) => n.id === "screen-1")!.folderId).toBe("folder-1"); // original stays put
  });

  it("keeps a copy in the same folder as its original", () => {
    let s = sample();
    s = addNode(s, { id: "folder-1", type: "folder", title: "Auth" });
    s = setFolder(s, "task-1", "folder-1");
    const { spec, ids } = pasteNodes(s, copyNodes(s, ["task-1"]));
    expect(spec.nodes.find((n) => n.id === ids[0])!.folderId).toBe("folder-1");
  });

  it("uses the positions it is told for nodes without a saved one", () => {
    const s = sample();
    const clip = copyNodes(s, ["task-1"], { "task-1": { x: 10, y: 20 } });
    const { spec, ids } = pasteNodes(s, clip, { dx: 100 });
    expect(spec.nodes.find((n) => n.id === ids[0])!.position).toEqual({ x: 110, y: 20 });
  });

  it("skips lines to nodes deleted since copying and refuses to copy nothing", () => {
    let s = sample();
    const clip = copyNodes(s, ["feat-1"]);
    s = { ...s, nodes: s.nodes.filter((n) => n.id !== "screen-1"), edges: s.edges.filter((e) => e.to !== "screen-1") };
    const { spec, ids } = pasteNodes(s, clip);
    expect(spec.edges.filter((e) => e.from === ids[0] || e.to === ids[0])).toHaveLength(1);
    expect(() => copyNodes(s, ["ghost"])).toThrow(/nothing to copy/);
  });
});

const r = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h });

describe("aligning nodes", () => {
  const rects = { a: r(0, 10, 100, 60), b: r(200, 50, 60, 40), c: r(500, 0, 80, 100) };
  const ids = ["a", "b", "c"];

  it("lines up edges", () => {
    expect(alignNodes(rects, ids, "left")).toEqual({ a: { x: 0, y: 10 }, b: { x: 0, y: 50 }, c: { x: 0, y: 0 } });
    expect(alignNodes(rects, ids, "right")).toEqual({ a: { x: 480, y: 10 }, b: { x: 520, y: 50 }, c: { x: 500, y: 0 } });
    expect(alignNodes(rects, ids, "top")).toEqual({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 500, y: 0 } });
    expect(alignNodes(rects, ids, "bottom")).toEqual({ a: { x: 0, y: 40 }, b: { x: 200, y: 60 }, c: { x: 500, y: 0 } });
  });

  it("centers on the middle of the whole group", () => {
    const out = alignNodes(rects, ids, "center"); // group spans x 0..580, middle 290
    expect(out["a"]!.x).toBe(240);
    expect(out["b"]!.x).toBe(260);
    expect(out["c"]!.x).toBe(250);
    const mid = alignNodes(rects, ids, "middle"); // group spans y 0..100, middle 50
    expect(mid["a"]!.y).toBe(20);
    expect(mid["b"]!.y).toBe(30);
    expect(mid["c"]!.y).toBe(0);
  });

  it("spaces nodes evenly between the two outermost ones", () => {
    const out = alignNodes(rects, ids, "distribute-h");
    // widths 100+60+80 = 240 inside 0..580 leaves 340, so two gaps of 170
    expect(out["a"]).toEqual({ x: 0, y: 10 });
    expect(out["b"]).toEqual({ x: 270, y: 50 });
    expect(out["c"]).toEqual({ x: 500, y: 0 });
    const tall = { a: r(0, 0, 50, 50), b: r(0, 30, 50, 50), c: r(0, 400, 50, 50) };
    const v = alignNodes(tall, ids, "distribute-v");
    expect(v["a"]!.y).toBe(0);
    expect(v["c"]!.y).toBe(400);
    expect(v["b"]!.y).toBe(200); // gaps of (450 - 150) / 2 = 150: a ends at 50, b spans 200..250, c starts at 400
  });

  it("orders by position, not by the order of the ids", () => {
    const out = alignNodes(rects, ["c", "a", "b"], "distribute-h");
    expect(out["b"]!.x).toBe(270);
  });

  it("needs two nodes, or three to space evenly", () => {
    expect(alignMinimum("left")).toBe(2);
    expect(alignMinimum("distribute-v")).toBe(3);
    expect(alignNodes(rects, ["a"], "left")).toEqual({});
    expect(alignNodes(rects, ["a", "b"], "distribute-h")).toEqual({});
    expect(Object.keys(alignNodes(rects, ["a", "b"], "top"))).toHaveLength(2);
    expect(alignNodes(rects, ["a", "nope"], "left")).toEqual({});
  });
});

describe("groupByKind", () => {
  const many = () => {
    let s = createSpec("T");
    for (const id of ["f1", "f2", "f3"]) s = addNode(s, { id, type: "feature", title: id });
    for (const id of ["s1", "s2"]) s = addNode(s, { id, type: "screen", title: id });
    s = addEdge(s, { from: "s1", to: "f1", kind: "relates" });
    return s;
  };

  it("makes a folder for each kind that has enough nodes and leaves the rest", () => {
    const s = groupByKind(many());
    const folder = s.nodes.find((n) => n.id === "folder-feature");
    expect(folder?.type).toBe("folder");
    expect(["f1", "f2", "f3"].every((id) => s.nodes.find((n) => n.id === id)?.folderId === "folder-feature")).toBe(true);
    expect(s.nodes.find((n) => n.id === "s1")?.folderId).toBeUndefined(); // only two screens
    expect(s.edges).toHaveLength(1);
  });

  it("honors min, reuses an existing folder and does not nest it twice", () => {
    let s = groupByKind(many(), { min: 2 });
    expect(s.nodes.filter((n) => n.type === "folder").map((n) => n.id).sort()).toEqual(["folder-feature", "folder-screen"]);
    s = addNode(s, { id: "f4", type: "feature", title: "f4" });
    s = groupByKind(s, { min: 2 });
    expect(s.nodes.filter((n) => n.type === "folder")).toHaveLength(2);
    expect(s.nodes.find((n) => n.id === "f4")?.folderId).toBe("folder-feature");
  });
});
