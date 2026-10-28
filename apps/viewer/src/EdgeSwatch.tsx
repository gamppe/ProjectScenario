import type { EdgeKind } from "@scenario/core";
import { EDGE_DASH, EDGE_STROKE } from "./icons";

/** A short sample of a line kind for ribbon buttons. Dashed kinds are dashed here too. */
export function EdgeSwatch({ kind }: { kind: EdgeKind }) {
  return (
    <svg className="edge-swatch-svg" width="24" height="8" viewBox="0 0 24 8" aria-hidden>
      <line x1="1" y1="4" x2="23" y2="4" style={{ stroke: EDGE_STROKE[kind] }} strokeWidth="2.5" strokeDasharray={EDGE_DASH[kind]} />
    </svg>
  );
}
