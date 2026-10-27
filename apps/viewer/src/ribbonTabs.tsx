import {
  Bot,
  CheckCheck,
  CircleDot,
  ClipboardCopy,
  Copy,
  Eye,
  FileDown,
  FilePlus,
  FlaskConical,
  FolderOpen,
  Frame,
  LayoutGrid,
  Languages,
  Map as MapIcon,
  Maximize,
  MessageCircleQuestion,
  Moon,
  NotebookText,
  PanelLeft,
  Pencil,
  Plug,
  Redo2,
  Save,
  SaveAll,
  SkipForward,
  Sun,
  SunMoon,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { EDGE_KINDS, STATUSES, type EdgeKind, type NodeType, type Status } from "@scenario/core";
import { EDGE_STROKE, NODE_ICON, NODE_TYPES_ORDER } from "./icons";
import { StatusDot, STATUS_LABEL, TYPE_LABEL } from "./Nodes";
import { EDGE_LABEL } from "./Panels";
import type { QuestionTab } from "./QuestionPanel";
import type { RibbonTab } from "./Ribbon";

export type Theme = "auto" | "light" | "dark";

export interface RibbonCtx {
  hasProject: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  outputLanguage: "en" | "ko";
  /** a node or an edge is selected */
  hasSelection: boolean;
  selectedNode: { id: string; ai: boolean; unreviewed: boolean } | null;
  linkMode: EdgeKind | null;
  badges: { openRequired: number; skipped: number; review: number };
  theme: Theme;
  showSidebar: boolean;
  showMinimap: boolean;
  aiOnly: boolean;
  hiddenKinds: Set<EdgeKind>;
  /** Actions */
  a: {
    newProject(): void;
    open(): void;
    save(): void;
    saveAs(): void;
    loadExample(): void;
    renameProject(): void;
    toggleLanguage(): void;
    undo(): void;
    redo(): void;
    setStatus(s: Status): void;
    renameNode(): void;
    remove(): void;
    reviewSelected(): void;
    approveAllAi(): void;
    addNode(t: NodeType): void;
    startLink(k: EdgeKind): void;
    openQuestions(t: QuestionTab): void;
    setTheme(t: Theme): void;
    tidy(): void;
    zoomIn(): void;
    zoomOut(): void;
    fit(): void;
    toggleSidebar(): void;
    toggleMinimap(): void;
    toggleAiOnly(): void;
    toggleKind(k: EdgeKind): void;
    exportAll(): void;
    preview(): void;
    copyMermaid(): void;
    copyJson(): void;
    openMcp(): void;
    copyPrompt(): void;
  };
}

const SOON = "준비 중인 기능입니다.";

export function buildTabs(c: RibbonCtx): RibbonTab[] {
  const noProject = !c.hasProject;
  const noNode = !c.selectedNode;
  const a = c.a;

  return [
    {
      id: "file",
      label: "파일",
      groups: [
        {
          label: "프로젝트",
          rows: 2,
          items: [
            { id: "new", label: "새로 만들기", icon: <FilePlus size={28} />, onClick: a.newProject },
            { id: "open", label: "열기", icon: <FolderOpen size={28} />, onClick: a.open },
            {
              id: "save",
              label: "저장",
              icon: <Save size={28} />,
              onClick: a.save,
              disabled: noProject,
              badge: c.dirty ? "●" : undefined,
              title: c.dirty ? "저장 (Ctrl+S) · 저장하지 않은 변경이 있습니다" : "저장 (Ctrl+S)",
            },
            { id: "saveas", label: "다른 이름으로", icon: <SaveAll size={16} />, size: "small", onClick: a.saveAs, disabled: noProject },
            { id: "example", label: "예시 불러오기", icon: <FlaskConical size={16} />, size: "small", onClick: a.loadExample },
          ],
        },
        {
          label: "프로젝트 설정",
          items: [
            { id: "rename", label: "이름 변경", icon: <Pencil size={16} />, size: "small", onClick: a.renameProject, disabled: noProject },
            {
              id: "lang",
              label: `md 언어: ${c.outputLanguage === "en" ? "English" : "한국어"}`,
              icon: <Languages size={16} />,
              size: "small",
              onClick: a.toggleLanguage,
              disabled: noProject,
              title: "생성되는 md 파일의 언어를 바꿉니다 (질문 화면은 항상 한국어)",
            },
          ],
        },
      ],
    },
    {
      id: "home",
      label: "홈",
      groups: [
        {
          label: "실행 취소",
          rows: 2,
          items: [
            { id: "undo", label: "실행 취소", icon: <Undo2 size={16} />, size: "small", onClick: a.undo, disabled: !c.canUndo, title: "실행 취소 (Ctrl+Z)" },
            { id: "redo", label: "다시 실행", icon: <Redo2 size={16} />, size: "small", onClick: a.redo, disabled: !c.canRedo, title: "다시 실행 (Ctrl+Y)" },
          ],
        },
        {
          label: "선택한 노드의 상태",
          items: STATUSES.map((s) => ({
            id: `st-${s}`,
            label: STATUS_LABEL[s],
            icon: <StatusDot status={s} size={22} />,
            onClick: () => a.setStatus(s),
            disabled: noNode,
            title: `${STATUS_LABEL[s]}(으)로 표시`,
          })),
        },
        {
          label: "편집",
          items: [
            { id: "rename-node", label: "이름 바꾸기", icon: <Pencil size={28} />, onClick: a.renameNode, disabled: noNode },
            { id: "delete", label: "삭제", icon: <Trash2 size={28} />, onClick: a.remove, disabled: !c.hasSelection, title: "선택한 노드/연결 삭제 (Delete) · Ctrl+Z로 되돌릴 수 있습니다" },
          ],
        },
        {
          label: "AI 검토",
          items: [
            {
              id: "approve",
              label: "AI 항목 승인",
              icon: <CheckCheck size={28} />,
              onClick: a.reviewSelected,
              disabled: !c.selectedNode?.unreviewed,
              title: "AI가 만든 노드를 그대로 받아들입니다",
            },
          ],
        },
      ],
    },
    {
      id: "insert",
      label: "삽입",
      groups: [
        {
          label: "노드 추가",
          rows: 2,
          items: NODE_TYPES_ORDER.map((t) => {
            const Icon = NODE_ICON[t];
            return {
              id: `add-${t}`,
              label: TYPE_LABEL[t] ?? t,
              icon: <Icon size={22} />,
              size: "medium" as const,
              onClick: () => a.addNode(t),
              disabled: noProject,
              title: `${TYPE_LABEL[t]} 추가 · 노드를 선택해 두었으면 그 아래에, 아니면 최상위에 만들어집니다`,
            };
          }),
        },
        {
          label: "연결 만들기",
          rows: 4,
          items: EDGE_KINDS.map((k) => ({
            id: `link-${k}`,
            label: EDGE_LABEL[k],
            icon: <span className="edge-swatch" style={{ background: EDGE_STROKE[k] }} />,
            size: "small" as const,
            onClick: () => a.startLink(k),
            disabled: noNode,
            active: c.linkMode === k,
            title: `${EDGE_LABEL[k]} 연결: 먼저 노드를 선택하고, 이 버튼을 누른 뒤 대상 노드를 클릭하세요`,
          })),
        },
      ],
    },
    {
      id: "plan",
      label: "기획",
      groups: [
        {
          label: "질문",
          items: [
            {
              id: "q-next",
              label: "질문 답하기",
              icon: <MessageCircleQuestion size={28} />,
              onClick: () => a.openQuestions("next"),
              disabled: noProject,
              badge: c.badges.openRequired,
              title: "필수 질문부터 차례로 답합니다",
            },
            {
              id: "q-skipped",
              label: "건너뛴 질문",
              icon: <SkipForward size={28} />,
              onClick: () => a.openQuestions("skipped"),
              disabled: noProject,
              badge: c.badges.skipped,
              title: "건너뛰어 에이전트가 판단하길 기다리는 질문",
            },
            {
              id: "q-review",
              label: "AI 판단 검토",
              icon: <Bot size={28} />,
              onClick: () => a.openQuestions("review"),
              disabled: noProject,
              badge: c.badges.review,
              title: "에이전트가 대신 정한 값을 확인하고 승인하거나 고칩니다",
            },
          ],
        },
      ],
    },
    {
      id: "design",
      label: "디자인",
      groups: [
        {
          label: "테마",
          items: (
            [
              ["auto", "자동", <SunMoon size={28} key="a" />],
              ["light", "밝게", <Sun size={28} key="l" />],
              ["dark", "어둡게", <Moon size={28} key="d" />],
            ] as const
          ).map(([id, label, icon]) => ({
            id: `theme-${id}`,
            label,
            icon,
            active: c.theme === id,
            onClick: () => a.setTheme(id),
          })),
        },
        {
          label: "배치",
          items: [
            {
              id: "tidy",
              label: "자동 정렬",
              icon: <LayoutGrid size={28} />,
              onClick: a.tidy,
              disabled: noProject,
              title: "직접 옮긴 노드 위치를 모두 지우고 트리 모양으로 다시 배치합니다",
            },
          ],
        },
        {
          label: "디자인 도구 연동",
          items: [
            { id: "figma", label: "Figma", icon: <Frame size={28} />, disabled: true, title: `Figma로 화면 내보내기 · ${SOON}` },
            { id: "notion", label: "Notion", icon: <NotebookText size={28} />, disabled: true, title: `Notion에서 가져오기 · ${SOON}` },
            { id: "gh", label: "GitHub 이슈", icon: <CircleDot size={28} />, disabled: true, title: `작업을 이슈로 만들기 · ${SOON}` },
          ],
        },
      ],
    },
    {
      id: "view",
      label: "보기",
      groups: [
        {
          label: "확대/축소",
          items: [
            { id: "zin", label: "확대", icon: <ZoomIn size={16} />, size: "small", onClick: a.zoomIn },
            { id: "zout", label: "축소", icon: <ZoomOut size={16} />, size: "small", onClick: a.zoomOut },
            { id: "fit", label: "화면에 맞춤", icon: <Maximize size={16} />, size: "small", onClick: a.fit },
          ],
        },
        {
          label: "표시",
          items: [
            { id: "side", label: "왼쪽 패널", icon: <PanelLeft size={16} />, size: "small", active: c.showSidebar, onClick: a.toggleSidebar },
            { id: "mini", label: "미니맵", icon: <MapIcon size={16} />, size: "small", active: c.showMinimap, onClick: a.toggleMinimap },
            { id: "ai", label: "AI 노드만 강조", icon: <Bot size={16} />, size: "small", active: c.aiOnly, onClick: a.toggleAiOnly },
          ],
        },
        {
          label: "연결선 표시",
          rows: 4,
          items: EDGE_KINDS.map((k) => ({
            id: `show-${k}`,
            label: EDGE_LABEL[k],
            icon: <span className="edge-swatch" style={{ background: EDGE_STROKE[k] }} />,
            size: "small" as const,
            active: !c.hiddenKinds.has(k),
            onClick: () => a.toggleKind(k),
          })),
        },
      ],
    },
    {
      id: "export",
      label: "내보내기",
      groups: [
        {
          label: "md 파일",
          items: [
            { id: "export", label: "파일로 내보내기", icon: <FileDown size={28} />, onClick: a.exportAll, disabled: noProject },
            { id: "preview", label: "미리보기", icon: <Eye size={28} />, onClick: a.preview, disabled: noProject },
          ],
        },
        {
          label: "클립보드로 복사",
          items: [
            { id: "mmd", label: "Mermaid 플로우", icon: <Copy size={16} />, size: "small", onClick: a.copyMermaid, disabled: noProject },
            { id: "json", label: "project.json", icon: <Copy size={16} />, size: "small", onClick: a.copyJson, disabled: noProject },
          ],
        },
      ],
    },
    {
      id: "ai",
      label: "AI 에이전트",
      groups: [
        {
          label: "연결",
          items: [
            { id: "mcp", label: "MCP 연결 안내", icon: <Plug size={28} />, onClick: a.openMcp, title: "Claude Code 등 에이전트가 이 프로젝트를 읽고 쓰도록 연결합니다" },
            { id: "prompt", label: "첫 지시문 복사", icon: <ClipboardCopy size={28} />, onClick: a.copyPrompt, title: "에이전트에게 기획을 시작시키는 문장을 복사합니다" },
          ],
        },
        {
          label: "검토",
          items: [
            {
              id: "ai-review",
              label: "AI 판단 검토",
              icon: <Bot size={28} />,
              onClick: () => a.openQuestions("review"),
              disabled: noProject,
              badge: c.badges.review,
            },
            { id: "ai-all", label: "모두 승인", icon: <CheckCheck size={28} />, onClick: a.approveAllAi, disabled: noProject, title: "AI가 만든 노드와 답변을 모두 승인합니다" },
          ],
        },
      ],
    },
  ];
}
