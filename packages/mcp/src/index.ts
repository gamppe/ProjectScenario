#!/usr/bin/env node
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { fileStore } from "./store.js";

function parseFile(argv: string[]): string {
  const i = argv.findIndex((a) => a === "--file" || a === "-f");
  const fromFlag = i >= 0 ? argv[i + 1] : undefined;
  return resolve(fromFlag ?? process.env.SCENARIO_FILE ?? "project.json");
}

const file = parseFile(process.argv.slice(2));
const server = createServer(fileStore(file));

// stdout carries the protocol, so log to stderr only.
console.error(`project-scenario MCP server using ${file}`);
await server.connect(new StdioServerTransport());
