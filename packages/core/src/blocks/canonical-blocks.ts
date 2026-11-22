import type { CanonicalBlock, CanonicalBlockType, SelectionBlockRange } from "@rakazo/contracts";
import { droppedTableHtmlText } from "@rakazo/contracts";
import { toText } from "hast-util-to-text";
import { toHast } from "mdast-util-to-hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const markdownParser = unified().use(remarkParse).use(remarkGfm);

type MdastNode = {
  type?: string;
  value?: string;
  lang?: string | null;
  children?: MdastNode[];
};

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Pure-JS SHA-256 over UTF-8 bytes so `@rakazo/core` remains Vite/browser-safe without `node:crypto`. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15]! >>> 7) | (w[i - 15]! << 25)) ^
        ((w[i - 15]! >>> 18) | (w[i - 15]! << 14)) ^
        (w[i - 15]! >>> 3);
      const s1 =
        ((w[i - 2]! >>> 17) | (w[i - 2]! << 15)) ^
        ((w[i - 2]! >>> 19) | (w[i - 2]! << 13)) ^
        (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => n.toString(16).padStart(8, "0")).join("");
}

function salvageSkippedTableHtml(node: MdastNode, insideCell = false): void {
  const inCell = insideCell || node.type === "tableCell";
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (inCell && child.type === "html") {
      const value = droppedTableHtmlText(child.value ?? "");
      return value === null ? child : { type: "text", value };
    }
    salvageSkippedTableHtml(child, inCell);
    return child;
  });
}

function renderMdastNodeText(node: MdastNode): string {
  const clone: MdastNode = structuredClone(node);
  salvageSkippedTableHtml(clone);
  const hast = toHast({ type: "root", children: [clone] } as never);
  return toText(hast as never)
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");
}

function mapBlockType(nodeType: string | undefined): CanonicalBlockType {
  switch (nodeType) {
    case "heading":
      return "heading";
    case "listItem":
      return "list_item";
    case "code":
      return "code";
    case "blockquote":
      return "blockquote";
    case "table":
      return "table";
    default:
      return "paragraph";
  }
}

/**
 * Parses settled Markdown into deterministic semantic blocks with stable identities,
 * canonical UTF-16 text projections, and SHA-256 digests.
 */
export function parseMarkdownToCanonicalBlocks(
  markdown: string,
  options?: { seedPrefix?: string },
): CanonicalBlock[] {
  const normalized = markdown.replace(/\r\n?/g, "\n").normalize("NFC");
  if (!normalized.trim()) return [];

  const mdast = markdownParser.parse(normalized) as MdastNode;
  const rawNodes: MdastNode[] = [];
  for (const child of mdast.children ?? []) {
    if (child.type === "list" && child.children?.length) {
      for (const item of child.children) {
        rawNodes.push(item);
      }
    } else {
      rawNodes.push(child);
    }
  }

  const prefix = options?.seedPrefix ?? "blk";
  const blocks: CanonicalBlock[] = [];
  for (const node of rawNodes) {
    const blockType = mapBlockType(node.type);
    const canonicalText =
      blockType === "code"
        ? (node.value ?? "").replace(/\r\n?/g, "\n").normalize("NFC")
        : renderMdastNodeText(node).trim();

    if (!canonicalText) continue;

    const orderIndex = blocks.length;
    const textDigest = sha256Hex(canonicalText);
    const language = blockType === "code" ? (node.lang ?? null) : null;
    blocks.push({
      stableBlockId: `${prefix}_${orderIndex}_${blockType}_${textDigest.slice(0, 10)}`,
      blockType,
      orderIndex,
      canonicalText,
      ...(language !== null ? { language } : {}),
      textDigest,
      utf16Length: canonicalText.length,
    });
  }

  return blocks;
}

/** Ensures a UTF-16 offset lands cleanly on grapheme & surrogate-pair boundaries. */
export function clampToGraphemeBoundary(
  text: string,
  utf16Offset: number,
  edge: "start" | "end",
): number {
  const clamped = Math.max(0, Math.min(utf16Offset, text.length));
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const seg of segmenter.segment(text)) {
      const segStart = seg.index;
      const segEnd = seg.index + seg.segment.length;
      if (clamped > segStart && clamped < segEnd) {
        return edge === "start" ? segStart : segEnd;
      }
    }
    return clamped;
  }

  const code = text.charCodeAt(clamped);
  if (code >= 0xdc00 && code <= 0xdfff && clamped > 0) {
    return edge === "start" ? clamped - 1 : Math.min(text.length, clamped + 1);
  }
  return clamped;
}

/**
 * Extracts a verified canonical selection range within one block or spanning adjacent blocks.
 */
export function extractSelectionRange(
  blocks: readonly CanonicalBlock[],
  startBlockId: string,
  startUtf16: number,
  endBlockId: string,
  endUtf16: number,
): SelectionBlockRange | null {
  const startIndex = blocks.findIndex((b) => b.stableBlockId === startBlockId);
  const endIndex = blocks.findIndex((b) => b.stableBlockId === endBlockId);
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return null;

  const startBlock = blocks[startIndex]!;
  const endBlock = blocks[endIndex]!;
  const safeStart = clampToGraphemeBoundary(startBlock.canonicalText, startUtf16, "start");
  const safeEnd = clampToGraphemeBoundary(endBlock.canonicalText, endUtf16, "end");

  if (startIndex === endIndex) {
    if (safeEnd <= safeStart) return null;
    const quoteText = startBlock.canonicalText.slice(safeStart, safeEnd);
    return {
      startBlockId,
      endBlockId,
      startUtf16: safeStart,
      endUtf16: safeEnd,
      quoteText,
      textDigest: sha256Hex(quoteText),
    };
  }

  const parts: string[] = [startBlock.canonicalText.slice(safeStart)];
  for (let i = startIndex + 1; i < endIndex; i++) {
    parts.push(blocks[i]!.canonicalText);
  }
  parts.push(endBlock.canonicalText.slice(0, safeEnd));
  const quoteText = parts.join("\n\n");
  if (!quoteText.trim()) return null;

  return {
    startBlockId,
    endBlockId,
    startUtf16: safeStart,
    endUtf16: safeEnd,
    quoteText,
    textDigest: sha256Hex(quoteText),
  };
}

/** Verifies an untrusted client selection range against persisted canonical blocks. */
export function verifySelectionRange(
  blocks: readonly CanonicalBlock[],
  range: SelectionBlockRange,
): boolean {
  const extracted = extractSelectionRange(
    blocks,
    range.startBlockId,
    range.startUtf16,
    range.endBlockId,
    range.endUtf16,
  );
  if (!extracted) return false;
  return extracted.quoteText === range.quoteText && extracted.textDigest === range.textDigest;
}
