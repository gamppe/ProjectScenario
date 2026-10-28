import type { ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
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
  FolderTree,
  FolderUp,
  Frame,
  House,
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
  Save,
  SaveAll,
  SkipForward,
  Sun,
  SunMoon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { EDGE_KINDS, STATUSES, alignMinimum, type AlignMode, type EdgeKind, type NodeType, type Status } from "@scenario/core";
import { EdgeSwatch } from "./EdgeSwatch";
import { EDGE_HINT, NODE_HINT, NODE_ICON, NODE_TYPES_ORDER } from "./icons";
import { StatusDot, STATUS_LABEL, TYPE_LABEL } from "./Nodes";
import { EDGE_LABEL } from "./Panels";
import type { QuestionTab } from "./QuestionPanel";
import type { RibbonTab } from "./Ribbon";

const FolderIcon = NODE_ICON.folder;

export type Theme = "auto" | "light" | "dark";

export interface RibbonCtx {
  hasProject: boolean;
  dirty: boolean;
  outputLanguage: "en" | "ko";
  /** the selected nodes: one (or none) by clicking, several by dragging a box with the right mouse button */
  selection: {
    count: number;
    /** set only when exactly one node is selected */
    single: { id: string } | null;
    anyUnreviewed: boolean;
  };
  linkMode: EdgeKind | null;
  /** node type armed for click-to-place, if any */
  placing: NodeType | null;
  /** the folder whose diagram is open (null = main) */
  view: string | null;
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
    setStatus(s: Status): void;
    align(mode: AlignMode): void;
    reviewSelected(): void;
    approveAllAi(): void;
    startPlacing(t: NodeType): void;
    folderUp(): void;
    folderHome(): void;
    startLink(k: EdgeKind): void;
    openQuestions(t: QuestionTab): void;
    setTheme(t: Theme): void;
    tidy(): void;
    groupByKind(): void;
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
  const none = c.selection.count === 0;
  const noSingle = !c.selection.single;
  const a = c.a;

  const alignItem = (id: string, label: string, icon: ReactNode, mode: AlignMode) => ({
    id,
    label,
    icon,
    onClick: () => a.align(mode),
    disabled: c.selection.count < alignMinimum(mode),
  });

  return [
    {
      id: "file",
      label: "파일",
      groups: [
        {
          label: "프로젝트",
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
          label: "선택한 노드의 상태",
          items: STATUSES.map((s) => ({
            id: `st-${s}`,
            label: STATUS_LABEL[s],
            icon: <StatusDot status={s} size={16} />,
            onClick: () => a.setStatus(s),
            disabled: none,
            title: `${STATUS_LABEL[s]}(으)로 표시`,
          })),
        },
        {
          label: "AI 검토",
          items: [
            {
              id: "approve",
              label: "AI 항목 승인",
              icon: <CheckCheck size={28} />,
              onClick: a.reviewSelected,
              disabled: !c.selection.anyUnreviewed,
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
          label: "묶기",
          items: [
            {
              id: "add-folder",
              label: TYPE_LABEL.folder ?? "폴더",
              icon: <FolderIcon size={22} />,
              onClick: () => a.startPlacing("folder"),
              disabled: noProject,
              active: c.placing === "folder",
              title: `${TYPE_LABEL.folder}: ${NODE_HINT.folder}`,
            },
          ],
        },
        {
          label: "노드 추가",
          items: NODE_TYPES_ORDER.map((t) => {
            const Icon = NODE_ICON[t];
            return {
              id: `add-${t}`,
              label: TYPE_LABEL[t] ?? t,
              icon: <Icon size={22} />,
              size: "medium" as const,
              onClick: () => a.startPlacing(t),
              disabled: noProject,
              active: c.placing === t,
              title: `${TYPE_LABEL[t]}: ${NODE_HINT[t]}`,
            };
          }),
        },
        {
          label: "연결 만들기",
          items: EDGE_KINDS.map((k) => ({
            id: `link-${k}`,
            label: EDGE_LABEL[k],
            icon: <EdgeSwatch kind={k} />,
            size: "small" as const,
            onClick: () => a.startLink(k),
            disabled: noSingle,
            active: c.linkMode === k,
            title: `${EDGE_LABEL[k]}: ${EDGE_HINT[k]}`,
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
              ["light", "라이트 테마", <Sun size={28} key="l" />],
              ["dark", "다크 테마", <Moon size={28} key="d" />],
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
          label: "폴더",
          items: [
            { id: "fup", label: "상위 폴더", icon: <FolderUp size={16} />, size: "small", onClick: a.folderUp, disabled: !c.view, title: "한 단계 위로" },
            { id: "fhome", label: "메인으로", icon: <House size={16} />, size: "small", onClick: a.folderHome, disabled: !c.view, title: "메인 다이어그램으로" },
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
          items: EDGE_KINDS.map((k) => ({
            id: `show-${k}`,
            label: EDGE_LABEL[k],
            icon: <EdgeSwatch kind={k} />,
            size: "small" as const,
            active: !c.hiddenKinds.has(k),
            onClick: () => a.toggleKind(k),
          })),
        },
      ],
    },
    {
      id: "tools",
      label: "도구",
      groups: [
        {
          label: "배치",
          items: [
            {
              id: "align",
              label: "정렬",
              icon: <AlignHorizontalSpaceAround size={28} />,
              title: "선택한 노드들을 정렬합니다 (오른쪽 마우스 버튼으로 드래그해서 여러 개를 선택)",
              menu: [
                {
                  label: "맞춤",
                  items: [
                    alignItem("al-left", "왼쪽 맞춤", <AlignStartVertical size={16} />, "left"),
                    alignItem("al-center", "가운데 맞춤", <AlignCenterVertical size={16} />, "center"),
                    alignItem("al-right", "오른쪽 맞춤", <AlignEndVertical size={16} />, "right"),
                    alignItem("al-top", "위쪽 맞춤", <AlignStartHorizontal size={16} />, "top"),
                    alignItem("al-middle", "중간 맞춤", <AlignCenterHorizontal size={16} />, "middle"),
                    alignItem("al-bottom", "아래쪽 맞춤", <AlignEndHorizontal size={16} />, "bottom"),
                  ],
                },
                {
                  label: "간격",
                  items: [
                    alignItem("al-dist-h", "가로 간격을 동일하게", <AlignHorizontalSpaceBetween size={16} />, "distribute-h"),
                    alignItem("al-dist-v", "세로 간격을 동일하게", <AlignVerticalSpaceBetween size={16} />, "distribute-v"),
                  ],
                },
              ],
            },
            {
              id: "tidy",
              label: "자동 정렬",
              icon: <LayoutGrid size={28} />,
              onClick: a.tidy,
              disabled: noProject,
              title: "지금 보는 화면의 노드를 종류별 열로 다시 배치합니다 (기능, 화면, 작업 …)",
            },
            {
              id: "group-kind",
              label: "종류별 폴더",
              icon: <FolderTree size={28} />,
              onClick: a.groupByKind,
              disabled: noProject,
              title: "지금 보는 화면에 흩어진 노드를 종류별 폴더(기능, 화면, 작업 …)로 묶습니다. 종류마다 3개 이상일 때 묶어요",
            },
          ],
        },
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
            { id: "mmd", label: "Mermaid 흐름도", icon: <Copy size={16} />, size: "small", onClick: a.copyMermaid, disabled: noProject },
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
