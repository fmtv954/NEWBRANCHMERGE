import type { Bot, ModelQualityTier } from "@rakazo/contracts";
import { Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { Check, ChevronDown, Flame, KeyRound, Search, Sparkles, Star } from "lucide-react";
import { useMemo, useState } from "react";
import {
  groupUnifiedBySmartBrand,
  type ModalitySubFilter,
  type PickerTab,
  useUnifiedModels,
} from "../../lib/models/use-unified-models";

const STAR_COLOR: Record<ModelQualityTier, string> = {
  flagship: "text-amber-400 fill-amber-400",
  reasoning_coding: "text-sky-400 fill-sky-400",
  cinema_media: "text-purple-400 fill-purple-400",
  fast_daily: "text-emerald-400 fill-emerald-400",
  uncensored: "text-rose-500 fill-rose-500",
};

const MODALITY_LABELS: Record<ModalitySubFilter, string> = {
  all: "All",
  text: "Text",
  image: "Image",
  video: "Video",
};

export function SideBranchModelPicker({
  activeBot,
  value,
  onChange,
  onManageKeys,
}: {
  activeBot?: Bot;
  value: string;
  onChange: (nextValue: string) => void;
  onManageKeys?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("frontier");
  const [modality, setModality] = useState<ModalitySubFilter>("all");
  const [query, setQuery] = useState("");
  const { allRows, defaultMainModelKey } = useUnifiedModels(activeBot);

  const effectiveValue = value || defaultMainModelKey;
  const selected = useMemo(
    () => allRows.find((r) => r.key === effectiveValue) ?? allRows[0],
    [allRows, effectiveValue],
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allRows
      .filter((r) => (tab === "uncensored" ? r.isUncensored : !r.isUncensored))
      .filter((r) => modality === "all" || r.kind === modality)
      .filter(
        (r) =>
          !q ||
          r.displayName.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.modelId.toLowerCase().includes(q),
      );
    return groupUnifiedBySmartBrand(filtered);
  }, [allRows, tab, modality, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid="side-branch-model-picker"
            className="inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          />
        }
      >
        <Star className={`size-3 shrink-0 ${STAR_COLOR[selected?.qualityTier ?? "flagship"]}`} />
        <span className="truncate">{selected?.displayName ?? "Select model"}</span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[340px] rounded-xl border border-border bg-popover p-0 shadow-xl"
      >
        {/* Symmetrical Frontier | Uncensored tabs (exact parity with Main) */}
        <div className="grid grid-cols-2 border-b border-border p-1">
          <button
            type="button"
            onClick={() => setTab("frontier")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              tab === "frontier"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3 text-sky-400" />
            <span>Frontier</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("uncensored")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              tab === "uncensored"
                ? "bg-rose-500/15 text-rose-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flame className="size-3 text-rose-400" />
            <span>Uncensored</span>
          </button>
        </div>

        {/* All | Text | Image | Video sub-filters */}
        <div className="flex items-center gap-1 border-b border-border/70 px-2.5 py-1.5">
          {(["all", "text", "image", "video"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModality(m)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                modality === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {MODALITY_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="border-b border-border/70 px-2.5 py-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
            <Search className="size-3 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models or brands..."
              className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Smart Brand Grouped Model List */}
        <div className="rk-scroll max-h-64 overflow-y-auto p-1.5">
          {grouped.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No matching models
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.brand} className="mb-1.5 last:mb-0">
                {group.showHeader ? (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.brand}
                  </div>
                ) : null}
                {group.rows.map((row) => {
                  const isActive = row.key === effectiveValue;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => {
                        onChange(row.key);
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        isActive ? "bg-muted text-foreground" : "hover:bg-muted/60"
                      }`}
                    >
                      <Star className={`mt-0.5 size-3 shrink-0 ${STAR_COLOR[row.qualityTier]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${
                                row.status === "connected" ? "bg-success" : "bg-muted-foreground/40"
                              }`}
                            />
                            <span className="truncate text-xs font-medium text-foreground">
                              {row.displayName}
                            </span>
                          </div>
                          <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {row.costLabel}
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">{row.useNote}</p>
                      </div>
                      {isActive ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {onManageKeys ? (
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManageKeys();
              }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <KeyRound className="size-3.5" />
              <span>Add / Manage API Keys</span>
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
