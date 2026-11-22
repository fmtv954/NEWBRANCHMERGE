import type {
  BillingRoute,
  BranchContextMode,
  CloneModelCatalogEntry,
  ModelModality,
  SelectionBlockRange,
} from "@rakazo/contracts";
import { CLONE_MODEL_CATALOG, validateModelInputCompatibility } from "@rakazo/contracts";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@rakazo/ui-web";
import {
  AlertTriangle,
  Check,
  GitBranch,
  Layers,
  Search,
  SplitSquareHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface BranchSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originModelProvider?: string | null;
  originModelId?: string | null;
  selectionRange?: SelectionBlockRange | null;
  suggestedName?: string;
  inheritedMessageCount: number;
  pinnedRefCount: number;
  attachedInputs?: ReadonlyArray<{
    id: string;
    label: string;
    kind: "image" | "video" | "audio" | "text";
  }>;
  onOpenBranch: (input: {
    name: string;
    modelProvider: string;
    modelId: string;
    billingRoute: BillingRoute;
    contextMode: BranchContextMode;
  }) => Promise<void> | void;
  onCompareModels: (input: {
    modelA: { provider: string; modelId: string };
    modelB: { provider: string; modelId: string };
    contextMode: BranchContextMode;
  }) => void;
}

const BILLING_LABELS: Record<BillingRoute, string> = {
  subscription: "Use my subscription",
  byok: "BYOK · billed on send",
  hosted_credits: "CLONE credits",
  local: "Local · free",
};

export function BranchSetupDialog({
  open,
  onOpenChange,
  originModelProvider,
  originModelId,
  selectionRange,
  suggestedName = "Branch",
  inheritedMessageCount,
  pinnedRefCount,
  attachedInputs = [],
  onOpenBranch,
  onCompareModels,
}: BranchSetupDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | ModelModality>("all");
  const [variantFilter, setVariantFilter] = useState<"all" | "abliterated" | "local">("all");
  const [selectedProvider, setSelectedProvider] = useState(originModelProvider ?? "openai");
  const [selectedModelId, setSelectedModelId] = useState(originModelId ?? "gpt-6.2-sol");
  const [billingRoute, setBillingRoute] = useState<BillingRoute>("byok");
  const [contextMode, setContextMode] = useState<BranchContextMode>("through_message");
  const [submitting, setSubmitting] = useState(false);

  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CLONE_MODEL_CATALOG.filter((m) => {
      if (m.evalOnly) return false;
      if (taskFilter !== "all" && !m.modalities.includes(taskFilter)) return false;
      if (variantFilter === "abliterated" && m.weightVariant !== "abliterated") return false;
      if (variantFilter === "local" && m.executionMode !== "local") return false;
      if (q && !`${m.displayName} ${m.provider} ${m.modelId}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [query, taskFilter, variantFilter]);

  const selectedEntry: CloneModelCatalogEntry | undefined = useMemo(
    () =>
      CLONE_MODEL_CATALOG.find(
        (m) => m.provider === selectedProvider && m.modelId === selectedModelId,
      ) ?? CLONE_MODEL_CATALOG[0],
    [selectedProvider, selectedModelId],
  );

  const compatibility = useMemo(() => {
    if (!selectedEntry || attachedInputs.length === 0) {
      return { compatible: true, unsupportedInputs: [] };
    }
    return validateModelInputCompatibility(selectedEntry, attachedInputs);
  }, [selectedEntry, attachedInputs]);

  const handleOpen = async () => {
    setSubmitting(true);
    try {
      await onOpenBranch({
        name: name.trim() || suggestedName,
        modelProvider: selectedProvider,
        modelId: selectedModelId,
        billingRoute,
        contextMode,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader className="flex flex-row items-center justify-between gap-3">
          <DialogTitle className="flex items-center gap-2 text-heading2">
            <GitBranch className="size-4 text-success" />
            Open a branch
          </DialogTitle>
          <div className="flex items-center gap-2">
            <span className="text-label text-muted-foreground">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-44 text-body-sm"
              aria-label="Branch name"
            />
          </div>
        </DialogHeader>

        {selectionRange?.quoteText ? (
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-body-sm text-foreground">
            “{selectionRange.quoteText}”
          </div>
        ) : null}

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-sm font-medium text-foreground">Model</span>
            <Tabs
              value={variantFilter}
              onValueChange={(v) => setVariantFilter(v as typeof variantFilter)}
            >
              <TabsList className="h-7">
                <TabsTrigger value="all" className="px-2 text-label">
                  All
                </TabsTrigger>
                <TabsTrigger value="abliterated" className="px-2 text-label">
                  Abliterated
                </TabsTrigger>
                <TabsTrigger value="local" className="px-2 text-label">
                  Local
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-2 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by model or provider…"
                className="h-8 ps-8 text-body-sm"
              />
            </div>
            <select
              aria-label="Can do this task"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value as typeof taskFilter)}
              className="h-8 rounded-md border border-border bg-background px-2 text-label text-foreground"
            >
              <option value="all">Any task</option>
              <option value="text">Chat & Reasoning</option>
              <option value="vision">Vision</option>
              <option value="image_gen">Image Gen</option>
              <option value="video_gen">Video Gen</option>
            </select>
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
            {visibleModels.map((m) => {
              const active = m.provider === selectedProvider && m.modelId === selectedModelId;
              const isOrigin = m.provider === originModelProvider && m.modelId === originModelId;
              const preferredRoute = m.billingRouteSupport[0] ?? "byok";
              return (
                <button
                  key={`${m.provider}:${m.modelId}`}
                  type="button"
                  onClick={() => {
                    setSelectedProvider(m.provider);
                    setSelectedModelId(m.modelId);
                    setBillingRoute(preferredRoute);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-body-sm transition-colors ${
                    active ? "bg-success/15 text-foreground" : "hover:bg-accent text-foreground/90"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{m.displayName}</span>
                    {m.weightVariant === "abliterated" ? (
                      <Badge variant="outline" className="text-[10px]">
                        Abliterated
                      </Badge>
                    ) : null}
                    {m.executionMode === "local" ? (
                      <Badge variant="outline" className="text-[10px]">
                        Local
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-label text-muted-foreground">
                    <span>{isOrigin ? "From source chat" : BILLING_LABELS[preferredRoute]}</span>
                    {active ? <Check className="size-3.5 text-success" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {!compatibility.compatible ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-label text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="space-y-1">
              {compatibility.unsupportedInputs.map((u) => (
                <p key={u.id}>{u.suggestion}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
          <div className="flex items-center gap-2 text-body-sm">
            <Layers className="size-4 text-muted-foreground" />
            <span>Context</span>
          </div>
          <select
            aria-label="Context scope"
            value={contextMode}
            onChange={(e) => setContextMode(e.target.value as BranchContextMode)}
            className="h-7 rounded-md border border-border bg-background px-2 text-label text-foreground"
          >
            <option value="through_message">
              Through this message ({inheritedMessageCount} msgs · {pinnedRefCount} pinned)
            </option>
            <option value="only_selection">Only selection + pinned refs</option>
            <option value="custom">Choose inputs…</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onCompareModels({
                modelA: {
                  provider: originModelProvider ?? "openai",
                  modelId: originModelId ?? "gpt-6.2-sol",
                },
                modelB: { provider: selectedProvider, modelId: selectedModelId },
                contextMode,
              })
            }
          >
            <SplitSquareHorizontal className="mr-1.5 size-3.5" />
            Compare models
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={submitting} onClick={handleOpen}>
              Open branch
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
