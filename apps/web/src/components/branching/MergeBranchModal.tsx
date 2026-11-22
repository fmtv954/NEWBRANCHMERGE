import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Branch, MergePreviewBase, MergeReceipt, MergeSourceBlock } from "@rakazo/contracts";
import { Button, Checkbox, Dialog, DialogContent, DialogTitle, Textarea } from "@rakazo/ui-web";
import { ArrowLeft, Columns2, GitMerge, Loader2 } from "lucide-react";
import { useState } from "react";
import type { createSpaceRpc } from "../../lib/query/rpc";
import { NotionBlockCanvas } from "./NotionBlockCanvas";

type MergeStrategy = "ai_assisted" | "replace" | "append" | "insert";

const placements: { id: MergeStrategy; label: string }[] = [
  { id: "insert", label: "Insert at branch point" },
  { id: "replace", label: "Replace highlighted text" },
  { id: "append", label: "Place manually" },
  { id: "ai_assisted", label: "Blend with AI" },
];

export function MergeBranchModal({
  onClose,
  rpc,
  projectId,
  sourceBranch,
  targetBranch,
  initialSelectedText,
  selectedBlocks,
  standaloneMessage,
  onMerged,
  onSavedStandalone,
}: {
  onClose: () => void;
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId: string;
  sourceBranch?: Branch | null;
  targetBranch?: Branch | null;
  initialSelectedText: string;
  selectedBlocks?: MergeSourceBlock[];
  standaloneMessage?: {
    messageId: string;
    blockIndex: number;
    markdown: string;
    originalMarkdown?: string;
  } | null;
  onMerged: (result: {
    receipt: MergeReceipt | null;
    archivedBranchId: string | null;
  }) => Promise<void>;
  onSavedStandalone: (
    messageId: string,
    markdown: string,
    blockIndex: number,
    originalMarkdown: string,
  ) => Promise<void>;
}) {
  const [strategy, setStrategy] = useState<MergeStrategy>("insert");
  const [selectedText, setSelectedText] = useState(initialSelectedText);
  const [instructions, setInstructions] = useState("");
  const [archiveAfterMerge, setArchiveAfterMerge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [compare, setCompare] = useState(false);
  const [preview, setPreview] = useState<{
    beforeText: string;
    afterText: string;
    beforeContext?: string;
    afterContext?: string;
    previewBase: MergePreviewBase;
    idempotencyKey: string;
  }>();
  const [draft, setDraft] = useState(standaloneMessage?.markdown ?? "");
  const [editorReady, setEditorReady] = useState(false);
  const [submittedDraft, setSubmittedDraft] = useState<string>();
  const inStudio = Boolean(preview || standaloneMessage);
  const canPreview = Boolean(selectedText.trim() && sourceBranch && targetBranch);

  async function generatePreview() {
    if (!sourceBranch || !targetBranch || !canPreview || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await rpc.merges.executeStrategy({
        projectId,
        sourceBranchId: sourceBranch.id,
        targetBranchId: targetBranch.id,
        strategy,
        selectedText: selectedText.trim(),
        selectedBlocks,
        instructions: instructions.trim() || undefined,
        archiveAfterMerge,
        previewOnly: true,
      });
      setDraft(result.afterText);
      setSubmittedDraft(undefined);
      setPreview({ ...result, idempotencyKey: crypto.randomUUID() });
      setCompare(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the merge preview.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (loading || !editorReady || !draft.trim()) return;
    setLoading(true);
    setError(undefined);
    try {
      if (standaloneMessage) {
        await onSavedStandalone(
          standaloneMessage.messageId,
          draft,
          standaloneMessage.blockIndex,
          standaloneMessage.originalMarkdown ?? standaloneMessage.markdown,
        );
      } else if (sourceBranch && targetBranch && preview) {
        const confirmedDraft = submittedDraft ?? draft;
        setSubmittedDraft(confirmedDraft);
        const result = await rpc.merges.executeStrategy({
          projectId,
          sourceBranchId: sourceBranch.id,
          targetBranchId: targetBranch.id,
          strategy,
          selectedText: selectedText.trim(),
          selectedBlocks,
          finalAfterText: confirmedDraft,
          previewBase: preview.previewBase,
          idempotencyKey: preview.idempotencyKey,
          archiveAfterMerge,
          previewOnly: false,
        });
        await onMerged(result);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent
        size="lg"
        className={
          inStudio
            ? "h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none sm:h-[92dvh] sm:w-[94vw] sm:max-w-[100rem]"
            : "h-auto w-[calc(100vw-1rem)] max-w-none sm:max-w-2xl"
        }
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3 pr-14">
          <div>
            <DialogTitle>{standaloneMessage ? "Edit Main canvas" : "Merge into Main"}</DialogTitle>
            {sourceBranch && targetBranch && !standaloneMessage ? (
              <p className="text-sm text-muted-foreground">
                {sourceBranch.name} → {targetBranch.name}
              </p>
            ) : null}
          </div>
          {preview ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={compare}
              onClick={() => setCompare(!compare)}
            >
              <Columns2 className="size-4" />
              {compare ? "Hide original" : "Compare original"}
            </Button>
          ) : null}
        </header>

        {inStudio ? (
          <div
            className={`grid min-h-0 flex-1 overflow-hidden ${compare ? "grid-rows-[minmax(0,1fr)_minmax(0,2fr)] divide-y divide-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-1 lg:divide-x lg:divide-y-0" : "grid-cols-1"}`}
          >
            {compare && preview ? (
              <section key="original" className="rk-scroll min-w-0 overflow-auto">
                <h3 className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2 text-sm font-medium">
                  Original Main
                </h3>
                <div className="mx-auto max-w-3xl p-4">
                  <ChatMarkdown>
                    {[preview.beforeContext, preview.beforeText, preview.afterContext]
                      .filter(Boolean)
                      .join("\n\n")}
                  </ChatMarkdown>
                </div>
              </section>
            ) : null}
            <section key="draft" className="rk-scroll min-w-0 overflow-auto">
              <div className="mx-auto max-w-5xl">
                {preview?.beforeContext ? (
                  <div className="border-b border-border px-5 py-3 text-muted-foreground">
                    <ChatMarkdown>{preview.beforeContext}</ChatMarkdown>
                  </div>
                ) : null}
                {preview ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <h3 className="text-sm font-medium">Merge draft</h3>
                    <span className="text-xs text-muted-foreground">
                      Highlighted blocks changed in this preview
                    </span>
                  </div>
                ) : null}
                <NotionBlockCanvas
                  initialMarkdown={preview?.afterText ?? standaloneMessage?.markdown ?? ""}
                  originalMarkdown={preview?.beforeText}
                  onChangeMarkdown={setDraft}
                  onReadyChange={setEditorReady}
                  disabled={loading || submittedDraft !== undefined}
                />
                {preview?.afterContext ? (
                  <div className="border-t border-border px-5 py-3 text-muted-foreground">
                    <ChatMarkdown>{preview.afterContext}</ChatMarkdown>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : (
          <div className="rk-scroll min-h-0 space-y-4 overflow-auto px-5 py-4">
            {selectedBlocks?.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Selected blocks ({selectedBlocks.length})</h3>
                <ol className="space-y-2">
                  {selectedBlocks.map((block) => (
                    <li
                      key={block.blockId}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <ChatMarkdown>{block.markdown}</ChatMarkdown>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <label htmlFor="merge-selection" className="block space-y-1 text-sm font-medium">
                <span>Text to merge</span>
                <Textarea
                  id="merge-selection"
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  rows={4}
                />
              </label>
            )}
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-medium">Placement</legend>
              {placements.map((placement) => (
                <Button
                  type="button"
                  key={placement.id}
                  variant={strategy === placement.id ? "default" : "outline"}
                  aria-pressed={strategy === placement.id}
                  onClick={() => setStrategy(placement.id)}
                >
                  {placement.label}
                </Button>
              ))}
            </fieldset>
            {strategy === "append" ? (
              <p className="text-sm text-muted-foreground">
                Selected blocks start at the end. Move them to the desired position in the draft.
              </p>
            ) : null}
            {strategy === "ai_assisted" ? (
              <label htmlFor="merge-instructions" className="block space-y-1 text-sm font-medium">
                <span>Instructions for AI (optional)</span>
                <Textarea
                  id="merge-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={2}
                />
              </label>
            ) : null}
            <label htmlFor="merge-archive-branch" className="flex items-center gap-2 text-sm">
              <Checkbox
                id="merge-archive-branch"
                checked={archiveAfterMerge}
                onCheckedChange={(value) => setArchiveAfterMerge(Boolean(value))}
              />
              Archive side branch after merge
            </label>
          </div>
        )}

        {error ? (
          <p role="alert" className="shrink-0 px-5 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          {preview ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setPreview(undefined);
                setEditorReady(false);
                setSubmittedDraft(undefined);
                setError(undefined);
              }}
            >
              <ArrowLeft className="size-4" /> Back to placement
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            disabled={loading || (inStudio ? !editorReady || !draft.trim() : !canPreview)}
            onClick={() => void (inStudio ? confirm() : generatePreview())}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : !standaloneMessage ? (
              <GitMerge className="size-4" />
            ) : null}
            {standaloneMessage
              ? "Save changes"
              : submittedDraft !== undefined && !loading
                ? "Retry merge"
                : inStudio
                  ? "Confirm merge"
                  : "Preview merge"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
