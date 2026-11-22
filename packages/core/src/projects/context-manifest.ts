import type {
  BillingRoute,
  BranchContextMode,
  CloneModelCatalogEntry,
  ContextOmittedItem,
  ContextPreview,
} from "@rakazo/contracts";
import { validateModelInputCompatibility } from "@rakazo/contracts";

export interface ContextTurnCandidate {
  id: string;
  seq: number;
  role: "user" | "bot" | "system";
  text: string;
  estimatedTokens: number;
}

export interface ContextAttachmentCandidate {
  id: string;
  label: string;
  kind: "image" | "video" | "audio" | "text";
  estimatedTokens: number;
  sourceKind: "placement" | "pinned_ref" | "attachment";
}

export interface BuildContextManifestInput {
  branchId: string;
  model: CloneModelCatalogEntry;
  billingRoute: BillingRoute;
  contextMode: BranchContextMode;
  inheritedUpToSeq: number | null;
  selectedExcerptText?: string | null;
  turns: readonly ContextTurnCandidate[];
  attachments: readonly ContextAttachmentCandidate[];
  excludedMessageIds?: ReadonlySet<string>;
  maxBudgetTokens?: number;
}

/**
 * Deterministic Context Inspector & RunManifest builder:
 * freezes exact inherited history up to `inheritedUpToSeq`, validates model modality
 * compatibility, respects token budgets, and records every omission explicitly.
 */
export function buildContextManifestPreview(input: BuildContextManifestInput): ContextPreview {
  const budget = Math.min(
    input.maxBudgetTokens ?? input.model.contextWindow,
    input.model.contextWindow,
  );
  const omittedItems: ContextOmittedItem[] = [];
  const warnings: string[] = [];

  // 1. Filter turns by fork boundary and contextMode
  const eligibleTurns = input.turns.filter((turn) => {
    if (input.excludedMessageIds?.has(turn.id)) {
      omittedItems.push({
        kind: "message",
        id: turn.id,
        label: `Turn #${turn.seq}`,
        reason: "user_excluded",
      });
      return false;
    }
    if (input.contextMode === "only_selection") {
      return false;
    }
    if (input.inheritedUpToSeq !== null && turn.seq > input.inheritedUpToSeq) {
      return false;
    }
    return true;
  });

  // 2. Validate attachment modalities against selected model
  const compat = validateModelInputCompatibility(
    input.model,
    input.attachments.map((a) => ({ id: a.id, label: a.label, kind: a.kind })),
  );
  const incompatibleIds = new Set(compat.unsupportedInputs.map((u) => u.id));
  for (const u of compat.unsupportedInputs) {
    warnings.push(u.suggestion);
    omittedItems.push({
      kind: "attachment",
      id: u.id,
      label: u.label,
      reason: "unsupported_modality",
    });
  }

  // 3. Allocate budget: prioritize selected excerpt + compatible attachments, then newest eligible turns
  let usedTokens = input.selectedExcerptText ? Math.ceil(input.selectedExcerptText.length / 4) : 0;
  const includedPlacementIds: string[] = [];
  const includedArtifactIds: string[] = [];

  for (const att of input.attachments) {
    if (incompatibleIds.has(att.id)) continue;
    if (usedTokens + att.estimatedTokens > budget) {
      omittedItems.push({
        kind: att.sourceKind === "placement" ? "placement" : "pinned_ref",
        id: att.id,
        label: att.label,
        reason: "budget_limit",
      });
      continue;
    }
    usedTokens += att.estimatedTokens;
    if (att.sourceKind === "placement") {
      includedPlacementIds.push(att.id);
    } else {
      includedArtifactIds.push(att.id);
    }
  }

  const includedMessageIds: string[] = [];
  for (let i = eligibleTurns.length - 1; i >= 0; i--) {
    const turn = eligibleTurns[i]!;
    if (usedTokens + turn.estimatedTokens > budget) {
      omittedItems.push({
        kind: "message",
        id: turn.id,
        label: `Turn #${turn.seq}`,
        reason: "budget_limit",
      });
      continue;
    }
    usedTokens += turn.estimatedTokens;
    includedMessageIds.unshift(turn.id);
  }

  const estimatedCostMicros =
    input.billingRoute === "local" || input.billingRoute === "subscription"
      ? "0"
      : String(Math.ceil((usedTokens / 1_000_000) * input.model.inputPriceMicros));

  return {
    branchId: input.branchId,
    requestedProvider: input.model.provider,
    requestedModelId: input.model.modelId,
    billingRoute: input.billingRoute,
    contextWindow: input.model.contextWindow,
    estimatedInputTokens: usedTokens,
    estimatedCostMicros,
    includedMessageIds,
    includedPlacementIds,
    includedArtifactIds,
    omittedItems,
    warnings,
  };
}
