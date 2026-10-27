import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const MD_FILES = new Set(["AGENTS.md", "PRD.md", "SCREENS.md", "FLOWS.md", "TASKS.md"]);
const MCP_ENTRY = fileURLToPath(new URL("../../packages/mcp/dist/index.js", import.meta.url));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 20_000_000) fail(new Error("body too large"));
    });
    req.on("end", () => ok(body));
    req.on("error", fail);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Dev-server bridge between the viewer and the project file named by
 * SCENARIO_FILE, so the GUI, the CLI and MCP agents all work on the same file.
 *   GET  /api/project?since=<mtime>  read (or "unchanged")
 *   PUT  /api/project                save
 *   POST /api/files                  write exported md files next to the project
 *   GET  /api/info                   paths needed for the MCP setup help
 * Without SCENARIO_FILE every route answers 404 and the viewer runs standalone.
 */
function projectFile(): Plugin {
  const path = process.env.SCENARIO_FILE ? resolve(process.env.SCENARIO_FILE) : undefined;
  return {
    name: "scenario-project-file",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res, next) => {
        const url = new URL(req.url ?? "", "http://x");
        if (!path) return send(res, 404, { error: "no project file configured" });

        try {
          if (url.pathname === "/project" && req.method === "GET") {
            const mtime = statSync(path).mtimeMs;
            const since = Number(url.searchParams.get("since"));
            if (since && since === mtime) return send(res, 200, { changed: false, mtime });
            return send(res, 200, { changed: true, mtime, name: path, data: JSON.parse(readFileSync(path, "utf8")) });
          }

          if (url.pathname === "/project" && req.method === "PUT") {
            const data = JSON.parse(await readBody(req));
            const tmp = `${path}.tmp`;
            writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
            renameSync(tmp, path);
            return send(res, 200, { mtime: statSync(path).mtimeMs });
          }

          if (url.pathname === "/files" && req.method === "POST") {
            const { files } = JSON.parse(await readBody(req)) as { files: Record<string, string> };
            const dir = join(dirname(path), "scenario-out");
            mkdirSync(dir, { recursive: true });
            const written: string[] = [];
            for (const [name, content] of Object.entries(files)) {
              // only the known deliverables, and never a path
              if (!MD_FILES.has(basename(name)) || basename(name) !== name) continue;
              writeFileSync(join(dir, name), content, "utf8");
              written.push(name);
            }
            return send(res, 200, { dir, written });
          }

          if (url.pathname === "/info" && req.method === "GET") {
            return send(res, 200, { file: path, mcp: MCP_ENTRY });
          }
          next();
        } catch (e) {
          send(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), projectFile()],
  resolve: {
    alias: {
      "@scenario/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: false },
});
