import { Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { Check, GitBranch, History, Maximize2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useSave } from "../../lib/query/query";
import type { createSpaceRpc, RpcClient } from "../../lib/query/rpc";
import { NotionBlockCanvas } from "./NotionBlockCanvas";

export interface CanvasSelectionAnchor {
  startUtf16: number;
  endUtf16: number;
}

function draftStorageKey(messageId: string): string {
  return `clone:canvas-draft:${messageId}`;
}

function readStoredDraft(messageId: string): { draft: string; original: string } | null {
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(messageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: unknown; original?: unknown };
    if (typeof parsed.draft === "string" && typeof parsed.original === "string") {
      return { draft: parsed.draft, original: parsed.original };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeStoredDraft(messageId: string, value: { draft: string; original: string } | null) {
  try {
    if (!value) window.sessionStorage.removeItem(draftStorageKey(messageId));
    else window.sessionStorage.setItem(draftStorageKey(messageId), JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

/**
 * Resolve the N-th occurrence of selected plain text (supporting bold/italic/code/emoji)
 * back to its exact UTF-16 [startUtf16, endUtf16] range in the raw Markdown string.
 */
function resolveSelectionAnchorInMarkdown(
  container: HTMLElement | null,
  fullMarkdown: string,
): { quoteText: string; anchor: CanvasSelectionAnchor } | null {
  if (!container) return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const quoteText = sel.toString().trim();
  if (!quoteText) return null;

  // Count how many times quoteText appears in the rendered plain text BEFORE this selection.
  let occurrenceIdx = 0;
  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const beforePlain = preRange.toString();
    let searchFrom = 0;
    while (true) {
      const hit = beforePlain.indexOf(quoteText, searchFrom);
      if (hit < 0) break;
      occurrenceIdx++;
      searchFrom = hit + Math.max(1, quoteText.length);
    }
  } catch {
    occurrenceIdx = 0;
  }

  // First try exact literal occurrences in fullMarkdown.
  let pos = 0;
  let seen = 0;
  while (pos <= fullMarkdown.length) {
    const idx = fullMarkdown.indexOf(quoteText, pos);
    if (idx < 0) break;
    if (seen === occurrenceIdx) {
      return { quoteText, anchor: { startUtf16: idx, endUtf16: idx + quoteText.length } };
    }
    seen++;
    pos = idx + Math.max(1, quoteText.length);
  }

  // Fallback: map Markdown-stripped characters back to raw Markdown UTF-16 indices so
  // formatted selections like "**Review** 🧭 this" still resolve their exact N-th occurrence.
  const strippedChars: string[] = [];
  const rawIndices: number[] = [];
  for (let i = 0; i < fullMarkdown.length; i++) {
    const ch = fullMarkdown[i]!;
    if (ch === "*" || ch === "_" || ch === "`" || ch === "~") continue;
    strippedChars.push(ch);
    rawIndices.push(i);
  }
  const stripped = strippedChars.join("");
  const normQuote = quoteText.replace(/\s+/g, " ");
  const normStripped = stripped.replace(/\s+/g, " ");
  let sPos = 0;
  let sSeen = 0;
  while (sPos <= stripped.length) {
    const hit = stripped.indexOf(quoteText, sPos);
    if (hit < 0) break;
    if (sSeen === occurrenceIdx) {
      const startUtf16 = rawIndices[hit] ?? 0;
      const endCharIdx = Math.min(rawIndices.length - 1, hit + quoteText.length - 1);
      const endUtf16 = (rawIndices[endCharIdx] ?? startUtf16) + 1;
      return { quoteText, anchor: { startUtf16, endUtf16 } };
    }
    sSeen++;
    sPos = hit + Math.max(1, quoteText.length);
  }
  const looseIdx = normStripped.indexOf(normQuote);
  if (looseIdx >= 0) {
    const startUtf16 = rawIndices[Math.min(rawIndices.length - 1, looseIdx)] ?? 0;
    const endUtf16 = Math.min(fullMarkdown.length, startUtf16 + quoteText.length);
    return { quoteText, anchor: { startUtf16, endUtf16 } };
  }
  return { quoteText, anchor: { startUtf16: 0, endUtf16: quoteText.length } };
}

/**
 * Always-live Raw BlockNote response canvas for Main Chat:
 * - No card wrapper, no "Edit blocks" button — responses render directly in raw BlockNote
 * - Native BlockNote `+` formatting menu & `⋮⋮` drag handles right in the left gutter
 * - Auto-saves edits/drags smoothly after a short debounce + flushes on unmount/navigation
 * - Exact selection-aware Branch + Regenerate | Expand Canvas | History (vN) | Undo
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
  onBranchSegment?: (quoteText: string, anchor?: CanvasSelectionAnchor) => void;
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
  const [draft, setDraft] = useState(() => {
    const recovered = readStoredDraft(messageId);
    return recovered && recovered.original === markdown ? recovered.draft : markdown;
  });
  const [error, setError] = useState<string>();
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeSelection, setActiveSelection] = useState<{
    quoteText: string;
    anchor: CanvasSelectionAnchor;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestServerMarkdown = useRef(markdown);
  const pendingDraftRef = useRef<{ draft: string; original: string } | null>(null);
  const onCommitRef = useRef(onCommitMarkdown);
  onCommitRef.current = onCommitMarkdown;
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; version: number; sourceAction: string }>
  >([]);
  const [activeRevId, setActiveRevId] = useState<string | null>(null);

  const flushPendingDraft = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const pending = pendingDraftRef.current;
    if (!pending) return;
    pendingDraftRef.current = null;
    void onCommitRef
      .current(messageId, pending.draft, blockIndex, pending.original, rpcRef.current)
      .then(() => {
        writeStoredDraft(messageId, null);
      })
      .catch(() => {
        // Keep sessionStorage recovery draft intact if network flush failed
      });
  };

  useEffect(() => {
    latestServerMarkdown.current = markdown;
    const recovered = readStoredDraft(messageId);
    if (
      recovered &&
      recovered.original === markdown &&
      recovered.draft.trim() !== markdown.trim()
    ) {
      setDraft(recovered.draft);
      pendingDraftRef.current = recovered;
      flushPendingDraft();
      return;
    }
    if (recovered && recovered.draft.trim() === markdown.trim()) {
      writeStoredDraft(messageId, null);
    }
    setDraft(markdown);
  }, [markdown, messageId]);

  useEffect(() => {
    const onBeforeUnload = () => flushPendingDraft();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushPendingDraft();
    };
  }, [messageId, blockIndex]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const captured = resolveSelectionAnchorInMarkdown(
        containerRef.current,
        draft || latestServerMarkdown.current,
      );
      if (captured) setActiveSelection(captured);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [draft]);

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
      pendingDraftRef.current = null;
      writeStoredDraft(messageId, null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      if (historyOpen || revisions.length) await loadRevisions();
    },
  });

  function handleCanvasChange(nextMd: string) {
    setDraft(nextMd);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!nextMd.trim() || nextMd.trim() === latestServerMarkdown.current.trim()) {
      pendingDraftRef.current = null;
      writeStoredDraft(messageId, null);
      return;
    }
    const nextPending = { draft: nextMd, original: latestServerMarkdown.current };
    pendingDraftRef.current = nextPending;
    writeStoredDraft(messageId, nextPending);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      setError(undefined);
      save.run(nextPending);
    }, 900);
  }

  const errorMessage = save.error?.message ?? error;
  const currentVersion =
    revisions.find((rev) => rev.id === activeRevId)?.version ?? revisions[0]?.version;

  return (
    <div ref={containerRef} className="min-w-0 w-full">
      {/* Always-live raw BlockNote surface (native `+` formatting & `⋮⋮` drag dots) */}
      <NotionBlockCanvas
        variant="raw"
        initialMarkdown={draft}
        onChangeMarkdown={handleCanvasChange}
        onBranch={
          onBranchSegment
            ? (quote) => {
                flushPendingDraft();
                const captured = resolveSelectionAnchorInMarkdown(
                  containerRef.current,
                  draft || markdown,
                );
                onBranchSegment(captured?.quoteText || quote, captured?.anchor);
              }
            : undefined
        }
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
            onMouseDown={(e) => {
              // Capture selection BEFORE button focus collapses DOM selection
              const captured = resolveSelectionAnchorInMarkdown(
                containerRef.current,
                draft || markdown,
              );
              if (captured) {
                e.preventDefault();
                setActiveSelection(captured);
              }
            }}
            onClick={() => {
              flushPendingDraft();
              const live =
                resolveSelectionAnchorInMarkdown(containerRef.current, draft || markdown) ??
                activeSelection;
              if (live) {
                onBranchSegment(live.quoteText, live.anchor);
                setActiveSelection(null);
              } else {
                onBranchSegment(draft.trim() || markdown);
              }
            }}
            className="h-6 gap-1 px-1.5 text-[11px] text-success hover:text-success"
          >
            <GitBranch className="size-3" />
            <span>{activeSelection ? "Branch selection" : "Branch"}</span>
          </Button>
        ) : null}
        {onRegenerate ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              flushPendingDraft();
              onRegenerate();
            }}
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
                              : rev.sourceAction === "regenerate"
                                ? "Regenerated"
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
