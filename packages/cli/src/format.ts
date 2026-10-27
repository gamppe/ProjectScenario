import type { Status } from "@scenario/core";

const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const dim = (s: string) => paint("2", s);
export const bold = (s: string) => paint("1", s);

// Mirrors the GUI status dots: gray / blue / yellow / green.
const DOT: Record<Status, (s: string) => string> = {
  planned: (s) => paint("90", s),
  in_progress: (s) => paint("34", s),
  blocked: (s) => paint("33", s),
  done: (s) => paint("32", s),
};

export const STATUS_TEXT: Record<Status, string> = {
  planned: "planned",
  in_progress: "in progress",
  blocked: "blocked",
  done: "done",
};

export function dot(status: Status): string {
  return DOT[status]("●");
}

export function statusLabel(status: Status): string {
  return `${dot(status)} ${STATUS_TEXT[status]}`;
}
