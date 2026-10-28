import { useState } from "react";
import { Bot, Check, X } from "lucide-react";
import {
  EDGE_LABELS,
  STAGES,
  STATUSES,
  getQuestion,
  removeEdge,
  reviewNode,
  setFolder,
  setStatus,
  updateNode,
  type EdgeKind,
  type ProjectSpec,
  type Status,
} from "@scenario/core";
import { FIELDS, type FieldSpec } from "./fields";
import { STATUS_LABEL, StatusDot, TYPE_LABEL } from "./Nodes";
import { valueText } from "./format";

export const EDGE_LABEL: Record<EdgeKind, string> = EDGE_LABELS;

const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;

type Apply = (fn: (s: ProjectSpec) => ProjectSpec) => boolean;

/** One editable field. Remounted (via key) whenever the stored value changes, so it never shows stale text. */
function FieldEditor(props: { field: FieldSpec; value: unknown; onCommit: (v: unknown) => void }) {
  const { field, value, onCommit } = props;
  const asLines = (v: unknown): string[] =>
    field.format ? field.format(v) : Array.isArray(v) ? v.map(String) : [];
  const initial =
    field.kind === "lines" ? asLines(value).join("\n") : value === undefined || value === null ? "" : String(value);
  const [text, setText] = useState(initial);

  const commitText = () => {
    if (text === initial) return;
    if (field.kind === "lines") {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      onCommit(field.parse ? field.parse(lines) : lines);
    } else if (field.kind === "number") {
      onCommit(text.trim() === "" ? undefined : Number(text));
    } else {
      onCommit(text.trim() === "" ? undefined : text);
    }
  };

  return (
    <label className="field">
      <span className="field-label">{field.label}</span>
      {field.kind === "checkbox" ? (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onCommit(e.target.checked)} />
      ) : field.kind === "select" ? (
        <select value={String(value ?? "")} onChange={(e) => onCommit(e.target.value)}>
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : field.kind === "textarea" || field.kind === "lines" ? (
        <textarea
          rows={field.kind === "lines" ? 3 : 3}
          value={text}
          placeholder={field.hint}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
        />
      ) : (
        <input
          type={field.kind === "number" ? "number" : "text"}
          value={text}
          placeholder={field.hint}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
    </label>
  );
}

export function Detail(props: {
  spec: ProjectSpec;
  rollup: Record<string, Status>;
  id: string;
  apply: Apply;
  onSelect(id: string): void;
  onClose(): void;
}) {
  const { spec, rollup, id, apply, onSelect, onClose } = props;
  const node = spec.nodes.find((n) => n.id === id);
  if (!node) return null;

  const title = (i: string) => spec.nodes.find((n) => n.id === i)?.title ?? i;
  const out = spec.edges.filter((e) => e.from === id);
  const inc = spec.edges.filter((e) => e.to === id);
  const effective = rollup[id] ?? node.status;
  const answers = spec.answers.filter((a) => a.nodeIds.includes(id));
  const members = spec.nodes.filter((n) => n.folderId === id);
  const patch = (p: Record<string, unknown>) => apply((s) => updateNode(s, id, p));

  return (
    <aside className="side-panel detail">
      <button className="close" onClick={onClose} aria-label="닫기">×</button>
      <div className="muted">{TYPE_LABEL[node.type] ?? node.type} · <code>{node.id}</code></div>
      <input
        key={`${node.id}:${node.title}`}
        className="title-input"
        defaultValue={node.title}
        aria-label="이름"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== node.title) patch({ title: v });
          else e.target.value = node.title;
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />

      <div className="seg status-seg" role="group" aria-label="상태">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`btn${node.status === s ? " primary" : ""}`}
            onClick={() => apply((sp) => setStatus(sp, id, s))}
            title={STATUS_LABEL[s]}
          >
            <StatusDot status={s} size={8} /> {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {effective !== node.status && (
        <div className="muted">하위 항목을 합치면 현재 <b>{STATUS_LABEL[effective]}</b>로 표시됩니다.</div>
      )}

      {node.provenance?.source === "ai" && (
        <div className={`callout${node.provenance.reviewed ? "" : " warn"}`}>
          <b><Bot size={13} /> AI가 만든 항목{node.provenance.reviewed ? " (검토 완료)" : " · 검토 필요"}</b>
          {node.provenance.rationale && <div>근거: {node.provenance.rationale}</div>}
          {!node.provenance.reviewed && (
            <button className="btn" onClick={() => apply((s) => reviewNode(s, id))}>
              <Check size={14} /> 그대로 승인
            </button>
          )}
          <div className="muted">내용을 고치면 AI 표시가 사라집니다.</div>
        </div>
      )}

      <FieldEditor
        key={`summary:${node.summary ?? ""}`}
        field={{ key: "summary", label: "설명", kind: "textarea" }}
        value={node.summary}
        onCommit={(v) => patch({ summary: v })}
      />
      {FIELDS[node.type].map((f) => {
        const value = (node as Record<string, unknown>)[f.key];
        return (
          <FieldEditor
            key={`${f.key}:${JSON.stringify(value)}`}
            field={f}
            value={value}
            onCommit={(v) => patch({ [f.key]: v })}
          />
        );
      })}

      {node.type === "folder" && (
        <>
          <h3>담긴 노드 {members.length}</h3>
          {members.length === 0 ? (
            <p className="muted">노드를 끌어다 이 폴더 위에 놓으면 담깁니다.</p>
          ) : (
            <ul className="plain links">
              {members.map((m) => (
                <li key={m.id}>
                  <a href="#" onClick={(ev) => { ev.preventDefault(); onSelect(m.id); }}>{m.title}</a>
                  <span className="muted"> {TYPE_LABEL[m.type]}</span>
                  <button
                    className="icon-x"
                    title="폴더에서 빼기"
                    aria-label="폴더에서 빼기"
                    onClick={() => apply((s) => setFolder(s, m.id, node.folderId))}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {node.folderId && (
        <div className="muted">
          폴더: <a href="#" onClick={(ev) => { ev.preventDefault(); onSelect(node.folderId!); }}>{title(node.folderId)}</a>
          <button
            className="icon-x"
            title="폴더에서 빼기"
            aria-label="폴더에서 빼기"
            onClick={() => apply((s) => setFolder(s, id, s.nodes.find((f) => f.id === node.folderId)?.folderId))}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {node.external && Object.keys(node.external).length > 0 && (
        <div className="muted">연동: {JSON.stringify(node.external)}</div>
      )}

      {(out.length > 0 || inc.length > 0) && (
        <>
          <h3>연결</h3>
          <ul className="plain links">
            {out.map((e) => (
              <li key={`o:${e.kind}:${e.to}`}>
                <span className="muted">{EDGE_LABEL[e.kind]} →</span>{" "}
                <a href="#" onClick={(ev) => { ev.preventDefault(); onSelect(e.to); }}>{title(e.to)}</a>
                {e.label && <span className="muted"> ({e.label})</span>}
                <button className="icon-x" title="연결 끊기" aria-label="연결 끊기" onClick={() => apply((s) => removeEdge(s, e))}>
                  <X size={12} />
                </button>
              </li>
            ))}
            {inc.map((e) => (
              <li key={`i:${e.kind}:${e.from}`}>
                <span className="muted">← {EDGE_LABEL[e.kind]}</span>{" "}
                <a href="#" onClick={(ev) => { ev.preventDefault(); onSelect(e.from); }}>{title(e.from)}</a>
                {e.label && <span className="muted"> ({e.label})</span>}
                <button className="icon-x" title="연결 끊기" aria-label="연결 끊기" onClick={() => apply((s) => removeEdge(s, e))}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {answers.length > 0 && (
        <>
          <h3>이 노드를 만든 답변</h3>
          <ul className="plain">
            {answers.map((a) => (
              <li key={a.questionId}>
                {getQuestion(a.questionId)?.prompt ?? a.questionId}
                <div className="answer">{valueText(a.value) || "(건너뜀)"}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
