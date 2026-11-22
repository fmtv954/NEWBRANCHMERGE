import { Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { Check, GitBranch, History, Maximize2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useSave } from "../../lib/query/query";
import type { createSpaceRpc, RpcClient } from "../../lib/query/rpc";
import { NotionBlockCanvas } from "./NotionBlockCanvas";

/**
 * Always-live Raw BlockNote response canvas for Main Chat:
 * - No card wrapper, no "Edit blocks" button — responses render directly in raw BlockNote
 * - Native BlockNote `+` formatting menu & `⋮⋮` drag handles right in the left gutter
 * - Auto-saves edits/drags smoothly after a short debounce (plus instant Save indicator)
 * - Compact bottom action strip: Branch | Regenerate | Expand Canvas | History (vN)
 */
export function InlineMessageCanvas({
  messageId,
  blockIndex,
  markdown,
  rpc,
  projectId,
  branchId,
  onBranchSegment,
  onCommitMarkdown,
  onRestoredRevision,
  onOpenRearrangeCanvas,
  onRegenerate,
  onUndoMerge,
}: {
  messageId: string;
  blockIndex: number;
  markdown: string;
  displayMarkdown?: string;
  renderMarkdown?: (markdown: string) => ReactNode;
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId?: string | null;
  branchId?: string | null;
  showBlocks?: boolean;
  onBranchSegment?: (quoteText: string) => void;
  onCommitMarkdown: (
    messageId: string,
    markdown: string,
    blockIndex: number,
    originalMarkdown: string,
    client?: RpcClient,
  ) => Promise<void>;
  onRestoredRevision?: () => Promise<void>;
  onOpenRearrangeCanvas?: (messageId: string, markdown: string, blockIndex: number) => void;
  onRegenerate?: () => void;
  onUndoMerge?: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(markdown);
  const [error, setError] = useState<string>();
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestServerMarkdown = useRef(markdown);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; version: number; sourceAction: string }>
  >([]);
  const [activeRevId, setActiveRevId] = useState<string | null>(null);

  useEffect(() => {
    latestServerMarkdown.current = markdown;
    setDraft(markdown);
  }, [markdown]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  async function loadRevisions() {
    try {
      const res = await rpc.projects.listMessageRevisions({ messageId });
      setRevisions(res.revisions);
      setActiveRevId(res.activeRevisionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load version history.");
    }
  }

  const save = useSave({
    save: (input: { draft: string; original: string }, client) =>
      onCommitMarkdown(messageId, input.draft, blockIndex, input.original, client),
    onSaved: async () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      if (historyOpen || revisions.length) await loadRevisions();
    },
  });

  function handleCanvasChange(nextMd: string) {
    setDraft(nextMd);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!nextMd.trim() || nextMd.trim() === latestServerMarkdown.current.trim()) return;
    debounceTimer.current = setTimeout(() => {
      setError(undefined);
      save.run({ draft: nextMd, original: latestServerMarkdown.current });
    }, 900);
  }

  const errorMessage = save.error?.message ?? error;
  const currentVersion =
    revisions.find((rev) => rev.id === activeRevId)?.version ?? revisions[0]?.version;

  return (
    <div className="min-w-0 w-full">
      {/* Always-live raw BlockNote surface (native `+` formatting & `⋮⋮` drag dots) */}
      <NotionBlockCanvas
        variant="raw"
        initialMarkdown={markdown}
        onChangeMarkdown={handleCanvasChange}
        onBranch={onBranchSegment}
        disabled={save.pending}
      />

      {errorMessage ? (
        <p role="alert" className="mt-1 px-7 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {/* Minimal inline action bar directly under the raw BlockNote response */}
      <div className="mt-1 flex flex-wrap items-center gap-1 px-7 text-muted-foreground">
        {onBranchSegment ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onBranchSegment(draft.trim() || markdown)}
            className="h-6 gap-1 px-1.5 text-[11px] text-success hover:text-success"
          >
            <GitBranch className="size-3" />
            <span>Branch</span>
          </Button>
        ) : null}
        {onRegenerate ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onRegenerate}
            className="h-6 gap-1 px-1.5 text-[11px] text-sky-400 hover:text-sky-300"
          >
            <RotateCw className="size-3" />
            <span>Regenerate</span>
          </Button>
        ) : null}
        {onOpenRearrangeCanvas ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onOpenRearrangeCanvas(messageId, draft || markdown, blockIndex)}
            className="h-6 gap-1 px-1.5 text-[11px]"
          >
            <Maximize2 className="size-3" />
            <span>Expand</span>
          </Button>
        ) : null}
        {projectId && branchId ? (
          <Popover
            open={historyOpen}
            onOpenChange={(open) => {
              setHistoryOpen(open);
              if (open) void loadRevisions();
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-6 gap-1 px-1.5 text-[11px]"
                />
              }
            >
              <History className="size-3" />
              <span>{currentVersion ? `v${currentVersion}` : "History"}</span>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" sideOffset={6} className="w-64 p-2">
              <div className="mb-1.5 px-1 text-xs font-semibold text-foreground">
                Version history
              </div>
              {revisions.length === 0 ? (
                <div className="px-1 py-2 text-xs text-muted-foreground">
                  Original version (v1). Drag, edit, or merge a branch to create v2.
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
                        <span>
                          v{rev.version} ·{" "}
                          <span className="text-[10px] text-muted-foreground">
                            {rev.sourceAction === "merge_apply"
                              ? "Merged"
                              : rev.sourceAction === "original"
                                ? "Original"
                                : "Edited"}
                          </span>
                        </span>
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
        ) : null}
        {onUndoMerge ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => void onUndoMerge()}
            className="h-6 gap-1 px-1.5 text-[11px] text-amber-400 hover:text-amber-300"
          >
            <Undo2 className="size-3" />
            <span>Undo</span>
          </Button>
        ) : null}
        {savedFlash ? (
          <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-success">
            <Check className="size-2.5" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
