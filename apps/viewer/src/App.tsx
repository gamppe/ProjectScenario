import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FilePlus, FlaskConical, FolderOpen, Redo2, Save, Undo2 } from "lucide-react";
import {
  QUESTION_BANK,
  addEdge,
  addNode,
  clearPositions,
  computeCompleteness,
  computeRollup,
  exportMarkdown,
  getQuestion,
  markReviewed,
  openQuestions,
  removeEdge,
  removeNode,
  renameProject,
  reviewNode,
  setOutputLanguage,
  setPosition,
  setStatus,
  uniqueNodeId,
  updateNode,
  type EdgeKind,
  type NodeType,
  type Status,
} from "@scenario/core";
import { McpDialog, NewProjectDialog, PreviewDialog, RenameDialog, AGENT_PROMPT, copyText } from "./Dialogs";
import { EDGE_STROKE, ID_PREFIX, NODE_DEFAULTS } from "./icons";
import { layoutNodes } from "./layout";
import { nodeTypes, TYPE_LABEL, type ScenarioNode } from "./Nodes";
import { Detail, EDGE_LABEL, Sidebar } from "./Panels";
import { useProject } from "./project";
import { QuestionPanel, type QuestionTab } from "./QuestionPanel";
import { Ribbon } from "./Ribbon";
import { buildTabs, type Theme } from "./ribbonTabs";

const EDGE_DASH: Partial<Record<EdgeKind, string>> = {
  navigates: "6 4",
  uses_data: "2 4",
  relates: "2 4",
};
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

type Dialog = null | "new" | "rename-project" | "rename-node" | "preview" | "mcp";

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
  const [linkMode, setLinkMode] = useState<{ kind: EdgeKind; from: string } | null>(null);
  const [qOpen, setQOpen] = useState(false);
  const [qTab, setQTab] = useState<QuestionTab>("next");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [aiOnly, setAiOnly] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EdgeKind>>(new Set());
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  const [focusToken, setFocusToken] = useState(0);
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

  // Drop a selection that no longer exists (deleted, undone, or changed by an agent).
  useEffect(() => {
    if (spec && selectedId && !spec.nodes.some((n) => n.id === selectedId)) setSelectedId(null);
    if (spec && selectedEdge && !spec.edges.some((e) => e.from === selectedEdge.from && e.to === selectedEdge.to && e.kind === selectedEdge.kind)) {
      setSelectedEdge(null);
    }
  }, [spec, selectedId, selectedEdge]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setSelectedEdge(null);
    if (id) setQOpen(false);
  };

  const selectedNode = spec?.nodes.find((n) => n.id === selectedId) ?? null;

  /* ---------- actions ---------- */

  const openFile = async () => {
    const needInput = await p.openFile();
    if (needInput) fileInput.current?.click();
  };

  const addNodeOfType = (type: NodeType) => {
    if (!spec) return;
    const id = uniqueNodeId(spec, ID_PREFIX[type]);
    const node = { id, type, title: `새 ${TYPE_LABEL[type]}`, ...NODE_DEFAULTS[type] };
    if (apply((s) => addNode(s, node, { parentId: selectedId ?? undefined }))) {
      setSelectedEdge(null);
      setSelectedId(id);
      setQOpen(false);
      setFocusToken((t) => t + 1);
    }
  };

  const remove = () => {
    if (selectedEdge) {
      apply((s) => removeEdge(s, selectedEdge));
      setSelectedEdge(null);
    } else if (selectedId) {
      apply((s) => removeNode(s, selectedId));
      setSelectedId(null);
    }
  };

  const startLink = (kind: EdgeKind) => {
    if (!selectedId) return;
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

  const keys = useRef({ p, remove, selectedId, selectedEdge, linkMode, dialog });
  keys.current = { p, remove, selectedId, selectedEdge, linkMode, dialog };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const el = e.target as HTMLElement;
      const typing = el.matches("input, textarea, select, [contenteditable]");
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape" && k.linkMode) {
        setLinkMode(null);
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void k.p.save();
        return;
      }
      if (typing || k.dialog) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        k.p.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        k.p.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && (k.selectedId || k.selectedEdge)) {
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
    const pos = layoutNodes(spec);
    const nodes: ScenarioNode[] = spec.nodes.map((n) => {
      const ai = n.provenance?.source === "ai";
      return {
        id: n.id,
        type: "scenario",
        position: drag[n.id] ?? pos[n.id] ?? { x: 0, y: 0 },
        selected: n.id === selectedId || n.id === linkMode?.from,
        data: {
          title: n.title,
          kind: n.type,
          status: rollup[n.id] ?? n.status,
          ai,
          unreviewed: ai && !n.provenance?.reviewed,
          dim: aiOnly && !ai,
        },
      };
    });
    const edges: Edge[] = spec.edges
      .filter((e) => !hiddenKinds.has(e.kind))
      .map((e) => {
        const isSel = selectedEdge?.from === e.from && selectedEdge.to === e.to && selectedEdge.kind === e.kind;
        const stroke = EDGE_STROKE[e.kind];
        return {
          id: `${e.kind}:${e.from}>${e.to}`,
          source: e.from,
          target: e.to,
          label: e.label,
          type: "smoothstep",
          selected: isSel,
          interactionWidth: 18,
          style: {
            stroke,
            strokeDasharray: EDGE_DASH[e.kind],
            strokeWidth: isSel ? 3.5 : e.kind === "contains" ? 1.5 : 2,
          },
          markerEnd: EDGE_ARROW[e.kind] ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
          labelStyle: { fontSize: 11 },
        };
      });
    return { nodes, edges };
  }, [spec, rollup, selectedId, selectedEdge, linkMode, hiddenKinds, aiOnly, drag]);

  const onNodesChange = useCallback((changes: NodeChange<ScenarioNode>[]) => {
    for (const c of changes) {
      if (c.type === "position" && c.position) {
        const { id, position } = c;
        setDrag((d) => ({ ...d, [id]: position }));
      }
    }
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
    canUndo: p.canUndo,
    canRedo: p.canRedo,
    outputLanguage: spec?.project.outputLanguage ?? "en",
    hasSelection: !!selectedId || !!selectedEdge,
    selectedNode: selectedNode
      ? { id: selectedNode.id, ai: selectedNode.provenance?.source === "ai", unreviewed: selectedNode.provenance?.source === "ai" && !selectedNode.provenance.reviewed }
      : null,
    linkMode: linkMode?.kind ?? null,
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
      undo: p.undo,
      redo: p.redo,
      setStatus: (st: Status) => selectedId && apply((s) => setStatus(s, selectedId, st)),
      renameNode: () => selectedId && setDialog("rename-node"),
      remove,
      reviewSelected: () => selectedId && apply((s) => reviewNode(s, selectedId)),
      approveAllAi,
      addNode: addNodeOfType,
      startLink,
      openQuestions: openQuestionsPanel,
      setTheme: setThemeState,
      tidy: () => {
        setDrag({});
        apply((s) => clearPositions(s));
        setTimeout(() => flow.fitView({ padding: 0.2 }), 50);
      },
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
          onClose={() => setQOpen(false)}
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
            focusTitleToken={focusToken}
          />
        )
        : null;

  return (
    <div
      className={`app${dropping ? " dropping" : ""}`}
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

      {linkMode && spec && (
        <div className="banner">
          <b>{spec.nodes.find((n) => n.id === linkMode.from)?.title}</b>에서 <b>{EDGE_LABEL[linkMode.kind]}</b> 연결할 대상 노드를 클릭하세요.
          <button className="btn" onClick={() => setLinkMode(null)}>취소 (Esc)</button>
        </div>
      )}

      {!spec || !comp ? (
        <Welcome onNew={() => setDialog("new")} onOpen={() => void openFile()} onExample={p.loadExample} />
      ) : (
        <div className="body">
          {showSidebar && <Sidebar spec={spec} rollup={rollup} comp={comp} openQuestions={openQuestionsPanel} />}
          <main>
            {spec.nodes.length === 0 && (
              <div className="empty-hint">
                <p>아직 노드가 없습니다.</p>
                <p className="muted">‘삽입’ 탭에서 노드를 추가하거나, ‘기획’ 탭에서 질문에 답해 보세요.</p>
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              nodesConnectable={false}
              selectNodesOnDrag={false}
              deleteKeyCode={null}
              onNodeClick={(_, n) => (linkMode ? finishLink(n.id) : select(n.id))}
              onEdgeClick={(_, e) => {
                const found = spec.edges.find((x) => `${x.kind}:${x.from}>${x.to}` === e.id);
                if (found) {
                  setSelectedEdge({ from: found.from, to: found.to, kind: found.kind });
                  setSelectedId(null);
                }
              }}
              onNodeDragStop={(_, n) => {
                const pos = n.position;
                setDrag((d) => {
                  const { [n.id]: _gone, ...rest } = d;
                  return rest;
                });
                apply((s) => setPosition(s, n.id, pos));
              }}
              onPaneClick={() => (linkMode ? null : select(null))}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
              className={linkMode ? "linking" : ""}
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
            <span>노드 {spec.nodes.length} · 연결 {spec.edges.length}</span>
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
      {dialog === "rename-node" && selectedNode && (
        <RenameDialog title="이름 바꾸기" initial={selectedNode.title} onSubmit={(v) => apply((s) => updateNode(s, selectedNode.id, { title: v }))} onClose={() => setDialog(null)} />
      )}
      {dialog === "preview" && spec && (
        <PreviewDialog spec={spec} onCopied={(ok) => p.tell(ok ? "복사했습니다." : "복사하지 못했습니다.", ok ? "info" : "error")} onClose={() => setDialog(null)} />
      )}
      {dialog === "mcp" && (
        <McpDialog onCopied={(ok) => p.tell(ok ? "복사했습니다." : "복사하지 못했습니다.", ok ? "info" : "error")} onClose={() => setDialog(null)} />
      )}
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
