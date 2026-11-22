import type {
  DependencyImpact,
  MergeDiffItem,
  MergeItemResolutionChoice,
  MergeReview,
  Placement,
} from "@rakazo/contracts";
import { computeWordDiff } from "@rakazo/core";
import { Badge, Button, Card, Checkbox, Textarea } from "@rakazo/ui-web";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ExternalLink,
  GitMerge,
  GripVertical,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

export function KeptItemCard({
  placement,
  sourceBranchName,
  onViewSource,
  onMove,
  onToggleNextMessage,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp = false,
  canMoveDown = false,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  placement: Placement;
  sourceBranchName: string;
  onViewSource: (sourceBranchId: string, sourceMessageId: string | null) => void;
  onMove: (placementId: string, anchorKind: Placement["anchorKind"]) => void;
  onToggleNextMessage: (placementId: string, nextValue: boolean) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: (placementId: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  return (
    <Card
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="border-success/35 bg-success/5 px-4 py-3 transition-shadow hover:border-success/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-label">
        <div className="flex items-center gap-1.5">
          <GripVertical
            className={`size-3.5 text-muted-foreground/80 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
          />
          <span className="font-medium text-success">Kept from {sourceBranchName}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>{placement.label}</span>
          {onMoveUp ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Move up"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              className="size-6"
            >
              <ArrowUp className="size-3" />
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Move down"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              className="size-6"
            >
              <ArrowDown className="size-3" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-label"
            onClick={() => onViewSource(placement.sourceBranchId, placement.sourceMessageId)}
          >
            <ExternalLink className="mr-1 size-3" />
            View source
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-label"
            onClick={() =>
              onMove(
                placement.id,
                placement.anchorKind === "before_message" ? "after_message" : "before_message",
              )
            }
          >
            <ArrowUpDown className="mr-1 size-3" />
            {placement.anchorKind === "before_message" ? "Move after" : "Move before"}
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove block"
              onClick={() => onRemove(placement.id)}
              className="size-6 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {placement.excerptText ? (
        <p className="mt-2 whitespace-pre-wrap text-body-sm text-foreground">
          {placement.excerptText}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-label text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Checkbox
            id={`keep-next-${placement.id}`}
            checked={placement.useInNextMessage}
            onCheckedChange={(checked) => onToggleNextMessage(placement.id, Boolean(checked))}
          />
          <label htmlFor={`keep-next-${placement.id}`} className="cursor-pointer">
            Use in next message
          </label>
        </div>
        <span>Original provenance & cost retained</span>
      </div>
    </Card>
  );
}

export function CompareModelsCard({
  promptText,
  branchA,
  branchB,
  onKeepResult,
}: {
  promptText: string;
  branchA: { branchId: string; modelLabel: string; costEstimate: string; previewText: string };
  branchB: { branchId: string; modelLabel: string; costEstimate: string; previewText: string };
  onKeepResult: (branchId: string, previewText: string) => void;
}) {
  return (
    <Card className="border-border bg-card/70 p-4">
      <div className="mb-3 flex items-center justify-between text-label text-muted-foreground">
        <span className="font-medium text-foreground">Model comparison</span>
        <span className="truncate">{promptText}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[branchA, branchB].map((side) => (
          <div
            key={side.branchId}
            className="flex flex-col justify-between rounded-lg border border-border bg-background/60 p-3"
          >
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-body-sm font-medium text-foreground">{side.modelLabel}</span>
                <Badge variant="outline" className="text-[10px]">
                  {side.costEstimate}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-body-sm text-foreground/90">
                {side.previewText || "Running…"}
              </p>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!side.previewText}
                onClick={() => onKeepResult(side.branchId, side.previewText)}
              >
                Keep in Main
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function InlineMergeReviewCard({
  review,
  sourceBranchName,
  onDefer,
  onApply,
}: {
  review: MergeReview;
  sourceBranchName: string;
  onDefer: () => void;
  onApply: (
    resolutions: Array<{
      itemId: string;
      choice: MergeItemResolutionChoice;
      editedText?: string;
    }>,
  ) => Promise<void> | void;
}) {
  const [decisions, setDecisions] = useState<
    Record<string, { choice: MergeItemResolutionChoice; editedText?: string }>
  >(() => {
    const initial: Record<string, { choice: MergeItemResolutionChoice; editedText?: string }> = {};
    for (const item of review.items) {
      initial[item.itemId] = {
        choice: item.diffKind === "ready_to_apply" ? "use_branch" : "defer",
      };
    }
    return initial;
  });
  const [expandedBase, setExpandedBase] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  const conflictCount = review.items.filter((i) => i.diffKind === "conflict").length;
  const selectedCount = Object.values(decisions).filter(
    (d) => d.choice !== "defer" && d.choice !== "keep_main",
  ).length;

  const setChoice = (item: MergeDiffItem, choice: MergeItemResolutionChoice) => {
    setDecisions((prev) => ({
      ...prev,
      [item.itemId]: {
        choice,
        editedText: choice === "edit_result" ? (item.branchText ?? item.mainText ?? "") : undefined,
      },
    }));
  };

  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-body-lg font-medium text-foreground">
            <GitMerge className="size-4 text-success" />
            Review changes
          </h3>
          <p className="text-label text-muted-foreground">{sourceBranchName} into Main</p>
        </div>
        {conflictCount > 0 ? (
          <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
            {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {review.items.map((item) => {
          const decision = decisions[item.itemId] ?? { choice: "defer" };
          if (item.diffKind === "ready_to_apply") {
            return (
              <div
                key={item.itemId}
                className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-body-sm">
                  <Checkbox
                    id={`merge-item-${item.itemId}`}
                    checked={decision.choice === "use_branch"}
                    onCheckedChange={(checked) => setChoice(item, checked ? "use_branch" : "defer")}
                  />
                  <label
                    htmlFor={`merge-item-${item.itemId}`}
                    className="cursor-pointer font-medium"
                  >
                    {item.label}
                  </label>
                </div>
                <span className="text-label text-success">Ready to apply</span>
              </div>
            );
          }

          return (
            <div key={item.itemId} className="rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-medium text-foreground">{item.label}</span>
                {item.baseText !== null ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBase((prev) => ({
                        ...prev,
                        [item.itemId]: !prev[item.itemId],
                      }))
                    }
                    className="text-label text-link hover:underline"
                  >
                    {expandedBase[item.itemId] ? "Hide original" : "Show original version"}
                  </button>
                ) : null}
              </div>

              {expandedBase[item.itemId] && item.baseText !== null ? (
                <div className="mt-2 rounded-md border border-border/60 bg-muted/40 p-2 text-label text-muted-foreground">
                  Original: {item.baseText}
                </div>
              ) : null}

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div
                  className={`rounded-md border p-2.5 text-body-sm ${
                    decision.choice === "keep_main"
                      ? "border-success/50 bg-success/10"
                      : "border-border bg-card/40"
                  }`}
                >
                  <div className="mb-1 text-label font-medium text-muted-foreground">Main</div>
                  <p className="whitespace-pre-wrap">{item.mainText ?? "—"}</p>
                </div>
                <div
                  className={`rounded-md border p-2.5 text-body-sm ${
                    decision.choice === "use_branch"
                      ? "border-success/50 bg-success/10"
                      : "border-border bg-card/40"
                  }`}
                >
                  <div className="mb-1 text-label font-medium text-muted-foreground">
                    {sourceBranchName} (word diff)
                  </div>
                  <p className="whitespace-pre-wrap">
                    {item.mainText && item.branchText
                      ? computeWordDiff(item.mainText, item.branchText).map((tok, idx) => (
                          <span
                            key={idx}
                            className={
                              tok.kind === "added"
                                ? "rounded bg-emerald-500/20 px-0.5 text-emerald-300"
                                : tok.kind === "removed"
                                  ? "rounded bg-rose-500/20 px-0.5 text-rose-300 line-through"
                                  : undefined
                            }
                          >
                            {tok.text}
                          </span>
                        ))
                      : (item.branchText ?? "—")}
                  </p>
                </div>
              </div>

              {decision.choice === "edit_result" ? (
                <Textarea
                  className="mt-2 text-body-sm"
                  value={decision.editedText ?? ""}
                  onChange={(e) =>
                    setDecisions((prev) => ({
                      ...prev,
                      [item.itemId]: { choice: "edit_result", editedText: e.target.value },
                    }))
                  }
                />
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={decision.choice === "keep_main" ? "default" : "outline"}
                  onClick={() => setChoice(item, "keep_main")}
                >
                  Keep Main
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={decision.choice === "use_branch" ? "default" : "outline"}
                  onClick={() => setChoice(item, "use_branch")}
                >
                  Use branch
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={decision.choice === "edit_result" ? "default" : "outline"}
                  onClick={() => setChoice(item, "edit_result")}
                >
                  Edit result
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {review.dependencyImpacts.length > 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-label text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{review.dependencyImpacts.map((d: DependencyImpact) => d.reason).join(" ")}</span>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDefer}>
          Defer
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={applying || selectedCount === 0}
          onClick={async () => {
            setApplying(true);
            try {
              await onApply(
                Object.entries(decisions).map(([itemId, d]) => ({
                  itemId,
                  choice: d.choice,
                  ...(d.editedText !== undefined ? { editedText: d.editedText } : {}),
                })),
              );
            } finally {
              setApplying(false);
            }
          }}
        >
          Apply {selectedCount} {selectedCount === 1 ? "change" : "changes"}
        </Button>
      </div>
    </Card>
  );
}

export function MergeReceiptBanner({
  acceptedCount,
  dependencyNotice,
  onUndo,
}: {
  acceptedCount: number;
  dependencyNotice?: string | null;
  onUndo: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3.5 py-2 text-body-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Check className="size-4 text-success" />
          {acceptedCount} {acceptedCount === 1 ? "change applied" : "changes applied"}
        </span>
        {dependencyNotice ? (
          <span className="text-label text-warning">{dependencyNotice}</span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-label"
        onClick={onUndo}
      >
        <RotateCcw className="mr-1 size-3" />
        Undo
      </Button>
    </div>
  );
}
