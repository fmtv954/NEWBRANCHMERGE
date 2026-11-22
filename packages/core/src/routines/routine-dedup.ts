export type RoutineCheckOutcome = "reported" | "skipped";

export interface RoutineDeliveryKeyRecord {
  itemKey: string;
  outcome: RoutineCheckOutcome;
  expiresAtMs: number;
}

export type RoutineRunClassification =
  | { kind: "new_items"; newKeys: string[]; suppressedCount: number }
  | { kind: "empty_success"; suppressedCount: number }
  | { kind: "failed"; error: string };

/**
 * Customer-Pain Fix #2: Bounded expiring routine deduplication kept separate from personal memory.
 * Distinguishes an empty successful check from a failed check and suppresses already-reported
 * or skipped items until their TTL expires.
 */
export function evaluateRoutineDeliveryBatch(input: {
  candidateKeys: readonly string[];
  existingRecords: readonly RoutineDeliveryKeyRecord[];
  nowMs: number;
  ttlMs?: number;
  error?: string | null;
}): {
  classification: RoutineRunClassification;
  nextRecords: RoutineDeliveryKeyRecord[];
} {
  const activeRecords = input.existingRecords.filter((r) => r.expiresAtMs > input.nowMs);

  if (input.error) {
    return {
      classification: { kind: "failed", error: input.error },
      nextRecords: activeRecords,
    };
  }

  const seenSet = new Set(activeRecords.map((r) => r.itemKey));
  const newKeys: string[] = [];
  let suppressedCount = 0;

  for (const key of input.candidateKeys) {
    if (seenSet.has(key)) {
      suppressedCount++;
    } else {
      newKeys.push(key);
      seenSet.add(key);
    }
  }

  const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  const added: RoutineDeliveryKeyRecord[] = newKeys.map((itemKey) => ({
    itemKey,
    outcome: "reported",
    expiresAtMs: input.nowMs + ttlMs,
  }));

  if (newKeys.length === 0) {
    return {
      classification: { kind: "empty_success", suppressedCount },
      nextRecords: activeRecords,
    };
  }

  return {
    classification: { kind: "new_items", newKeys, suppressedCount },
    nextRecords: [...activeRecords, ...added],
  };
}
