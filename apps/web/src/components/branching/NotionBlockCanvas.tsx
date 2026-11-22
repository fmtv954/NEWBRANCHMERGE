import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { Button } from "@rakazo/ui-web";
import { ArrowDown, ArrowUp, GitBranch, LocateFixed, Scissors, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useAppTheme } from "../../lib/pages/pages";
import { splitParagraph } from "./sentence-blocks";

export function NotionBlockCanvas({
  initialMarkdown,
  originalMarkdown,
  onChangeMarkdown,
  onReadyChange,
  onBranch,
  disabled,
}: {
  initialMarkdown: string;
  originalMarkdown?: string;
  onChangeMarkdown: (markdown: string) => void;
  onReadyChange?: (ready: boolean) => void;
  onBranch?: (quote: string) => void;
  disabled?: boolean;
}) {
  const editor = useCreateBlockNote();
  const theme = useAppTheme();
  const canvasId = useId();
  const initializedFor = useRef<string | null>(null);
  const loading = useRef(false);
  const [ready, setReady] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<string>();
  const [incomingIds, setIncomingIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (initializedFor.current === initialMarkdown) return;
    loading.current = true;
    try {
      const blocks = editor.tryParseMarkdownToBlocks(initialMarkdown);
      const original =
        originalMarkdown === undefined ? [] : editor.tryParseMarkdownToBlocks(originalMarkdown);
      const before = original.map((block) => editor.blocksToMarkdownLossy([block]));
      const after = blocks.map((block) => editor.blocksToMarkdownLossy([block]));
      let start = 0;
      let end = after.length;
      let beforeEnd = before.length;
      while (start < end && start < beforeEnd && before[start] === after[start]) start++;
      while (end > start && beforeEnd > start && before[beforeEnd - 1] === after[end - 1]) {
        end--;
        beforeEnd--;
      }
      editor.transact((transaction) => {
        transaction.setMeta("addToHistory", false);
        editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: "paragraph" }]);
      });
      setIncomingIds(
        originalMarkdown === undefined ? [] : blocks.slice(start, end).map(({ id }) => id),
      );
      setFocusedBlockId(editor.document[0]?.id);
      setReady(true);
      onReadyChange?.(true);
      setError(undefined);
      initializedFor.current = initialMarkdown;
    } catch {
      setReady(false);
      onReadyChange?.(false);
      setError("This draft could not be loaded into the editor.");
    } finally {
      loading.current = false;
    }
  }, [editor, initialMarkdown, originalMarkdown, onReadyChange]);

  function emitMarkdown() {
    if (!loading.current && initializedFor.current === initialMarkdown) {
      onChangeMarkdown(editor.blocksToMarkdownLossy(editor.document).trim());
    }
  }

  const activeBlock = focusedBlockId ? editor.getBlock(focusedBlockId) : undefined;
  const sentences = activeBlock?.type === "paragraph" ? splitParagraph(activeBlock.content) : [];
  const canEdit = ready && !disabled;

  function splitActiveParagraph() {
    if (!activeBlock || sentences.length < 2) return;
    const [first, ...rest] = sentences;
    editor.transact(() => {
      editor.updateBlock(activeBlock, { content: first });
      editor.insertBlocks(
        rest.map((content) => ({ type: "paragraph", content })),
        activeBlock,
        "after",
      );
    });
  }

  function branchFromBlock() {
    if (!activeBlock || !onBranch) return;
    const quote =
      editor.getSelectedText().trim() || editor.blocksToMarkdownLossy([activeBlock]).trim();
    if (quote) onBranch(quote);
  }

  // BlockNote keeps block IDs stable during moves, so highlights follow the changed blocks.
  const highlights = incomingIds
    .map(
      (id) =>
        `[data-merge-canvas="${CSS.escape(canvasId)}"] .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block > .bn-block-content`,
    )
    .join(",");
  return (
    <div className="flex min-h-0 flex-col" data-merge-canvas={canvasId}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={!canEdit || sentences.length < 2}
          onClick={splitActiveParagraph}
        >
          <Scissors className="size-3.5" />
          Split into sentences
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Move block up"
          title="Move block up"
          disabled={!canEdit || !activeBlock}
          onClick={() => editor.moveBlocksUp(activeBlock)}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Move block down"
          title="Move block down"
          disabled={!canEdit || !activeBlock}
          onClick={() => editor.moveBlocksDown(activeBlock)}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Undo edit"
          title="Undo edit"
          disabled={!canEdit}
          onClick={() => editor.undo()}
        >
          <Undo2 className="size-3.5" />
        </Button>
        {onBranch ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={!canEdit || !activeBlock}
            onClick={branchFromBlock}
          >
            <GitBranch className="size-3.5" />
            Branch from block
          </Button>
        ) : null}
        {incomingIds.length ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              const change = incomingIds
                .map((id) =>
                  editor.domElement?.querySelector(`.bn-block-outer[data-id="${CSS.escape(id)}"]`),
                )
                .find(Boolean);
              change?.scrollIntoView({ block: "nearest" });
            }}
          >
            <LocateFixed className="size-3.5" />
            Jump to changes
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {highlights ? (
        <style>{`${highlights}{background:color-mix(in srgb, var(--success) 12%, transparent);}`}</style>
      ) : null}
      <BlockNoteView
        editor={editor}
        theme={theme}
        editable={canEdit}
        onChange={() => {
          emitMarkdown();
          setFocusedBlockId(editor.getTextCursorPosition().block.id);
        }}
        onSelectionChange={() => setFocusedBlockId(editor.getTextCursorPosition().block.id)}
        className="min-w-0 bg-background py-3 [&_.bn-editor]:bg-transparent [&_.bn-editor]:px-10 [&_.bn-block-content]:rounded-md [&_.bn-block-content]:px-2 [&_.bn-block-content]:py-1"
      />
    </div>
  );
}
