import type { Block } from "@blocknote/core";
import { BlockNoteEditor } from "@blocknote/core";

type ParagraphContent = Extract<Block, { type: "paragraph" }>["content"];
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

function sliceInlineContent(
  content: ParagraphContent,
  start: number,
  end: number,
): ParagraphContent {
  let offset = 0;
  function sliceText(part: Extract<ParagraphContent[number], { type: "text" }>) {
    const text = part.text.slice(Math.max(0, start - offset), Math.max(0, end - offset));
    offset += part.text.length;
    return { ...part, text };
  }

  return content.flatMap<ParagraphContent[number]>((part) => {
    if (part.type === "text") {
      const sliced = sliceText(part);
      return sliced.text ? [sliced] : [];
    }
    const sliced = part.content.map(sliceText).filter(({ text }) => text);
    return sliced.length ? [{ ...part, content: sliced }] : [];
  });
}

export function splitParagraph(content: ParagraphContent): ParagraphContent[] {
  const text = content
    .map((part) =>
      part.type === "text" ? part.text : part.content.map((item) => item.text).join(""),
    )
    .join("");

  return Array.from(sentenceSegmenter.segment(text), ({ index, segment }) => {
    const start = index + segment.length - segment.trimStart().length;
    const end = index + segment.trimEnd().length;
    return sliceInlineContent(content, start, end);
  }).filter((part) => part.length > 0);
}

export function hasMultipleSentences(text: string) {
  const segments = sentenceSegmenter.segment(text)[Symbol.iterator]();
  segments.next();
  return !segments.next().done;
}

export function splitMarkdownParagraph(markdown: string): string[] {
  const editor = BlockNoteEditor.create();
  try {
    const [block, ...rest] = editor.tryParseMarkdownToBlocks(markdown);
    if (block?.type !== "paragraph" || rest.length) return [];
    const parts = splitParagraph(block.content);
    if (parts.length < 2) return [];
    return parts.map((content) =>
      editor.blocksToMarkdownLossy([{ type: "paragraph", content }]).trim(),
    );
  } finally {
    editor._tiptapEditor.destroy();
  }
}
