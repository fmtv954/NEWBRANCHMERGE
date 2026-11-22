import { describe, expect, it } from "vitest";
import { parseMarkdownToCanonicalBlocks } from "../blocks/canonical-blocks.js";
import {
  applySurgicalSelectionPatch,
  buildSmartSegments,
  computeWordDiff,
  reorderMarkdownBlocks,
} from "./word-diff.js";

describe("word-diff & surgical block/selection merge", () => {
  it("preserves Markdown source when extracting selectable reply blocks", () => {
    const source =
      "# Heading\n\nA **formatted** [link](https://example.test).\n\n1. First\n2. Second";
    expect(buildSmartSegments(source).map((block) => block.markdown)).toEqual([
      "# Heading",
      "A **formatted** [link](https://example.test).",
      "1. First",
      "2. Second",
    ]);
  });

  it("computes word-level added, removed, and equal tokens", () => {
    const tokens = computeWordDiff("The hero walks slowly home.", "The hero sprints quickly home.");
    expect(tokens.some((t) => t.kind === "removed" && t.text.includes("walks"))).toBe(true);
    expect(tokens.some((t) => t.kind === "added" && t.text.includes("sprints"))).toBe(true);
    expect(tokens.some((t) => t.kind === "equal" && t.text.includes("The hero"))).toBe(true);
  });

  it("surgically patches only the highlighted sentence without touching surrounding text", () => {
    const original = "Scene 1 opens in rain. The detective hesitates at the door. Thunder rolls.";
    const start = original.indexOf("The detective");
    const end = start + "The detective hesitates at the door.".length;

    const patched = applySurgicalSelectionPatch({
      originalText: original,
      utf16Start: start,
      utf16End: end,
      replacementText: "The detective kicks the door open.",
      mode: "use_branch",
    });

    expect(patched).toBe(
      "Scene 1 opens in rain. The detective kicks the door open. Thunder rolls.",
    );
  });

  it("reorders canonical Markdown blocks cleanly", () => {
    const md = "## Title\n\nFirst paragraph.\n\nSecond paragraph.";
    const blocks = parseMarkdownToCanonicalBlocks(md);
    expect(blocks.length).toBe(3);

    const reordered = reorderMarkdownBlocks(md, [
      blocks[0]!.stableBlockId,
      blocks[2]!.stableBlockId,
      blocks[1]!.stableBlockId,
    ]);
    expect(reordered).toBe("## Title\n\nSecond paragraph.\n\nFirst paragraph.");
  });
});
