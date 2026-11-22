import { buildSmartSegments } from "@rakazo/core";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { History, Maximize2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSave } from "../../lib/query/query";
import type { createSpaceRpc, RpcClient } from "../../lib/query/rpc";
import { NotionBlockCanvas } from "./NotionBlockCanvas";

export function InlineMessageCanvas({
  messageId,
  blockIndex,
  markdown,
  displayMarkdown,
  renderMarkdown,
  rpc,
  projectId,
  branchId,
  showBlocks,
  onBranchSegment,
  onCommitMarkdown,
  onRestoredRevision,
  onOpenRearrangeCanvas,
}: {
  messageId: string;
  blockIndex: number;
  markdown: string;
  displayMarkdown: string;
  renderMarkdown: (markdown: string) => ReactNode;
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
}) {
  const [original, setOriginal] = useState<string>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const editing = original !== undefined;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; version: number; sourceAction: string }>
  >([]);
  const [activeRevId, setActiveRevId] = useState<string | null>(null);

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
      setOriginal(undefined);
      if (historyOpen || revisions.length) await loadRevisions();
    },
  });
  const errorMessage = save.error?.message ?? error;

  const currentVersion =
    revisions.find((rev) => rev.id === activeRevId)?.version ?? revisions[0]?.version;

  return (
    <div className="min-w-0">
      {editing ? (
        <div data-canvas-editing className="rounded-lg border border-border">
          <NotionBlockCanvas
            initialMarkdown={original}
            onChangeMarkdown={setDraft}
            onBranch={draft === original ? onBranchSegment : undefined}
            disabled={save.pending}
          />
          <div className="flex justify-end gap-2 border-t border-border px-2 py-2">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={save.pending}
              onClick={() => {
                setOriginal(undefined);
                setError(undefined);
                save.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={save.pending || !draft.trim() || draft === original}
              onClick={() => {
                if (original === undefined) return;
                setError(undefined);
                save.run({ draft, original });
              }}
            >
              Save canvas
            </Button>
          </div>
        </div>
      ) : showBlocks ? (
        <div className="space-y-2">
          {buildSmartSegments(displayMarkdown).map((block) => (
            <div key={block.id} className="rounded-lg border border-border px-3 py-2">
              {renderMarkdown(block.markdown)}
            </div>
          ))}
        </div>
      ) : (
        renderMarkdown(displayMarkdown)
      )}
      {errorMessage ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={editing}
          onClick={() => {
            setOriginal(markdown);
            setDraft(markdown);
            setError(undefined);
          }}
        >
          Edit blocks
        </Button>
        {onOpenRearrangeCanvas && !editing ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Expand canvas"
            title="Expand canvas"
            onClick={() => onOpenRearrangeCanvas(messageId, markdown, blockIndex)}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        ) : null}
        {projectId && branchId ? (
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
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                          <div className="flex items-center gap-1.5 font-medium">
                            <span>v{rev.version}</span>
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
                            disabled={editing}
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
      </div>
    </div>
  );
}
