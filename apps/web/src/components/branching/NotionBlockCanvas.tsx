import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { Button } from "@rakazo/ui-web";
import { Scissors, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * True Notion-style BlockNote (ProseMirror + Tiptap) Canvas:
 * - Native left-gutter drag handles (⋮⋮) on every Heading, Paragraph, Bullet, Quote & Code block
 * - Full rich formatting + Slash menu (`/`) + atomic Undo/Redo
 * - 1-click "Split into Sentences" tool to break dense paragraphs into movable sentence blocks
 */
export function NotionBlockCanvas({
  initialMarkdown,
  onChangeMarkdown,
  scrollRef,
  onScroll,
}: {
  initialMarkdown: string;
  onChangeMarkdown: (markdown: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  const editor = useCreateBlockNote();
  const initializedFor = useRef<string | null>(null);
  const [sentenceSplitCount, setSentenceSplitCount] = useState(0);

  // Load initial Markdown into native Notion blocks whenever initialMarkdown changes.
  useEffect(() => {
    if (initializedFor.current === initialMarkdown) return;
    initializedFor.current = initialMarkdown;
    let cancelled = false;
    void (async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialMarkdown || "");
        if (!cancelled && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch {
        // Fallback: keep current document if markdown parsing throws
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, initialMarkdown]);

  async function emitMarkdown() {
    try {
      const md = await editor.blocksToMarkdownLossy(editor.document);
      onChangeMarkdown(md.trim());
    } catch {
      // ignore transient export error
    }
  }

  /**
   * Splits multi-sentence paragraph blocks into independent movable sentence blocks
   * so the user can surgically drag any individual sentence anywhere in the canvas.
   */
  async function handleSplitIntoSentences() {
    let splits = 0;
    const nextBlocks: Array<{ type: "paragraph"; content: string }> = [];
    const current = editor.document;
    const replacements: Array<{ targetId: string; sentences: string[] }> = [];

    for (const block of current) {
      if (block.type !== "paragraph" || !Array.isArray(block.content)) continue;
      const plain = block.content
        .map((c) => (typeof c === "object" && c && "text" in c ? String(c.text) : ""))
        .join("")
        .trim();
      if (!plain) continue;
      // Split on sentence boundaries (. ! ?) followed by whitespace + capital/quote/number
      const parts = plain
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        replacements.push({ targetId: block.id, sentences: parts });
        splits += parts.length - 1;
      }
    }

    if (replacements.length === 0) return;

    for (const rep of replacements) {
      nextBlocks.length = 0;
      for (const s of rep.sentences) {
        nextBlocks.push({ type: "paragraph", content: s });
      }
      editor.replaceBlocks([rep.targetId], nextBlocks);
    }
    setSentenceSplitCount((c) => c + splits);
    await emitMarkdown();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Compact Notion Canvas Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          Hover left edge for <strong className="text-foreground">⋮⋮ drag handle</strong> · Type{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">/</code> for headings, bullets &
          blocks
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSplitIntoSentences()}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <Scissors className="size-3 text-success" />
            <span>
              Split into Sentences{sentenceSplitCount > 0 ? ` (+${sentenceSplitCount})` : ""}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              editor.undo();
              void emitMarkdown();
            }}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <Undo2 className="size-3" />
            <span>Undo</span>
          </Button>
        </div>
      </div>

      {/* Scrollable Notion BlockNote Surface */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="rk-scroll min-h-0 flex-1 overflow-y-auto bg-background/60 px-2 py-3 [&_.bn-editor]:bg-transparent [&_.bn-editor]:px-8 [&_.bn-editor]:text-sm"
      >
        <BlockNoteView
          editor={editor}
          theme="dark"
          onChange={() => {
            void emitMarkdown();
          }}
        />
      </div>
    </div>
  );
}
