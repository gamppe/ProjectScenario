import type { MouseEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Folder, X } from "lucide-react";
import { NODE_LABELS, type NodeType, type Status } from "@scenario/core";
import { NODE_ICON } from "./icons";

export const STATUS_LABEL: Record<Status, string> = {
  planned: "미진행",
  in_progress: "진행 중",
  blocked: "막힘",
  done: "완료",
};

export const TYPE_LABEL: Record<string, string> = NODE_LABELS;

export function StatusDot({ status, size = 10 }: { status: Status; size?: number }) {
  return (
    <span
      className="dot"
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      style={{ background: `var(--st-${status})`, width: size, height: size }}
    />
  );
}

/** One member of a folder, drawn as a pill inside the folder box. */
export interface Pill {
  id: string;
  title: string;
  kind: NodeType;
  status: Status;
  ai: boolean;
  selected: boolean;
}

export type NodeData = {
  title: string;
  kind: string;
  status: Status;
  /** Written by an agent. */
  ai: boolean;
  /** AI-written and not yet confirmed by the user. */
  unreviewed: boolean;
  dim: boolean;
  /** Only for folders. */
  folder?: {
    pills: Pill[];
    onPill: (id: string, e: MouseEvent) => void;
    onPillOpen: (id: string) => void;
    onPillRemove: (id: string) => void;
  };
};

export type ScenarioNode = Node<NodeData, "scenario" | "folder">;

export function ScenarioNodeView({ data, selected }: NodeProps<ScenarioNode>) {
  const Icon = NODE_ICON[data.kind as NodeType];
  return (
    <div className={`node kind-${data.kind}${selected ? " selected" : ""}${data.dim ? " dim" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-head">
        <StatusDot status={data.status} />
        <Icon size={12} className="node-icon" aria-hidden />
        <span className="node-kind">{TYPE_LABEL[data.kind] ?? data.kind}</span>
        {data.ai && (
          <span
            className={`ai-badge${data.unreviewed ? " unreviewed" : ""}`}
            title={data.unreviewed ? "AI가 판단함 · 검토 필요" : "AI가 판단함 · 검토 완료"}
          >
            AI
          </span>
        )}
      </div>
      <div className="node-title">{data.title}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/**
 * A folder: a box that lists what it holds as pills. Double-clicking it (handled by the
 * diagram) opens a diagram of just its contents. The box height follows the pill count.
 */
export function FolderNodeView({ data, selected }: NodeProps<ScenarioNode>) {
  const f = data.folder;
  const pills = f?.pills ?? [];
  return (
    <div className={`folder-node${selected ? " selected" : ""}${data.dim ? " dim" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="folder-head">
        <StatusDot status={data.status} size={9} />
        <Folder size={14} className="node-icon" aria-hidden />
        <span className="folder-title">{data.title}</span>
        <span className="folder-count" title="담긴 노드 수">{pills.length}</span>
        {data.ai && <span className={`ai-badge${data.unreviewed ? " unreviewed" : ""}`}>AI</span>}
      </div>
      <ul className="pills nodrag nopan">
        {pills.length === 0 && <li className="pill-empty">비어 있음 · 노드를 끌어다 놓으세요</li>}
        {pills.map((p) => {
          const Icon = NODE_ICON[p.kind];
          return (
            <li
              key={p.id}
              className={`pill kind-${p.kind}${p.selected ? " selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                f?.onPill(p.id, e);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                f?.onPillOpen(p.id);
              }}
            >
              <StatusDot status={p.status} size={8} />
              <Icon size={12} className="node-icon" aria-hidden />
              <span className="pill-title">{p.title}</span>
              {p.ai && <span className="ai-badge">AI</span>}
              <button
                className="pill-x"
                title="폴더에서 빼기"
                aria-label={`${p.title}을(를) 폴더에서 빼기`}
                onClick={(e) => {
                  e.stopPropagation();
                  f?.onPillRemove(p.id);
                }}
              >
                <X size={11} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const nodeTypes = { scenario: ScenarioNodeView, folder: FolderNodeView };
