import type { CanonicalBlock } from "@rakazo/contracts";
import { diffWordsWithSpace } from "diff";
import {
  clampToGraphemeBoundary,
  parseMarkdownToCanonicalBlocks,
} from "../blocks/canonical-blocks.js";

export interface WordDiffToken {
  kind: "equal" | "added" | "removed";
  text: string;
}

/**
 * Computes a Git-style inline word-level diff between base/main text and branch text.
 */
export function computeWordDiff(baseText: string, branchText: string): WordDiffToken[] {
  return diffWordsWithSpace(baseText, branchText).map((part) => ({
    kind: part.added ? "added" : part.removed ? "removed" : "equal",
    text: part.value,
  }));
}

/**
 * Surgically patches just the highlighted sentence/words inside an existing message,
 * clamping UTF-16 offsets to grapheme boundaries so emojis/accents never split.
 */
export function applySurgicalSelectionPatch(input: {
  originalText: string;
  utf16Start: number;
  utf16End: number;
  replacementText: string;
  mode: "use_branch" | "keep_main" | "keep_both" | "edit_result";
  editedText?: string;
}): string {
  if (input.mode === "keep_main") return input.originalText;
  const start = clampToGraphemeBoundary(input.originalText, input.utf16Start, "start");
  const end = clampToGraphemeBoundary(input.originalText, input.utf16End, "end");
  const safeEnd = Math.max(start, end);
  const before = input.originalText.slice(0, start);
  const selected = input.originalText.slice(start, safeEnd);
  const after = input.originalText.slice(safeEnd);

  if (input.mode === "edit_result") {
    return `${before}${input.editedText ?? input.replacementText}${after}`;
  }
  if (input.mode === "keep_both") {
    return `${before}${selected}\n\n${input.replacementText}${after}`;
  }
  return `${before}${input.replacementText}${after}`;
}

export function formatBlockAsMarkdown(block: CanonicalBlock): string {
  if (block.blockType === "heading") return `## ${block.canonicalText}`;
  if (block.blockType === "blockquote") return `> ${block.canonicalText}`;
  if (block.blockType === "list_item") return `- ${block.canonicalText}`;
  if (block.blockType === "code") {
    return `\`\`\`${block.language ?? ""}\n${block.canonicalText}\n\`\`\``;
  }
  return block.canonicalText;
}

export interface SmartSegment {
  id: string;
  blockType: CanonicalBlock["blockType"];
  markdown: string;
  plainText: string;
}

/**
 * Smart Segmentation: breaks any Markdown response into independently editable,
 * draggable segments (headings, paragraphs, individual list items, code blocks, quotes)
 * while preserving original Markdown formatting for uniform rendering.
 */
export function buildSmartSegments(markdown: string): SmartSegment[] {
  const blocks = parseMarkdownToCanonicalBlocks(markdown);
  if (blocks.length === 0) {
    const trimmed = markdown.trim();
    if (!trimmed) return [];
    return [
      {
        id: "seg_0",
        blockType: "paragraph",
        markdown: trimmed,
        plainText: trimmed,
      },
    ];
  }
  return blocks.map((block, idx) => ({
    id: block.stableBlockId || `seg_${idx}`,
    blockType: block.blockType,
    markdown: formatBlockAsMarkdown(block),
    plainText: block.canonicalText,
  }));
}

export function joinSmartSegments(segments: ReadonlyArray<{ markdown: string }>): string {
  return segments
    .map((s) => s.markdown.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Reorders canonical Markdown blocks inside a message according to `orderedBlockIds`
 * (like `git rebase -i` chunk reordering) and reconstructs clean Markdown.
 */
export function reorderMarkdownBlocks(markdown: string, orderedBlockIds: readonly string[]): string {
  const blocks = parseMarkdownToCanonicalBlocks(markdown);
  if (blocks.length === 0) return markdown;

  const byId = new Map(blocks.map((b) => [b.stableBlockId, b]));
  const result: string[] = [];
  const used = new Set<string>();

  for (const id of orderedBlockIds) {
    const block = byId.get(id);
    if (block && !used.has(id)) {
      used.add(id);
      result.push(formatBlockAsMarkdown(block));
    }
  }
  for (const block of blocks) {
    if (!used.has(block.stableBlockId)) {
      result.push(formatBlockAsMarkdown(block));
    }
  }
  return result.join("\n\n");
}
