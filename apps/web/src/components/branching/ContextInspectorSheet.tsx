import type { ContextPreview } from "@rakazo/contracts";
import { Badge, Button, Card } from "@rakazo/ui-web";
import { AlertTriangle, Eye, Layers, ShieldCheck } from "lucide-react";

/**
 * Customer-Pain Fix #5 (Memory & Instruction Provenance) + Context Inspector:
 * Shows exact included turns, pinned placements/artifacts, omitted items, and
 * ensures branch-local instructions never leak into Main until explicitly promoted.
 */
export function ContextInspectorSheet({
  preview,
  branchInstructions,
  isBranch,
  onPromoteInstructionsToMain,
}: {
  preview: ContextPreview;
  branchInstructions?: string | null;
  isBranch: boolean;
  onPromoteInstructionsToMain?: () => void;
}) {
  const estDollars =
    preview.estimatedCostMicros !== null
      ? `$${(Number(preview.estimatedCostMicros) / 1_000_000).toFixed(4)}`
      : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2 text-body-lg font-medium text-foreground">
          <Eye className="size-4 text-success" />
          Context & Provenance
        </div>
        <Badge variant="outline" className="text-[10px]">
          {preview.billingRoute} · est {estDollars}
        </Badge>
      </div>

      <Card className="space-y-1.5 p-3 text-body-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Model route</span>
          <span className="font-medium text-foreground">
            {preview.requestedProvider} / {preview.requestedModelId}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Token budget</span>
          <span className="font-medium text-foreground">
            {preview.estimatedInputTokens.toLocaleString()} /{" "}
            {preview.contextWindow.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Included items</span>
          <span className="text-foreground">
            {preview.includedMessageIds.length} turns · {preview.includedPlacementIds.length} kept ·{" "}
            {preview.includedArtifactIds.length} refs
          </span>
        </div>
      </Card>

      {branchInstructions ? (
        <Card className="space-y-2 border-border p-3 text-body-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Layers className="size-3.5 text-status-working" />
              {isBranch ? "Branch-local instructions (isolated from Main)" : "Main instructions"}
            </span>
            <ShieldCheck className="size-3.5 text-success" />
          </div>
          <p className="text-label text-muted-foreground">{branchInstructions}</p>
          {isBranch && onPromoteInstructionsToMain ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-label"
              onClick={onPromoteInstructionsToMain}
            >
              Promote instructions to Main
            </Button>
          ) : null}
        </Card>
      ) : null}

      {preview.warnings.length > 0 || preview.omittedItems.length > 0 ? (
        <Card className="space-y-2 border-warning/40 bg-warning/10 p-3 text-label">
          <div className="flex items-center gap-1.5 font-medium text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            Omitted or incompatible inputs ({preview.omittedItems.length})
          </div>
          {preview.warnings.map((w, idx) => (
            <p key={idx} className="text-foreground/90">
              {w}
            </p>
          ))}
          {preview.omittedItems.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-muted-foreground">
              <span>{o.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {o.reason}
              </Badge>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
