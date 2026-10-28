import { useRef } from "react";
import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import type { XY } from "@scenario/core";

export interface RoutedData extends Record<string, unknown> {
  /** SVG path, already routed to the chosen attachment points. */
  d: string;
  mid: XY;
  stroke: string;
  dash?: string;
  width: number;
  label?: string;
  /** More than one real line stands behind this one (a folder collected them). */
  count: number;
  /** Only lines between two things drawn as themselves can have their ends moved. */
  editable: boolean;
  /** Which end is being dragged right now, if any. */
  editing?: { end: "from" | "to"; at: XY };
  onLongPress?: (edgeId: string, clientX: number, clientY: number) => void;
}

export type RoutedEdgeType = Edge<RoutedData, "routed">;

const HOLD_MS = 450;
const MOVE_TOLERANCE = 6;

/**
 * A line whose path is computed by the diagram, so ends can sit at chosen spots on a node
 * instead of one fixed point. Pressing and holding near an end starts moving that end.
 */
export function RoutedEdge({ id, data, markerEnd, selected }: EdgeProps<RoutedEdgeType>) {
  const timer = useRef<number | undefined>(undefined);
  const down = useRef<XY | null>(null);
  if (!data) return null;

  const cancel = () => {
    window.clearTimeout(timer.current);
    down.current = null;
  };
  const label = data.label ?? (data.count > 1 ? `×${data.count}` : undefined);

  return (
    <>
      <BaseEdge
        id={id}
        path={data.d}
        markerEnd={markerEnd}
        label={label}
        labelX={data.mid.x}
        labelY={data.mid.y}
        labelStyle={{ fontSize: 11 }}
        interactionWidth={0}
        style={{ stroke: data.stroke, strokeDasharray: data.dash, strokeWidth: selected ? 3.5 : data.width }}
      />
      <path
        d={data.d}
        className="edge-hit nopan"
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        onPointerDown={(e) => {
          if (!data.editable || e.button !== 0) return;
          const at = { x: e.clientX, y: e.clientY };
          down.current = at;
          timer.current = window.setTimeout(() => {
            down.current = null;
            data.onLongPress?.(id, at.x, at.y);
          }, HOLD_MS);
        }}
        onPointerMove={(e) => {
          const s = down.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
      />
      {data.editing && <circle className="edge-handle" cx={data.editing.at.x} cy={data.editing.at.y} r={7} />}
    </>
  );
}

export const edgeTypes = { routed: RoutedEdge };
