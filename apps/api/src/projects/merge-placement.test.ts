import { sha256Hex } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { placeMergeText } from "./merge-placement.js";

function selection(text: string, quoteText: string, startUtf16 = text.indexOf(quoteText)) {
  return {
    startBlockId: "block",
    endBlockId: "block",
    startUtf16,
    endUtf16: startUtf16 + quoteText.length,
    quoteText,
    textDigest: sha256Hex(text),
  };
}

describe("branch placement", () => {
  it("inserts the ordered selection after the whole Markdown block", () => {
    const main = "Keep **the anchor** here.\n\nKeep this next block.";
    expect(
      placeMergeText(
        main,
        "Third reply block.\n\nFirst reply block.",
        "insert",
        selection(main, "the anchor"),
      ),
    ).toBe(
      "Keep **the anchor** here.\n\nThird reply block.\n\nFirst reply block.\n\nKeep this next block.",
    );
  });

  it("keeps the containing fenced code block intact", () => {
    const main = "```js\nconst anchor = 1;\n\nconsole.log(anchor);\n```\n\nBelow.";
    expect(placeMergeText(main, "Incoming.", "insert", selection(main, "const anchor"))).toBe(
      "```js\nconst anchor = 1;\n\nconsole.log(anchor);\n```\n\nIncoming.\n\nBelow.",
    );
  });

  it("uses verified offsets for repeated text and refuses ambiguous or missing quotes", () => {
    const main = "Same.\n\nMiddle.\n\nSame.\n\nEnd.";
    const anchor = selection(main, "Same.", main.lastIndexOf("Same."));
    expect(placeMergeText(main, "Incoming.", "insert", anchor)).toBe(
      "Same.\n\nMiddle.\n\nSame.\n\nIncoming.\n\nEnd.",
    );
    expect(() => placeMergeText(`Edited.\n\n${main}`, "Incoming.", "insert", anchor)).toThrow(
      "missing or ambiguous",
    );
    expect(() => placeMergeText("Gone.", "Incoming.", "replace", anchor)).toThrow(
      "missing or ambiguous",
    );
    expect(placeMergeText("Gone.", "Incoming.", "append", anchor)).toBe("Gone.\n\nIncoming.");
  });
});
