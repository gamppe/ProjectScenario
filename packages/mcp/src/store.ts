import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parseSpec, type ProjectSpec } from "@scenario/core";
import { ZodError } from "zod";

export interface Store {
  file: string;
  exists(): boolean;
  load(): ProjectSpec;
  save(spec: ProjectSpec): void;
}

export function describeError(e: unknown): string {
  if (e instanceof ZodError) {
    return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  }
  return e instanceof Error ? e.message : String(e);
}

/** Reads and writes project.json on every call, so the GUI and CLI always see the same state. */
export function fileStore(file: string): Store {
  return {
    file,
    exists: () => existsSync(file),
    load() {
      if (!existsSync(file)) {
        throw new Error(`${file} does not exist yet. Call init_project first.`);
      }
      try {
        return parseSpec(JSON.parse(readFileSync(file, "utf8")));
      } catch (e) {
        throw new Error(`${file} is invalid: ${describeError(e)}`);
      }
    },
    save(spec) {
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(spec, null, 2) + "\n", "utf8");
      renameSync(tmp, file);
    },
  };
}
