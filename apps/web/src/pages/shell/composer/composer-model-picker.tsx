import { useLingui } from "@lingui/react/macro";
import {
  type Bot,
  CLONE_MODEL_CATALOG,
  formatModelCostEstimate,
  getModelGuideMeta,
  type ModelQualityTier,
  resolveModelBrand,
  type ThinkingLevel,
} from "@rakazo/contracts";
import { botModelPick, botModelState, modelOptionKey } from "@rakazo/core";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Flame,
  KeyRound,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import { thinkingLevelLabel } from "../../../lib/models/model-catalog";
import { useSave, useSpaceQueries } from "../../../lib/query/query";
import { errorText } from "../../../lib/query/user-error";

export interface SelectedMediaModel {
  provider: string;
  modelId: string;
  displayName: string;
  kind: "image" | "video";
  isUncensored: boolean;
}

type PickerTab = "frontier" | "uncensored";
type ModalitySubFilter = "all" | "text" | "image" | "video";

interface UnifiedModelRow {
  key: string;
  provider: string;
  modelId: string;
  displayName: string;
  brand: string;
  routeLabel: string;
  costLabel: string;
  kind: "text" | "image" | "video";
  qualityTier: ModelQualityTier;
  qualityRank: number;
  tierLabel: string;
  useNote: string;
  isUncensored: boolean;
  status: "connected" | "env_key" | "needs_key";
  saveKey?: string;
}

interface SmartBrandGroup {
  brand: string;
  bestRank: number;
  showHeader: boolean;
  rows: UnifiedModelRow[];
}

const STAR_COLOR_BY_TIER: Record<ModelQualityTier, string> = {
  flagship: "text-amber-400 fill-amber-400",
  reasoning_coding: "text-sky-400 fill-sky-400",
  cinema_media: "text-purple-400 fill-purple-400",
  fast_daily: "text-emerald-400 fill-emerald-400",
  uncensored: "text-rose-500 fill-rose-500",
};

const TIER_BADGE_CLASS: Record<ModelQualityTier, string> = {
  flagship: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  reasoning_coding: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  cinema_media: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  fast_daily: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  uncensored: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const MODALITY_TAG_LABEL: Record<"text" | "image" | "video", string> = {
  text: "Text",
  image: "Image",
  video: "Video",
};

const STATUS_ORDER = { connected: 0, env_key: 1, needs_key: 2 } as const;

function sortRowsByQuality(rows: UnifiedModelRow[]): UnifiedModelRow[] {
  return [...rows].sort((a, b) => {
    if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Smart Brand Grouping:
 * - Groups models by Brand (OpenAI, xAI / Grok, Anthropic, Google, ByteDance, Kling, Qwen, etc.)
 * - Orders brands by their highest-quality model (`bestRank` ascending)
 * - Orders models within each brand from best quality on top down to lighter/faster models
 * - Only renders a Brand Header when 2+ models exist in that brand (`showHeader: rows.length > 1`);
 *   single-model brands list cleanly without a redundant header.
 */
function groupBySmartBrand(rows: UnifiedModelRow[]): SmartBrandGroup[] {
  const byBrand = new Map<string, UnifiedModelRow[]>();
  for (const row of rows) {
    const existing = byBrand.get(row.brand);
    if (existing) existing.push(row);
    else byBrand.set(row.brand, [row]);
  }

  const groups: SmartBrandGroup[] = [];
  for (const [brand, groupRows] of byBrand.entries()) {
    const sorted = sortRowsByQuality(groupRows);
    const bestRank = sorted[0]?.qualityRank ?? 99;
    groups.push({
      brand,
      bestRank,
      showHeader: sorted.length > 1,
      rows: sorted,
    });
  }

  return groups.sort((a, b) => {
    // Keep multi-model flagship brands & highest-quality models at the top
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    if (a.showHeader !== b.showHeader) return a.showHeader ? -1 : 1;
    return a.brand.localeCompare(b.brand);
  });
}

/**
 * Single unified model picker popover integrated directly inside the chat input.
 * Organizes Text, Image, Video, and Uncensored models with Smart Brand Grouping,
 * highest-to-lowest quality ordering, per-model cost estimates, color-coded stars,
 * real doc-backed 1-line use notes, live connection dots, and a direct "Manage API Keys" footer.
 */
export function ComposerModelPicker({
  bot,
  disabled,
  onSaved,
  onConnect,
  activeMediaModel,
  onSelectMediaModel,
}: {
  bot: Bot;
  disabled?: boolean;
  onSaved: (bot: Bot) => void;
  /** Opens Settings -> Models & API Keys directly. */
  onConnect: () => void;
  activeMediaModel?: SelectedMediaModel | null;
  onSelectMediaModel?: (model: SelectedMediaModel | null) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("frontier");
  const [modalityFilter, setModalityFilter] = useState<ModalitySubFilter>("all");
  const [query, setQuery] = useState("");
  const queries = useSpaceQueries();
  const credentials = useQuery(queries.models.credentials.queryOptions()).data;
  const catalog = useQuery(queries.models.list.queryOptions()).data;
  const me = useQuery(queries.me.queryOptions()).data;

  const onFailed = (error: Error) => toast.error(errorText(error, t`Could not change the model`));
  const saveModel = useSave({
    save: (key: string, client) => client.bots.update({ botId: bot.id, ...botModelPick(key) }),
    stale: [queries.bots.list.key()],
    onSaved,
    onFailed,
  });
  const saveThinking = useSave({
    save: (level: ThinkingLevel | null, client) =>
      client.bots.update({ botId: bot.id, thinkingLevel: level }),
    stale: [queries.bots.list.key()],
    onSaved,
    onFailed,
  });

  const savedKey =
    bot.modelProvider && bot.modelId ? modelOptionKey(bot.modelProvider, bot.modelId) : "";
  const pendingModel = saveModel.pending ? saveModel.input : undefined;
  const modelPending = pendingModel !== undefined;

  const state = useMemo(() => {
    if (!credentials || !catalog || !me) return null;
    return botModelState({
      credentials,
      catalog,
      me,
      modelKey: pendingModel ?? savedKey,
      spaceDefaultLabel: t`Space default`,
    });
  }, [credentials, catalog, me, pendingModel, savedKey, t]);

  const { connectedProviders, subscriptionProviders } = useMemo(() => {
    const connected = new Set<string>();
    const subs = new Set<string>();
    for (const cred of credentials ?? []) {
      const prov = cred.provider.toLowerCase();
      if (cred.hasKey || cred.accountId) {
        connected.add(prov);
        if (prov.startsWith("openai")) connected.add("openai");
      }
      if (cred.accountId) {
        subs.add(prov);
      }
    }
    return { connectedProviders: connected, subscriptionProviders: subs };
  }, [credentials]);

  const allRows = useMemo<UnifiedModelRow[]>(() => {
    const map = new Map<string, UnifiedModelRow>();

    // 1. Connected / runnable text models from Rakazo's live botModelState
    for (const choice of state?.choices ?? []) {
      if (!choice.key) continue;
      const picked = botModelPick(choice.key);
      const provider = picked.modelProvider ?? "openai";
      const modelId = picked.modelId ?? choice.key;
      const meta = getModelGuideMeta(provider, modelId);
      const { brand, routeLabel } = resolveModelBrand(provider, modelId);
      const isSub =
        subscriptionProviders.has(provider.toLowerCase()) ||
        provider.toLowerCase() === "openai-codex";
      const uniqueKey = `${provider}:${modelId}`;
      map.set(uniqueKey, {
        key: uniqueKey,
        provider,
        modelId,
        displayName: choice.label,
        brand,
        routeLabel,
        costLabel: formatModelCostEstimate({ isSubscription: isSub }),
        kind: "text",
        qualityTier: meta.qualityTier,
        qualityRank: meta.qualityRank,
        tierLabel: meta.tierLabel,
        useNote: meta.useNote,
        isUncensored: meta.isUncensored,
        status: "connected",
        saveKey: choice.key,
      });
    }

    // 2. Full CLONE catalog (Text, Image, Video, Uncensored)
    for (const entry of CLONE_MODEL_CATALOG) {
      if (entry.evalOnly) continue;
      const uniqueKey = `${entry.provider}:${entry.modelId}`;
      const meta = getModelGuideMeta(entry.provider, entry.modelId, entry.weightVariant);
      const { brand, routeLabel } = resolveModelBrand(entry.provider, entry.modelId);
      const kind: "text" | "image" | "video" = entry.modalities.includes("video_gen")
        ? "video"
        : entry.modalities.includes("image_gen") || entry.modalities.includes("image_edit")
          ? "image"
          : "text";

      const isConnected = connectedProviders.has(entry.provider.toLowerCase());
      const isSub = subscriptionProviders.has(entry.provider.toLowerCase());
      const hasEnv =
        entry.verificationStatus === "live_tested" ||
        entry.verificationStatus === "credential_connected";

      const costLabel = formatModelCostEstimate({
        billingUnit: entry.billingUnit,
        inputPriceMicros: entry.inputPriceMicros,
        outputPriceMicros: entry.outputPriceMicros,
        isSubscription: isSub && kind === "text",
        executionMode: entry.executionMode,
      });

      const existing = map.get(uniqueKey);
      if (existing) {
        map.set(uniqueKey, {
          ...existing,
          displayName: entry.displayName,
          brand,
          routeLabel,
          costLabel,
          qualityTier: meta.qualityTier,
          qualityRank: meta.qualityRank,
          tierLabel: meta.tierLabel,
          useNote: meta.useNote,
          isUncensored: meta.isUncensored,
        });
      } else {
        map.set(uniqueKey, {
          key: uniqueKey,
          provider: entry.provider,
          modelId: entry.modelId,
          displayName: entry.displayName,
          brand,
          routeLabel,
          costLabel,
          kind,
          qualityTier: meta.qualityTier,
          qualityRank: meta.qualityRank,
          tierLabel: meta.tierLabel,
          useNote: meta.useNote,
          isUncensored: meta.isUncensored,
          status: isConnected ? "connected" : hasEnv ? "env_key" : "needs_key",
          saveKey: isConnected ? modelOptionKey(entry.provider, entry.modelId) : undefined,
        });
      }
    }

    return [...map.values()];
  }, [state, connectedProviders, subscriptionProviders]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows
      .filter((row) => {
        if (tab === "uncensored" && !row.isUncensored) return false;
        if (tab === "frontier" && row.isUncensored) return false;
        if (modalityFilter !== "all" && row.kind !== modalityFilter) return false;
        return true;
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.displayName.toLowerCase().includes(q) ||
          row.brand.toLowerCase().includes(q) ||
          row.provider.toLowerCase().includes(q) ||
          row.useNote.toLowerCase().includes(q) ||
          row.tierLabel.toLowerCase().includes(q)
        );
      });
  }, [allRows, tab, modalityFilter, query]);

  const modalitySections = useMemo(() => {
    const order: Array<"text" | "image" | "video"> = ["text", "image", "video"];
    return order
      .map((modality) => {
        const rows = filteredRows.filter((r) => r.kind === modality);
        return {
          modality,
          label: MODALITY_TAG_LABEL[modality],
          groups: groupBySmartBrand(rows),
          count: rows.length,
        };
      })
      .filter((s) => s.count > 0);
  }, [filteredRows]);

  if (!credentials || !catalog || !me || !state) return null;

  const { selectedModelKey, selectedName, thinkingLevels, defaultThinkingLevel } = state;
  const thinking: ThinkingLevel | null = modelPending
    ? null
    : saveThinking.pending
      ? (saveThinking.input ?? null)
      : bot.thinkingLevel;
  const shownThinking = thinkingLevels.length
    ? thinkingLevelLabel(thinking ?? defaultThinkingLevel)
    : undefined;
  const defaultLabel = thinkingLevelLabel(defaultThinkingLevel);

  const activeMeta = activeMediaModel
    ? getModelGuideMeta(activeMediaModel.provider, activeMediaModel.modelId)
    : getModelGuideMeta(bot.modelProvider ?? "openai", bot.modelId ?? "gpt-6.2-sol");

  const triggerLabel = activeMediaModel ? activeMediaModel.displayName : selectedName;
  const triggerSub = activeMediaModel
    ? activeMediaModel.kind === "image"
      ? "Image"
      : "Video"
    : shownThinking;

  function renderModelRow(row: UnifiedModelRow, showBrandInline: boolean, showModalityPill: boolean) {
    const isSelected = activeMediaModel
      ? activeMediaModel.provider === row.provider && activeMediaModel.modelId === row.modelId
      : Boolean(row.saveKey && row.saveKey === selectedModelKey);

    return (
      <button
        key={row.key}
        type="button"
        onClick={() => {
          if (row.status === "needs_key") {
            setOpen(false);
            onConnect();
            return;
          }
          if (row.kind === "image" || row.kind === "video") {
            onSelectMediaModel?.({
              provider: row.provider,
              modelId: row.modelId,
              displayName: row.displayName,
              kind: row.kind,
              isUncensored: row.isUncensored,
            });
            setOpen(false);
            return;
          }
          onSelectMediaModel?.(null);
          if (row.saveKey && row.saveKey !== selectedModelKey) {
            saveModel.run(row.saveKey);
          }
          setOpen(false);
        }}
        className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
          isSelected
            ? "border-foreground/30 bg-accent/70"
            : "border-transparent hover:border-border hover:bg-muted/60"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Star className={`size-3 shrink-0 ${STAR_COLOR_BY_TIER[row.qualityTier]}`} />
            <span className="truncate text-xs font-medium text-foreground">{row.displayName}</span>
            {showModalityPill ? (
              <span className="shrink-0 rounded border border-border/80 bg-muted px-1 py-0 text-[9px] font-medium text-muted-foreground">
                {MODALITY_TAG_LABEL[row.kind]}
              </span>
            ) : null}
            <span
              className={`shrink-0 rounded border px-1 py-0 text-[9px] font-medium ${TIER_BADGE_CLASS[row.qualityTier]}`}
            >
              {row.tierLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[9.5px] text-foreground/80">
              {row.costLabel}
            </span>
            <span
              title={
                row.status === "connected"
                  ? "Connected"
                  : row.status === "env_key"
                    ? "Server Env Key Ready"
                    : "Click to add API Key"
              }
              className={`inline-flex items-center gap-1 text-[10px] ${
                row.status === "connected"
                  ? "text-emerald-400"
                  : row.status === "env_key"
                    ? "text-sky-400"
                    : "text-amber-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  row.status === "connected"
                    ? "bg-emerald-400"
                    : row.status === "env_key"
                      ? "bg-sky-400"
                      : "bg-amber-400"
                }`}
              />
              {row.status === "needs_key" ? "Add Key" : null}
            </span>
            {isSelected ? <Check className="size-3.5 text-foreground" /> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pl-4.5 text-[11px] text-muted-foreground">
          <span className="line-clamp-1">{row.useNote}</span>
          <span className="shrink-0 text-[10px] opacity-80">
            {showBrandInline ? `${row.brand} · ${row.routeLabel}` : row.routeLabel}
          </span>
        </div>
      </button>
    );
  }

  function renderBrandGroups(groups: SmartBrandGroup[], showModalityPill: boolean) {
    return groups.map((group) => (
      <div key={group.brand} className="space-y-0.5">
        {group.showHeader ? (
          <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{group.brand}</span>
            <span className="font-normal opacity-70">{group.rows.length} models · best first</span>
          </div>
        ) : null}
        {group.rows.map((row) => renderModelRow(row, !group.showHeader, showModalityPill))}
      </div>
    ));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || saveModel.pending || saveThinking.pending}
            data-testid="unified-model-picker-trigger"
            className="h-7 max-w-[230px] gap-1.5 rounded-full border border-border/80 bg-muted/60 px-2.5 text-xs font-medium text-foreground hover:bg-muted"
          />
        }
      >
        <Star className={`size-3 shrink-0 ${STAR_COLOR_BY_TIER[activeMeta.qualityTier]}`} />
        <span className="truncate">{triggerLabel}</span>
        {triggerSub ? (
          <span className="shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {triggerSub}
          </span>
        ) : null}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-[430px] max-w-[calc(100vw-24px)] p-0 shadow-xl"
      >
        {/* Top 2 Symmetrical Tabs: Frontier | Uncensored */}
        <div className="border-b border-border p-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
            {(
              [
                { id: "frontier", label: "Frontier", icon: Sparkles },
                { id: "uncensored", label: "Uncensored", icon: Flame },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? id === "uncensored"
                        ? "bg-rose-500/20 text-rose-300 shadow-xs"
                        : "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Identical Modality Sub-Filter Pills (All | Text | Image | Video) for both Frontier & Uncensored */}
          <div className="mt-2 flex items-center gap-1 px-0.5">
            {(["all", "text", "image", "video"] as const).map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setModalityFilter(sub)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  modalityFilter === sub
                    ? tab === "uncensored"
                      ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                      : "border-foreground/30 bg-foreground/10 text-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {sub === "all" ? "All" : MODALITY_TAG_LABEL[sub]}
              </button>
            ))}
          </div>

          {/* Color-coded star legend */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="size-2.5 fill-amber-400 text-amber-400" />
              Flagship
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-2.5 fill-sky-400 text-sky-400" />
              Coding/Think
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-2.5 fill-purple-400 text-purple-400" />
              Cinema
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-2.5 fill-rose-500 text-rose-500" />
              Uncensored
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Live
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="size-1.5 rounded-full bg-sky-400" />
                Env
              </span>
            </span>
          </div>

          {/* Search box */}
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by brand, model, or capability..."
              className="h-7 w-full rounded-md border border-border bg-background pl-8 pr-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
        </div>

        {/* Symmetrical Modality Sections + Smart Brand Grouping for both Frontier & Uncensored */}
        <div className="rk-scroll max-h-[330px] space-y-2 overflow-y-auto p-2">
          {filteredRows.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No models match your filter.
            </div>
          ) : (
            modalitySections.map((section) => (
              <div key={section.modality} className="space-y-1">
                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    tab === "uncensored"
                      ? "bg-rose-500/10 text-rose-300"
                      : "bg-muted/80 text-foreground/80"
                  }`}
                >
                  <span>
                    {tab === "uncensored" ? "Uncensored" : "Frontier"} · {section.label}
                  </span>
                  <span>{section.count}</span>
                </div>
                {renderBrandGroups(section.groups, true)}
              </div>
            ))
          )}
        </div>

        {/* Thinking level selector for active Text models */}
        {!activeMediaModel && thinkingLevels.length > 0 ? (
          <div className="border-t border-border px-2.5 py-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Thinking effort
            </div>
            <div className="flex flex-wrap gap-1">
              {[null, ...thinkingLevels].map((level) => {
                const active = level === thinking;
                return (
                  <button
                    key={level ?? "default"}
                    type="button"
                    disabled={saveModel.pending}
                    onClick={() => {
                      if (level !== thinking) saveThinking.run(level);
                    }}
                    className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                      active
                        ? "border-foreground/30 bg-foreground/15 font-medium text-foreground"
                        : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {level ? thinkingLevelLabel(level) : `Default (${defaultLabel})`}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Footer: Direct Add / Manage API Keys button */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-2.5 py-2">
          <span className="text-[11px] text-muted-foreground">
            OpenAI · xAI · fal · Uncensored · Custom
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
              onConnect();
            }}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <KeyRound className="size-3.5" />
            <span>Add / Manage API Keys</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
