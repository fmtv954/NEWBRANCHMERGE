import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Branch, MergeReceipt, Placement } from "@rakazo/contracts";
import { Button, Checkbox, Dialog, DialogContent, Textarea } from "@rakazo/ui-web";
import {
  ArrowLeft,
  Check,
  Columns2,
  GitMerge,
  Loader2,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { createSpaceRpc } from "../../lib/query/rpc";
import { NotionBlockCanvas } from "./NotionBlockCanvas";

export type MergeStrategy = "ai_assisted" | "replace" | "append" | "insert";

const STRATEGY_OPTIONS: Array<{
  id: MergeStrategy;
  title: string;
  description: string;
  ai?: boolean;
}> = [
  {
    id: "insert",
    title: "Insert at Branch Point",
    description: "Place selected segment(s) right where you branched (freely draggable in Canvas)",
  },
  {
    id: "replace",
    title: "Replace Highlighted Text",
    description: "Replace the highlighted excerpt in the parent Main message",
  },
  {
    id: "append",
    title: "Append to End of Message",
    description: "Add uniformly to the end of Main's message (freely draggable in Canvas)",
  },
  {
    id: "ai_assisted",
    title: "AI-Assisted Merge",
    description: "Use AI to blend selected segment(s) smoothly into Main",
    ai: true,
  },
];

/**
 * 90% Full-Screen Merge & Rearrange Canvas Studio:
 * - Works in Merge mode (Side Branch -> Main) AND Standalone Rearrange mode (any Main message!)
 * - Tab 1: Side-by-Side Diff (lockstep sync-scrolled Original Main vs. live Notion BlockNote Canvas)
 * - Tab 2: Full Canvas Focus (100% width Notion BlockNote Canvas with drag handles & Split into Sentences)
 * - Save & Return to Main writes uniformly into Main's Message.blocks (MessageRevision vN)
 */
export function MergeBranchModal({
  open,
  onOpenChange,
  rpc,
  projectId,
  sourceBranch,
  targetBranch,
  initialSelectedText,
  standaloneMessage,
  onMerged,
  onSavedStandalone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId: string;
  sourceBranch?: Branch | null;
  targetBranch?: Branch | null;
  initialSelectedText: string;
  /** When set, opens directly in Full Canvas Studio for rearranging/editing this Main message! */
  standaloneMessage?: { messageId: string; markdown: string } | null;
  onMerged?: (result: {
    receipt: MergeReceipt | null;
    archivedBranchId: string | null;
    placement: Placement | null;
  }) => Promise<void> | void;
  onSavedStandalone?: (messageId: string, updatedMarkdown: string) => Promise<void>;
}) {
  const isStandalone = Boolean(standaloneMessage);
  const [step, setStep] = useState<"options" | "studio">(isStandalone ? "studio" : "options");
  const [studioTab, setStudioTab] = useState<"split" | "focus">(isStandalone ? "focus" : "split");
  const [strategy, setStrategy] = useState<MergeStrategy>("insert");
  const [selectedText, setSelectedText] = useState(initialSelectedText);
  const [instructions, setInstructions] = useState("");
  const [archiveAfterMerge, setArchiveAfterMerge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beforeText, setBeforeText] = useState("");
  const [canvasInitialMarkdown, setCanvasInitialMarkdown] = useState("");
  const [canvasCurrentMarkdown, setCanvasCurrentMarkdown] = useState("");

  // Lockstep synchronized scroll refs
  const beforeScrollRef = useRef<HTMLDivElement>(null);
  const afterScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef<"before" | "after" | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (standaloneMessage) {
      setStep("studio");
      setStudioTab("focus");
      setBeforeText(standaloneMessage.markdown);
      setCanvasInitialMarkdown(standaloneMessage.markdown);
      setCanvasCurrentMarkdown(standaloneMessage.markdown);
    } else {
      setStep("options");
      setStudioTab("split");
      setSelectedText(initialSelectedText);
      setBeforeText("");
      setCanvasInitialMarkdown("");
      setCanvasCurrentMarkdown("");
    }
  }, [open, initialSelectedText, standaloneMessage]);

  function handleSyncScroll(source: "before" | "after") {
    if (studioTab !== "split") return;
    if (syncingScroll.current && syncingScroll.current !== source) return;
    const from = source === "before" ? beforeScrollRef.current : afterScrollRef.current;
    const to = source === "before" ? afterScrollRef.current : beforeScrollRef.current;
    if (!from || !to) return;
    syncingScroll.current = source;
    const maxFrom = Math.max(1, from.scrollHeight - from.clientHeight);
    const maxTo = Math.max(1, to.scrollHeight - to.clientHeight);
    to.scrollTop = (from.scrollTop / maxFrom) * maxTo;
    requestAnimationFrame(() => {
      syncingScroll.current = null;
    });
  }

  async function handlePreview() {
    if (!selectedText.trim() || loading || !sourceBranch || !targetBranch) return;
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
      setCanvasInitialMarkdown(res.afterText);
      setCanvasCurrentMarkdown(res.afterText);
      setStep("studio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate merge preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const finalMd = (canvasCurrentMarkdown || canvasInitialMarkdown).trim();
      if (standaloneMessage && onSavedStandalone) {
        await onSavedStandalone(standaloneMessage.messageId, finalMd);
        onOpenChange(false);
        return;
      }
      if (!sourceBranch || !targetBranch) return;
      const res = await rpc.merges.executeStrategy({
        projectId,
        sourceBranchId: sourceBranch.id,
        targetBranchId: targetBranch.id,
        strategy,
        selectedText: selectedText.trim(),
        finalAfterText: finalMd,
        instructions: instructions.trim() || undefined,
        archiveAfterMerge,
        previewOnly: false,
      });
      await onMerged?.({
        receipt: res.receipt,
        archivedBranchId: res.archivedBranchId,
        placement: res.placement,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          step === "studio"
            ? "flex h-[88vh] w-[92vw] max-w-[92vw] flex-col overflow-hidden border border-border bg-card p-0 text-foreground"
            : "max-w-3xl overflow-hidden border border-border bg-card p-0 text-foreground"
        }
      >
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
              {sourceBranch && targetBranch ? (
                <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-foreground">
                  <span className="font-medium text-success">{sourceBranch.name}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-medium">{targetBranch.name}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    (Merges uniformly into Main & live context window)
                  </span>
                </div>
              ) : null}

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
                  Initial placement (you can freely drag any heading, paragraph, bullet, or sentence
                  in the Notion Canvas Studio next)
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
                Open Canvas Studio
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Studio Header with Tab Switcher: Side-by-Side Diff | Full Canvas Focus */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <h2 className="text-base font-semibold">
                  {isStandalone ? "Rearrange Main Canvas (Notion Blocks)" : "Merge & Rearrange Studio"}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Drag headings, paragraphs, bullets, or split into sentences — then save directly
                  back to Main.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setStudioTab("split")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      studioTab === "split"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Columns2 className="size-3.5" />
                    <span>Side-by-Side Diff</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioTab("focus")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      studioTab === "focus"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Maximize2 className="size-3.5" />
                    <span>Full Canvas Focus</span>
                  </button>
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
            </div>

            {/* Studio Body */}
            <div
              className={`grid min-h-0 flex-1 overflow-hidden ${
                studioTab === "split"
                  ? "grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0"
                  : "grid-cols-1"
              }`}
            >
              {studioTab === "split" ? (
                <div className="flex min-h-0 flex-col">
                  <div className="shrink-0 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2">
                    <div className="text-xs font-semibold text-rose-400">Original Main (Sync Scroll)</div>
                    <div className="text-[11px] text-rose-300/80">Read-only reference before changes</div>
                  </div>
                  <div
                    ref={beforeScrollRef}
                    onScroll={() => handleSyncScroll("before")}
                    className="rk-scroll flex-1 overflow-y-auto p-5 text-sm"
                  >
                    <ChatMarkdown>{beforeText}</ChatMarkdown>
                  </div>
                </div>
              ) : null}

              <div className="flex min-h-0 flex-col">
                <div className="shrink-0 border-b border-success/25 bg-success/10 px-4 py-2">
                  <div className="text-xs font-semibold text-success">
                    New Main Canvas (Live Notion-Style Blocks)
                  </div>
                  <div className="text-[11px] text-success/80">
                    Drag blocks via left ⋮⋮ handle, edit inline, or split paragraphs into sentences
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <NotionBlockCanvas
                    initialMarkdown={canvasInitialMarkdown}
                    onChangeMarkdown={setCanvasCurrentMarkdown}
                    scrollRef={afterScrollRef}
                    onScroll={() => handleSyncScroll("after")}
                  />
                </div>
              </div>
            </div>

            {error ? <p className="px-5 py-2 text-xs text-destructive">{error}</p> : null}

            <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
              {!isStandalone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("options")}
                >
                  <ArrowLeft className="mr-1.5 size-3.5" />
                  Back to Options
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={loading}
                onClick={() => void handleConfirm()}
                className="bg-success text-white hover:bg-success/90"
              >
                {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Save & Return to Main
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
