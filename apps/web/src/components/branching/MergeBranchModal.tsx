import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Branch, MergeReceipt, Placement } from "@rakazo/contracts";
import { buildSmartSegments, joinSmartSegments } from "@rakazo/core";
import { Button, Checkbox, Dialog, DialogContent, Textarea } from "@rakazo/ui-web";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  GitMerge,
  GripVertical,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { createSpaceRpc } from "../../lib/query/rpc";

export type MergeStrategy = "ai_assisted" | "replace" | "append" | "insert";

interface PreviewSegment {
  id: string;
  markdown: string;
  isIncoming: boolean;
}

const STRATEGY_OPTIONS: Array<{
  id: MergeStrategy;
  title: string;
  description: string;
  ai?: boolean;
}> = [
  {
    id: "insert",
    title: "Insert at Branch Point",
    description: "Place the selected segment(s) right where you branched (draggable in preview)",
  },
  {
    id: "replace",
    title: "Replace Highlighted Text",
    description: "Replace the highlighted excerpt in the parent Main message",
  },
  {
    id: "append",
    title: "Append to End of Message",
    description: "Add seamlessly to the end of Main's message (draggable to any spot in preview)",
  },
  {
    id: "ai_assisted",
    title: "AI-Assisted Merge",
    description: "Use AI to blend the selected segment(s) smoothly into Main",
    ai: true,
  },
];

export function MergeBranchModal({
  open,
  onOpenChange,
  rpc,
  projectId,
  sourceBranch,
  targetBranch,
  initialSelectedText,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId: string;
  sourceBranch: Branch;
  targetBranch: Branch;
  initialSelectedText: string;
  onMerged: (result: {
    receipt: MergeReceipt | null;
    archivedBranchId: string | null;
    placement: Placement | null;
  }) => Promise<void> | void;
}) {
  const [step, setStep] = useState<"options" | "preview">("options");
  const [strategy, setStrategy] = useState<MergeStrategy>("insert");
  const [selectedText, setSelectedText] = useState(initialSelectedText);
  const [instructions, setInstructions] = useState("");
  const [archiveAfterMerge, setArchiveAfterMerge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beforeText, setBeforeText] = useState("");
  const [afterSegments, setAfterSegments] = useState<PreviewSegment[]>([]);
  const [draggedSegId, setDraggedSegId] = useState<string | null>(null);

  // Lockstep synchronized scroll refs
  const beforeScrollRef = useRef<HTMLDivElement>(null);
  const afterScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef<"before" | "after" | null>(null);

  useEffect(() => {
    if (open) {
      setStep("options");
      setSelectedText(initialSelectedText);
      setBeforeText("");
      setAfterSegments([]);
      setError(null);
    }
  }, [open, initialSelectedText]);

  function handleSyncScroll(source: "before" | "after") {
    if (syncingScroll.current && syncingScroll.current !== source) return;
    const from = source === "before" ? beforeScrollRef.current : afterScrollRef.current;
    const to = source === "before" ? afterScrollRef.current : beforeScrollRef.current;
    if (!from || !to) return;
    syncingScroll.current = source;
    const maxFrom = Math.max(1, from.scrollHeight - from.clientHeight);
    const maxTo = Math.max(1, to.scrollHeight - to.clientHeight);
    const ratio = from.scrollTop / maxFrom;
    to.scrollTop = ratio * maxTo;
    requestAnimationFrame(() => {
      syncingScroll.current = null;
    });
  }

  function buildInteractiveAfterSegments(beforeMd: string, afterMd: string, incomingMd: string): PreviewSegment[] {
    const beforeSet = new Set(
      buildSmartSegments(beforeMd).map((s) => s.markdown.trim()),
    );
    const incomingSet = new Set(
      buildSmartSegments(incomingMd).map((s) => s.markdown.trim()),
    );
    return buildSmartSegments(afterMd).map((seg, idx) => {
      const norm = seg.markdown.trim();
      const isIncoming = incomingSet.has(norm) || !beforeSet.has(norm);
      return {
        id: `after_${idx}_${seg.id}`,
        markdown: seg.markdown,
        isIncoming,
      };
    });
  }

  async function handlePreview() {
    if (!selectedText.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await rpc.merges.executeStrategy({
        projectId,
        sourceBranchId: sourceBranch.id,
        targetBranchId: targetBranch.id,
        strategy,
        selectedText: selectedText.trim(),
        instructions: instructions.trim() || undefined,
        archiveAfterMerge,
        previewOnly: true,
      });
      setBeforeText(res.beforeText);
      setAfterSegments(buildInteractiveAfterSegments(res.beforeText, res.afterText, selectedText.trim()));
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate merge preview");
    } finally {
      setLoading(false);
    }
  }

  function moveSegment(idx: number, delta: -1 | 1) {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= afterSegments.length) return;
    const next = [...afterSegments];
    const [item] = next.splice(idx, 1);
    if (!item) return;
    next.splice(nextIdx, 0, item);
    setAfterSegments(next);
  }

  function dropSegment(targetId: string) {
    if (!draggedSegId || draggedSegId === targetId) {
      setDraggedSegId(null);
      return;
    }
    const fromIdx = afterSegments.findIndex((s) => s.id === draggedSegId);
    const toIdx = afterSegments.findIndex((s) => s.id === targetId);
    setDraggedSegId(null);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...afterSegments];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    setAfterSegments(next);
  }

  async function handleConfirm() {
    if (!selectedText.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const finalAfterText = joinSmartSegments(afterSegments);
      const res = await rpc.merges.executeStrategy({
        projectId,
        sourceBranchId: sourceBranch.id,
        targetBranchId: targetBranch.id,
        strategy,
        selectedText: selectedText.trim(),
        finalAfterText,
        instructions: instructions.trim() || undefined,
        archiveAfterMerge,
        previewOnly: false,
      });
      await onMerged({
        receipt: res.receipt,
        archivedBranchId: res.archivedBranchId,
        placement: res.placement,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden border border-border bg-card p-0 text-foreground">
        {step === "options" ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <GitMerge className="size-4 text-success" />
                <h2 className="text-base font-semibold">Merge Branch into Main</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="rk-scroll max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-foreground">
                <span className="font-medium text-success">{sourceBranch.name}</span>
                <span className="mx-1.5 text-muted-foreground">→</span>
                <span className="font-medium">{targetBranch.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  (Merges uniformly into Main & live context window)
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Selected segment(s) to merge (editable)
                </label>
                <Textarea
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  rows={4}
                  placeholder="Select segments in Side Chat or paste the text you want to merge into Main..."
                  className="text-xs"
                />
              </div>

              {strategy === "ai_assisted" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Instructions for AI-Assisted merge (optional)
                  </label>
                  <Textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={2}
                    placeholder="e.g. blend into the second paragraph, keep existing examples..."
                    className="text-xs"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Initial placement (you can also drag to any exact spot in Preview)
                </div>
                <div className="space-y-2">
                  {STRATEGY_OPTIONS.map((opt) => {
                    const active = strategy === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStrategy(opt.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                          active
                            ? "border-success/60 bg-success/10"
                            : "border-border bg-background/40 hover:bg-muted/50"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {opt.ai ? <Sparkles className="size-3.5 text-success" /> : null}
                            <span>{opt.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                        {active ? <Check className="size-4 shrink-0 text-success" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="archive-branch-after-merge"
                  checked={archiveAfterMerge}
                  onCheckedChange={(v) => setArchiveAfterMerge(Boolean(v))}
                />
                <label
                  htmlFor="archive-branch-after-merge"
                  className="cursor-pointer text-xs text-foreground"
                >
                  Archive branch after merge
                </label>
              </div>

              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedText.trim() || loading}
                onClick={() => void handlePreview()}
                className="bg-success text-white hover:bg-success/90"
              >
                {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Preview & Position
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div>
                <h2 className="text-base font-semibold">Merge Preview — Drag to Position</h2>
                <p className="text-[11px] text-muted-foreground">
                  Before & After scroll in sync. Drag green segments (or use ↑↓) to place them
                  precisely in Main.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid h-[62vh] grid-cols-1 divide-y divide-border overflow-hidden md:grid-cols-2 md:divide-x md:divide-y-0">
              {/* Before Merge (Synchronized Scroll) */}
              <div className="flex min-h-0 flex-col">
                <div className="shrink-0 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2">
                  <div className="text-xs font-semibold text-rose-400">Before Merge</div>
                  <div className="text-[11px] text-rose-300/80">Current Main message</div>
                </div>
                <div
                  ref={beforeScrollRef}
                  onScroll={() => handleSyncScroll("before")}
                  className="rk-scroll flex-1 overflow-y-auto p-4 text-xs"
                >
                  <ChatMarkdown>{beforeText}</ChatMarkdown>
                </div>
              </div>

              {/* After Merge (Synchronized Scroll + Interactive Drag-to-Place) */}
              <div className="flex min-h-0 flex-col">
                <div className="shrink-0 border-b border-success/25 bg-success/10 px-4 py-2">
                  <div className="text-xs font-semibold text-success">
                    After Merge (Drag segments to exact spot)
                  </div>
                  <div className="text-[11px] text-success/80">
                    Green segments are incoming from {sourceBranch.name}
                  </div>
                </div>
                <div
                  ref={afterScrollRef}
                  onScroll={() => handleSyncScroll("after")}
                  className="rk-scroll flex-1 space-y-2 overflow-y-auto p-4 text-xs"
                >
                  {afterSegments.map((seg, idx) => (
                    <div
                      key={seg.id}
                      draggable
                      onDragStart={() => setDraggedSegId(seg.id)}
                      onDragOver={(e) => {
                        if (draggedSegId && draggedSegId !== seg.id) e.preventDefault();
                      }}
                      onDrop={() => dropSegment(seg.id)}
                      onDragEnd={() => setDraggedSegId(null)}
                      className={`group flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                        seg.isIncoming
                          ? "border-success/60 bg-success/10"
                          : "border-border/50 bg-background/40 hover:border-border"
                      }`}
                    >
                      <GripVertical className="mt-1 size-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                      <div className="min-w-0 flex-1">
                        <ChatMarkdown>{seg.markdown}</ChatMarkdown>
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5 opacity-60 group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveSegment(idx, -1)}
                          aria-label="Move segment up"
                          className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === afterSegments.length - 1}
                          onClick={() => moveSegment(idx, 1)}
                          aria-label="Move segment down"
                          className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error ? <p className="px-5 py-2 text-xs text-destructive">{error}</p> : null}

            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("options")}
              >
                <ArrowLeft className="mr-1.5 size-3.5" />
                Back to Options
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={loading}
                onClick={() => void handleConfirm()}
                className="bg-success text-white hover:bg-success/90"
              >
                {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Confirm Merge into Main
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
