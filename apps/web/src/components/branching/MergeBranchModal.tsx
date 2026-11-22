import type { Branch, MergeReceipt, Placement } from "@rakazo/contracts";
import { computeWordDiff } from "@rakazo/core";
import { Button, Checkbox, Dialog, DialogContent, Textarea } from "@rakazo/ui-web";
import { ArrowLeft, Check, GitMerge, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { createSpaceRpc } from "../../lib/query/rpc";

export type MergeStrategy = "ai_assisted" | "replace" | "append" | "insert";

const STRATEGY_OPTIONS: Array<{
  id: MergeStrategy;
  title: string;
  description: string;
  ai?: boolean;
}> = [
  {
    id: "ai_assisted",
    title: "AI-Assisted Merge",
    description: "Use AI to intelligently place and blend the selected text into Main",
    ai: true,
  },
  {
    id: "replace",
    title: "Replace",
    description: "Replace the highlighted text in the parent Main message",
  },
  {
    id: "append",
    title: "Append",
    description: "Add the selected text as a draggable block at the end of Main",
  },
  {
    id: "insert",
    title: "Insert",
    description: "Insert the selected text right at the position where it was branched from",
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
  const [preview, setPreview] = useState<{ beforeText: string; afterText: string } | null>(null);

  useEffect(() => {
    if (open) {
      setStep("options");
      setSelectedText(initialSelectedText);
      setPreview(null);
      setError(null);
    }
  }, [open, initialSelectedText]);

  const diffTokens = useMemo(() => {
    if (!preview) return [];
    return computeWordDiff(preview.beforeText, preview.afterText);
  }, [preview]);

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
      setPreview({ beforeText: res.beforeText, afterText: res.afterText });
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate merge preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
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
      <DialogContent className="max-w-3xl overflow-hidden border border-border bg-card p-0 text-foreground">
        {step === "options" ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <GitMerge className="size-4 text-success" />
                <h2 className="text-base font-semibold">Merge Branch</h2>
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
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Selected branch text to merge
                </label>
                <Textarea
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  rows={3}
                  placeholder="Paste or edit the branch excerpt you want to merge into Main..."
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
                  How would you like to merge?
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
                Preview Merge
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-base font-semibold">Merge Preview</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid max-h-[66vh] grid-cols-1 divide-y divide-border overflow-hidden md:grid-cols-2 md:divide-x md:divide-y-0">
              {/* Before Merge (Red header) */}
              <div className="flex min-h-0 flex-col">
                <div className="border-b border-rose-500/25 bg-rose-500/10 px-4 py-2">
                  <div className="text-xs font-semibold text-rose-400">Before Merge</div>
                  <div className="text-[11px] text-rose-300/80">
                    Content to be removed or modified
                  </div>
                </div>
                <div className="rk-scroll flex-1 overflow-y-auto p-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {diffTokens.map((tok, idx) =>
                    tok.kind === "added" ? null : (
                      <span
                        key={idx}
                        className={
                          tok.kind === "removed"
                            ? "rounded bg-rose-500/20 px-0.5 text-rose-300 line-through"
                            : undefined
                        }
                      >
                        {tok.text}
                      </span>
                    ),
                  )}
                </div>
              </div>

              {/* After Merge (Green header) */}
              <div className="flex min-h-0 flex-col">
                <div className="border-b border-success/25 bg-success/10 px-4 py-2">
                  <div className="text-xs font-semibold text-success">After Merge</div>
                  <div className="text-[11px] text-success/80">
                    Content after merge with changes
                  </div>
                </div>
                <div className="rk-scroll flex-1 overflow-y-auto p-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  {diffTokens.map((tok, idx) =>
                    tok.kind === "removed" ? null : (
                      <span
                        key={idx}
                        className={
                          tok.kind === "added"
                            ? "rounded bg-success/20 px-0.5 text-success"
                            : undefined
                        }
                      >
                        {tok.text}
                      </span>
                    ),
                  )}
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
                Confirm Merge
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
