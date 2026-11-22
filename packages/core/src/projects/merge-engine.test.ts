import { describe, expect, it } from "vitest";
import {
  applyThreeWayMerge,
  computeThreeWayDiff,
  computeUndoMerge,
  flattenJsonFieldEntities,
} from "./merge-engine.js";

describe("merge-engine", () => {
  it("handles ready changes, conflicts, dependency impacts, partial merges, and repeated merges", () => {
    const base = [
      {
        itemId: "opening",
        targetKind: "block" as const,
        label: "Opening beat",
        text: "Original opening.",
      },
      {
        itemId: "ending",
        targetKind: "block" as const,
        label: "Ending narration",
        text: "Original ending.",
      },
      { itemId: "coda", targetKind: "block" as const, label: "Coda", text: "Original coda." },
    ];
    const main = [
      {
        itemId: "opening",
        targetKind: "block" as const,
        label: "Opening beat",
        text: "Original opening.",
      },
      {
        itemId: "ending",
        targetKind: "block" as const,
        label: "Ending narration",
        text: "I watched him feed everybody else.",
      },
      { itemId: "coda", targetKind: "block" as const, label: "Coda", text: "Original coda." },
    ];
    const branch = [
      {
        itemId: "opening",
        targetKind: "block" as const,
        label: "Opening beat",
        text: "Tighter opening.",
      },
      {
        itemId: "ending",
        targetKind: "block" as const,
        label: "Ending narration",
        text: "He always had enough for everyone else.",
      },
      { itemId: "coda", targetKind: "block" as const, label: "Coda", text: "New branch coda." },
    ];

    const diff = computeThreeWayDiff({
      baseEntities: base,
      mainEntities: main,
      branchEntities: branch,
      dependencies: [
        {
          upstreamId: "ending",
          downstreamKind: "audio_take",
          downstreamId: "take_audio_7",
          label: "Tonya VO Take 07",
          reason: "Narration line changed; 1 audio take needs review.",
        },
      ],
    });

    expect(diff.items.find((i) => i.itemId === "opening")?.diffKind).toBe("ready_to_apply");
    expect(diff.items.find((i) => i.itemId === "ending")?.diffKind).toBe("conflict");
    expect(diff.items.find((i) => i.itemId === "coda")?.diffKind).toBe("ready_to_apply");
    expect(diff.dependencyImpacts).toHaveLength(1);
    expect(diff.dependencyImpacts[0]?.downstreamId).toBe("take_audio_7");

    // Partial merge: accept opening + resolve ending via edit_result, defer coda
    const pass1 = applyThreeWayMerge({
      diff,
      resolutions: [
        { itemId: "opening", choice: "use_branch" },
        { itemId: "ending", choice: "edit_result", editedText: "He fed everyone else first." },
        { itemId: "coda", choice: "defer" },
      ],
    });

    expect(pass1.appliedItems).toHaveLength(2);
    expect(pass1.deferredItemIds).toEqual(["coda"]);

    // Repeated merge tomorrow: Main now has pass1's values; opening & ending should NOT reappear,
    // while deferred 'coda' remains ready to apply!
    const mainDay2 = [
      {
        itemId: "opening",
        targetKind: "block" as const,
        label: "Opening beat",
        text: "Tighter opening.",
      },
      {
        itemId: "ending",
        targetKind: "block" as const,
        label: "Ending narration",
        text: "He fed everyone else first.",
      },
      { itemId: "coda", targetKind: "block" as const, label: "Coda", text: "Original coda." },
    ];
    const diffDay2 = computeThreeWayDiff({
      baseEntities: base,
      mainEntities: mainDay2,
      branchEntities: branch,
      priorBaselines: pass1.updatedBaselines,
    });

    expect(diffDay2.items.map((i) => i.itemId)).toEqual(["coda"]);
    expect(diffDay2.items[0]?.diffKind).toBe("ready_to_apply");
  });

  it("supports restoring Undo and flags intervening edits instead of silently overwriting", () => {
    const diff = computeThreeWayDiff({
      baseEntities: [
        { itemId: "a", targetKind: "block", label: "Para A", text: "v0" },
        { itemId: "b", targetKind: "block", label: "Para B", text: "v0" },
      ],
      mainEntities: [
        { itemId: "a", targetKind: "block", label: "Para A", text: "v0" },
        { itemId: "b", targetKind: "block", label: "Para B", text: "v0" },
      ],
      branchEntities: [
        { itemId: "a", targetKind: "block", label: "Para A", text: "v1-branch" },
        { itemId: "b", targetKind: "block", label: "Para B", text: "v1-branch" },
      ],
    });

    const applied = applyThreeWayMerge({
      diff,
      resolutions: [
        { itemId: "a", choice: "use_branch" },
        { itemId: "b", choice: "use_branch" },
      ],
    });

    // Someone later edited Para B in Main, while Para A stayed at v1-branch
    const undoCheck = computeUndoMerge({
      appliedItems: applied.appliedItems,
      currentMainEntities: [
        { itemId: "a", targetKind: "block", label: "Para A", text: "v1-branch" },
        { itemId: "b", targetKind: "block", label: "Para B", text: "v2-later-main-edit" },
      ],
    });

    expect(undoCheck.autoRestorable).toEqual([
      { itemId: "a", restoreText: "v0", restoreArtifactId: null },
    ]);
    expect(undoCheck.interveningConflicts).toHaveLength(1);
    expect(undoCheck.interveningConflicts[0]?.itemId).toBe("b");
  });

  it("diffs A2UI dataModel JSON field paths independently", () => {
    const base = flattenJsonFieldEntities("surf_1", "Plan", { title: "v1", approved: false });
    const main = flattenJsonFieldEntities("surf_1", "Plan", { title: "v1-main", approved: false });
    const branch = flattenJsonFieldEntities("surf_1", "Plan", { title: "v1", approved: true });

    const diff = computeThreeWayDiff({
      baseEntities: base,
      mainEntities: main,
      branchEntities: branch,
    });

    expect(diff.items).toHaveLength(1);
    expect(diff.items[0]?.itemId).toBe("surf_1.approved");
    expect(diff.items[0]?.diffKind).toBe("ready_to_apply");
  });
});
