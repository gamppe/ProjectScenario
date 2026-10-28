import { useMemo, useState } from "react";
import { Bot, Check, SkipForward } from "lucide-react";
import {
  QUESTION_BANK,
  STAGES,
  answerQuestion,
  coerceValue,
  markReviewed,
  openQuestions,
  skipQuestion,
  type AnswerValue,
  type ProjectSpec,
  type Question,
} from "@scenario/core";
import { valueText } from "./format";
import { describeError } from "./project";

export type QuestionTab = "next" | "skipped" | "review";

const IMPORTANCE: Record<string, string> = { P0: "필수", P1: "권장", P2: "선택" };


/** Input matching the question kind. Returns the raw text that coerceValue understands. */
function AnswerForm(props: {
  q: Question;
  initial?: AnswerValue;
  submitLabel: string;
  onSubmit: (raw: string) => string | null;
  extra?: React.ReactNode;
}) {
  const { q } = props;
  const initialText =
    props.initial === undefined
      ? ""
      : Array.isArray(props.initial)
        ? props.initial.join(q.kind === "multi" ? ";" : "\n")
        : String(props.initial === true ? "예" : props.initial === false ? "아니오" : props.initial);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  const submit = (raw: string) => {
    if (!raw.trim()) {
      setError("값을 입력해 주세요.");
      return;
    }
    setError(props.onSubmit(raw));
  };

  const selected = new Set(text.split(";").filter(Boolean));

  return (
    <div className="aform">
      {q.kind === "boolean" ? (
        <div className="seg">
          {["예", "아니오"].map((v) => (
            <button key={v} className={`btn${text === v ? " primary" : ""}`} onClick={() => setText(v)}>
              {v}
            </button>
          ))}
        </div>
      ) : q.kind === "choice" ? (
        <div className="choices">
          {q.choices.map((c) => (
            <label key={c.value} className="check">
              <input type="radio" name={q.id} checked={text === c.value} onChange={() => setText(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      ) : q.kind === "multi" ? (
        <div className="choices">
          {q.choices.map((c) => (
            <label key={c.value} className="check">
              <input
                type="checkbox"
                checked={selected.has(c.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(c.value);
                  else next.delete(c.value);
                  setText([...next].join(";"));
                }}
              />
              {c.label}
            </label>
          ))}
        </div>
      ) : (
        <textarea
          rows={q.kind === "list" ? 4 : 3}
          value={text}
          placeholder={q.kind === "list" ? "한 줄에 하나씩 적어 주세요" : "여기에 답을 적어 주세요"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(text);
          }}
        />
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="aform-actions">
        <button className="btn primary" onClick={() => submit(text)}>
          <Check size={14} /> {props.submitLabel}
        </button>
        {props.extra}
      </div>
    </div>
  );
}

function QuestionMeta({ q }: { q: Question }) {
  return (
    <>
      <div className="muted">
        {STAGES.find((s) => s.id === q.stage)?.label} · <span className={`imp ${q.importance}`}>{IMPORTANCE[q.importance]}</span>
      </div>
      <div className="q-prompt">{q.prompt}</div>
      {q.hint && <div className="muted">힌트: {q.hint}</div>}
      {q.examples.length > 0 && <div className="muted">예: {q.examples.join(" / ")}</div>}
    </>
  );
}

export function QuestionPanel(props: {
  spec: ProjectSpec;
  tab: QuestionTab;
  setTab: (t: QuestionTab) => void;
  apply: (fn: (s: ProjectSpec) => ProjectSpec) => boolean;
  questionOf: (id: string) => Question | undefined;
  /** A single question picked from the sidebar list; shown instead of the tab content. */
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onClose: () => void;
}) {
  const { spec, tab, apply, questionOf, focusId, onFocus } = props;
  const setTab = (t: QuestionTab) => {
    onFocus(null);
    props.setTab(t);
  };
  const t = focusId ? "focus" : tab;
  const [p0Only, setP0Only] = useState(true);
  const [stage, setStage] = useState("");
  const [confirmSkip, setConfirmSkip] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const open = useMemo(
    () => openQuestions(spec).filter((q) => (!p0Only || q.importance === "P0") && (!stage || q.stage === stage)),
    [spec, p0Only, stage],
  );
  const skipped = spec.answers.filter((a) => a.state === "skipped");
  const review = spec.answers.filter((a) => a.state === "ai_decided" && !a.provenance.reviewed);

  const answer = (q: Question) => (raw: string) => {
    try {
      const value = coerceValue(q, raw);
      return apply((s) => answerQuestion(s, q.id, value)) ? (setEditing(null), null) : null;
    } catch (e) {
      return describeError(e);
    }
  };

  const current = open[0];

  const focusQ = focusId ? questionOf(focusId) : undefined;
  const focusA = focusQ ? spec.answers.find((a) => a.questionId === focusQ.id) : undefined;
  const nextOpen = (() => {
    if (!focusQ) return undefined;
    const all = openQuestions(spec).filter((q) => q.id !== focusQ.id);
    const at = QUESTION_BANK.findIndex((q) => q.id === focusQ.id);
    return all.find((q) => QUESTION_BANK.indexOf(q) > at) ?? all[0];
  })();

  return (
    <aside className="side-panel qpanel">
      <button className="close" onClick={props.onClose} aria-label="닫기">×</button>
      <h2>기획 질문</h2>
      <div className="tabs">
        <button className={t === "next" ? "on" : ""} onClick={() => setTab("next")}>
          진행 <b>{open.length}</b>
        </button>
        <button className={t === "skipped" ? "on" : ""} onClick={() => setTab("skipped")}>
          건너뜀 <b>{skipped.length}</b>
        </button>
        <button className={t === "review" ? "on" : ""} onClick={() => setTab("review")}>
          AI 검토 <b>{review.length}</b>
        </button>
      </div>

      {t === "focus" && focusQ && (
        <div className="qcard" key={focusQ.id}>
          <QuestionMeta q={focusQ} />
          {focusA?.state === "ai_decided" && !focusA.provenance.reviewed && (
            <div className="ai-answer">
              <span className="ai-badge unreviewed"><Bot size={11} /> AI</span> 에이전트가 정한 값입니다.
              {focusA.provenance.rationale && <div className="muted">근거: {focusA.provenance.rationale}</div>}
              <button className="btn" onClick={() => apply((s) => markReviewed(s, focusQ.id))}>
                <Check size={14} /> 그대로 승인
              </button>
            </div>
          )}
          {focusA?.state === "skipped" && (
            <div className="muted">건너뛴 질문입니다. 에이전트가 판단하도록 기다리는 중이며, 직접 답할 수도 있습니다.</div>
          )}
          <AnswerForm
            key={`${focusQ.id}:${focusA?.state}:${JSON.stringify(focusA?.value)}`}
            q={focusQ}
            initial={focusA?.value}
            submitLabel={focusA?.value !== undefined ? "수정 저장" : "답변 저장"}
            onSubmit={answer(focusQ)}
            extra={
              !focusA ? (
                <button className="btn" onClick={() => apply((s) => skipQuestion(s, focusQ.id))}>
                  <SkipForward size={14} /> 건너뛰기
                </button>
              ) : undefined
            }
          />
          <button className="btn" disabled={!nextOpen} onClick={() => nextOpen && onFocus(nextOpen.id)}>
            다음 미답변 질문 →
          </button>
        </div>
      )}

      {t === "next" && (
        <>
          <div className="filters">
            <label className="check">
              <input type="checkbox" checked={p0Only} onChange={(e) => setP0Only(e.target.checked)} />
              필수 질문만
            </label>
            <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="단계 선택">
              <option value="">모든 단계</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {!current ? (
            <p className="muted">
              {p0Only ? "남은 필수 질문이 없습니다. " : "남은 질문이 없습니다. "}
              {p0Only && "‘필수 질문만’을 끄면 권장·선택 질문이 나옵니다."}
            </p>
          ) : (
            <div className="qcard" key={current.id}>
              <QuestionMeta q={current} />
              <AnswerForm
                q={current}
                submitLabel="답변 저장"
                onSubmit={answer(current)}
                extra={
                  confirmSkip === current.id ? (
                    <span className="confirm">
                      필수 질문입니다. 에이전트가 판단하도록 둘까요?
                      <button className="btn" onClick={() => { apply((s) => skipQuestion(s, current.id)); setConfirmSkip(null); }}>예</button>
                      <button className="btn" onClick={() => setConfirmSkip(null)}>취소</button>
                    </span>
                  ) : (
                    <button
                      className="btn"
                      title="건너뛰면 AI 에이전트가 알아서 판단합니다. 나중에 직접 고칠 수 있고, AI가 정한 값에는 표시가 남습니다."
                      onClick={() =>
                        current.importance === "P0" ? setConfirmSkip(current.id) : apply((s) => skipQuestion(s, current.id))
                      }
                    >
                      <SkipForward size={14} /> 건너뛰기
                    </button>
                  )
                }
              />
              <div className="muted">남은 질문 {open.length - 1}개 · Ctrl+Enter로 저장</div>
            </div>
          )}
        </>
      )}

      {t === "skipped" && (
        <>
          <p className="muted">건너뛴 질문입니다. AI 에이전트가 판단하도록 기다리고 있고, 직접 답할 수도 있습니다.</p>
          {skipped.length === 0 && <p className="muted">없음</p>}
          {skipped.map((a) => {
            const q = questionOf(a.questionId);
            if (!q) return null;
            return (
              <div className="qcard" key={a.questionId}>
                <QuestionMeta q={q} />
                {editing === q.id ? (
                  <AnswerForm q={q} submitLabel="답변 저장" onSubmit={answer(q)} />
                ) : (
                  <button className="btn" onClick={() => setEditing(q.id)}>직접 답하기</button>
                )}
              </div>
            );
          })}
        </>
      )}

      {t === "review" && (
        <>
          <p className="muted">에이전트가 대신 정한 값입니다. 그대로 받아들이거나 직접 고치세요.</p>
          {review.length === 0 && <p className="muted">검토할 항목이 없습니다.</p>}
          {review.map((a) => {
            const q = questionOf(a.questionId);
            if (!q) return null;
            return (
              <div className="qcard" key={a.questionId}>
                <QuestionMeta q={q} />
                <div className="ai-answer">
                  <span className="ai-badge unreviewed"><Bot size={11} /> AI</span> {valueText(a.value)}
                  {a.provenance.rationale && <div className="muted">근거: {a.provenance.rationale}</div>}
                </div>
                {editing === q.id ? (
                  <AnswerForm q={q} initial={a.value} submitLabel="수정 저장" onSubmit={answer(q)} />
                ) : (
                  <div className="aform-actions">
                    <button className="btn primary" onClick={() => apply((s) => markReviewed(s, q.id))}>
                      <Check size={14} /> 그대로 승인
                    </button>
                    <button className="btn" onClick={() => setEditing(q.id)}>수정하기</button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </aside>
  );
}
