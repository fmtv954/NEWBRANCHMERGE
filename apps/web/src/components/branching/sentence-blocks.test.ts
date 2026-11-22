// @vitest-environment jsdom
import { expect, it } from "vitest";
import { splitMarkdownParagraph } from "./sentence-blocks";

it("splits a paragraph into movable blocks without losing inline formatting", () => {
  expect(
    splitMarkdownParagraph("**First** sentence. [Second](https://example.test) sentence."),
  ).toEqual(["**First** sentence.", "[Second](https://example.test) sentence."]);
});
