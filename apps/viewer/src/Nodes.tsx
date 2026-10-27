import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { NodeType, Status } from "@scenario/core";
import { NODE_ICON } from "./icons";

export const STATUS_LABEL: Record<Status, string> = {
  planned: "미진행",
  in_progress: "진행 중",
  blocked: "막힘",
  done: "완료",
};

export const TYPE_LABEL: Record<string, string> = {
  vision: "비전",
  persona: "사용자",
  feature: "기능",
  story: "스토리",
  screen: "화면",
  interaction: "상호작용",
  flow: "플로우",
  entity: "데이터",
  decision: "기술 결정",
  task: "작업",
  risk: "리스크",
};

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

export type NodeData = {
  title: string;
  kind: string;
  status: Status;
  /** Written by an agent. */
  ai: boolean;
  /** AI-written and not yet confirmed by the user. */
  unreviewed: boolean;
  dim: boolean;
};

export type ScenarioNode = Node<NodeData, "scenario">;

export function ScenarioNodeView({ data, selected }: NodeProps<ScenarioNode>) {
  const Icon = NODE_ICON[data.kind as NodeType];
  return (
    <div
      className={`node kind-${data.kind}${selected ? " selected" : ""}${data.dim ? " dim" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-head">
        <StatusDot status={data.status} />
        <Icon size={12} className="node-icon" aria-hidden />
        <span className="node-kind">{TYPE_LABEL[data.kind] ?? data.kind}</span>
        {data.ai && (
          <span className={`ai-badge${data.unreviewed ? " unreviewed" : ""}`} title={data.unreviewed ? "AI가 판단함 · 검토 필요" : "AI가 판단함 · 검토 완료"}>
            AI
          </span>
        )}
      </div>
      <div className="node-title">{data.title}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = { scenario: ScenarioNodeView };
