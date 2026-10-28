import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, X } from "lucide-react";
import { exportMarkdown, type ProjectSpec } from "@scenario/core";

export const AGENT_PROMPT = `ProjectScenario MCP 서버(scenario)를 사용해서 이 프로젝트의 기획을 같이 진행해줘.
1. next_steps를 먼저 호출해서 비어 있는 항목을 확인해.
2. 필수(P0) 질문은 내게 한국어로 직접 물어보고, 내가 답한 내용만 record_user_answer로 저장해. 내 답을 지어내지 마.
3. 내가 건너뛰라고 하거나 알아서 정하라고 한 항목만 skip_question → decide_question(근거 한 줄 포함)으로 채워.
4. 답이 쌓이면 add_node / link_nodes로 화면, 기능, 작업을 만들어 구조화해. 같은 종류가 여러 개면 폴더(folder)로 묶어서(또는 group_by_kind 호출) 한 화면에 12개 넘게 흩어지지 않게 해.
5. 마지막에 export_markdown을 호출하고, 아직 비어 있거나 AI가 판단한 항목을 요약해줘.`;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal${props.wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-x" onClick={props.onClose} aria-label="닫기"><X size={16} /></button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function NewProjectDialog(props: { onCreate: (name: string, lang: "en" | "ko") => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [lang, setLang] = useState<"en" | "ko">("en");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = () => name.trim() && (props.onCreate(name.trim(), lang), props.onClose());

  return (
    <Modal title="새 프로젝트" onClose={props.onClose}>
      <label className="field">
        <span className="field-label">프로젝트 이름</span>
        <input ref={ref} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </label>
      <div className="field">
        <span className="field-label">생성되는 md 파일의 언어</span>
        <div className="seg">
          <button className={`btn${lang === "en" ? " primary" : ""}`} onClick={() => setLang("en")}>English (권장)</button>
          <button className={`btn${lang === "ko" ? " primary" : ""}`} onClick={() => setLang("ko")}>한국어</button>
        </div>
        <span className="muted">AI 에이전트는 영어 지시를 조금 더 안정적으로 따릅니다. 질문 화면은 항상 한국어입니다.</span>
      </div>
      <div className="modal-actions">
        <button className="btn primary" disabled={!name.trim()} onClick={submit}>만들기</button>
        <button className="btn" onClick={props.onClose}>취소</button>
      </div>
    </Modal>
  );
}

export function RenameDialog(props: { title: string; initial: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(props.initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const submit = () => value.trim() && (props.onSubmit(value.trim()), props.onClose());
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <input ref={ref} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <div className="modal-actions">
        <button className="btn primary" onClick={submit}>확인</button>
        <button className="btn" onClick={props.onClose}>취소</button>
      </div>
    </Modal>
  );
}

function CopyBlock(props: { label: string; text: string; onCopied: (ok: boolean) => void }) {
  return (
    <div className="copyblock">
      <div className="copyblock-head">
        <span>{props.label}</span>
        <button className="btn" onClick={async () => props.onCopied(await copyText(props.text))}>
          <Copy size={13} /> 복사
        </button>
      </div>
      <pre>{props.text}</pre>
    </div>
  );
}

export function PreviewDialog(props: { spec: ProjectSpec; onCopied: (ok: boolean) => void; onClose: () => void }) {
  const files = exportMarkdown(props.spec);
  const names = Object.keys(files);
  const [active, setActive] = useState(names[0]!);
  return (
    <Modal title="내보낼 md 미리보기" onClose={props.onClose} wide>
      <div className="tabs">
        {names.map((n) => (
          <button key={n} className={n === active ? "on" : ""} onClick={() => setActive(n)}>{n}</button>
        ))}
      </div>
      <CopyBlock label={active} text={files[active]!} onCopied={props.onCopied} />
    </Modal>
  );
}

export function McpDialog(props: {
  /** What is open right now: only a live file has a full path the page can know. */
  source: { kind: string; name: string } | null;
  onCopied: (ok: boolean) => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<{ file: string; mcp: string } | null>(null);
  const [typedPath, setTypedPath] = useState("");
  useEffect(() => {
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const mcp = info?.mcp ?? "<ProjectScenario 폴더>\\packages\\mcp\\dist\\index.js";
  // A file picked in the browser only reveals its name, never its folder, so the path is typed in.
  const live = props.source?.kind === "live";
  const shownName = props.source?.name ?? "project.json";
  const file = live ? (info?.file ?? props.source!.name) : typedPath.trim() || `<${shownName}의 전체 경로>`;
  const cli = `claude mcp add scenario -- node "${mcp}" --file "${file}"`;
  const json = JSON.stringify({ mcpServers: { scenario: { command: "node", args: [mcp, "--file", file] } } }, null, 2);

  return (
    <Modal title="AI 에이전트 연결" onClose={props.onClose} wide>
      <p>
        에이전트는 MCP로 이 프로젝트 파일을 직접 읽고 씁니다. 에이전트가 바꾼 내용은 이 화면에 바로 반영되고,
        AI가 정한 값에는 <b>AI 표시</b>가 남아 나중에 검토할 수 있습니다.
      </p>
      {live ? (
        <p className="muted">지금 열린 파일: <code>{file}</code></p>
      ) : (
        <>
          <p className="muted">
            <b>{shownName}</b>은(는) 브라우저로 연 파일이라 폴더 위치를 알 수 없습니다. 아래에 전체 경로를 붙여 넣으면 명령에 반영됩니다.
            (에이전트와 실시간으로 같이 쓰려면 <code>view.cmd 경로\project.json</code>으로 실행하세요.)
          </p>
          <input
            className="path-input"
            value={typedPath}
            onChange={(e) => setTypedPath(e.target.value)}
            placeholder={`예: C:\\Users\\내이름\\project\\${shownName}`}
            aria-label="프로젝트 파일 전체 경로"
            style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", margin: "4px 0 8px" }}
          />
        </>
      )}
      <CopyBlock label="Claude Code" text={cli} onCopied={props.onCopied} />
      <CopyBlock label="다른 MCP 클라이언트 (설정 JSON)" text={json} onCopied={props.onCopied} />
      <CopyBlock label="에이전트에게 처음 보낼 말" text={AGENT_PROMPT} onCopied={props.onCopied} />
      <p className="muted">MCP 서버는 먼저 <code>pnpm build</code>로 빌드되어 있어야 합니다.</p>
    </Modal>
  );
}
