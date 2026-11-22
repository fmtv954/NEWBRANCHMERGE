import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Bot, Branch, BranchContextMode, MergeSourceBlock, ModelPersona } from "@rakazo/contracts";
import { CLONE_SYSTEM_PERSONAS } from "@rakazo/contracts";
import { buildSmartSegments } from "@rakazo/core";
import {
  Button,
  Card,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@rakazo/ui-web";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  BookmarkPlus,
  Check,
  GitBranch,
  GitMerge,
  Loader2,
  Pencil,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useUnifiedModels } from "../../lib/models/use-unified-models";
import type { createSpaceRpc } from "../../lib/query/rpc";
import { PersonaPicker } from "./PersonaPicker";
import { SideBranchModelPicker } from "./SideBranchModelPicker";
import { hasMultipleSentences, splitMarkdownParagraph } from "./sentence-blocks";

export interface SideBranchMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  modelLabel?: string;
  createdAt?: string;
}

function focusRenameInput(input: HTMLInputElement | null) {
  input?.focus();
}

/**
 * Right-hand Split-Pane Side Branch (isolated branch.threadId in PostgreSQL):
 * - Durable conversation memory loaded via `rpc.branches.messages`
 * - Isolated LLM replies via `rpc.branches.send` (never pollutes Main!)
 * - Unified Frontier | Uncensored model picker (`SideBranchModelPicker`)
 * - Inline-editable branch name persisted via `rpc.branches.rename`
 * - 1-click Context toggle (`Full chat + focus` vs `Focus only`)
 * - 1-click quick actions (`Insert at spot`, `Replace spot`, `Drop as Block`) + full `Merge` modal
 */
export function SideBranchPane({
  rpc,
  branch,
  activeBot,
  initialFocusQuote,
  onOpenModelSettings,
  onRenameBranch,
  onInjectIntoMain,
  onOpenMergeReview,
  onClose,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  branch: Branch;
  activeBot?: Bot;
  initialFocusQuote?: string | null;
  onOpenModelSettings?: () => void;
  onRenameBranch?: (name: string) => void;
  onInjectIntoMain: (input: {
    mode: "insert_spot" | "replace_spot" | "drop_block";
    text: string;
    selectedBlocks?: MergeSourceBlock[];
    sourceBranchId: string;
  }) => Promise<void>;
  onOpenMergeReview: (selectedText?: string, selectedBlocks?: MergeSourceBlock[]) => void;
  onClose: () => void;
}) {
  const { defaultMainModelKey } = useUnifiedModels(activeBot);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(branch.name);
  const [contextMode, setContextMode] = useState<BranchContextMode>(
    branch.forkOrigin?.contextMode ?? "through_message",
  );
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (activeBot?.modelProvider && activeBot?.modelId) {
      return `${activeBot.modelProvider}:${activeBot.modelId}`;
    }
    if (branch.defaultModelProvider && branch.defaultModelId) {
      return `${branch.defaultModelProvider}:${branch.defaultModelId}`;
    }
    return defaultMainModelKey;
  });
  const [activePersona, setActivePersona] = useState<ModelPersona>(CLONE_SYSTEM_PERSONAS[0]!);
  const [responseStyle, setResponseStyle] = useState<"direct" | "balanced" | "deep">("direct");
  const [customTemp, setCustomTemp] = useState<number | null>(null);
  const [customMaxTokens, setCustomMaxTokens] = useState<number | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [messages, setMessages] = useState<SideBranchMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [injectingKey, setInjectingKey] = useState<string | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<MergeSourceBlock[]>([]);
  const [splitBlocks, setSplitBlocks] = useState<Record<string, MergeSourceBlock[]>>({});
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  function toggleSegmentSelection(block: MergeSourceBlock) {
    setSelectedSegments((current) =>
      current.some((item) => item.blockId === block.blockId)
        ? current.filter((item) => item.blockId !== block.blockId)
        : [...current, block],
    );
  }

  function splitBlock(block: MergeSourceBlock) {
    try {
      const parts = splitMarkdownParagraph(block.markdown);
      if (!parts.length) return;
      const replacements = parts.map((markdown, index) => ({
        ...block,
        blockId: `${block.blockId}:${index}`,
        markdown,
      }));
      setSplitBlocks((current) => ({ ...current, [block.blockId]: replacements }));
      setSelectedSegments((current) =>
        current.flatMap((item) => (item.blockId === block.blockId ? replacements : [item])),
      );
    } catch {
      setError("This block could not be split.");
    }
  }

  function moveSelection(index: number, direction: -1 | 1) {
    setSelectedSegments((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
  }

  const selectedText = selectedSegments.map((block) => block.markdown).join("\n\n");

  async function inject(
    mode: "insert_spot" | "replace_spot" | "drop_block",
    message: SideBranchMessage,
  ) {
    if (injectingKey) return;
    setInjectingKey(message.id);
    setError(null);
    try {
      await onInjectIntoMain({
        mode,
        text: selectedText || message.text,
        selectedBlocks: selectedSegments.length ? selectedSegments : undefined,
        sourceBranchId: branch.id,
      });
      setSelectedSegments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not insert into Main");
    } finally {
      setInjectingKey(null);
    }
  }

  // Keep Side Chat defaulted to Main's active model when opening a fresh branch.
  useEffect(() => {
    if (defaultMainModelKey) {
      setSelectedModel(defaultMainModelKey);
    }
  }, [branch.id, defaultMainModelKey]);

  const focusQuote = initialFocusQuote ?? branch.forkOrigin?.selectionRange?.quoteText ?? null;

  // Load persisted side-branch messages whenever switching or reopening a branch.
  useEffect(() => {
    let cancelled = false;
    setNameDraft(branch.name);
    setContextMode(branch.forkOrigin?.contextMode ?? "through_message");
    setLoadingHistory(true);
    setError(null);
    rpc.branches
      .messages({ branchId: branch.id })
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch((err) => {
        if (!cancelled) {
          setMessages([]);
          setError(err instanceof Error ? err.message : "Could not load branch history");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHistory(false);
          inputRef.current?.focus();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [branch.id, branch.name, branch.forkOrigin?.contextMode, rpc]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function commitRename() {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === branch.name) return;
    onRenameBranch?.(trimmed);
    try {
      await rpc.branches.rename({ branchId: branch.id, name: trimmed });
    } catch {
      // ignore transient rename failure
    }
  }

  async function handleSend() {
    const prompt = draft.trim();
    if (!prompt || sending) return;
    setDraft("");
    setError(null);
    const tempId = `temp_u_${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", text: prompt }]);
    setSending(true);
    try {
      const [provider = "openai", modelId = "gpt-4o-mini"] = (selectedModel || defaultMainModelKey).split(":");
      const res = await rpc.branches.send({
        branchId: branch.id,
        text: prompt,
        contextMode,
        provider,
        modelId,
        focusQuote: focusQuote ?? undefined,
        personaId: activePersona.id !== "default" ? activePersona.id : undefined,
        personaPrompt: activePersona.systemPrompt || undefined,
        responseStyle,
        temperature: customTemp ?? undefined,
        maxTokens: customMaxTokens ?? undefined,
      });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        res.userMessage,
        res.assistantMessage,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get branch reply");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const latestAssistantText =
    [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";

  return (
    <aside
      data-testid="side-branch-pane"
      className="flex h-full w-full flex-col border-l border-border bg-background/95 md:w-[46%] md:min-w-[360px] md:max-w-[540px]"
    >
      {/* Header: Inline-editable branch name + Context toggle + Merge + Close */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="size-4 shrink-0 text-success" />
          {editingName ? (
            <input
              type="text"
              value={nameDraft}
              ref={focusRenameInput}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
              }}
              className="h-6 w-44 rounded border border-ring bg-background px-1.5 text-xs font-medium text-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              title="Click to rename branch"
              className="group flex min-w-0 items-center gap-1 text-left text-xs font-semibold text-foreground hover:text-success"
            >
              <span className="truncate">{nameDraft}</span>
              <Pencil className="size-3 shrink-0 opacity-0 group-hover:opacity-70" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setContextMode((m) => (m === "through_message" ? "only_selection" : "through_message"))
            }
            title="Switch branch context scope"
            className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-muted/70 px-2 text-[10px] font-medium text-foreground hover:bg-muted"
          >
            <Sparkles className="size-2.5 text-sky-400" />
            <span>{contextMode === "only_selection" ? "Focus only" : "Full chat + focus"}</span>
          </button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenMergeReview(
                selectedText || latestAssistantText,
                selectedSegments.length ? selectedSegments : undefined,
              );
            }}
            className="h-6 gap-1 px-2 text-[11px] text-success"
          >
            <GitMerge className="size-3" />
            <span>
              {selectedSegments.length > 0 ? `Merge (${selectedSegments.length})` : "Merge"}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close side branch"
            onClick={onClose}
            className="size-6"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Pinned Focus Quote from Main */}
      {focusQuote ? (
        <div className="border-b border-border/70 bg-muted/40 px-3.5 py-2 text-xs">
          <p className="max-h-28 overflow-auto border-l-2 border-success/60 pl-2 text-foreground/90">
            “{focusQuote}”
          </p>
        </div>
      ) : null}

      {/* Side-Branch Transcript (Persisted on branch.threadId) */}
      <div className="rk-scroll flex-1 space-y-3 overflow-y-auto p-3.5">
        {loadingHistory ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Loading branch memory…</span>
          </div>
        ) : messages.length === 0 ? (
          <Card className="border-dashed border-border bg-card/40 p-3 text-xs text-muted-foreground">
            Ask a follow-up, then select the reply blocks you want to bring into Main.
          </Card>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`text-sm ${
                  msg.role === "user"
                    ? "max-w-[92%] rounded-2xl bg-primary px-3.5 py-2.5 text-primary-foreground"
                    : "w-full min-w-0 text-foreground"
                }`}
              >
                {msg.modelLabel ? (
                  <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                    {msg.modelLabel}
                  </div>
                ) : null}
                {msg.role === "assistant" ? (
                  <div className="space-y-1.5">
                    {buildSmartSegments(msg.text)
                      .flatMap((seg, index) => {
                        const blockId = `${msg.id}:${seg.id}:${index}`;
                        return (
                          splitBlocks[blockId]?.map((block) => ({ block, canSplit: false })) ?? [
                            {
                              block: { messageId: msg.id, blockId, markdown: seg.markdown },
                              canSplit:
                                seg.blockType === "paragraph" &&
                                hasMultipleSentences(seg.plainText),
                            },
                          ]
                        );
                      })
                      .map(({ block, canSplit }, index) => {
                        const checked = selectedSegments.some(
                          (item) => item.blockId === block.blockId,
                        );
                        return (
                          <div
                            key={block.blockId}
                            className={`flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 ${checked ? "ring-1 ring-success/60" : ""}`}
                          >
                            <Checkbox
                              checked={checked}
                              aria-label={`Select reply block ${index + 1}`}
                              onCheckedChange={() => toggleSegmentSelection(block)}
                              className="mt-1 shrink-0"
                            />
                            <div className="min-w-0 flex-1 text-xs leading-relaxed">
                              <ChatMarkdown>{block.markdown}</ChatMarkdown>
                            </div>
                            {canSplit ? (
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                title="Split into sentences"
                                aria-label={`Split reply block ${index + 1} into sentences`}
                                onClick={() => splitBlock(block)}
                              >
                                <Scissors className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                )}
              </div>

              {msg.role === "assistant" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(injectingKey)}
                    onClick={() => void inject("insert_spot", msg)}
                    className="h-6 gap-1 px-2 text-[10px] text-success"
                  >
                    <ArrowDownToLine className="size-3" />
                    <span>{selectedSegments.length ? "Insert selected" : "Insert at spot"}</span>
                  </Button>

                  {focusQuote ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={Boolean(injectingKey)}
                      onClick={() => void inject("replace_spot", msg)}
                      className="h-6 gap-1 px-2 text-[10px] text-sky-400"
                    >
                      <Check className="size-3" />
                      <span>
                        {selectedSegments.length ? "Replace with selected" : "Replace spot"}
                      </span>
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(injectingKey)}
                    onClick={() => void inject("drop_block", msg)}
                    className="h-6 gap-1 px-2 text-[10px]"
                  >
                    <BookmarkPlus className="size-3" />
                    <span>{selectedSegments.length ? "Append selected" : "Append reply"}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}

        {sending ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-success" />
            <span>Thinking on side branch…</span>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div ref={scrollEndRef} />
      </div>

      {selectedSegments.length > 0 ? (
        <div className="space-y-2 border-t border-border bg-card px-3.5 py-2 text-xs">
          <div className="font-medium">
            {selectedSegments.length} {selectedSegments.length === 1 ? "block" : "blocks"} selected
          </div>
          <ol className="rk-scroll max-h-36 space-y-1 overflow-y-auto">
            {selectedSegments.map((block, index) => (
              <li
                key={block.blockId}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate">{block.markdown}</span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Move selected block ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => moveSelection(index, -1)}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Move selected block ${index + 1} down`}
                  disabled={index === selectedSegments.length - 1}
                  onClick={() => moveSelection(index, 1)}
                >
                  <ArrowDown className="size-3" />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedSegments([])}
              className="h-6 px-2 text-[11px]"
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenMergeReview(selectedText, selectedSegments)}
              className="h-6 gap-1 bg-success px-2.5 text-[11px] text-white hover:bg-success/90"
            >
              <GitMerge className="size-3" />
              <span>Merge Selected</span>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Embedded Unified Model Picker + Persona Picker + Side-Branch Composer */}
      <div className="border-t border-border bg-card/40 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <SideBranchModelPicker
            activeBot={activeBot}
            value={selectedModel}
            onChange={setSelectedModel}
            onManageKeys={onOpenModelSettings}
          />
          <PersonaPicker
            selectedPersonaId={activePersona.id}
            onSelectPersona={setActivePersona}
          />
          <button
            type="button"
            onClick={() =>
              setResponseStyle((s) =>
                s === "direct" ? "balanced" : s === "balanced" ? "deep" : "direct",
              )
            }
            title="Response depth (click to cycle Direct / Balanced / Deep)"
            className="inline-flex h-7 items-center rounded-lg border border-border bg-card px-2 text-[10px] font-medium capitalize text-foreground hover:bg-muted"
          >
            {responseStyle}
          </button>
          <Popover open={paramsOpen} onOpenChange={setParamsOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title="Custom model parameters (Temperature & Max Tokens)"
                  aria-label="Model parameters"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground ${
                    customTemp !== null || customMaxTokens !== null ? "border-success/60 text-success" : ""
                  }`}
                />
              }
            >
              <SlidersHorizontal className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-64 space-y-3 rounded-xl border border-border bg-popover p-3 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Branch Parameters</span>
                <button
                  type="button"
                  onClick={() => {
                    setCustomTemp(null);
                    setCustomMaxTokens(null);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Reset to Auto
                </button>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Temperature</span>
                  <span className="font-mono text-foreground">
                    {customTemp !== null
                      ? customTemp.toFixed(2)
                      : responseStyle === "direct"
                        ? "Auto (0.25)"
                        : responseStyle === "balanced"
                          ? "Auto (0.50)"
                          : "Auto (0.70)"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={
                    customTemp ??
                    (responseStyle === "direct" ? 0.25 : responseStyle === "balanced" ? 0.5 : 0.7)
                  }
                  onChange={(e) => setCustomTemp(Number(e.target.value))}
                  className="w-full accent-success"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Max Tokens</span>
                  <span className="font-mono text-foreground">
                    {customMaxTokens !== null
                      ? customMaxTokens
                      : responseStyle === "direct"
                        ? "Auto (320)"
                        : responseStyle === "balanced"
                          ? "Auto (900)"
                          : "Auto (2400)"}
                  </span>
                </div>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  step={64}
                  placeholder="Auto"
                  value={customMaxTokens ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setCustomMaxTokens(v ? Math.max(64, Math.min(8192, Number(v))) : null);
                  }}
                  className="h-7 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-2.5 py-2 focus-within:border-ring">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask about this selection on the side..."
            className="max-h-28 flex-1 resize-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="button"
            size="icon-sm"
            disabled={!draft.trim() || sending}
            onClick={() => void handleSend()}
            aria-label="Send side-branch message"
            className="size-7 shrink-0 rounded-full"
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
