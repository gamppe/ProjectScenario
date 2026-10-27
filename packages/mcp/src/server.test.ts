import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { fileStore } from "./store.js";

let dir: string;
let file: string;
let client: Client;

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  const raw = res.content[0]!.text;
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* error messages are plain text */
  }
  return { error: !!res.isError, data: data as any, raw };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "scenario-mcp-"));
  file = join(dir, "project.json");
  const server = createServer(fileStore(file));
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

describe("MCP server", () => {
  it("exposes the planning tools and prompt", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of [
      "init_project", "next_steps", "get_project", "get_node", "list_questions",
      "record_user_answer", "skip_question", "decide_question", "translate_answer",
      "add_node", "link_nodes", "update_status", "remove_node", "export_markdown",
    ]) {
      expect(names, n).toContain(n);
    }
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toContain("plan_project");
  });

  it("reports a helpful error before the project exists", async () => {
    const r = await call("next_steps");
    expect(r.error).toBe(true);
    expect(r.raw).toContain("init_project");
  });

  it("runs the interview -> skip -> decide -> model -> export flow", async () => {
    expect((await call("init_project", { name: "Demo", output_language: "en" })).error).toBe(false);
    expect((await call("init_project", { name: "Again" })).error).toBe(true);

    const steps = (await call("next_steps")).data;
    expect(steps.askTheUser.length).toBeGreaterThan(5);
    expect(steps.askTheUser[0].id).toBe("problem-statement");

    await call("record_user_answer", { question_id: "problem-statement", value: "할 일 앱이 너무 무겁다" });
    await call("skip_question", { question_id: "scope-mvp" });
    const decided = await call("decide_question", {
      question_id: "scope-mvp",
      value: "task list; add task",
      rationale: "smallest useful product",
      confidence: 0.7,
    });
    expect(decided.error).toBe(false);

    // the agent may not overwrite the user's own answer
    const overwrite = await call("decide_question", {
      question_id: "problem-statement",
      value: "x",
      rationale: "because",
    });
    expect(overwrite.error).toBe(true);
    expect(overwrite.raw).toContain("already answered");

    const review = (await call("list_questions", { state: "review" })).data;
    expect(review.map((q: { id: string }) => q.id)).toEqual(["scope-mvp"]);
    expect(review[0].answer.source).toBe("ai");

    // model the answers
    await call("record_user_answer", { question_id: "ia-screens", value: "목록; 상세" });
    expect((await call("next_steps")).data.modelingGaps[0].missingNodeType).toBe("screen");

    await call("add_node", { type: "vision", id: "vision", title: "Demo" });
    await call("add_node", {
      type: "screen",
      id: "screen-list",
      title: "List",
      parent_id: "vision",
      fields: { route: "/" },
      rationale: "implied by the main flow",
    });
    await call("add_node", { type: "task", id: "task-ui", title: "Build UI", fields: { order: 1 } });
    await call("link_nodes", { from: "task-ui", to: "screen-list", kind: "relates" });
    await call("update_status", { id: "task-ui", status: "done" });

    const project = (await call("get_project")).data;
    expect(project.nodes.find((n: { id: string }) => n.id === "screen-list").aiDecided).toBe(true);
    expect(project.summary.tasks).toEqual({ done: 1, total: 1 });

    const exported = await call("export_markdown", { return_content: true });
    expect(exported.error).toBe(false);
    expect(existsSync(join(dir, "scenario-out", "PRD.md"))).toBe(true);
    expect(exported.data.content["TASKS.md"]).toContain("- [x] **Build UI**");
    expect(exported.data.content["PRD.md"]).toContain("`scope-mvp`"); // listed as awaiting review
    expect(exported.data.warnings.length).toBeGreaterThan(0);

    // everything the tools did is plain project.json the CLI and viewer can read
    expect(JSON.parse(readFileSync(file, "utf8")).answers).toHaveLength(3);
  });

  it("returns tool errors instead of throwing for bad input", async () => {
    await call("init_project", { name: "Demo" });
    expect((await call("record_user_answer", { question_id: "nope", value: "x" })).error).toBe(true);
    expect((await call("link_nodes", { from: "a", to: "b", kind: "relates" })).error).toBe(true);
    expect((await call("record_user_answer", { question_id: "data-storage", value: "tape" })).raw).toContain("valid choice");
  });

  it("the prompt tells the agent how to run the interview", async () => {
    const p = await client.getPrompt({ name: "plan_project", arguments: { idea: "할 일 앱" } });
    const body = (p.messages[0]!.content as { text: string }).text;
    expect(body).toContain("할 일 앱");
    expect(body).toContain("record_user_answer");
  });
});
