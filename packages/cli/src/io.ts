import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parseSpec, type ProjectSpec } from "@scenario/core";
import { ZodError } from "zod";

export class CliError extends Error {}

export function describeError(e: unknown): string {
  if (e instanceof ZodError) {
    return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
  }
  return e instanceof Error ? e.message : String(e);
}

export function loadSpec(file: string): ProjectSpec {
  if (!existsSync(file)) {
    throw new CliError(`${file} not found. Run \`scenario init <name>\` first or pass --file.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new CliError(`${file} is not valid JSON: ${describeError(e)}`);
  }
  try {
    return parseSpec(data);
  } catch (e) {
    throw new CliError(`${file} failed validation:\n${describeError(e)}`);
  }
}

/** Write via a temp file so a crash never leaves a half-written project.json. */
export function saveSpec(file: string, spec: ProjectSpec): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(spec, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}
