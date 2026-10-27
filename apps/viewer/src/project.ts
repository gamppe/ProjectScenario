import { useCallback, useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import { createSpec, safeParseSpec, type ProjectSpec } from "@scenario/core";
import example from "../../../examples/todo-app/project.json";

/** Minimal slice of the File System Access API (Chromium / Electron). */
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
};
const picker = () => window as PickerWindow;
const JSON_TYPES = [{ description: "ProjectScenario", accept: { "application/json": [".json"] } }];

export type SourceKind = "live" | "file" | "example" | "new" | "upload";
export interface Source {
  kind: SourceKind;
  name: string;
  handle?: FileHandle;
}

export interface Notice {
  text: string;
  tone: "info" | "error";
}

export function describeError(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  return e instanceof Error ? e.message : String(e);
}

const HISTORY_LIMIT = 100;

/**
 * The open project: current spec, undo/redo, and where it is saved.
 *  - live:   the file the dev server follows (SCENARIO_FILE); every edit is saved at once
 *  - file:   a file picked through the browser; saved back through its handle
 *  - others: kept in memory until the user saves
 */
export function useProject() {
  const [spec, setSpec] = useState<ProjectSpec | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // History lives in a ref (state updaters must stay pure); the flags below drive the buttons.
  const history = useRef({ past: [] as ProjectSpec[], future: [] as ProjectSpec[] });
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });
  const setHistory = useCallback((h: { past: ProjectSpec[]; future: ProjectSpec[] }) => {
    history.current = h;
    setFlags({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  }, []);

  const specRef = useRef<ProjectSpec | null>(null);
  const sourceRef = useRef<Source | null>(null);
  const mtime = useRef(0);
  const polling = useRef(true);

  const tell = useCallback((text: string, tone: Notice["tone"] = "info") => setNotice({ text, tone }), []);

  const install = useCallback((next: ProjectSpec, src: Source, isDirty: boolean) => {
    specRef.current = next;
    sourceRef.current = src;
    setSpec(next);
    setSource(src);
    setDirty(isDirty);
    setHistory({ past: [], future: [] });
  }, [setHistory]);

  const persist = useCallback(
    async (next: ProjectSpec) => {
      const src = sourceRef.current;
      if (!src) return;
      try {
        if (src.kind === "live") {
          const res = await fetch("/api/project", { method: "PUT", body: JSON.stringify(next) });
          if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
          mtime.current = (await res.json()).mtime;
          setDirty(false);
        } else if (src.kind === "file" && src.handle) {
          const w = await src.handle.createWritable();
          await w.write(JSON.stringify(next, null, 2) + "\n");
          await w.close();
          setDirty(false);
        } else {
          setDirty(true);
        }
      } catch (e) {
        setDirty(true);
        tell(`저장하지 못했습니다: ${describeError(e)}`, "error");
      }
    },
    [tell],
  );

  const commit = useCallback(
    (next: ProjectSpec, past: ProjectSpec[], future: ProjectSpec[]) => {
      specRef.current = next;
      setSpec(next);
      setHistory({ past, future });
      void persist(next);
    },
    [persist, setHistory],
  );

  /** Run a pure core operation on the current spec; errors surface as a notice. */
  const apply = useCallback(
    (fn: (s: ProjectSpec) => ProjectSpec): boolean => {
      const cur = specRef.current;
      if (!cur) return false;
      try {
        const next = fn(cur);
        commit(next, [...history.current.past, cur].slice(-HISTORY_LIMIT), []);
        return true;
      } catch (e) {
        tell(describeError(e), "error");
        return false;
      }
    },
    [commit, tell],
  );

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past[h.past.length - 1];
    const cur = specRef.current;
    if (prev && cur) commit(prev, h.past.slice(0, -1), [cur, ...h.future]);
  }, [commit]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future[0];
    const cur = specRef.current;
    if (next && cur) commit(next, [...h.past, cur], h.future.slice(1));
  }, [commit]);

  const parse = useCallback(
    (data: unknown): ProjectSpec | null => {
      const r = safeParseSpec(data);
      if (r.success) return r.data;
      tell(`파일 형식이 올바르지 않습니다: ${describeError(r.error)}`, "error");
      return null;
    },
    [tell],
  );

  /** Follow the dev server's project file; later changes by agents or the CLI show up here. */
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || !polling.current) return;
      try {
        const res = await fetch(`/api/project?since=${mtime.current}`);
        if (res.status === 404) {
          polling.current = false;
          return;
        }
        if (!res.ok) return; // caught mid-write; retry next tick
        const body = await res.json();
        // Skip "unchanged", and duplicate answers to the same request (React StrictMode runs this effect twice).
        if (!body.changed || body.mtime === mtime.current) return;
        const first = mtime.current === 0;
        mtime.current = body.mtime;
        const parsed = parse(body.data);
        if (!parsed) return;
        install(parsed, { kind: "live", name: body.name }, false);
        if (!first) tell("파일이 외부(에이전트/CLI)에서 변경되어 새로 불러왔습니다.");
      } catch {
        polling.current = false; // static build: no dev server
      }
    };
    void tick();
    const timer = setInterval(tick, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [install, parse, tell]);

  const leaveLive = () => {
    polling.current = false;
  };

  const loadText = async (file: File, handle?: FileHandle) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      tell("JSON 파일을 읽을 수 없습니다.", "error");
      return;
    }
    const parsed = parse(data);
    if (!parsed) return;
    leaveLive();
    install(parsed, handle ? { kind: "file", name: file.name, handle } : { kind: "upload", name: file.name }, false);
  };

  const saveAs = async () => {
    const cur = specRef.current;
    const src = sourceRef.current;
    if (!cur || !src) return;
    const text = JSON.stringify(cur, null, 2) + "\n";
    const p = picker();
    if (p.showSaveFilePicker) {
      try {
        const h = await p.showSaveFilePicker({ suggestedName: "project.json", types: JSON_TYPES });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        leaveLive();
        sourceRef.current = { kind: "file", name: h.name, handle: h };
        setSource(sourceRef.current);
        setDirty(false);
        tell(`${h.name}에 저장했습니다.`);
      } catch {
        /* cancelled */
      }
      return;
    }
    downloadText("project.json", text, "application/json");
    setDirty(false);
    tell("project.json을 내려받았습니다.");
  };

  const save = async () => {
    const cur = specRef.current;
    const src = sourceRef.current;
    if (!cur || !src) return;
    if (src.kind === "live" || (src.kind === "file" && src.handle)) {
      await persist(cur);
      tell("저장했습니다.");
    } else {
      await saveAs();
    }
  };

  return {
    spec,
    source,
    dirty,
    notice,
    dismissNotice: () => setNotice(null),
    tell,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    apply,
    undo,
    redo,

    newProject(name: string, lang: "en" | "ko") {
      leaveLive();
      install(createSpec(name, lang), { kind: "new", name: `${name}.json` }, true);
    },

    loadExample() {
      const parsed = parse(example);
      if (!parsed) return;
      leaveLive();
      install(parsed, { kind: "example", name: "예시: Simple Todo" }, false);
    },

    /** Returns true when the browser could not show a picker and a file input is needed instead. */
    async openFile(): Promise<boolean> {
      const p = picker();
      if (!p.showOpenFilePicker) return true;
      try {
        const [h] = await p.showOpenFilePicker({ types: JSON_TYPES });
        if (h) await loadText(await h.getFile(), h);
      } catch {
        /* cancelled */
      }
      return false;
    },
    openUpload: (file: File) => loadText(file),

    save,
    saveAs,

    /** Write md files next to the project when live; otherwise download them. */
    async exportFiles(files: Record<string, string>) {
      if (sourceRef.current?.kind === "live") {
        try {
          const res = await fetch("/api/files", { method: "POST", body: JSON.stringify({ files }) });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          tell(`${body.written.length}개 파일을 ${body.dir}에 저장했습니다.`);
          return;
        } catch (e) {
          tell(`내보내지 못했습니다: ${describeError(e)}`, "error");
          return;
        }
      }
      for (const [name, content] of Object.entries(files)) downloadText(name, content, "text/markdown");
      tell(`${Object.keys(files).length}개 파일을 내려받았습니다.`);
    },
  };
}

export type ProjectApi = ReturnType<typeof useProject>;

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
