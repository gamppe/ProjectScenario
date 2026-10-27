import { useEffect, useRef, useState } from "react";
import { Bot, Check, X } from "lucide-react";
import {
  QUESTION_BANK,
  STAGES,
  STATUSES,
  getQuestion,
  removeEdge,
  reviewNode,
  setStatus,
  updateNode,
  type Completeness,
  type EdgeKind,
  type ProjectSpec,
  type Status,
} from "@scenario/core";
import { FIELDS, type FieldSpec } from "./fields";
import { STATUS_LABEL, StatusDot, TYPE_LABEL } from "./Nodes";
import { valueText, type QuestionTab } from "./QuestionPanel";

export const EDGE_LABEL: Record<EdgeKind, string> = {
  contains: "포함",
  implements: "구현",
  navigates: "화면 이동",
  depends_on: "선행 필요",
  uses_data: "데이터 사용",
  blocks: "막음",
  relates: "관련",
};

const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;

type Apply = (fn: (s: ProjectSpec) => ProjectSpec) => boolean;

export function Sidebar(props: {
  spec: ProjectSpec;
  rollup: Record<string, Status>;
  comp: Completeness;
  openQuestions(tab: QuestionTab): void;
}) {
  const { spec, rollup, comp } = props;
  const counts: Record<Status, number> = { planned: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const n of spec.nodes) counts[rollup[n.id] ?? "planned"]++;

  const tasks = spec.nodes.filter((n) => n.type === "task");
  const tasksDone = tasks.filter((n) => rollup[n.id] === "done").length;
  const skipped = spec.answers.filter((a) => a.state === "skipped");
  const review = spec.answers.filter((a) => a.state === "ai_decided" && !a.provenance.reviewed);
  const reviewNodes = spec.nodes.filter((n) => n.provenance?.source === "ai" && !n.provenance.reviewed);

  return (
    <aside className="sidebar">
      <section>
        <h2>진행 상황</h2>
        <ul className="legend">
          {STATUSES.map((s) => (
            <li key={s}>
              <StatusDot status={s} /> {STATUS_LABEL[s]} <b>{counts[s]}</b>
            </li>
          ))}
        </ul>
        {tasks.length > 0 && (
          <div className="meter" title={`작업 ${tasksDone}/${tasks.length} 완료`}>
            <div className="meter-bar" style={{ width: `${(tasksDone / tasks.length) * 100}%` }} />
            <span>작업 {tasksDone}/{tasks.length} 완료</span>
          </div>
        )}
      </section>

      <section>
        <h2>기획 완성도</h2>
        {(["P0", "P1", "P2"] as const).map((p) => {
          const t = comp.byImportance[p];
          const label = p === "P0" ? "필수" : p === "P1" ? "권장" : "선택";
          return (
            <div className="meter" key={p} title={`${t.resolved}/${t.total} 완료 · 건너뜀 ${t.skipped} · 미답변 ${t.open}`}>
              <div className={`meter-bar ${p}`} style={{ width: t.total ? `${(t.resolved / t.total) * 100}%` : "0%" }} />
              <span>{label} {t.resolved}/{t.total}</span>
            </div>
          );
        })}
      </section>

      <section>
        <h2>확인이 필요한 것</h2>

        <h3>
          필수 질문 미답변 <b>{comp.missingP0.length}</b>
          {comp.missingP0.length > 0 && (
            <button className="linkish" onClick={() => props.openQuestions("next")}>답하기</button>
          )}
        </h3>
        {comp.missingP0.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          <ul className="plain">
            {comp.missingP0.map((id) => (
              <li key={id}>
                <span className="muted">{stageLabel(getQuestion(id)?.stage ?? "")}</span> {getQuestion(id)?.prompt ?? id}
              </li>
            ))}
          </ul>
        )}

        <h3>
          AI 판단 · 검토 대기 <b>{review.length + reviewNodes.length}</b>
          {review.length > 0 && (
            <button className="linkish" onClick={() => props.openQuestions("review")}>검토하기</button>
          )}
        </h3>
        {review.length + reviewNodes.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          <ul className="plain">
            {review.map((a) => (
              <li key={a.questionId}>
                <span className="ai-badge unreviewed"><Bot size={11} /> AI</span> {getQuestion(a.questionId)?.prompt ?? a.questionId}
                <div className="answer">{valueText(a.value)}</div>
                <div className="muted">근거: {a.provenance.rationale}</div>
              </li>
            ))}
            {reviewNodes.map((n) => (
              <li key={n.id}>
                <span className="ai-badge unreviewed"><Bot size={11} /> AI</span> {TYPE_LABEL[n.type]} · {n.title}
                <div className="muted">근거: {n.provenance?.rationale}</div>
              </li>
            ))}
          </ul>
        )}

        <h3>
          건너뜀 · 에이전트가 판단할 것 <b>{skipped.length}</b>
          {skipped.length > 0 && (
            <button className="linkish" onClick={() => props.openQuestions("skipped")}>보기</button>
          )}
        </h3>
        {skipped.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          <ul className="plain">
            {skipped.map((a) => (
              <li key={a.questionId}>{getQuestion(a.questionId)?.prompt ?? a.questionId}</li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted foot">질문 은행 {QUESTION_BANK.length}개 · 노드 {spec.nodes.length}개 · 연결 {spec.edges.length}개</p>
    </aside>
  );
}

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
  /** Bumps when a node was just created, so the title gets focus. */
  focusTitleToken: number;
}) {
  const { spec, rollup, id, apply, onSelect, onClose } = props;
  const node = spec.nodes.find((n) => n.id === id);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.focusTitleToken > 0) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [props.focusTitleToken, id]);

  if (!node) return null;

  const title = (i: string) => spec.nodes.find((n) => n.id === i)?.title ?? i;
  const out = spec.edges.filter((e) => e.from === id);
  const inc = spec.edges.filter((e) => e.to === id);
  const effective = rollup[id] ?? node.status;
  const answers = spec.answers.filter((a) => a.nodeIds.includes(id));
  const patch = (p: Record<string, unknown>) => apply((s) => updateNode(s, id, p));

  return (
    <aside className="side-panel detail">
      <button className="close" onClick={onClose} aria-label="닫기">×</button>
      <div className="muted">{TYPE_LABEL[node.type] ?? node.type} · <code>{node.id}</code></div>
      <input
        key={`${node.id}:${node.title}`}
        ref={titleRef}
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
