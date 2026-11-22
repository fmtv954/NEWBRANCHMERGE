import { ChatMarkdown } from "@rakazo/chat-ui/web";
import { buildSmartSegments, joinSmartSegments, type SmartSegment } from "@rakazo/core";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import {
  Check,
  GitBranch,
  GripVertical,
  History,
  Maximize2,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { createSpaceRpc } from "../../lib/query/rpc";

/**
 * Seamless Smart-Segmented Canvas for Main AI messages:
 * - Renders every segment uniformly with `<ChatMarkdown />` (zero boxes by default)
 * - Hovering any segment reveals surgical actions: Drag-to-reorder, Branch, Inline Edit, Delete
 * - Optional `showOutlines` (header `Blocks` toggle) reveals subtle borders on all segments at once
 * - Built-in Visual Spine + `vN` Version Switcher backed by PostgreSQL `MessageRevision`
 */
export function SmartSegmentedMessage({
  messageId,
  markdown,
  rpc,
  projectId,
  branchId,
  showOutlines = false,
  onBranchSegment,
  onCommitMarkdown,
  onRestoredRevision,
  onOpenRearrangeCanvas,
}: {
  messageId: string;
  markdown: string;
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId?: string | null;
  branchId?: string | null;
  showOutlines?: boolean;
  onBranchSegment?: (quoteText: string) => void;
  onCommitMarkdown?: (messageId: string, updatedMarkdown: string) => Promise<void>;
  onRestoredRevision?: () => Promise<void>;
  onOpenRearrangeCanvas?: (messageId: string, markdown: string) => void;
}) {
  const parsed = useMemo(() => buildSmartSegments(markdown), [markdown]);
  const [segments, setSegments] = useState<SmartSegment[]>(parsed);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Version History (Visual Spine)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; version: number; canonicalText: string; sourceAction: string; createdAt: string }>
  >([]);
  const [activeRevId, setActiveRevId] = useState<string | null>(null);

  useEffect(() => {
    setSegments(parsed);
  }, [parsed]);

  // Lazily load revisions when the user opens the version pill (or after a local save).
  async function loadRevisions() {
    try {
      const res = await rpc.projects.listMessageRevisions({ messageId });
      setRevisions(res.revisions);
      setActiveRevId(res.activeRevisionId);
    } catch {
      // ignore if message has no revisions yet
    }
  }

  async function persistSegments(next: SmartSegment[]) {
    setSegments(next);
    if (!onCommitMarkdown) return;
    setSaving(true);
    try {
      await onCommitMarkdown(messageId, joinSmartSegments(next));
      await loadRevisions();
    } finally {
      setSaving(false);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = segments.findIndex((s) => s.id === draggedId);
    const toIdx = segments.findIndex((s) => s.id === targetId);
    setDraggedId(null);
    setDragOverId(null);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...segments];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    void persistSegments(next);
  }

  function handleDelete(segId: string) {
    const next = segments.filter((s) => s.id !== segId);
    if (next.length === 0) return;
    void persistSegments(next);
  }

  function handleSaveEdit(segId: string) {
    const trimmed = editDraft.trim();
    setEditingId(null);
    if (!trimmed) return;
    const next = segments.map((s) =>
      s.id === segId ? { ...s, markdown: trimmed, plainText: trimmed } : s,
    );
    void persistSegments(next);
  }

  const currentVersion =
    revisions.find((r) => r.id === activeRevId)?.version ?? revisions[0]?.version ?? null;

  return (
    <div
      className={`group/canvas relative ${
        currentVersion && currentVersion > 1 ? "border-l-2 border-success/40 pl-2.5" : ""
      }`}
    >
      {/* Segments rendered seamlessly with uniform ChatMarkdown */}
      <div className={showOutlines ? "space-y-1.5" : "space-y-0.5"}>
        {segments.map((seg) => {
          const isEditing = editingId === seg.id;
          const isDropTarget = dragOverId === seg.id && draggedId !== seg.id;
          return (
            <div
              key={seg.id}
              draggable={!isEditing && Boolean(onCommitMarkdown)}
              onDragStart={() => setDraggedId(seg.id)}
              onDragOver={(e) => {
                if (draggedId && draggedId !== seg.id) {
                  e.preventDefault();
                  setDragOverId(seg.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverId === seg.id) setDragOverId(null);
              }}
              onDrop={() => handleDrop(seg.id)}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              className={`group/seg relative rounded-lg transition-colors ${
                showOutlines
                  ? "border border-border/70 bg-background/30 px-2.5 py-1.5 hover:border-success/50"
                  : "px-1 py-0.5 hover:bg-muted/25"
              } ${isDropTarget ? "ring-2 ring-success/70" : ""}`}
            >
              {isEditing ? (
                <div className="space-y-1.5 py-1">
                  <textarea
                    rows={Math.max(2, Math.min(8, editDraft.split("\n").length + 1))}
                    value={editDraft}
                    autoFocus
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSaveEdit(seg.id);
                      }
                    }}
                    className="w-full resize-y rounded-lg border border-ring bg-background px-2.5 py-1.5 text-sm text-foreground outline-none"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      className="h-6 px-2 text-xs"
                    >
                      <X className="mr-1 size-3" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving}
                      onClick={() => handleSaveEdit(seg.id)}
                      className="h-6 bg-success px-2 text-xs text-white hover:bg-success/90"
                    >
                      <Check className="mr-1 size-3" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Hover-reveal surgical controls */}
                  <div className="pointer-events-none absolute -top-2.5 right-1 z-10 flex items-center gap-0.5 rounded-full border border-border bg-popover/95 px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover/seg:pointer-events-auto group-hover/seg:opacity-100">
                    {onCommitMarkdown ? (
                      <span
                        title="Drag to reorder segment"
                        className="inline-flex size-5 cursor-grab items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:cursor-grabbing"
                      >
                        <GripVertical className="size-3" />
                      </span>
                    ) : null}
                    {onBranchSegment ? (
                      <button
                        type="button"
                        title="Branch just this segment"
                        aria-label="Branch segment"
                        onClick={() => onBranchSegment(seg.plainText)}
                        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-success"
                      >
                        <GitBranch className="size-3" />
                      </button>
                    ) : null}
                    {onCommitMarkdown ? (
                      <button
                        type="button"
                        title="Edit segment"
                        aria-label="Edit segment"
                        onClick={() => {
                          setEditDraft(seg.markdown);
                          setEditingId(seg.id);
                        }}
                        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                    ) : null}
                    {onCommitMarkdown && segments.length > 1 ? (
                      <button
                        type="button"
                        title="Delete segment"
                        aria-label="Delete segment"
                        onClick={() => handleDelete(seg.id)}
                        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    ) : null}
                  </div>

                  {/* Uniform Markdown render */}
                  <ChatMarkdown>{seg.markdown}</ChatMarkdown>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Subtle Rearrange Canvas + Version History pill (shown on hover or when v2+) */}
      {projectId && branchId ? (
        <div className="mt-1 flex items-center justify-end gap-1.5">
          {onOpenRearrangeCanvas ? (
            <button
              type="button"
              title="Open 90% Notion Block Canvas Studio to rearrange blocks or split sentences"
              onClick={() => onOpenRearrangeCanvas(messageId, joinSmartSegments(segments))}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-success group-hover/canvas:opacity-90"
            >
              <Maximize2 className="size-2.5" />
              <span>Rearrange Canvas</span>
            </button>
          ) : null}
          <Popover
            open={historyOpen}
            onOpenChange={(next) => {
              setHistoryOpen(next);
              if (next) void loadRevisions();
            }}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title="Message version history"
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity ${
                    currentVersion && currentVersion > 1
                      ? "bg-success/15 text-success opacity-90 hover:opacity-100"
                      : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/canvas:opacity-75"
                  }`}
                />
              }
            >
              <History className="size-2.5" />
              <span>{currentVersion ? `v${currentVersion}` : "History"}</span>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={6}
              className="w-64 rounded-xl border border-border bg-popover p-2 shadow-xl"
            >
              <div className="mb-1.5 px-1 text-[11px] font-semibold text-foreground">
                Version History
              </div>
              {revisions.length === 0 ? (
                <div className="px-1 py-2 text-[11px] text-muted-foreground">
                  Original version (v1). Edit, reorder, or merge a branch to create v2.
                </div>
              ) : (
                <div className="rk-scroll max-h-48 space-y-1 overflow-y-auto">
                  {revisions.map((rev) => {
                    const isCurrent = rev.id === activeRevId;
                    return (
                      <div
                        key={rev.id}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${
                          isCurrent ? "bg-success/10 text-success" : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium">
                            v{rev.version} ·{" "}
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {rev.sourceAction === "merge_apply"
                                ? "Merged"
                                : rev.sourceAction === "original"
                                  ? "Original"
                                  : "Edited"}
                            </span>
                          </div>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-medium">Active</span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              await rpc.projects.restoreMessageRevision({
                                projectId,
                                branchId,
                                messageId,
                                revisionId: rev.id,
                              });
                              setHistoryOpen(false);
                              await loadRevisions();
                              await onRestoredRevision?.();
                            }}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                          >
                            <RotateCcw className="size-2.5" />
                            Restore
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}
