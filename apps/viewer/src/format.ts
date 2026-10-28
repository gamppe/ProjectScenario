import type { AnswerValue } from "@scenario/core";

/** An answer as one line of text for display. */
export function valueText(v: AnswerValue | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  return Array.isArray(v) ? v.join(", ") : v;
}
