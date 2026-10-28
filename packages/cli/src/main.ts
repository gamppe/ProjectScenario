import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  EDGE_KINDS,
  QUESTION_BANK,
  STAGES,
  STATUSES,
  addEdge,
  addNode,
  groupByKind,
  aiDecide,
  answerQuestion,
  coerceValue,
  computeCompleteness,
  computeRollup,
  createSpec,
  exportMarkdown,
  getQuestion,
  markReviewed,
  openQuestions,
  removeNode,
  reviewQueue,
  setStatus,
  setTranslation,
  summarizeSpec,
  skipQuestion,
  skippedQuestions,
  untranslated,
  type EdgeKind,
  type ProjectSpec,
  type Question,
  type Status,
} from "@scenario/core";
import { dim, bold, dot, statusLabel, STATUS_TEXT } from "./format.js";
import { CliError, describeError, loadSpec, saveSpec } from "./io.js";

export interface Io {
  print(line: string): void;
  /** Lines typed by the user for `ask`; defaults to process.stdin. */
  input?: NodeJS.ReadableStream;
}

const HELP = `scenario — plan a project as a diagram and export md for AI agents

Usage: scenario [--file project.json] <command> [args]

Project
  init <name> [--lang en|ko]      create project.json
  validate                        check project.json
  status                          progress, completeness, review queue
  status <id> <status>            set a node's status (planned|in_progress|blocked|done)
  list [--type <type>]            list nodes with status dots

Questions
  ask [--stage <id>]              guided Q&A in the terminal (Korean)
  questions [--state open|skipped|review|untranslated|all] [--stage <id>]
  answer <questionId> <value>     list/multi values are separated by ";"
  skip <questionId>               leave it to the agent to decide
  decide <questionId> <value> --why <text> [--confidence 0-1]
                                  (agents) fill a skipped question; marked AI-decided
  review <questionId>             accept an AI decision as-is
  translate <questionId> <value>  store the output-language version

Graph
  add <type> <id> <title> [--parent <id>] [--data '<json>']
  link <from> <to> <kind> [--label <text>]
  rm <id>
  group [--min <n>]               put loose nodes into one folder per kind (default: 3 or more of a kind)

Output
  export [--out <dir>]            write AGENTS.md PRD.md SCREENS.md FLOWS.md TASKS.md

Global flags: --file/-f <path>  --json  --help
Edge kinds: ${EDGE_KINDS.join(", ")}`;

const OPTIONS = {
  file: { type: "string", short: "f" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  lang: { type: "string" },
  type: { type: "string" },
  stage: { type: "string" },
  state: { type: "string" },
  parent: { type: "string" },
  min: { type: "string" },
  data: { type: "string" },
  label: { type: "string" },
  out: { type: "string" },
  why: { type: "string" },
  confidence: { type: "string" },
} as const;

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined || v === "") throw new CliError(`missing ${what}. Run \`scenario --help\`.`);
  return v;
}

function stageLabel(id: string): string {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

function requireQ(id: string): Question {
  const q = getQuestion(id);
  if (!q) throw new CliError(`unknown question "${id}". Run \`scenario questions --state all\`.`);
  return q;
}

function describeQuestion(q: Question): string {
  return `[${q.importance}] ${q.id}  ${dim(`(${stageLabel(q.stage)})`)}  ${q.prompt}`;
}

function filterStage(qs: Question[], stage?: string): Question[] {
  if (!stage) return qs;
  if (!STAGES.some((s) => s.id === stage)) {
    throw new CliError(`unknown stage "${stage}". Stages: ${STAGES.map((s) => s.id).join(", ")}`);
  }
  return qs.filter((q) => q.stage === stage);
}

export async function run(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
  });
  const [cmd, ...args] = positionals;
  const out = (s = "") => io.print(s);
  const file = resolve(values.file ?? process.env.SCENARIO_FILE ?? "project.json");
  const json = (v: unknown) => out(JSON.stringify(v, null, 2));

  if (!cmd || values.help || cmd === "help") {
    out(HELP);
    return 0;
  }

  const mutate = (fn: (s: ProjectSpec) => ProjectSpec): ProjectSpec => {
    const next = fn(loadSpec(file));
    saveSpec(file, next);
    return next;
  };

  switch (cmd) {
    case "init": {
      const name = need(args[0], "project name");
      if (existsSync(file)) throw new CliError(`${file} already exists`);
      const lang = values.lang ?? "en";
      if (lang !== "en" && lang !== "ko") throw new CliError(`--lang must be en or ko`);
      saveSpec(file, createSpec(name, lang));
      out(`created ${file}`);
      out(`next: scenario ask`);
      return 0;
    }

    case "validate": {
      const spec = loadSpec(file);
      out(`ok: ${spec.nodes.length} nodes, ${spec.edges.length} edges, ${spec.answers.length} answers`);
      return 0;
    }

    case "status": {
      if (args.length > 0) {
        const id = need(args[0], "node id");
        const st = need(args[1], "status") as Status;
        if (!STATUSES.includes(st)) throw new CliError(`status must be one of: ${STATUSES.join(", ")}`);
        mutate((s) => setStatus(s, id, st));
        out(`${id} → ${statusLabel(st)}`);
        return 0;
      }
      const summary = summarizeSpec(loadSpec(file));
      if (values.json) {
        json(summary);
        return 0;
      }
      const counts = summary.nodes;
      const tasks = summary.tasks;
      out(`${bold(summary.project)}  ${dim(`(output: ${summary.outputLanguage})`)}`);
      out(
        `nodes: ${(Object.keys(counts) as Status[]).map((k) => `${dot(k)} ${STATUS_TEXT[k]} ${counts[k]}`).join("  ")}` +
          (tasks.total ? `   tasks: ${tasks.done}/${tasks.total} done` : ""),
      );
      for (const p of ["P0", "P1", "P2"] as const) {
        const t = summary.questions[p];
        out(`${p}: ${t.resolved}/${t.total} resolved` + (t.skipped ? `, ${t.skipped} skipped` : "") + (t.open ? `, ${t.open} open` : ""));
      }
      if (summary.missingRequired.length) out(`missing required: ${summary.missingRequired.join(", ")}`);
      if (summary.skippedWaitingForAgent.length) out(`skipped (agent to decide): ${summary.skippedWaitingForAgent.join(", ")}`);
      if (summary.needsReview.length) out(`AI decisions to review: ${summary.needsReview.join(", ")}`);
      if (summary.untranslated.length && summary.outputLanguage === "en") {
        out(`untranslated answers: ${summary.untranslated.length}`);
      }
      return 0;
    }

    case "list": {
      const spec = loadSpec(file);
      const rollup = computeRollup(spec);
      const nodes = spec.nodes.filter((n) => !values.type || n.type === values.type);
      if (values.json) {
        json(nodes.map((n) => ({ id: n.id, type: n.type, title: n.title, status: rollup[n.id] })));
        return 0;
      }
      for (const n of nodes) {
        const ai = n.provenance?.source === "ai" ? dim(" [AI]") : "";
        out(`${dot(rollup[n.id] ?? "planned")} ${n.id}  ${dim(n.type)}  ${n.title}${ai}`);
      }
      return 0;
    }

    case "questions": {
      const spec = loadSpec(file);
      const state = values.state ?? "open";
      let qs: Question[];
      switch (state) {
        case "open": qs = openQuestions(spec); break;
        case "skipped": qs = skippedQuestions(spec); break;
        case "review": qs = reviewQueue(spec).flatMap((a) => getQuestion(a.questionId) ?? []); break;
        case "untranslated": qs = untranslated(spec).flatMap((a) => getQuestion(a.questionId) ?? []); break;
        case "all": qs = QUESTION_BANK; break;
        default: throw new CliError(`--state must be open|skipped|review|untranslated|all`);
      }
      qs = filterStage(qs, values.stage);
      if (values.json) {
        const answers = new Map(spec.answers.map((a) => [a.questionId, a] as const));
        json(qs.map((q) => ({ ...q, answer: answers.get(q.id) ?? null })));
      } else if (!qs.length) {
        out("(none)");
      } else {
        for (const q of qs) out(describeQuestion(q));
      }
      return 0;
    }

    case "answer": {
      const q = requireQ(need(args[0], "question id"));
      const raw = need(args.slice(1).join(" "), "value");
      mutate((s) => answerQuestion(s, q.id, coerceValue(q, raw)));
      out(`answered ${q.id}`);
      return 0;
    }

    case "skip": {
      const q = requireQ(need(args[0], "question id"));
      mutate((s) => skipQuestion(s, q.id));
      out(`skipped ${q.id} (an agent can now decide it)`);
      return 0;
    }

    case "decide": {
      const q = requireQ(need(args[0], "question id"));
      const raw = need(args.slice(1).join(" "), "value");
      const why = need(values.why, "--why <rationale>");
      const confidence = values.confidence === undefined ? undefined : Number(values.confidence);
      if (confidence !== undefined && !(confidence >= 0 && confidence <= 1)) {
        throw new CliError("--confidence must be between 0 and 1");
      }
      mutate((s) => aiDecide(s, q.id, coerceValue(q, raw), why, { confidence }));
      out(`AI-decided ${q.id} (needs user review)`);
      return 0;
    }

    case "review": {
      const id = need(args[0], "question id");
      mutate((s) => markReviewed(s, id));
      out(`reviewed ${id}`);
      return 0;
    }

    case "translate": {
      const q = requireQ(need(args[0], "question id"));
      const raw = need(args.slice(1).join(" "), "value");
      mutate((s) => setTranslation(s, q.id, coerceValue(q, raw)));
      out(`translated ${q.id}`);
      return 0;
    }

    case "add": {
      const type = need(args[0], "node type");
      const id = need(args[1], "node id");
      const title = need(args.slice(2).join(" "), "title");
      let extra: Record<string, unknown> = {};
      if (values.data) {
        try {
          extra = JSON.parse(values.data);
        } catch {
          throw new CliError("--data must be a JSON object");
        }
      }
      mutate((s) => addNode(s, { ...extra, id, type, title }, { parentId: values.parent }));
      out(`added ${type} ${id}`);
      return 0;
    }

    case "group": {
      const min = values.min === undefined ? 3 : Number(values.min);
      if (!Number.isInteger(min) || min < 1) throw new CliError("--min must be a whole number, 1 or more");
      const count = (sp: ProjectSpec) => sp.nodes.filter((n) => n.type === "folder").length;
      const before = count(loadSpec(file));
      const next = mutate((sp) => groupByKind(sp, { min }));
      out(`grouped into ${count(next) - before} new folder(s)`);
      return 0;
    }

    case "link": {
      const from = need(args[0], "from id");
      const to = need(args[1], "to id");
      const kind = need(args[2], "edge kind") as EdgeKind;
      if (!EDGE_KINDS.includes(kind)) throw new CliError(`edge kind must be one of: ${EDGE_KINDS.join(", ")}`);
      mutate((s) => addEdge(s, { from, to, kind, label: values.label }));
      out(`linked ${from} -${kind}-> ${to}`);
      return 0;
    }

    case "rm": {
      const id = need(args[0], "node id");
      mutate((s) => removeNode(s, id));
      out(`removed ${id}`);
      return 0;
    }

    case "export": {
      const spec = loadSpec(file);
      const dir = resolve(values.out ?? "scenario-out");
      mkdirSync(dir, { recursive: true });
      const files = exportMarkdown(spec);
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(dir, name), content, "utf8");
      }
      out(`wrote ${Object.keys(files).join(", ")} to ${dir}`);
      const comp = computeCompleteness(QUESTION_BANK, spec);
      if (comp.missingP0.length) {
        out(`warning: ${comp.missingP0.length} required question(s) unanswered or skipped: ${comp.missingP0.join(", ")}`);
      }
      const missing = untranslated(spec).length;
      if (spec.project.outputLanguage === "en" && missing) {
        out(`warning: ${missing} answer(s) have no English translation and stay in their original language`);
      }
      return 0;
    }

    case "ask":
      return ask(file, values.stage, io, mutate);

    default:
      throw new CliError(`unknown command "${cmd}". Run \`scenario --help\`.`);
  }
}

/** Guided Q&A. Korean prompts; a blank line is ignored, "/s" skips, "/q" quits. */
async function ask(
  file: string,
  stage: string | undefined,
  io: Io,
  mutate: (fn: (s: ProjectSpec) => ProjectSpec) => ProjectSpec,
): Promise<number> {
  const rl = createInterface({ input: io.input ?? process.stdin, output: process.stdout, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const readLine = async (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt);
    const r = await lines.next();
    return r.done ? null : r.value.trim();
  };

  let spec = loadSpec(file);
  let answered = 0;
  io.print(dim("답변 입력 · 목록/복수 선택은 ; 로 구분 · /s 건너뛰기(에이전트가 판단) · /q 종료"));

  try {
    for (;;) {
      const q = filterStage(openQuestions(spec), stage)[0];
      if (!q) {
        io.print("\n더 이상 남은 질문이 없습니다.");
        break;
      }
      io.print(`\n[${q.importance}] ${stageLabel(q.stage)} · ${bold(q.prompt)}`);
      if (q.hint) io.print(dim(`  힌트: ${q.hint}`));
      if (q.examples.length) io.print(dim(`  예: ${q.examples.join(" / ")}`));
      if (q.choices.length) io.print(dim(`  선택: ${q.choices.map((c) => `${c.value}(${c.label})`).join(", ")}`));
      if (q.kind === "boolean") io.print(dim("  선택: 예 / 아니오"));

      const line = await readLine("> ");
      if (line === null || line === "/q") break;
      if (line === "") continue;

      if (line === "/s") {
        if (q.importance === "P0") {
          const ok = await readLine("필수 질문입니다. 에이전트가 판단하도록 건너뛸까요? (y/N) ");
          if (ok === null) break;
          if (!/^(y|yes|예|네)$/i.test(ok)) continue;
        }
        spec = mutate((s) => skipQuestion(s, q.id));
        continue;
      }

      try {
        const value = coerceValue(q, line);
        spec = mutate((s) => answerQuestion(s, q.id, value));
        answered++;
      } catch (e) {
        io.print(`  ✗ ${describeError(e)}`);
      }
    }
  } finally {
    rl.close();
  }
  io.print(`\n${answered}개 답변을 저장했습니다.`);
  return 0;
}
