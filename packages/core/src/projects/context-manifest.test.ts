import { findCatalogModel } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { buildContextManifestPreview } from "./context-manifest.js";

describe("context-manifest", () => {
  it("isolates inherited history at fork boundary and flags unsupported video/image inputs", () => {
    const veniceTextOnly = findCatalogModel("venice", "deepseek-v4.1-flash-1017-e2ee")!;
    const preview = buildContextManifestPreview({
      branchId: "br_2",
      model: veniceTextOnly,
      billingRoute: "byok",
      contextMode: "through_message",
      inheritedUpToSeq: 6,
      selectedExcerptText: "Keep Tonya's confession understated.",
      turns: [
        { id: "m1", seq: 1, role: "user", text: "Turn 1", estimatedTokens: 20 },
        { id: "m6", seq: 6, role: "bot", text: "Turn 6", estimatedTokens: 30 },
        { id: "m7", seq: 7, role: "user", text: "Later Main turn 7", estimatedTokens: 40 },
      ],
      attachments: [
        {
          id: "att_clip",
          label: "Kitchen reveal.mp4",
          kind: "video",
          estimatedTokens: 500,
          sourceKind: "placement",
        },
        {
          id: "att_script",
          label: "Episode 01 Script.md",
          kind: "text",
          estimatedTokens: 200,
          sourceKind: "pinned_ref",
        },
      ],
    });

    expect(preview.includedMessageIds).toEqual(["m1", "m6"]);
    expect(preview.includedArtifactIds).toEqual(["att_script"]);
    expect(preview.includedPlacementIds).toEqual([]);
    expect(preview.omittedItems).toEqual([
      {
        kind: "attachment",
        id: "att_clip",
        label: "Kitchen reveal.mp4",
        reason: "unsupported_modality",
      },
    ]);
    expect(preview.warnings).toHaveLength(1);
  });

  it("supports only_selection mode excluding prior turns while keeping pinned refs", () => {
    const grok = findCatalogModel("xai", "grok-4.7")!;
    const preview = buildContextManifestPreview({
      branchId: "br_3",
      model: grok,
      billingRoute: "subscription",
      contextMode: "only_selection",
      inheritedUpToSeq: 6,
      selectedExcerptText: "Keep Tonya's confession understated.",
      turns: [{ id: "m1", seq: 1, role: "user", text: "Turn 1", estimatedTokens: 20 }],
      attachments: [
        {
          id: "ref_1",
          label: "Character Sheet",
          kind: "image",
          estimatedTokens: 300,
          sourceKind: "pinned_ref",
        },
      ],
    });

    expect(preview.includedMessageIds).toEqual([]);
    expect(preview.includedArtifactIds).toEqual(["ref_1"]);
    expect(preview.estimatedCostMicros).toBe("0");
  });
});
