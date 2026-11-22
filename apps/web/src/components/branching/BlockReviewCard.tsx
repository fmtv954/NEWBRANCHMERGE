import { parseMarkdownToCanonicalBlocks } from "@rakazo/core";
import { Badge, Button, Card } from "@rakazo/ui-web";
import { ArrowDown, ArrowUp, Check, GitBranch, GripVertical, Layers } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * Notion-style & Git-rebase-inspired Block Text Review card:
 * Splits an assistant message into canonical Markdown blocks so the user can
 * drag-and-drop OR click Move Up / Move Down to rearrange blocks, branch any individual block,
 * and commit the new order as an immutable MessageRevision.
 */
export function BlockReviewCard({
  messageId,
  markdown,
  onSaveOrder,
  onBranchBlock,
  onClose,
}: {
  messageId: string;
  markdown: string;
  onSaveOrder: (orderedBlockIds: string[]) => Promise<void>;
  onBranchBlock?: (blockText: string) => void;
  onClose?: () => void;
}) {
  const initialBlocks = useMemo(
    () => parseMarkdownToCanonicalBlocks(markdown, { seedPrefix: messageId }),
    [markdown, messageId],
  );
  const [order, setOrder] = useState<string[]>(() =>
    initialBlocks.map((b) => b.stableBlockId),
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const blocksById = useMemo(
    () => new Map(initialBlocks.map((b) => [b.stableBlockId, b])),
    [initialBlocks],
  );

  const orderedBlocks = order
    .map((id) => blocksById.get(id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  const isDirty = order.some((id, idx) => initialBlocks[idx]?.stableBlockId !== id);

  function moveBy(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (item !== undefined) next.splice(target, 0, item);
      return next;
    });
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrder((prev) => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (item !== undefined) next.splice(to, 0, item);
      return next;
    });
    setDraggedId(null);
  }

  if (initialBlocks.length === 0) {
    return null;
  }

  return (
    <Card className="border-border bg-card/80 p-3.5 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Layers className="size-3.5 text-sky-400" />
          <span>Block Text Review & Reorder</span>
          <Badge variant="outline" className="text-[10px]">
            {orderedBlocks.length} blocks
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {isDirty ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSaveOrder(order);
                } finally {
                  setSaving(false);
                }
              }}
              className="h-6 gap-1 px-2 text-[11px]"
            >
              <Check className="size-3" />
              <span>{saving ? "Saving…" : "Commit Order"}</span>
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 px-2 text-[11px]"
            >
              Done
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        {orderedBlocks.map((block, index) => (
          <div
            key={block.stableBlockId}
            draggable
            onDragStart={() => setDraggedId(block.stableBlockId)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(block.stableBlockId)}
            className={`group flex items-start gap-2 rounded-lg border bg-background/60 px-2.5 py-2 transition-colors ${
              draggedId === block.stableBlockId
                ? "border-sky-500/60 opacity-60"
                : "border-border/70 hover:border-border"
            }`}
          >
            <div
              className="mt-0.5 cursor-grab text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                  {block.blockType}
                </Badge>
                <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-foreground/90">
                {block.canonicalText}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Move block up"
                disabled={index === 0}
                onClick={() => moveBy(index, -1)}
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <ArrowUp className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Move block down"
                disabled={index === orderedBlocks.length - 1}
                onClick={() => moveBy(index, 1)}
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <ArrowDown className="size-3" />
              </Button>
              {onBranchBlock ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Branch this block"
                  title="Branch this block"
                  onClick={() => onBranchBlock(block.canonicalText)}
                  className="size-6 text-muted-foreground hover:text-foreground"
                >
                  <GitBranch className="size-3" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
