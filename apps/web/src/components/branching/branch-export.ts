import type { MergeSourceBlock } from "@rakazo/contracts";
import { downloadArtifactBytes } from "../../lib/pages/artifact-open";

export type BranchExportFormat = "pdf" | "docx" | "md" | "json";

function printDocument(html: string, title: string) {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>
    body{font:11pt/1.55 system-ui,sans-serif;color:#111;margin:0}
    @page{margin:18mm} h1,h2,h3{break-after:avoid} img{max-width:100%}
    pre{white-space:pre-wrap;background:#f3f3f3;padding:.6em}
    blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:1em}
    table{border-collapse:collapse;width:100%} th,td{border:1px solid #aaa;padding:.35em;vertical-align:top}
  </style>${html}`;
  frame.addEventListener(
    "load",
    () => {
      const target = frame.contentWindow;
      if (!target) {
        frame.remove();
        return;
      }
      target.document.title = title;
      target.addEventListener("afterprint", () => frame.remove(), { once: true });
      target.print();
    },
    { once: true },
  );
  document.body.append(frame);
}

export async function exportBranchBlocks(
  title: string,
  blocks: readonly MergeSourceBlock[],
  format: BranchExportFormat,
) {
  const filename = title.replace(/[<>:"/\\|?*\p{Cc}]/gu, "-").trim() || "Side Chat";
  const markdown = blocks.map((block) => block.markdown).join("\n\n");
  const utf8 = new TextEncoder();
  if (format === "md") {
    downloadArtifactBytes(`${filename}.md`, "text/markdown", utf8.encode(markdown));
    return;
  }
  if (format === "json") {
    const payload = {
      version: 1,
      title,
      blocks: blocks.map((block, index) => ({ ...block, order: index + 1 })),
    };
    downloadArtifactBytes(
      `${filename}.json`,
      "application/json",
      utf8.encode(JSON.stringify(payload, null, 2)),
    );
    return;
  }

  const { BlockNoteEditor } = await import("@blocknote/core");
  const editor = BlockNoteEditor.create();
  let html: string;
  try {
    html = editor.blocksToHTMLLossy(editor.tryParseMarkdownToBlocks(markdown));
  } finally {
    editor._tiptapEditor.destroy();
  }
  if (format === "pdf") {
    printDocument(html, title);
  } else {
    const { wordDocumentBytes } = await import("./branch-word-export");
    downloadArtifactBytes(
      `${filename}.docx`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      await wordDocumentBytes(html, title),
    );
  }
}
