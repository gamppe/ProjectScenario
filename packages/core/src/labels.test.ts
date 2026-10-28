import { describe, expect, it } from "vitest";
import { EDGE_HINTS, EDGE_KINDS, EDGE_LABELS, NODE_HINTS, NODE_LABELS, NodeSchema } from "./index.js";

describe("node and edge labels", () => {
  it("name and describe every node type", () => {
    const types = NodeSchema.options.map((o) => o.shape.type.value).sort();
    expect(Object.keys(NODE_LABELS).sort()).toEqual(types);
    expect(Object.keys(NODE_HINTS).sort()).toEqual(types);
  });

  it("name and describe every edge kind", () => {
    expect(Object.keys(EDGE_LABELS).sort()).toEqual([...EDGE_KINDS].sort());
    expect(Object.keys(EDGE_HINTS).sort()).toEqual([...EDGE_KINDS].sort());
  });

  it("keeps hints to one short line", () => {
    for (const v of [...Object.values(NODE_HINTS), ...Object.values(EDGE_HINTS)]) {
      expect([...v].length).toBeLessThanOrEqual(25);
    }
  });

  it("uses the agreed names for the renamed kinds", () => {
    expect(NODE_LABELS.story).toBe("요구사항");
    expect(NODE_LABELS.vision).toBe("목표");
    expect(NODE_LABELS.interaction).toBe("화면 동작");
    expect(NODE_LABELS.flow).toBe("사용 흐름");
    expect(NODE_LABELS.risk).toBe("위험");
    expect(NODE_LABELS.decision).toBe("기술 선택");
  });

  it("keeps names short enough for the ribbon", () => {
    for (const v of [...Object.values(NODE_LABELS), ...Object.values(EDGE_LABELS)]) {
      expect(v.length).toBeLessThanOrEqual(6);
    }
  });
});
