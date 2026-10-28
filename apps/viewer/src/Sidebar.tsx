import { useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import {
  QUESTION_BANK,
  STAGES,
  STATUSES,
  answerPreview,
  isVisible,
  questionLabel,
  type Answer,
  type Completeness,
  type ProjectSpec,
  type Question,
  type Status,
} from "@scenario/core";
import { STATUS_LABEL, StatusDot } from "./Nodes";
import type { QuestionTab } from "./QuestionPanel";

type ItemState = "open" | "skipped" | "ai" | "done" | "locked";

function itemState(q: Question, a: Answer | undefined, visible: boolean): ItemState {
  if (!visible) return "locked";
  if (!a) return "open";
  if (a.state === "skipped") return "skipped";
  if (a.state === "ai_decided" && !a.provenance.reviewed) return "ai";
  return "done";
}

/** Questions grouped by planning stage, collapsible, each answerable with one click. */
function QuestionList(props: {
  spec: ProjectSpec;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const { spec } = props;
  const answers = useMemo(() => new Map(spec.answers.map((a) => [a.questionId, a] as const)), [spec.answers]);
  const [onlyNeeded, setOnlyNeeded] = useState(false);

  const groups = useMemo(
    () =>
      STAGES.map((s) => {
        const items = QUESTION_BANK.filter((q) => q.stage === s.id).map((q) => {
          const a = answers.get(q.id);
          return { q, a, state: itemState(q, a, isVisible(q, answers)) };
        });
        const needed = items.filter((i) => i.state === "open" || i.state === "skipped").length;
        const resolved = items.filter((i) => i.state === "done" || i.state === "ai").length;
        return { stage: s, items, needed, resolved, total: items.filter((i) => i.state !== "locked").length };
      }),
    [answers],
  );

  // Start with the stages that still need answers open; the user can change that.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.needed > 0).map((g) => g.stage.id)),
  );
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shown = groups
    .map((g) => ({
      ...g,
      items: onlyNeeded ? g.items.filter((i) => i.state === "open" || i.state === "skipped") : g.items,
    }))
    .filter((g) => g.items.length > 0);

  return (
    <section className="qlist">
      <div className="qlist-head">
        <h2>질문 목록</h2>
        <button className="linkish" onClick={() => setOpen(new Set(shown.map((g) => g.stage.id)))}>모두 펼치기</button>
        <button className="linkish" onClick={() => setOpen(new Set())}>모두 접기</button>
      </div>

      <label className="qlist-filter">
        <input type="checkbox" checked={onlyNeeded} onChange={(e) => setOnlyNeeded(e.target.checked)} />
        답변이 필요한 질문만 보기
      </label>

      {shown.length === 0 && <p className="muted">답변이 필요한 질문이 없습니다.</p>}

      {shown.map((g) => {
        const expanded = open.has(g.stage.id);
        return (
          <div className="qs-stage" key={g.stage.id}>
            <button className="qs-head" aria-expanded={expanded} onClick={() => toggle(g.stage.id)}>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="qs-name">{g.stage.label}</span>
              {g.needed > 0 && <span className="qdot open" title={`답변이 필요한 질문 ${g.needed}개`} />}
              <span className="qs-count">{g.resolved}/{g.total}</span>
            </button>
            {expanded && (
              <ul className="qs-items">
                {g.items.map(({ q, a, state }) => (
                  <li key={q.id}>
                    <button
                      className={`qs-item ${state}${props.activeId === q.id ? " active" : ""}`}
                      disabled={state === "locked"}
                      onClick={() => props.onOpen(q.id)}
                      title={state === "locked" ? `앞의 질문에 답하면 열립니다 · ${q.prompt}` : q.prompt}
                    >
                      <span className={`qdot ${state}`} aria-hidden />
                      <span className="qs-body">
                        <span className="qs-line">
                          <span className="qs-short">{questionLabel(q)}</span>
                          {q.importance === "P0" && <span className="req">필수</span>}
                          {state === "skipped" && <span className="qs-tag">건너뜀</span>}
                          {state === "ai" && (
                            <span className="ai-badge unreviewed"><Bot size={10} /> AI</span>
                          )}
                        </span>
                        {a?.value !== undefined && <span className="qs-preview">{answerPreview(a.value)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

    </section>
  );
}

export function Sidebar(props: {
  spec: ProjectSpec;
  rollup: Record<string, Status>;
  comp: Completeness;
  activeQuestionId: string | null;
  openQuestion: (id: string) => void;
  openQuestions: (tab: QuestionTab) => void;
  onClose: () => void;
}) {
  const { spec, rollup, comp } = props;
  const counts: Record<Status, number> = { planned: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const n of spec.nodes) if (n.type !== "folder") counts[rollup[n.id] ?? "planned"]++;

  const tasks = spec.nodes.filter((n) => n.type === "task");
  const tasksDone = tasks.filter((n) => rollup[n.id] === "done").length;
  const review =
    spec.answers.filter((a) => a.state === "ai_decided" && !a.provenance.reviewed).length +
    spec.nodes.filter((n) => n.provenance?.source === "ai" && !n.provenance.reviewed).length;

  return (
    <aside className="sidebar">
      <button className="close" onClick={props.onClose} aria-label="왼쪽 패널 닫기" title="닫기 (보기 탭의 왼쪽 패널로 다시 열 수 있습니다)">×</button>
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
        {(["P0", "P1", "P2"] as const).map((p) => {
          const t = comp.byImportance[p];
          const label = p === "P0" ? "필수" : p === "P1" ? "권장" : "선택";
          return (
            <div className="meter" key={p} title={`${t.resolved}/${t.total} 완료 · 건너뜀 ${t.skipped} · 미답변 ${t.open}`}>
              <div className={`meter-bar ${p}`} style={{ width: t.total ? `${(t.resolved / t.total) * 100}%` : "0%" }} />
              <span>질문 {label} {t.resolved}/{t.total}</span>
            </div>
          );
        })}
        {review > 0 && (
          <div className="review-line">
            <span className="ai-badge unreviewed"><Bot size={11} /> AI</span> 검토 대기 <b>{review}</b>
            <button className="linkish" onClick={() => props.openQuestions("review")}>검토하기</button>
          </div>
        )}
      </section>

      <QuestionList spec={spec} activeId={props.activeQuestionId} onOpen={props.openQuestion} />
    </aside>
  );
}
