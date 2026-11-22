import { describe, expect, it } from "vitest";
import { evaluateRoutineDeliveryBatch } from "./routine-dedup.js";

describe("routine-dedup", () => {
  it("delivers only new items on a second overlapping run and distinguishes empty_success vs failed", () => {
    const t0 = 1_700_000_000_000;
    const pass1 = evaluateRoutineDeliveryBatch({
      candidateKeys: ["item_1", "item_2"],
      existingRecords: [],
      nowMs: t0,
    });
    expect(pass1.classification).toEqual({
      kind: "new_items",
      newKeys: ["item_1", "item_2"],
      suppressedCount: 0,
    });

    const pass2 = evaluateRoutineDeliveryBatch({
      candidateKeys: ["item_2", "item_3"],
      existingRecords: pass1.nextRecords,
      nowMs: t0 + 1_000,
    });
    expect(pass2.classification).toEqual({
      kind: "new_items",
      newKeys: ["item_3"],
      suppressedCount: 1,
    });

    const pass3Empty = evaluateRoutineDeliveryBatch({
      candidateKeys: ["item_1", "item_3"],
      existingRecords: pass2.nextRecords,
      nowMs: t0 + 2_000,
    });
    expect(pass3Empty.classification).toEqual({
      kind: "empty_success",
      suppressedCount: 2,
    });

    const pass4Fail = evaluateRoutineDeliveryBatch({
      candidateKeys: [],
      existingRecords: pass2.nextRecords,
      nowMs: t0 + 3_000,
      error: "Provider 503",
    });
    expect(pass4Fail.classification).toEqual({
      kind: "failed",
      error: "Provider 503",
    });
  });
});
