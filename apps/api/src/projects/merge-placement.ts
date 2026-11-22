import type { SelectionBlockRange } from "@rakazo/contracts";
import { markdownBlockEndAt, sha256Hex } from "@rakazo/core";

export type PlacementStrategy =
  | "insert"
  | "insert_before"
  | "insert_after"
  | "append"
  | "manual"
  | "replace";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the start & end UTF-16 range of `selection.quoteText` inside `markdown`,
 * tolerating inline Markdown emphasis (`**`, `*`, `_`, `` ` ``) and repeated occurrences
 * (picking the match closest to `startUtf16` instead of failing).
 */
export function mergeAnchorRange(
  markdown: string,
  selection: SelectionBlockRange,
): { start: number; end: number } | null {
  const { quoteText, startUtf16, endUtf16, textDigest } = selection;
  const trimmedQuote = quoteText.trim();
  if (!trimmedQuote) return null;

  if (
    markdown.slice(startUtf16, endUtf16) === quoteText &&
    (!textDigest || textDigest === sha256Hex(markdown))
  ) {
    return { start: startUtf16, end: endUtf16 };
  }

  // 1. Exact substring matches (if repeated, pick closest to startUtf16)
  const exactMatches: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor <= markdown.length) {
    const idx = markdown.indexOf(trimmedQuote, cursor);
    if (idx < 0) break;
    exactMatches.push({ start: idx, end: idx + trimmedQuote.length });
    cursor = idx + 1;
  }
  if (exactMatches.length > 0) {
    exactMatches.sort(
      (a, b) => Math.abs(a.start - startUtf16) - Math.abs(b.start - startUtf16),
    );
    return exactMatches[0]!;
  }

  // 2. Markdown-tolerant / case-insensitive match (e.g. "burnt toast theory" matching "**burnt toast theory**")
  const tokens = trimmedQuote.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const pattern = tokens.map(escapeRegExp).join("(?:\\s|[*_`~])+");
    const regex = new RegExp(`(?:[*_\`~]*)${pattern}(?:[*_\`~]*)`, "gi");
    const fuzzyMatches: Array<{ start: number; end: number }> = [];
    for (const m of markdown.matchAll(regex)) {
      if (typeof m.index === "number") {
        fuzzyMatches.push({ start: m.index, end: m.index + m[0].length });
      }
    }
    if (fuzzyMatches.length > 0) {
      fuzzyMatches.sort(
        (a, b) => Math.abs(a.start - startUtf16) - Math.abs(b.start - startUtf16),
      );
      return fuzzyMatches[0]!;
    }
  }

  return null;
}

export function mergeAnchor(markdown: string, selection: SelectionBlockRange): number | null {
  return mergeAnchorRange(markdown, selection)?.start ?? null;
}

function markdownBlockStartAt(markdown: string, index: number): number {
  const before = markdown.slice(0, Math.max(0, index));
  const sep = before.lastIndexOf("\n\n");
  return sep < 0 ? 0 : sep + 2;
}

export function placeMergeText(
  before: string,
  incoming: string,
  strategy: PlacementStrategy,
  selection?: SelectionBlockRange | null,
): string {
  if (strategy === "append" || strategy === "manual") {
    return before ? `${before}\n\n${incoming}` : incoming;
  }

  const range = selection ? mergeAnchorRange(before, selection) : null;
  if (!range) {
    // Graceful fallback: never crash with a blocking conflict — append cleanly as a separate block
    return before ? `${before}\n\n${incoming}` : incoming;
  }

  if (strategy === "replace") {
    return before.slice(0, range.start) + incoming + before.slice(range.end);
  }

  if (strategy === "insert_before") {
    const blockStart = markdownBlockStartAt(before, range.start);
    const prefix = before.slice(0, blockStart).replace(/(?:[ \t]*\r?\n)+$/, "");
    const rest = before.slice(blockStart).replace(/^(?:[ \t]*\r?\n)+/, "");
    return [prefix, incoming, rest].filter(Boolean).join("\n\n");
  }

  // `insert` / `insert_after`: keep the containing paragraph/list/quote/code fence intact and place below
  const boundary = markdownBlockEndAt(before, Math.max(range.start, range.end - 1));
  const prefix = before.slice(0, boundary).replace(/(?:[ \t]*\r?\n)+$/, "");
  const suffix = before.slice(boundary).replace(/^(?:[ \t]*\r?\n)+/, "");
  return [prefix, incoming, suffix].filter(Boolean).join("\n\n");
}
