import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Bot } from "@rakazo/contracts";
import { buildSmartSegments, computeWordDiff } from "@rakazo/core";
import { Badge, Button, Checkbox, Dialog, DialogContent, Textarea } from "@rakazo/ui-web";
import {
  Award,
  Check,
  Columns3,
  Film,
  Flame,
  GitCompare,
  Image as ImageIcon,
  Layers,
  Loader2,
  Play,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useUnifiedModels } from "../../lib/models/use-unified-models";
import type { createSpaceRpc } from "../../lib/query/rpc";

type CompareModality = "text" | "image" | "video";

interface TextCompareResult {
  provider: string;
  modelId: string;
  displayName: string;
  modelLabel: string;
  text: string;
  latencyMs: number;
}

interface MediaCompareResult {
  provider: string;
  modelId: string;
  displayName: string;
  url: string | null;
  error?: string;
  latencyMs: number;
}

interface JudgeVerdict {
  winnerIndex: number;
  summary: string;
  differences?: string[];
  scores: Array<{ index: number; score: number; rationale: string }>;
}

/**
 * CLONE Multi-Modal Compare Models Arena (Text | Image | Video):
 * - Fire 1 prompt to 2–4 Frontier & Uncensored models in parallel
 * - Text: AI Judge (scores + rationale), Diff vs #1 toggle, Smart-Segmented Answer Board -> Notion Canvas
 * - Image & Video: Side-by-side visual grid via live `rpc.media.generate`
 */
export function CompareModelsArena({
  open,
  onOpenChange,
  rpc,
  activeBot,
  threadId,
  onUseWinnerText,
  onAssembleInCanvas,
  onOpenStudio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rpc: ReturnType<typeof createSpaceRpc>;
  activeBot?: Bot;
  threadId?: string | null;
  onUseWinnerText: (text: string) => Promise<void> | void;
  onAssembleInCanvas: (combinedMarkdown: string) => void;
  onOpenStudio?: () => void;
}) {
  const { allRows } = useUnifiedModels(activeBot);
  const [modality, setModality] = useState<CompareModality>("text");
  const [prompt, setPrompt] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [judging, setJudging] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [textResults, setTextResults] = useState<TextCompareResult[]>([]);
  const [mediaResults, setMediaResults] = useState<MediaCompareResult[]>([]);
  const [verdict, setVerdict] = useState<JudgeVerdict | null>(null);
  const [pickedSegments, setPickedSegments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const modalityModels = useMemo(
    () => allRows.filter((r) => r.kind === modality),
    [allRows, modality],
  );

  // Auto-pick top 2 models for the active modality if user hasn't picked yet
  const activeKeys = useMemo(() => {
    const valid = selectedKeys.filter((k) => modalityModels.some((m) => m.key === k));
    if (valid.length >= 2) return valid;
    return modalityModels.slice(0, 2).map((m) => m.key);
  }, [selectedKeys, modalityModels]);

  function toggleModelKey(key: string) {
    setSelectedKeys((prev) => {
      const base = prev.filter((k) => modalityModels.some((m) => m.key === k));
      const effective = base.length >= 2 ? base : activeKeys;
      if (effective.includes(key)) {
        if (effective.length <= 2) return effective;
        return effective.filter((k) => k !== key);
      }
      if (effective.length >= 4) return [...effective.slice(1), key];
      return [...effective, key];
    });
  }

  function toggleSegment(segKey: string, md: string) {
    setPickedSegments((prev) => {
      const next = { ...prev };
      if (next[segKey]) delete next[segKey];
      else next[segKey] = md;
      return next;
    });
  }

  async function handleRunCompare() {
    const q = prompt.trim();
    if (!q || running) return;
    const chosen = activeKeys
      .map((k) => modalityModels.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    if (chosen.length < 2) return;

    setRunning(true);
    setError(null);
    setVerdict(null);
    setPickedSegments({});

    try {
      if (modality === "text") {
        setMediaResults([]);
        const res = await rpc.branches.compareRun({
          prompt: q,
          models: chosen.map((m) => ({
            provider: m.provider,
            modelId: m.modelId,
            displayName: m.displayName,
          })),
        });
        setTextResults(res.results);
      } else {
        setTextResults([]);
        const results = await Promise.all(
          chosen.map(async (m) => {
            const started = Date.now();
            try {
              const res = await rpc.media.generate({
                threadId: threadId ?? undefined,
                provider: m.provider as
                  | "openai"
                  | "xai"
                  | "fal"
                  | "uncensoredllm"
                  | "refuseless"
                  | "venice"
                  | "higgsfield",
                modelId: m.modelId,
                kind: modality === "video" ? "video_gen" : "image_gen",
                prompt: q,
              });
              const firstUrl =
                ("url" in res && typeof res.url === "string" ? res.url : null) ??
                ("urls" in res && Array.isArray(res.urls) && typeof res.urls[0] === "string"
                  ? res.urls[0]
                  : null);
              return {
                provider: m.provider,
                modelId: m.modelId,
                displayName: m.displayName,
                url: firstUrl,
                latencyMs: Date.now() - started,
              };
            } catch (err) {
              return {
                provider: m.provider,
                modelId: m.modelId,
                displayName: m.displayName,
                url: null,
                error: err instanceof Error ? err.message : "Generation failed",
                latencyMs: Date.now() - started,
              };
            }
          }),
        );
        setMediaResults(results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compare run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleRunJudge() {
    if (textResults.length < 2 || judging) return;
    setJudging(true);
    try {
      const res = await rpc.branches.judgeCompare({
        prompt: prompt.trim(),
        candidates: textResults.map((r) => ({ modelLabel: r.displayName, text: r.text })),
      });
      setVerdict(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Judge failed");
    } finally {
      setJudging(false);
    }
  }

  const pickedList = Object.values(pickedSegments);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[92vw] max-w-[92vw] flex-col overflow-hidden border border-border bg-card p-0 text-foreground">
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Columns3 className="size-4 text-success" />
            <h2 className="text-base font-semibold">Multi-Modal Compare Arena</h2>
            <div className="ml-2 inline-flex rounded-lg border border-border bg-muted/60 p-0.5">
              {(
                [
                  { id: "text", label: "Text", icon: Sparkles },
                  { id: "image", label: "Image", icon: ImageIcon },
                  { id: "video", label: "Video", icon: Film },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setModality(id);
                    setTextResults([]);
                    setMediaResults([]);
                    setVerdict(null);
                    setPickedSegments({});
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    modality === id
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
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

        {/* Prompt + Model Chips Bar */}
        <div className="shrink-0 space-y-2.5 border-b border-border bg-muted/20 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">
              Pick 2–4 models:
            </span>
            {modalityModels.slice(0, 14).map((m) => {
              const selected = activeKeys.includes(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleModelKey(m.key)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    selected
                      ? "border-success/70 bg-success/15 text-success"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.isUncensored ? <Flame className="size-2.5 text-rose-400" /> : null}
                  <span>{m.displayName}</span>
                  <span className="text-[9px] opacity-70">{m.costLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                modality === "text"
                  ? "Enter one prompt to run across all selected models in parallel..."
                  : `Describe the ${modality} you want to compare across all selected models...`
              }
              className="flex-1 text-xs"
            />
            <Button
              type="button"
              disabled={!prompt.trim() || running || activeKeys.length < 2}
              onClick={() => void handleRunCompare()}
              className="h-10 gap-1.5 bg-success px-4 text-xs text-white hover:bg-success/90"
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              <span>Compare ({activeKeys.length})</span>
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        {/* Judge & Comparative Difference Analysis Banner (Text Mode) */}
        {verdict ? (
          <div className="shrink-0 space-y-1.5 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <strong className="text-amber-300">
                  AI Analysis Winner: {textResults[verdict.winnerIndex]?.displayName}
                </strong>
                <span className="ml-2 text-foreground/90">{verdict.summary}</span>
              </div>
            </div>
            {verdict.differences && verdict.differences.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-6 text-[11px] text-amber-100/90">
                {verdict.differences.map((diff, idx) => (
                  <li key={idx}>{diff}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Results Grid */}
        <div className="rk-scroll min-h-0 flex-1 overflow-y-auto p-5">
          {running ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-success" />
              <span>Running {activeKeys.length} models in parallel…</span>
            </div>
          ) : modality === "text" && textResults.length > 0 ? (
            <div className="space-y-3">
              {/* Action bar: Judge + Diff + Answer Board */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={judging}
                    onClick={() => void handleRunJudge()}
                    className="h-7 gap-1.5 text-xs"
                  >
                    {judging ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Award className="size-3.5 text-amber-400" />
                    )}
                    <span>AI Analysis & Differences</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={showDiff ? "default" : "outline"}
                    onClick={() => setShowDiff((v) => !v)}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <GitCompare className="size-3.5" />
                    <span>Diff vs #1</span>
                  </Button>
                </div>

                {pickedList.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onAssembleInCanvas(pickedList.join("\n\n"));
                      onOpenChange(false);
                    }}
                    className="h-7 gap-1.5 bg-success text-xs text-white hover:bg-success/90"
                  >
                    <Layers className="size-3.5" />
                    <span>Assemble {pickedList.length} Picked Segments in Notion Canvas</span>
                  </Button>
                ) : null}
              </div>

              <div
                className={`grid gap-4 ${
                  textResults.length >= 3 ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
                }`}
              >
                {textResults.map((res, idx) => {
                  const judgeScore = verdict?.scores.find((s) => s.index === idx);
                  const isWinner = verdict?.winnerIndex === idx;
                  const baseText = textResults[0]?.text ?? "";
                  return (
                    <div
                      key={`${res.provider}:${res.modelId}:${idx}`}
                      className={`flex flex-col rounded-xl border bg-background/60 p-3.5 ${
                        isWinner ? "border-amber-400/70 ring-1 ring-amber-400/30" : "border-border"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <span className="truncate">{res.displayName}</span>
                            {isWinner ? (
                              <Badge className="bg-amber-500/20 text-[10px] text-amber-300">
                                Winner
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {(res.latencyMs / 1000).toFixed(1)}s · {res.modelLabel}
                          </div>
                        </div>
                        {judgeScore ? (
                          <Badge variant="outline" className="text-xs font-semibold text-amber-300">
                            {judgeScore.score}/10
                          </Badge>
                        ) : null}
                      </div>

                      {judgeScore?.rationale ? (
                        <p className="mb-2 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200/90">
                          {judgeScore.rationale}
                        </p>
                      ) : null}

                      <div className="flex-1 space-y-1.5 text-xs">
                        {showDiff && idx > 0 ? (
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {computeWordDiff(baseText, res.text).map((tok, tIdx) => (
                              <span
                                key={tIdx}
                                className={
                                  tok.kind === "added"
                                    ? "rounded bg-success/20 px-0.5 text-success"
                                    : tok.kind === "removed"
                                      ? "rounded bg-rose-500/20 px-0.5 text-rose-300 line-through"
                                      : undefined
                                }
                              >
                                {tok.text}
                              </span>
                            ))}
                          </div>
                        ) : (
                          buildSmartSegments(res.text).map((seg, sIdx) => {
                            const segKey = `cmp_${idx}_${sIdx}`;
                            const checked = Boolean(pickedSegments[segKey]);
                            return (
                              <div
                                key={segKey}
                                onClick={() => toggleSegment(segKey, seg.markdown)}
                                className={`flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 transition-colors ${
                                  checked
                                    ? "bg-success/15 ring-1 ring-success/50"
                                    : "hover:bg-muted/50"
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleSegment(segKey, seg.markdown)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <ChatMarkdown>{seg.markdown}</ChatMarkdown>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-border/60 pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await onUseWinnerText(res.text);
                            onOpenChange(false);
                          }}
                          className="h-7 gap-1 text-xs text-success"
                        >
                          <Check className="size-3" />
                          <span>Use Winner in Main</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : mediaResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {mediaResults.map((res, idx) => (
                <div
                  key={`${res.provider}:${res.modelId}:${idx}`}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-background/60"
                >
                  <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2">
                    <span className="text-xs font-semibold text-foreground">{res.displayName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(res.latencyMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex min-h-56 flex-1 items-center justify-center bg-black/40 p-2">
                    {res.url ? (
                      modality === "video" ? (
                        <video
                          src={res.url}
                          controls
                          loop
                          className="max-h-72 w-full rounded-lg object-contain"
                        />
                      ) : (
                        <img
                          src={res.url}
                          alt={res.displayName}
                          className="max-h-72 w-full rounded-lg object-contain"
                        />
                      )
                    ) : (
                      <p className="px-4 text-center text-xs text-destructive">
                        {res.error ?? "No media returned"}
                      </p>
                    )}
                  </div>
                  {res.url ? (
                    <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2">
                      {onOpenStudio ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            onOpenStudio();
                            onOpenChange(false);
                          }}
                          className="h-7 text-xs"
                        >
                          Open Studio
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await onUseWinnerText(
                            modality === "image"
                              ? `![${res.displayName}](${res.url})`
                              : `[${res.displayName} Video](${res.url})`,
                          );
                          onOpenChange(false);
                        }}
                        className="h-7 gap-1 text-xs text-success"
                      >
                        <Check className="size-3" />
                        <span>Keep Winner</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                Pick 2–4 {modality} models above and enter a prompt to compare side-by-side.
              </p>
              <p>
                {modality === "text"
                  ? "Use AI Judge to score responses, toggle Diff vs #1, or check segments across models to assemble a hybrid answer in Notion Canvas."
                  : `Generates live ${modality} takes in parallel across Frontier and Uncensored providers.`}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
