import { ORPCError } from "@orpc/server";
import type { SelectionBlockRange } from "@rakazo/contracts";
import { markdownBlockEndAt, sha256Hex } from "@rakazo/core";

export function mergeAnchor(markdown: string, selection: SelectionBlockRange) {
  const { quoteText, startUtf16, endUtf16, textDigest } = selection;
  if (markdown.slice(startUtf16, endUtf16) === quoteText && textDigest === sha256Hex(markdown)) {
    return startUtf16;
  }

  const start = markdown.indexOf(quoteText);
  if (start < 0 || markdown.indexOf(quoteText, start + 1) >= 0) return null;
  return start;
}

export function placeMergeText(
  before: string,
  incoming: string,
  strategy: "insert" | "append" | "replace",
  selection?: SelectionBlockRange | null,
) {
  if (strategy === "append" || (strategy === "insert" && !selection)) {
    return before ? `${before}\n\n${incoming}` : incoming;
  }

  const start = selection ? mergeAnchor(before, selection) : null;
  if (start === null || !selection) {
    throw new ORPCError("CONFLICT", {
      message:
        "The branch point is missing or ambiguous. Choose Place manually to set the position in the draft.",
    });
  }
  const end = start + selection.quoteText.length;
  if (strategy === "replace") return before.slice(0, start) + incoming + before.slice(end);

  // Keep the containing paragraph, list, quote, or code fence intact.
  const boundary = markdownBlockEndAt(before, end - 1);
  const suffix = before.slice(boundary).replace(/^(?:[ \t]*\r?\n)+/, "");
  return [before.slice(0, boundary), incoming, suffix].filter(Boolean).join("\n\n");
}
