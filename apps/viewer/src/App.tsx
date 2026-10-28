import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { ChevronRight, FilePlus, FlaskConical, FolderOpen, LayoutGrid, Redo2, Save, Undo2, X } from "lucide-react";
import {
  FOLDER_W,
  NODE_H,
  NODE_W,
  QUESTION_BANK,
  addEdge,
  addNode,
  alignNodes,
  anchorPoint,
  clearPositions,
  copyNodes,
  computeCompleteness,
  computeRollup,
  edgePath,
  exportMarkdown,
  folderAt,
  folderDescendants,
  folderPath,
  getQuestion,
  laneFor,
  layoutLevel,
  levelEdges,
  markReviewed,
  moveNodes,
  nearestAnchor,
  openQuestions,
  pasteNodes,
  removeEdge,
  removeNode,
  renameProject,
  reviewNode,
  routeEdges,
  setEdgeAnchor,
  setFolder,
  setOutputLanguage,
  setStatus,
  snapForStraightLines,
  uniqueNodeId,
  type AlignMode,
  type Anchor,
  type Clipboard,
  type EdgeKind,
  type LevelEdge,
  type LevelLayout,
  type NodeType,
  type Rect,
  type Route,
  type Status,
  type XY,
} from "@scenario/core";
import { McpDialog, NewProjectDialog, PreviewDialog, RenameDialog, AGENT_PROMPT, copyText } from "./Dialogs";
import { edgeTypes, type RoutedData } from "./Edges";
import { EDGE_DASH, EDGE_STROKE, ID_PREFIX, NODE_DEFAULTS, NODE_ICON } from "./icons";
import { nodeTypes, TYPE_LABEL, type ScenarioNode } from "./Nodes";
import { Detail, EDGE_LABEL } from "./Panels";
import { Sidebar } from "./Sidebar";
import { describeError, useProject } from "./project";
import { QuestionPanel, type QuestionTab } from "./QuestionPanel";
import { Ribbon } from "./Ribbon";
import { buildTabs, type Theme } from "./ribbonTabs";

const EMPTY_LAYOUT: LevelLayout = { ids: [], pos: {}, size: {}, members: {} };
type SameEdge = { from: string; to: string; kind: EdgeKind };
const sameEdge = (a: SameEdge, b: SameEdge) => a.from === b.from && a.to === b.to && a.kind === b.kind;

/** A line end being dragged to a new spot on its node. */
interface AnchorDraft {
  edge: SameEdge;
  end: "from" | "to";
  anchor: Anchor;
}

const EDGE_ARROW: Record<EdgeKind, boolean> = {
  contains: false,
  implements: true,
  navigates: true,
  depends_on: true,
  uses_data: true,
  blocks: true,
  relates: false,
};

// The minimap draws to SVG attributes where CSS variables are not reliable, so mirror the status tokens.
const MINIMAP_COLOR: Record<string, string> = {
  planned: "#9ca3af",
  in_progress: "#3b82f6",
  blocked: "#eab308",
  done: "#22c55e",
};

type PlaceTarget =
  | { kind: "point"; point: XY }
  | { kind: "node"; id: string }
  | { kind: "folder"; id: string; point: XY };

type Dialog = null | "new" | "rename-project" | "preview" | "mcp";

function readTheme(): Theme {
  try {
    const v = localStorage.getItem("scenario.theme");
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function App() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}

function Workspace() {
  const p = useProject();
  const { spec, source, apply } = p;
  const flow = useReactFlow();

  const [tab, setTab] = useState("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ from: string; to: string; kind: EdgeKind } | null>(null);
  /** Several selected nodes (two or more), picked by dragging a box with the right mouse button. */
  const [multi, setMulti] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const multiRef = useRef<string[]>([]);
  multiRef.current = multi;
  /** What Ctrl+C kept, and how many times it has been pasted (each paste lands one step further right). */
  const clipRef = useRef<{ data: Clipboard; pastes: number; width: number } | null>(null);
  const [linkMode, setLinkMode] = useState<{ kind: EdgeKind; from: string } | null>(null);
  /** Node type picked in the Insert tab; the next click on the canvas places it. */
  const [placing, setPlacing] = useState<NodeType | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [qOpen, setQOpen] = useState(false);
  const [qTab, setQTab] = useState<QuestionTab>("next");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [aiOnly, setAiOnly] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EdgeKind>>(new Set());
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  /** The folder whose diagram is open; null is the main diagram. */
  const [view, setView] = useState<string | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<AnchorDraft | null>(null);
  const draftRef = useRef<AnchorDraft | null>(null);
  /** Where each dragged node actually is (after snapping); this, not the raw pointer position, is what gets saved. */
  const dragRef = useRef<Record<string, XY>>({});
  /** Holding Alt while dragging turns snapping off. */
  const altRef = useRef(false);
  /** What the diagram last drew, for the long-press handler (which outlives a render). */
  const routing = useRef<{ edges: LevelEdge[]; rects: Record<string, Rect>; routes: Record<string, Route> }>({
    edges: [],
    rects: {},
    routes: {},
  });
  /** Handlers the diagram nodes and edges call; kept in a ref so they never go stale inside memoized data. */
  const act = useRef<{
    pill: (id: string, e: React.MouseEvent) => void;
    pillOpen: (id: string) => void;
    pillRemove: (id: string) => void;
    longPress: (edgeId: string, cx: number, cy: number) => void;
  }>({ pill: () => {}, pillOpen: () => {}, pillRemove: () => {}, longPress: () => {} });
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("scenario.theme", theme);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, [theme]);

  // toast auto-dismiss
  useEffect(() => {
    if (!p.notice) return;
    const t = setTimeout(p.dismissNotice, p.notice.tone === "error" ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [p.notice, p.dismissNotice]);

  const rollup = useMemo(() => (spec ? computeRollup(spec) : {}), [spec]);
  const comp = useMemo(() => (spec ? computeCompleteness(QUESTION_BANK, spec) : null), [spec]);
  const layout = useMemo(() => (spec ? layoutLevel(spec, view) : EMPTY_LAYOUT), [spec, view]);

  // Drop a selection that no longer exists (deleted, undone, or changed by an agent).
  useEffect(() => {
    if (spec && selectedId && !spec.nodes.some((n) => n.id === selectedId)) setSelectedId(null);
    if (spec && multi.length > 0) {
      const alive = multi.filter((id) => spec.nodes.some((n) => n.id === id));
      if (alive.length !== multi.length) setMulti(alive.length > 1 ? alive : []);
    }
    if (spec && selectedEdge && !spec.edges.some((e) => e.from === selectedEdge.from && e.to === selectedEdge.to && e.kind === selectedEdge.kind)) {
      setSelectedEdge(null);
    }
  }, [spec, selectedId, selectedEdge, multi]);

  useEffect(() => {
    if (spec && view && !spec.nodes.some((n) => n.id === view && n.type === "folder")) setView(null);
  }, [spec, view]);

  // frame the diagram whenever another level is opened
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.2 }), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setSelectedEdge(null);
    setMulti([]);
    if (id) setQOpen(false);
  };

  const selectedNode = spec?.nodes.find((n) => n.id === selectedId) ?? null;
  /** Everything that is selected right now: the several picked by a box, or the one clicked. */
  const selectedIds = multi.length > 1 ? multi : selectedId ? [selectedId] : [];

  /** Shift+click: add the node to what is selected, or take it out if it already is. */
  const toggleInSelection = (id: string) => {
    selectMany(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const selectMany = (ids: string[]) => {
    if (ids.length <= 1) {
      select(ids[0] ?? null);
      return;
    }
    setMulti(ids);
    setSelectedId(null);
    setSelectedEdge(null);
    setQOpen(false);
  };

  /* ---------- actions ---------- */

  const openFile = async () => {
    const needInput = await p.openFile();
    if (needInput) fileInput.current?.click();
  };

  /** Picking a type in the Insert tab arms the placing tool; picking it again disarms it. */
  const startPlacing = (type: NodeType) => {
    setLinkMode(null);
    setPlacing((cur) => (cur === type ? null : type));
  };

  /**
   * Create a node of the armed type at the level that is open.
   *  - empty canvas: at the click
   *  - an existing node: beside it and connected as its child (the folder tool wraps that node instead)
   *  - inside a folder box: kept in that folder (it shows up there as a pill)
   */
  const place = (target: PlaceTarget, keep: boolean) => {
    if (!spec || !placing) return;
    const type = placing;
    const isFolder = type === "folder";
    const id = uniqueNodeId(spec, ID_PREFIX[type]);
    const size = isFolder ? { width: FOLDER_W, height: 80 } : { width: NODE_W, height: NODE_H };
    const node: Record<string, unknown> = { id, type, title: `새 ${TYPE_LABEL[type]}`, ...NODE_DEFAULTS[type] };
    let parentId: string | undefined;
    let wrap: string | undefined;

    if (target.kind === "folder") {
      node.folderId = target.id; // no position: members are listed, not placed
    } else {
      if (view) node.folderId = view;
      if (target.kind === "point") {
        node.position = {
          x: Math.round(target.point.x - size.width / 2),
          y: Math.round(target.point.y - size.height / 2),
        };
      } else if (isFolder) {
        // wrap the clicked node: the folder takes its place and the node becomes a pill inside
        const at = layout.pos[target.id] ?? { x: 0, y: 0 };
        node.position = { x: Math.round(at.x), y: Math.round(at.y) };
        wrap = target.id;
      } else {
        parentId = target.id;
        const base = layout.pos[parentId] ?? { x: 0, y: 0 };
        const kids = spec.edges
          .filter((e) => e.kind === "contains" && e.from === parentId)
          .map((e) => layout.pos[e.to])
          .filter((p): p is XY => !!p);
        const spot = kids.length
          ? { x: kids[0]!.x, y: Math.max(...kids.map((k) => k.y)) + NODE_H + 28 }
          : { x: base.x + 320, y: base.y };
        node.position = { x: Math.round(spot.x), y: Math.round(spot.y) };
      }
    }

    const ok = apply((s0) => {
      let next = addNode(s0, node, { parentId });
      if (wrap) next = setFolder(next, wrap, id);
      return next;
    });
    if (ok) {
      setSelectedEdge(null);
      setSelectedId(id);
      setQOpen(false);
      if (!keep) setPlacing(null);
    }
  };

  /**
   * After a drag: dropping on a folder box files the node in that folder (the mouse position
   * decides, since that is what the user sees); otherwise the new position is saved.
   */
  const commitDrag = (id: string, pos: XY, pointer: XY) => {
    if (!spec) return;
    const node = spec.nodes.find((n) => n.id === id);
    if (!node) return;
    const exclude = new Set([id, ...(node.type === "folder" ? folderDescendants(spec, id) : [])]);
    const target = folderAt(layout, spec, pointer, exclude);
    if (target) {
      apply((s0) => setFolder(s0, id, target));
      return;
    }
    const was = layout.pos[id];
    if (was && Math.round(was.x) === Math.round(pos.x) && Math.round(was.y) === Math.round(pos.y)) return;
    apply((s0) => moveNodes(s0, { [id]: pos }));
  };

  /* ---------- folders: opening, leaving, pills ---------- */

  const openFolder = (id: string | null) => {
    setView(id);
    setSelectedId(null);
    setSelectedEdge(null);
    setLinkMode(null);
    setMulti([]);
    setDrag({});
  };
  const folderUp = () => {
    if (!spec || !view) return;
    openFolder(spec.nodes.find((n) => n.id === view)?.folderId ?? null);
  };

  /** Lay out the nodes of the diagram that is open (other folders keep their arrangement). */
  const tidy = () => {
    if (!spec) return;
    setDrag({});
    apply((s0) => clearPositions(s0, view));
    setTimeout(() => flow.fitView({ padding: 0.2 }), 60);
  };

  const pillClick = (id: string, e: React.MouseEvent) => {
    if (!spec) return;
    if (placing) {
      const holder = spec.nodes.find((n) => n.id === id)?.folderId;
      if (holder) place({ kind: "folder", id: holder, point: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) }, e.shiftKey);
    } else if (linkMode) finishLink(id);
    else if (e.shiftKey) toggleInSelection(id);
    else select(id);
  };

  /** Double-clicking a pill opens the folder it sits in (or the folder it is). */
  const pillOpen = (id: string) => {
    const n = spec?.nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.type === "folder") openFolder(id);
    else if (n.folderId) {
      openFolder(n.folderId);
      setSelectedId(id);
    }
  };

  /** Take a node out of its folder; it lands next to that folder, one level up. */
  const pillRemove = (id: string) => {
    if (!spec) return;
    const holder = spec.nodes.find((n) => n.id === spec.nodes.find((x) => x.id === id)?.folderId);
    if (!holder) return;
    const at = layout.pos[holder.id];
    apply((s0) => {
      let next = setFolder(s0, id, holder.folderId);
      if (at) next = moveNodes(next, { [id]: { x: at.x + FOLDER_W + 40, y: at.y } });
      return next;
    });
  };

  /* ---------- moving where a line attaches (press and hold near its end) ---------- */

  const longPress = (edgeId: string, cx: number, cy: number) => {
    const { edges: shown, rects, routes } = routing.current;
    const le = shown.find((e) => e.key === edgeId);
    const route = routes[edgeId];
    if (!le?.direct || !route) return;

    const p = flow.screenToFlowPosition({ x: cx, y: cy });
    const ends = (["from", "to"] as const).map((end) => {
      const rect = rects[end === "from" ? le.from : le.to]!;
      const pt = anchorPoint(rect, route[end]);
      return { end, rect, dist: Math.hypot(p.x - pt.x, p.y - pt.y) };
    });
    const near = ends.reduce((a, b) => (b.dist < a.dist ? b : a));
    if (near.dist > 90 / flow.getZoom()) return; // only near a node; the middle of a line does nothing

    const edge = { from: le.direct.from, to: le.direct.to, kind: le.direct.kind };
    const first: AnchorDraft = { edge, end: near.end, anchor: route[near.end] };
    draftRef.current = first;
    setAnchorDraft(first);

    const move = (ev: PointerEvent) => {
      const at = flow.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const d = { ...draftRef.current!, anchor: nearestAnchor(near.rect, at) };
      draftRef.current = d;
      setAnchorDraft(d);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = draftRef.current;
      draftRef.current = null;
      setAnchorDraft(null);
      if (d) apply((s0) => setEdgeAnchor(s0, d.edge, d.end, d.anchor));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const remove = () => {
    if (selectedEdge) {
      apply((s) => removeEdge(s, selectedEdge));
      setSelectedEdge(null);
    } else if (multi.length > 1) {
      const ids = multi;
      apply((s) => ids.reduce((acc, id) => removeNode(acc, id), s));
      setMulti([]);
    } else if (selectedId) {
      apply((s) => removeNode(s, selectedId));
      setSelectedId(null);
    }
  };

  /** Ctrl+C: keep the selected nodes (with what is inside copied folders) and the lines that touch them. */
  const copySelected = () => {
    if (!spec || selectedIds.length === 0) return;
    const positions: Record<string, XY> = {};
    for (const id of selectedIds) {
      const at = layout.pos[id];
      if (at) positions[id] = at;
    }
    try {
      const data = copyNodes(spec, selectedIds, positions);
      const shown = data.roots.filter((id) => positions[id]);
      const left = Math.min(...shown.map((id) => positions[id]!.x));
      const right = Math.max(...shown.map((id) => positions[id]!.x + (layout.size[id]?.width ?? NODE_W)));
      clipRef.current = { data, pastes: 0, width: shown.length ? Math.max(NODE_W, right - left) : NODE_W };
      p.tell(`${data.roots.length}개를 복사했습니다.`);
    } catch (e) {
      p.tell(describeError(e), "error");
    }
  };

  /** Ctrl+V: the copies appear to the right of the originals, named "… (2)", with the same lines. */
  const pasteCopied = () => {
    const clip = clipRef.current;
    if (!spec || !clip) return;
    clip.pastes += 1;
    const dx = (clip.width + 40) * clip.pastes;
    let created: string[] = [];
    const ok = apply((s0) => {
      const r = pasteNodes(s0, clip.data, { dx });
      created = r.ids;
      return r.spec;
    });
    if (ok) {
      selectMany(created);
      p.tell(`${created.length}개를 붙여넣었습니다.`);
    }
  };

  /** Line the selected nodes up, like Align in PowerPoint. */
  const align = (mode: AlignMode) => {
    const rects: Record<string, Rect> = {};
    for (const id of selectedIds) {
      const at = layout.pos[id];
      const sz = layout.size[id];
      if (at && sz) rects[id] = { x: at.x, y: at.y, w: sz.width, h: sz.height };
    }
    const moves = alignNodes(rects, Object.keys(rects), mode);
    if (Object.keys(moves).length > 0) apply((s0) => moveNodes(s0, moves));
  };

  /**
   * Dragging with the right mouse button draws a box; every node it touches gets selected.
   * A right click without dragging just cancels the insert tool.
   */
  const startMarquee = (e: React.MouseEvent) => {
    if (e.button !== 2) return;
    if ((e.target as HTMLElement).closest(".react-flow__controls, .react-flow__minimap, .tidy-btn, .crumbs")) return;
    const from = { x: e.clientX, y: e.clientY };
    let dragged = false;
    const move = (ev: MouseEvent) => {
      if (!dragged && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 5) return;
      dragged = true;
      setMarquee({ x1: from.x, y1: from.y, x2: ev.clientX, y2: ev.clientY });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setMarquee(null);
      if (!dragged) {
        setPlacing(null);
        return;
      }
      const left = Math.min(from.x, ev.clientX);
      const right = Math.max(from.x, ev.clientX);
      const top = Math.min(from.y, ev.clientY);
      const bottom = Math.max(from.y, ev.clientY);
      const ids = [...document.querySelectorAll<HTMLElement>(".react-flow__node")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > left && r.left < right && r.bottom > top && r.top < bottom;
        })
        .map((el) => el.dataset.id!)
        .filter(Boolean);
      selectMany(ids);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  /** After dragging several selected nodes together: drop them into a folder, or save where they landed. */
  const commitGroupDrag = (ids: string[], positions: Record<string, XY>, pointer: XY) => {
    if (!spec) return;
    const exclude = new Set(ids);
    for (const id of ids) {
      if (spec.nodes.find((n) => n.id === id)?.type === "folder") for (const d of folderDescendants(spec, id)) exclude.add(d);
    }
    const target = folderAt(layout, spec, pointer, exclude);
    if (target) apply((s0) => ids.reduce((acc, id) => setFolder(acc, id, target), s0));
    else apply((s0) => moveNodes(s0, positions));
  };

  const startLink = (kind: EdgeKind) => {
    if (!selectedId) return;
    setPlacing(null);
    setLinkMode({ kind, from: selectedId });
  };

  const finishLink = (to: string) => {
    if (!linkMode) return;
    if (to === linkMode.from) {
      p.tell("자기 자신에게는 연결할 수 없습니다.", "error");
      return;
    }
    apply((s) => addEdge(s, { from: linkMode.from, to, kind: linkMode.kind }));
    setLinkMode(null);
  };

  const openQuestionsPanel = (t: QuestionTab) => {
    setQTab(t);
    setFocusId(null);
    setQOpen(true);
    setSelectedId(null);
    setSelectedEdge(null);
  };

  /** Open one question from the sidebar list, ready to answer. */
  const openQuestion = (id: string) => {
    setFocusId(id);
    setQOpen(true);
    setSelectedId(null);
    setSelectedEdge(null);
  };

  const approveAllAi = () => {
    if (!spec) return;
    apply((s) => {
      let next = s;
      for (const a of s.answers) {
        if (a.state === "ai_decided" && !a.provenance.reviewed) next = markReviewed(next, a.questionId);
      }
      for (const n of s.nodes) {
        if (n.provenance?.source === "ai" && !n.provenance.reviewed) next = reviewNode(next, n.id);
      }
      return next;
    });
  };

  const copy = async (text: string, what: string) => {
    p.tell((await copyText(text)) ? `${what}을(를) 복사했습니다.` : "복사하지 못했습니다. 브라우저 권한을 확인하세요.", "info");
  };

  const mermaid = () => {
    if (!spec) return "";
    const m = /```mermaid\n([\s\S]*?)```/.exec(exportMarkdown(spec)["FLOWS.md"] ?? "");
    return m?.[1]?.trim() ?? "";
  };

  /* ---------- keyboard ---------- */

  const keys = useRef({ p, remove, copy: copySelected, paste: pasteCopied, selectedId, selectedEdge, multi, linkMode, placing, dialog });
  keys.current = { p, remove, copy: copySelected, paste: pasteCopied, selectedId, selectedEdge, multi, linkMode, placing, dialog };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const el = e.target as HTMLElement;
      const typing = el.matches("input, textarea, select, [contenteditable]");
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape" && (k.linkMode || k.placing || k.multi.length > 0)) {
        setLinkMode(null);
        setPlacing(null);
        setMulti([]);
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void k.p.save();
        return;
      }
      if (typing || k.dialog) return;
      if (mod && e.key.toLowerCase() === "c" && (k.selectedId || k.multi.length > 0)) {
        e.preventDefault();
        k.copy();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        k.paste();
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        k.p.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        k.p.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && (k.selectedId || k.selectedEdge || k.multi.length > 0)) {
        e.preventDefault();
        k.remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- diagram data ---------- */

  const { nodes, edges } = useMemo(() => {
    if (!spec) return { nodes: [] as ScenarioNode[], edges: [] as Edge[] };
    const byId = new Map(spec.nodes.map((n) => [n.id, n] as const));
    const rects: Record<string, Rect> = {};

    const nodes: ScenarioNode[] = layout.ids.map((id) => {
      const n = byId.get(id)!;
      const ai = n.provenance?.source === "ai";
      const isFolder = n.type === "folder";
      const size = layout.size[id]!;
      const at = drag[id] ?? layout.pos[id]!;
      rects[id] = { x: at.x, y: at.y, w: size.width, h: size.height };
      return {
        id,
        type: isFolder ? "folder" : "scenario",
        position: at,
        style: { width: size.width, height: size.height },
        // We build fresh node objects on every render. Without this, React Flow treats each one as not yet
        // measured and hides it (and refuses to drag it) until it measures again, so the whole diagram
        // flickers or vanishes while dragging. The size is ours to give: it is what the style above sets.
        measured: { width: size.width, height: size.height },
        selected: id === selectedId || id === linkMode?.from || multi.includes(id),
        data: {
          title: n.title,
          kind: n.type,
          status: rollup[id] ?? n.status,
          ai,
          unreviewed: ai && !n.provenance?.reviewed,
          dim: aiOnly && !ai,
          folder: isFolder
            ? {
                pills: (layout.members[id] ?? []).map((mid) => {
                  const m = byId.get(mid)!;
                  return {
                    id: mid,
                    title: m.title,
                    kind: m.type,
                    status: rollup[mid] ?? m.status,
                    ai: m.provenance?.source === "ai",
                    selected: mid === selectedId,
                  };
                }),
                onPill: (pid, e) => act.current.pill(pid, e),
                onPillOpen: (pid) => act.current.pillOpen(pid),
                onPillRemove: (pid) => act.current.pillRemove(pid),
              }
            : undefined,
        },
      };
    });

    // Lines: a node inside a folder is drawn as that folder, so its lines belong to the folder.
    const shown = levelEdges(spec, view).filter((e) => !hiddenKinds.has(e.kind));
    const draftOf = (e: LevelEdge) => (anchorDraft && e.direct && sameEdge(e.direct, anchorDraft.edge) ? anchorDraft : undefined);
    const routes = routeEdges(
      shown.map((e) => {
        const d = draftOf(e);
        return {
          key: e.key,
          from: e.from,
          to: e.to,
          kind: e.kind,
          fromAnchor: d?.end === "from" ? d.anchor : e.direct?.fromAnchor,
          toAnchor: d?.end === "to" ? d.anchor : e.direct?.toAnchor,
        };
      }),
      rects,
    );
    routing.current = { edges: shown, rects, routes };

    const edges: Edge[] = shown.flatMap((e) => {
      const r = routes[e.key];
      if (!r) return [];
      const a = { pt: anchorPoint(rects[e.from]!, r.from), side: r.from.side };
      const b = { pt: anchorPoint(rects[e.to]!, r.to), side: r.to.side };
      const { d, mid } = edgePath(a, b, laneFor(e.kind));
      const stroke = EDGE_STROKE[e.kind];
      const draft = draftOf(e);
      const data: RoutedData = {
        d,
        mid,
        stroke,
        dash: EDGE_DASH[e.kind],
        width: e.kind === "contains" ? 1.5 : 2,
        label: e.label,
        count: e.count,
        editable: !!e.direct,
        editing: draft ? { end: draft.end, at: draft.end === "from" ? a.pt : b.pt } : undefined,
        onLongPress: (edgeId, cx, cy) => act.current.longPress(edgeId, cx, cy),
      };
      return [
        {
          id: e.key,
          source: e.from,
          target: e.to,
          type: "routed",
          selected: !!selectedEdge && !!e.direct && sameEdge(e.direct, selectedEdge),
          markerEnd: EDGE_ARROW[e.kind] ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
          data,
        },
      ];
    });
    return { nodes, edges };
  }, [spec, layout, view, rollup, selectedId, selectedEdge, multi, linkMode, hiddenKinds, aiOnly, drag, anchorDraft]);

  // Current handlers for the memoized nodes and edges above.
  act.current = { pill: pillClick, pillOpen, pillRemove, longPress };

  const onNodesChange = useCallback(
    (changes: NodeChange<ScenarioNode>[]) => {
      for (const c of changes) {
        if (c.type !== "position" || !c.position) continue;
        const { id } = c;
        let position = c.position;
        // Lines that are nearly straight pull the node into line with the node on the other end. This also
        // applies to the final change React Flow sends when the mouse is released, so the saved spot is the snapped one.
        const inGroup = multiRef.current.length > 1 && multiRef.current.includes(id);
        if (!altRef.current && !inGroup) {
          const r = routing.current;
          position = snapForStraightLines({
            id,
            pos: position,
            rects: r.rects,
            routes: r.routes,
            edges: r.edges,
            threshold: 10 / flow.getZoom(),
          });
        }
        dragRef.current[id] = position;
        setDrag((d) => ({ ...d, [id]: position }));
      }
    },
    [flow],
  );

  useEffect(() => {
    const set = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === "Alt") altRef.current = down;
    };
    const onDown = set(true);
    const onUp = set(false);
    const onBlur = () => {
      altRef.current = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /* ---------- ribbon ---------- */

  const openRequired = comp ? comp.missingP0.length : 0;
  const skippedCount = spec ? spec.answers.filter((a) => a.state === "skipped").length : 0;
  const reviewCount = spec
    ? spec.answers.filter((a) => a.state === "ai_decided" && !a.provenance.reviewed).length +
      spec.nodes.filter((n) => n.provenance?.source === "ai" && !n.provenance.reviewed).length
    : 0;

  const tabs = buildTabs({
    hasProject: !!spec,
    dirty: p.dirty,
    outputLanguage: spec?.project.outputLanguage ?? "en",
    selection: {
      count: selectedIds.length,
      single: selectedIds.length === 1 && selectedNode ? { id: selectedNode.id } : null,
      anyUnreviewed: selectedIds.some((id) => {
        const n = spec?.nodes.find((x) => x.id === id);
        return n?.provenance?.source === "ai" && !n.provenance.reviewed;
      }),
    },
    linkMode: linkMode?.kind ?? null,
    placing,
    view,
    badges: { openRequired, skipped: skippedCount, review: reviewCount },
    theme,
    showSidebar,
    showMinimap,
    aiOnly,
    hiddenKinds,
    a: {
      newProject: () => setDialog("new"),
      open: () => void openFile(),
      save: () => void p.save(),
      saveAs: () => void p.saveAs(),
      loadExample: () => {
        p.loadExample();
        select(null);
      },
      renameProject: () => setDialog("rename-project"),
      toggleLanguage: () => apply((s) => setOutputLanguage(s, s.project.outputLanguage === "en" ? "ko" : "en")),
      setStatus: (st: Status) => {
        const ids = selectedIds;
        if (ids.length > 0) apply((s) => ids.reduce((acc, id) => setStatus(acc, id, st), s));
      },
      align,
      reviewSelected: () => {
        const ids = selectedIds;
        if (ids.length > 0) apply((s) => ids.reduce((acc, id) => reviewNode(acc, id), s));
      },
      approveAllAi,
      startPlacing,
      folderUp,
      folderHome: () => openFolder(null),
      startLink,
      openQuestions: openQuestionsPanel,
      setTheme: setThemeState,
      tidy,
      zoomIn: () => void flow.zoomIn(),
      zoomOut: () => void flow.zoomOut(),
      fit: () => void flow.fitView({ padding: 0.2 }),
      toggleSidebar: () => setShowSidebar((v) => !v),
      toggleMinimap: () => setShowMinimap((v) => !v),
      toggleAiOnly: () => setAiOnly((v) => !v),
      toggleKind: (k: EdgeKind) =>
        setHiddenKinds((prev) => {
          const next = new Set(prev);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          return next;
        }),
      exportAll: () => spec && void p.exportFiles(exportMarkdown(spec)),
      preview: () => setDialog("preview"),
      copyMermaid: () => void copy(mermaid() || "(화면 간 이동이 아직 없습니다)", "Mermaid 코드"),
      copyJson: () => spec && void copy(JSON.stringify(spec, null, 2), "project.json"),
      openMcp: () => setDialog("mcp"),
      copyPrompt: () => void copy(AGENT_PROMPT, "지시문"),
    },
  });

  /* ---------- render ---------- */

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const f = e.dataTransfer.files[0];
    if (f) void p.openUpload(f);
  };

  const kindLabel = !source
    ? ""
    : { live: "실시간 연결", file: "파일", example: "예시", new: "새 프로젝트", upload: "불러온 파일" }[source.kind];

  const rightPane = !spec
    ? null
    : qOpen
      ? (
        <QuestionPanel
          spec={spec}
          tab={qTab}
          setTab={setQTab}
          apply={apply}
          questionOf={getQuestion}
          focusId={focusId}
          onFocus={setFocusId}
          onClose={() => {
            setQOpen(false);
            setFocusId(null);
          }}
        />
      )
      : selectedId
        ? (
          <Detail
            spec={spec}
            rollup={rollup}
            id={selectedId}
            apply={apply}
            onSelect={select}
            onClose={() => select(null)}
          />
        )
        : null;

  return (
    <div
      className={`app${dropping ? " dropping" : ""}${anchorDraft ? " anchor-editing" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={onDropFile}
    >
      <div className="titlebar">
        <div className="quick">
          <button onClick={() => void p.save()} disabled={!spec} title="저장 (Ctrl+S)" aria-label="저장"><Save size={16} /></button>
          <button onClick={p.undo} disabled={!p.canUndo} title="실행 취소 (Ctrl+Z)" aria-label="실행 취소"><Undo2 size={16} /></button>
          <button onClick={p.redo} disabled={!p.canRedo} title="다시 실행 (Ctrl+Y)" aria-label="다시 실행"><Redo2 size={16} /></button>
        </div>
        <div className="title">
          {spec ? `${spec.project.name}${p.dirty ? " ●" : ""}` : "ProjectScenario"}
          <span className="muted"> — ProjectScenario</span>
        </div>
        <div className="title-right">
          {source?.kind === "live" && <span className="live" title="파일이 바뀌면 자동으로 갱신되고, 편집하면 바로 저장됩니다">● 실시간</span>}
        </div>
      </div>

      <Ribbon tabs={tabs} active={tab} onTab={setTab} />

      {!spec || !comp ? (
        <Welcome onNew={() => setDialog("new")} onOpen={() => void openFile()} onExample={p.loadExample} />
      ) : (
        <div className="body">
          {showSidebar && <Sidebar
              spec={spec}
              rollup={rollup}
              comp={comp}
              activeQuestionId={qOpen ? focusId : null}
              openQuestion={openQuestion}
              openQuestions={openQuestionsPanel}
              onClose={() => setShowSidebar(false)}
            />}
          <main
            onMouseMove={placing ? (e) => setCursor({ x: e.clientX, y: e.clientY }) : undefined}
            onMouseLeave={() => setCursor(null)}
            onMouseDown={startMarquee}
            onContextMenu={(e) => e.preventDefault()}
          >
            {marquee && (
              <div
                className="marquee"
                style={{
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1),
                }}
              />
            )}
            {placing && cursor && <PlacingGhost type={placing} x={cursor.x} y={cursor.y} />}
            {view && (
              <nav className="crumbs" aria-label="폴더 경로">
                <button className="crumb" onClick={() => openFolder(null)}>메인</button>
                {folderPath(spec, view).map((fid, i, all) => {
                  const title = spec.nodes.find((n) => n.id === fid)?.title ?? fid;
                  return (
                    <Fragment key={fid}>
                      <ChevronRight size={14} className="crumb-sep" aria-hidden />
                      {i === all.length - 1 ? (
                        <span className="crumb current" aria-current="page">{title}</span>
                      ) : (
                        <button className="crumb" onClick={() => openFolder(fid)}>{title}</button>
                      )}
                    </Fragment>
                  );
                })}
                <span className="grow" />
                <button className="crumb-x" onClick={() => openFolder(null)} title="메인으로" aria-label="메인으로">
                  <X size={16} />
                </button>
              </nav>
            )}
            {layout.ids.length > 0 && (
              <button
                className={`tidy-btn${view ? " below-crumbs" : ""}`}
                onClick={tidy}
                title="자동 정렬"
                aria-label="자동 정렬"
              >
                <LayoutGrid size={14} /> 자동 정렬
              </button>
            )}
            {layout.ids.length === 0 && (
              <div className="empty-hint">
                {view ? (
                  <p>이 폴더는 비어 있습니다.</p>
                ) : (
                  <>
                    <p>아직 노드가 없습니다.</p>
                    <p className="muted">‘삽입’ 탭에서 노드를 추가하거나, ‘기획’ 탭에서 질문에 답해 보세요.</p>
                  </>
                )}
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              nodesConnectable={false}
              selectNodesOnDrag={false}
              elevateNodesOnSelect={false}
              selectionKeyCode={null}
              deleteKeyCode={null}
              onNodeClick={(e, n) => {
                if (placing) {
                  const hit = spec.nodes.find((x) => x.id === n.id);
                  const point = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
                  place(hit?.type === "folder" ? { kind: "folder", id: n.id, point } : { kind: "node", id: n.id }, e.shiftKey);
                } else if (linkMode) finishLink(n.id);
                else if (e.shiftKey) toggleInSelection(n.id);
                else select(n.id);
              }}
              onNodeDoubleClick={(_, n) => {
                if (placing || linkMode) return;
                if (spec.nodes.find((x) => x.id === n.id)?.type === "folder") openFolder(n.id);
              }}
              onEdgeClick={(_, e) => {
                const found = routing.current.edges.find((x) => x.key === e.id)?.direct;
                if (found) {
                  setSelectedEdge({ from: found.from, to: found.to, kind: found.kind });
                  setSelectedId(null);
                } else {
                  p.tell("폴더가 대신 가지고 있는 선입니다. 폴더 안으로 들어가면 선택할 수 있어요.");
                }
              }}
              onNodeDragStop={(e, n) => {
                const pt = "changedTouches" in e ? e.changedTouches[0]! : e;
                const group = multiRef.current.length > 1 && multiRef.current.includes(n.id) ? multiRef.current : null;
                if (group) {
                  const positions: Record<string, XY> = {};
                  for (const id of group) positions[id] = dragRef.current[id] ?? layout.pos[id] ?? { x: 0, y: 0 };
                  for (const id of group) delete dragRef.current[id];
                  setDrag((d) => {
                    const rest = { ...d };
                    for (const id of group) delete rest[id];
                    return rest;
                  });
                  commitGroupDrag(group, positions, flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }));
                  return;
                }
                setDrag((d) => {
                  const { [n.id]: _gone, ...rest } = d;
                  return rest;
                });
                const where = dragRef.current[n.id] ?? n.position;
                delete dragRef.current[n.id];
                commitDrag(n.id, where, flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }));
              }}
              onPaneClick={(e) => {
                if (placing) place({ kind: "point", point: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) }, e.shiftKey);
                else if (!linkMode && !e.shiftKey) select(null);
              }}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
              className={placing ? "placing" : linkMode ? "linking" : ""}
            >
              <Background gap={24} />
              <Controls showInteractive={false} />
              {showMinimap && (
                <MiniMap
                  pannable
                  zoomable
                  style={{ background: "var(--panel)", width: 150, height: 100 }}
                  maskColor="rgb(120 120 120 / 0.2)"
                  nodeColor={(n) => MINIMAP_COLOR[(n.data as { status: string }).status] ?? "#9ca3af"}
                />
              )}
            </ReactFlow>
          </main>
          {rightPane}
        </div>
      )}

      <div className="statusbar">
        <span>{kindLabel}{source ? ` · ${source.name}` : ""}</span>
        {spec && comp && (
          <>
            <span>노드 {spec.nodes.filter((n) => n.type !== "folder").length} · 연결 {spec.edges.length}</span>
            {multi.length > 1 && <span>{multi.length}개 선택됨</span>}
            <span>필수 질문 {comp.byImportance.P0.resolved}/{comp.byImportance.P0.total}</span>
            {reviewCount > 0 && <span className="warn-text">AI 검토 대기 {reviewCount}</span>}
            {openQuestions(spec).length === 0 && <span>모든 질문 처리됨</span>}
          </>
        )}
        <span className="grow" />
        <span>{p.dirty ? "저장 안 됨" : spec ? "저장됨" : ""}</span>
      </div>

      {p.notice && (
        <div className={`toast ${p.notice.tone}`} role="status" onClick={p.dismissNotice}>
          {p.notice.text}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void p.openUpload(f);
          e.target.value = "";
        }}
      />

      {dialog === "new" && (
        <NewProjectDialog
          onCreate={(name, lang) => {
            p.newProject(name, lang);
            select(null);
            setTab("plan");
            setQOpen(true);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "rename-project" && spec && (
        <RenameDialog title="프로젝트 이름" initial={spec.project.name} onSubmit={(v) => apply((s) => renameProject(s, v))} onClose={() => setDialog(null)} />
      )}
      {dialog === "preview" && spec && (
        <PreviewDialog spec={spec} onCopied={(ok) => p.tell(ok ? "복사했습니다." : "복사하지 못했습니다.", ok ? "info" : "error")} onClose={() => setDialog(null)} />
      )}
      {dialog === "mcp" && (
        <McpDialog source={p.source} onCopied={(ok) => p.tell(ok ? "복사했습니다." : "복사하지 못했습니다.", ok ? "info" : "error")} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/** Follows the mouse while the placing tool is armed, like the shape preview in PowerPoint. */
function PlacingGhost({ type, x, y }: { type: NodeType; x: number; y: number }) {
  const Icon = NODE_ICON[type];
  return (
    <div className="ghost" style={{ left: x + 16, top: y + 16 }} aria-hidden>
      <Icon size={14} /> {TYPE_LABEL[type]}
    </div>
  );
}

function Welcome(props: { onNew(): void; onOpen(): void; onExample(): void }) {
  return (
    <div className="welcome">
      <h1>ProjectScenario</h1>
      <p>기획을 질문으로 채우고, 구조를 다이어그램으로 보고, AI 에이전트용 md를 만들어 줍니다.</p>
      <div className="welcome-actions">
        <button className="welcome-card" onClick={props.onNew}>
          <FilePlus size={32} />
          <b>새 프로젝트</b>
          <span className="muted">질문에 답하며 시작</span>
        </button>
        <button className="welcome-card" onClick={props.onOpen}>
          <FolderOpen size={32} />
          <b>열기</b>
          <span className="muted">project.json 불러오기</span>
        </button>
        <button className="welcome-card" onClick={props.onExample}>
          <FlaskConical size={32} />
          <b>예시 보기</b>
          <span className="muted">완성된 예시 프로젝트</span>
        </button>
      </div>
      <p className="muted">파일을 이 창에 끌어다 놓아도 열립니다.</p>
    </div>
  );
}
