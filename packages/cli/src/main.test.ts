import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { run } from "./main.js";

let dir: string;
let file: string;
let lines: string[];

const cli = async (...args: string[]) => {
  lines = [];
  const code = await run(["--file", file, ...args], { print: (l) => lines.push(l) });
  return { code, text: lines.join("\n") };
};
const spec = () => JSON.parse(readFileSync(file, "utf8"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "scenario-"));
  file = join(dir, "project.json");
});

describe("cli", () => {
  it("runs the full answer / skip / decide / review flow", async () => {
    await cli("init", "Demo");
    await cli("answer", "problem-statement", "할 일 앱이 너무 무겁다");
    await cli("skip", "scope-mvp");
    await cli("decide", "scope-mvp", "tasks;tags", "--why", "smallest useful set", "--confidence", "0.6");

    const answers = spec().answers;
    expect(answers.map((a: { state: string }) => a.state)).toEqual(["answered", "ai_decided"]);

    const st = await cli("status", "--json");
    const summary = JSON.parse(st.text);
    expect(summary.needsReview).toEqual(["scope-mvp"]);
    expect(summary.questions.P0.resolved).toBe(2);

    await cli("review", "scope-mvp");
    expect(JSON.parse((await cli("status", "--json")).text).needsReview).toEqual([]);
  });

  it("builds a graph, sets status and exports md", async () => {
    await cli("init", "Demo");
    await cli("add", "vision", "vision", "Demo vision");
    await cli("add", "feature", "feat-a", "Feature A", "--parent", "vision", "--data", '{"priority":"must","inMvp":true}');
    await cli("add", "task", "task-a", "Build A", "--data", '{"order":1}');
    await cli("link", "task-a", "feat-a", "implements");
    await cli("status", "task-a", "done");

    const out = join(dir, "out");
    const r = await cli("export", "--out", out);
    expect(r.code).toBe(0);
    for (const f of ["AGENTS.md", "PRD.md", "SCREENS.md", "FLOWS.md", "TASKS.md"]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    expect(readFileSync(join(out, "TASKS.md"), "utf8")).toContain("- [x] **Build A**");
    expect(r.text).toContain("warning");
  });

  it("refuses bad input with a clear error", async () => {
    await cli("init", "Demo");
    await expect(cli("init", "Again")).rejects.toThrow(/already exists/);
    await expect(cli("answer", "nope", "x")).rejects.toThrow(/unknown question/);
    await expect(cli("status", "ghost", "done")).rejects.toThrow(/unknown node/);
    await expect(cli("decide", "scope-mvp", "x")).rejects.toThrow(/--why/);
    await expect(cli("link", "a", "b", "friends")).rejects.toThrow(/edge kind/);
  });

  it("guided ask saves answers, skips and ignores invalid input", async () => {
    await cli("init", "Demo");
    const input = Readable.from([
      "무겁다\n", // problem-statement
      "/s\n", // problem-goals (P0) -> asks for confirmation
      "y\n",
      "/q\n",
    ]);
    lines = [];
    await run(["--file", file, "ask", "--stage", "problem"], {
      print: (l) => lines.push(l),
      input,
    });
    const answers = spec().answers;
    expect(answers[0]).toMatchObject({ questionId: "problem-statement", state: "answered" });
    expect(answers[1]).toMatchObject({ questionId: "problem-goals", state: "skipped" });
  });

  it("lists questions as json for agents", async () => {
    await cli("init", "Demo");
    const r = await cli("questions", "--stage", "scope", "--json");
    const qs = JSON.parse(r.text);
    expect(qs.map((q: { id: string }) => q.id)).toContain("scope-nongoals");
    expect(qs[0].answer).toBeNull();
  });
});
