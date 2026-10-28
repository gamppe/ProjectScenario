import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  computeRollup,
  createSpec,
  exportMarkdown,
  getQuestion,
  openQuestions,
  removeNode,
  reviewQueue,
  setStatus,
  setTranslation,
  skipQuestion,
  skippedQuestions,
  summarizeSpec,
  untranslated,
  type ProjectSpec,
  type Question,
} from "@scenario/core";
import { z } from "zod";
import { describeError, type Store } from "./store.js";

const INSTRUCTIONS = `ProjectScenario holds a project plan as structured data (nodes, edges, answers to planning questions) and exports it as md files for coding agents.

How to use it well:
- Start with next_steps. It lists what is missing, in priority order.
- P0 questions are required. Ask the USER those in conversation, one stage at a time, then store their words with record_user_answer. Never invent a user answer.
- If the user says to skip or decide for them, call skip_question, then decide_question with a short rationale. Decisions made this way are permanently marked AI-decided until the user reviews them.
- decide_question only works on skipped or open questions; you cannot overwrite what the user answered.
- After answers exist, model them: add_node / link_nodes (screens, features, tasks, ...). next_steps reports answers that have no matching nodes yet.
- Keep the diagram readable: when a project has many nodes of one kind, put them in a folder per kind (add a folder node and give members {"folderId"} in fields), or call group_by_kind once the model exists. Aim for at most about 12 things loose on one level.
- Keep statuses current with update_status while implementing: planned, in_progress, blocked, done.
- Finish with export_markdown to produce AGENTS.md, PRD.md, SCREENS.md, FLOWS.md and TASKS.md.`;

const text = (v: unknown) => ({
  content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }],
});
const failure = (e: unknown) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: describeError(e) }],
});

function describeQuestion(q: Question, spec: ProjectSpec) {
  const a = spec.answers.find((x) => x.questionId === q.id);
  return {
    id: q.id,
    stage: q.stage,
    stageLabel: STAGES.find((s) => s.id === q.stage)?.label,
    importance: q.importance,
    prompt: q.prompt,
    hint: q.hint,
    examples: q.examples,
    kind: q.kind,
    choices: q.choices,
    answer: a
      ? { state: a.state, value: a.value, valueEn: a.valueEn, source: a.provenance.source, rationale: a.provenance.rationale }
      : null,
  };
}

/** Answers that exist but have not been turned into nodes yet. */
const MODELING: { question: string; nodeType: string; hint: string }[] = [
  { question: "ia-screens", nodeType: "screen", hint: "create a screen node for each listed screen" },
  { question: "data-entities", nodeType: "entity", hint: "create an entity node for each data type; fill its fields from the data-fields answer" },
  { question: "tasks-order", nodeType: "task", hint: "create task nodes with order and doneWhen" },
  { question: "scope-mvp", nodeType: "feature", hint: "create feature nodes with inMvp=true" },
  { question: "users-who", nodeType: "persona", hint: "create a persona node per user group" },
  { question: "stories-core", nodeType: "story", hint: "create story nodes (shown to the user as 요구사항) with acceptance criteria" },
  { question: "risks-main", nodeType: "risk", hint: "create risk nodes" },
];

function nextSteps(spec: ProjectSpec) {
  const open = openQuestions(spec);
  const skipped = skippedQuestions(spec);
  const brief = (q: Question) => ({ id: q.id, importance: q.importance, stage: q.stage, prompt: q.prompt });
  const answered = new Map(spec.answers.map((a) => [a.questionId, a] as const));

  return {
    summary: summarizeSpec(spec),
    askTheUser: open.filter((q) => q.importance === "P0").map(brief),
    askTheUserLater: open.filter((q) => q.importance !== "P0").slice(0, 10).map(brief),
    decideSkipped: skipped.map(brief),
    waitingForUserReview: reviewQueue(spec).map((a) => a.questionId),
    needTranslation: spec.project.outputLanguage === "en" ? untranslated(spec).map((a) => a.questionId) : [],
    modelingGaps: MODELING.flatMap((m) => {
      const a = answered.get(m.question);
      if (!a || a.value === undefined) return [];
      if (spec.nodes.some((n) => n.type === m.nodeType)) return [];
      return [{ fromQuestion: m.question, value: a.value, missingNodeType: m.nodeType, hint: m.hint }];
    }),
  };
}

export function createServer(store: Store): McpServer {
  const server = new McpServer({ name: "project-scenario", version: "0.0.1" }, { instructions: INSTRUCTIONS });

  /** Wraps a handler so thrown errors become tool errors the agent can read. */
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>) => unknown,
    readOnly = false,
  ) {
    server.registerTool(
      name,
      { description, inputSchema: shape, annotations: { readOnlyHint: readOnly } },
      // The SDK's callback type is generic over the schema; we validate through
      // the zod shape above, so a loose cast here is safe.
      (async (args: unknown) => {
        try {
          return text(await fn(args as z.infer<z.ZodObject<S>>));
        } catch (e) {
          return failure(e);
        }
      }) as never,
    );
  }

  /** Load, apply a pure operation, save, and report what changed. */
  const mutate = (fn: (s: ProjectSpec) => ProjectSpec) => {
    store.save(fn(store.load()));
  };

  tool(
    "init_project",
    "Create a new project.json (only if none exists yet).",
    { name: z.string().min(1), output_language: z.enum(["en", "ko"]).default("en") },
    ({ name, output_language }) => {
      if (store.exists()) throw new Error(`${store.file} already exists`);
      store.save(createSpec(name, output_language));
      return { created: store.file };
    },
  );

  tool(
    "next_steps",
    "Start here. Prioritized list of what to ask the user, what to decide, what to model, and what is waiting for review.",
    {},
    () => nextSteps(store.load()),
    true,
  );

  tool(
    "get_project",
    "Overview: summary counts, every node (id, type, title, effective status, AI flag) and every edge.",
    {},
    () => {
      const spec = store.load();
      const rollup = computeRollup(spec);
      return {
        summary: summarizeSpec(spec),
        nodes: spec.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          status: rollup[n.id],
          aiDecided: n.provenance?.source === "ai",
          folderId: n.folderId,
        })),
        edges: spec.edges,
      };
    },
    true,
  );

  tool(
    "get_node",
    "Full details of one node plus its edges and the answers that produced it.",
    { id: z.string() },
    ({ id }) => {
      const spec = store.load();
      const node = spec.nodes.find((n) => n.id === id);
      if (!node) throw new Error(`unknown node "${id}"`);
      return {
        node,
        effectiveStatus: computeRollup(spec)[id],
        edgesOut: spec.edges.filter((e) => e.from === id),
        edgesIn: spec.edges.filter((e) => e.to === id),
        answers: spec.answers.filter((a) => a.nodeIds.includes(id)),
      };
    },
    true,
  );

  tool(
    "list_questions",
    "List planning questions with the current answer. state: open (unanswered), skipped (user delegated), review (AI-decided, awaiting user), untranslated, all.",
    {
      state: z.enum(["open", "skipped", "review", "untranslated", "all"]).default("open"),
      stage: z.enum(STAGES.map((s) => s.id) as [string, ...string[]]).optional(),
    },
    ({ state, stage }) => {
      const spec = store.load();
      let qs: Question[];
      switch (state) {
        case "open": qs = openQuestions(spec); break;
        case "skipped": qs = skippedQuestions(spec); break;
        case "review": qs = reviewQueue(spec).flatMap((a) => getQuestion(a.questionId) ?? []); break;
        case "untranslated": qs = untranslated(spec).flatMap((a) => getQuestion(a.questionId) ?? []); break;
        default: qs = QUESTION_BANK;
      }
      if (stage) qs = qs.filter((q) => q.stage === stage);
      return qs.map((q) => describeQuestion(q, spec));
    },
    true,
  );

  tool(
    "record_user_answer",
    "Store an answer the USER actually gave (in chat or elsewhere). Do not use this to answer on the user's behalf; use decide_question for that. List/multi values are separated by ';'. Booleans: yes/no.",
    { question_id: z.string(), value: z.string().min(1) },
    ({ question_id, value }) => {
      const q = getQuestion(question_id);
      if (!q) throw new Error(`unknown question "${question_id}"`);
      mutate((s) => answerQuestion(s, question_id, coerceValue(q, value)));
      return { recorded: question_id };
    },
  );

  tool(
    "skip_question",
    "Record that the user chose to skip a question, leaving the decision to an agent. Follow with decide_question.",
    { question_id: z.string() },
    ({ question_id }) => {
      mutate((s) => skipQuestion(s, question_id));
      return { skipped: question_id };
    },
  );

  tool(
    "decide_question",
    "Fill a skipped (or still open) question with your own judgment. It is marked AI-decided with your rationale and stays flagged until the user reviews it. Fails if the user already answered.",
    {
      question_id: z.string(),
      value: z.string().min(1),
      rationale: z.string().min(1).describe("One sentence on why this is a reasonable choice for this project"),
      confidence: z.number().min(0).max(1).optional(),
    },
    ({ question_id, value, rationale, confidence }) => {
      const q = getQuestion(question_id);
      if (!q) throw new Error(`unknown question "${question_id}"`);
      mutate((s) => aiDecide(s, question_id, coerceValue(q, value), rationale, { confidence }));
      return { decided: question_id, status: "AI-decided, awaiting user review" };
    },
  );

  tool(
    "translate_answer",
    "Store the English (output language) version of an answer. Use list_questions with state=untranslated to find them.",
    { question_id: z.string(), value_en: z.string().min(1) },
    ({ question_id, value_en }) => {
      const q = getQuestion(question_id);
      if (!q) throw new Error(`unknown question "${question_id}"`);
      mutate((s) => setTranslation(s, question_id, coerceValue(q, value_en)));
      return { translated: question_id };
    },
  );

  tool(
    "add_node",
    `Add a node. type is one of vision, persona, feature, story, screen, interaction, flow, entity, decision, task, risk, folder. A folder only groups nodes on the diagram: create it first, then give members {"folderId": "<folder id>"} in "fields". id is a lowercase slug like "feat-login". Type-specific fields go in "fields" (e.g. task: {order, doneWhen[]}; screen: {route, states[{name, description}]}; entity: {fields[{name,type}]}). Set parent_id to place it under another node.`,
    {
      type: z.string(),
      id: z.string(),
      title: z.string().min(1),
      parent_id: z.string().optional(),
      fields: z.record(z.string(), z.unknown()).optional(),
      rationale: z.string().optional().describe("If you are proposing this node yourself, say why; it is then marked AI-decided"),
    },
    ({ type, id, title, parent_id, fields, rationale }) => {
      const node: Record<string, unknown> = { ...fields, id, type, title };
      if (rationale) node.provenance = { source: "ai", rationale, reviewed: false, decidedAt: new Date().toISOString() };
      mutate((s) => addNode(s, node, { parentId: parent_id }));
      return { added: id };
    },
  );

  tool(
    "group_by_kind",
    "Tidy the diagram: put loose nodes of the same kind (features, screens, tasks, ...) into one folder per kind, for every kind that has at least min_per_kind of them (default 3). Folders that already exist are reused; lines are kept. Call it after building the model, or whenever one level gets crowded.",
    { min_per_kind: z.number().int().min(1).default(3) },
    ({ min_per_kind }) => {
      const before = store.load().nodes.filter((n) => n.type === "folder").map((n) => n.id);
      mutate((s) => groupByKind(s, { min: min_per_kind }));
      const after = store.load().nodes.filter((n) => n.type === "folder").map((n) => n.id);
      return { newFolders: after.filter((id) => !before.includes(id)) };
    },
  );

  tool(
    "link_nodes",
    `Connect two nodes. kind: ${EDGE_KINDS.join(", ")}. contains = parent->child (drives status roll-up), navigates = screen->screen, implements = task->feature/story, depends_on = needs the target first.`,
    { from: z.string(), to: z.string(), kind: z.enum(EDGE_KINDS), label: z.string().optional() },
    ({ from, to, kind, label }) => {
      mutate((s) => addEdge(s, { from, to, kind, label }));
      return { linked: `${from} -${kind}-> ${to}` };
    },
  );

  tool(
    "update_status",
    "Set a node's own status. Parents roll up from their children automatically.",
    { id: z.string(), status: z.enum(STATUSES) },
    ({ id, status }) => {
      mutate((s) => setStatus(s, id, status));
      return { id, status };
    },
  );

  tool(
    "remove_node",
    "Delete a node and every edge touching it.",
    { id: z.string() },
    ({ id }) => {
      mutate((s) => removeNode(s, id));
      return { removed: id };
    },
  );

  tool(
    "export_markdown",
    "Write AGENTS.md, PRD.md, SCREENS.md, FLOWS.md and TASKS.md. Defaults to a scenario-out folder next to project.json. Set return_content to get the text back instead of reading the files.",
    { out_dir: z.string().optional(), return_content: z.boolean().default(false) },
    ({ out_dir, return_content }) => {
      const spec = store.load();
      const files = exportMarkdown(spec);
      const dir = resolve(out_dir ?? join(dirname(resolve(store.file)), "scenario-out"));
      mkdirSync(dir, { recursive: true });
      for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf8");
      const steps = nextSteps(spec);
      return {
        wrote: Object.keys(files),
        dir,
        warnings: [
          ...(steps.askTheUser.length ? [`${steps.askTheUser.length} required question(s) unanswered`] : []),
          ...(steps.decideSkipped.length ? [`${steps.decideSkipped.length} skipped question(s) not decided yet`] : []),
          ...(steps.needTranslation.length ? [`${steps.needTranslation.length} answer(s) untranslated`] : []),
        ],
        ...(return_content ? { content: files } : {}),
      };
    },
  );

  server.registerPrompt(
    "plan_project",
    {
      title: "Plan a project with the user",
      description: "Interview the user and build a structured plan in ProjectScenario.",
      argsSchema: { idea: z.string().optional().describe("One-line idea, if the user already gave one") },
    },
    ({ idea }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Help me plan a software project using the ProjectScenario tools.",
              idea ? `My idea: ${idea}` : "I will describe the idea as we go.",
              "",
              "Process:",
              "1. Call init_project if there is no project yet, then next_steps.",
              "2. Interview me stage by stage. Ask the required (P0) questions from next_steps in small groups, in Korean, using the prompts as written. Wait for my answers and store them with record_user_answer. Do not answer for me.",
              "3. If I say to skip or to decide for me, use skip_question then decide_question with a one-sentence rationale.",
              "4. When answers exist, build the model: add_node and link_nodes for screens, features, tasks and so on. Check next_steps for modelingGaps. Keep it readable: create a folder per kind (or call group_by_kind at the end) instead of leaving dozens of nodes loose.",
              "5. Call export_markdown and summarize what is still open or AI-decided so I can review it.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
