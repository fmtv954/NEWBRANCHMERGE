import { describe, expect, it } from "vitest";
import {
  clampToGraphemeBoundary,
  extractSelectionRange,
  parseMarkdownToCanonicalBlocks,
  sha256Hex,
  verifySelectionRange,
} from "./canonical-blocks.js";

describe("canonical-blocks", () => {
  it("computes standard SHA-256 digests", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("parses paragraphs, headings, lists, code, blockquotes, and tables into deterministic blocks", () => {
    const md = [
      "# Episode 01",
      "",
      "Give the camera time to sit with **Tonya**.",
      "",
      "- Keep Tonya's confession understated.",
      "- Hold the shot after she speaks.",
      "",
      "```ts",
      "const shot = 'Kitchen reveal';",
      "  console.log(shot);",
      "```",
      "",
      "> Whispered cue",
    ].join("\n");

    const blocks = parseMarkdownToCanonicalBlocks(md, { seedPrefix: "msg1" });
    expect(blocks.map((b) => b.blockType)).toEqual([
      "heading",
      "paragraph",
      "list_item",
      "list_item",
      "code",
      "blockquote",
    ]);
    expect(blocks[1]?.canonicalText).toBe("Give the camera time to sit with Tonya.");
    expect(blocks[4]?.language).toBe("ts");
    expect(blocks[4]?.canonicalText).toBe("const shot = 'Kitchen reveal';\n  console.log(shot);");

    const secondPass = parseMarkdownToCanonicalBlocks(md, { seedPrefix: "msg1" });
    expect(secondPass.map((b) => b.stableBlockId)).toEqual(blocks.map((b) => b.stableBlockId));
  });

  it("handles emoji, ZWJ grapheme clusters, and non-Latin text without splitting code units", () => {
    const text = "Scene 🎬👨🏽‍💻 café 日本語";
    const blocks = parseMarkdownToCanonicalBlocks(text, { seedPrefix: "m2" });
    expect(blocks).toHaveLength(1);
    const blk = blocks[0]!;

    const emojiStart = blk.canonicalText.indexOf("👨🏽‍💻");
    expect(clampToGraphemeBoundary(blk.canonicalText, emojiStart + 2, "start")).toBe(emojiStart);
    const emojiEnd = emojiStart + "👨🏽‍💻".length;
    expect(clampToGraphemeBoundary(blk.canonicalText, emojiStart + 2, "end")).toBe(emojiEnd);

    const range = extractSelectionRange(
      blocks,
      blk.stableBlockId,
      emojiStart,
      blk.stableBlockId,
      blk.utf16Length,
    );
    expect(range?.quoteText).toBe("👨🏽‍💻 café 日本語");
    expect(range ? verifySelectionRange(blocks, range) : false).toBe(true);
  });

  it("extracts and verifies selections spanning adjacent paragraphs", () => {
    const md = "First paragraph line.\n\nSecond paragraph ending.";
    const blocks = parseMarkdownToCanonicalBlocks(md, { seedPrefix: "m3" });
    expect(blocks).toHaveLength(2);

    const [b0, b1] = blocks;
    const range = extractSelectionRange(blocks, b0!.stableBlockId, 6, b1!.stableBlockId, 16);
    expect(range?.quoteText).toBe("paragraph line.\n\nSecond paragraph");
    expect(range ? verifySelectionRange(blocks, range) : false).toBe(true);

    // Tampered text fails server verification
    expect(
      verifySelectionRange(blocks, {
        ...range!,
        quoteText: "tampered text",
      }),
    ).toBe(false);
  });
});
