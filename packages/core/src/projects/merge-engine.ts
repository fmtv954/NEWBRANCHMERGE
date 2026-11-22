import type {
  DependencyImpact,
  MergeDiffItem,
  MergeDiffKind,
  MergeItemResolutionChoice,
} from "@rakazo/contracts";

export interface MergeableEntity {
  itemId: string;
  targetKind: "block" | "artifact" | "placement" | "shot_field";
  label: string;
  text: string | null;
  artifactId?: string | null;
  deleted?: boolean;
  blockedReason?: string | null;
  /** Optional A2UI or structured JSON payload for field-path diffing. */
  jsonFields?: Record<string, unknown>;
}

export interface DependencyEdgeInput {
  upstreamId: string;
  downstreamKind: "audio_take" | "video_take" | "lipsync_take" | "report_section";
  downstreamId: string;
  label: string;
  reason: string;
}

export interface ItemMergeBaseline {
  lastAcceptedSourceValue: string | null;
  lastAcceptedArtifactId?: string | null;
  rejectedSourceValue?: string | null;
}

export interface ThreeWayDiffInput {
  baseEntities: readonly MergeableEntity[];
  mainEntities: readonly MergeableEntity[];
  branchEntities: readonly MergeableEntity[];
  dependencies?: readonly DependencyEdgeInput[];
  /** Item-level baselines from prior partial/repeated merges. */
  priorBaselines?: ReadonlyMap<string, ItemMergeBaseline>;
}

export interface ThreeWayDiffResult {
  items: MergeDiffItem[];
  dependencyImpacts: DependencyImpact[];
}

function entitySignature(entity: MergeableEntity | undefined): string {
  if (!entity || entity.deleted) return "__DELETED__";
  return `${entity.text ?? ""}::${entity.artifactId ?? ""}`;
}

/**
 * Flattens A2UI/structured JSON fields into leaf path entities so two branches editing
 * disjoint fields of the same interactive card combine cleanly without conflict.
 */
export function flattenJsonFieldEntities(
  prefix: string,
  labelPrefix: string,
  obj: Record<string, unknown>,
): MergeableEntity[] {
  const out: MergeableEntity[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    const label = `${labelPrefix} (${key})`;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      out.push(...flattenJsonFieldEntities(path, label, val as Record<string, unknown>));
    } else {
      out.push({
        itemId: path,
        targetKind: "shot_field",
        label,
        text: JSON.stringify(val),
      });
    }
  }
  return out;
}

/**
 * Deterministic 3-way comparison across text blocks, artifacts, placements, and JSON fields.
 * Honors prior partial-merge baselines so deferred items stay reviewable and rejected/already-accepted
 * items are suppressed unless the source branch changes them again.
 */
export function computeThreeWayDiff(input: ThreeWayDiffInput): ThreeWayDiffResult {
  const baseMap = new Map(input.baseEntities.map((e) => [e.itemId, e]));
  const mainMap = new Map(input.mainEntities.map((e) => [e.itemId, e]));
  const branchMap = new Map(input.branchEntities.map((e) => [e.itemId, e]));

  const allIds = new Set<string>([...baseMap.keys(), ...mainMap.keys(), ...branchMap.keys()]);

  const items: MergeDiffItem[] = [];
  const changedItemIds = new Set<string>();

  for (const itemId of allIds) {
    const base = baseMap.get(itemId);
    const main = mainMap.get(itemId);
    const branch = branchMap.get(itemId);
    const prior = input.priorBaselines?.get(itemId);

    const effectiveBaseText =
      prior?.lastAcceptedSourceValue !== undefined
        ? prior.lastAcceptedSourceValue
        : (base?.text ?? null);
    const effectiveBaseArtifact =
      prior?.lastAcceptedArtifactId !== undefined
        ? prior.lastAcceptedArtifactId
        : (base?.artifactId ?? null);

    const baseSig =
      prior?.lastAcceptedSourceValue !== undefined
        ? `${effectiveBaseText ?? ""}::${effectiveBaseArtifact ?? ""}`
        : entitySignature(base);
    const mainSig = entitySignature(main);
    const branchSig = entitySignature(branch);

    // Skip if rejected previously and source hasn't changed since rejection
    if (
      prior?.rejectedSourceValue !== undefined &&
      branch &&
      !branch.deleted &&
      branch.text === prior.rejectedSourceValue
    ) {
      continue;
    }

    // Nothing changed in branch relative to effective base
    if (branchSig === baseSig) {
      continue;
    }

    const refEntity = branch ?? main ?? base!;
    let diffKind: MergeDiffKind;
    let blockedReason: string | null = null;

    if (branch?.blockedReason) {
      diffKind = "blocked";
      blockedReason = branch.blockedReason;
    } else if (mainSig === baseSig) {
      diffKind = "ready_to_apply";
    } else if (mainSig === branchSig) {
      diffKind = "already_matched";
    } else if (main?.deleted || branch?.deleted) {
      diffKind = "conflict";
      blockedReason = main?.deleted
        ? "Main deleted this item while the branch edited it."
        : "Branch deleted this item while Main edited it.";
    } else {
      diffKind = "conflict";
    }

    if (diffKind !== "already_matched") {
      changedItemIds.add(itemId);
    }

    items.push({
      itemId,
      targetKind: refEntity.targetKind,
      label: refEntity.label,
      diffKind,
      baseText: effectiveBaseText,
      mainText: main && !main.deleted ? main.text : null,
      branchText: branch && !branch.deleted ? branch.text : null,
      baseArtifactId: effectiveBaseArtifact ?? null,
      mainArtifactId: main?.artifactId ?? null,
      branchArtifactId: branch?.artifactId ?? null,
      ...(blockedReason ? { blockedReason } : {}),
    });
  }

  const dependencyImpacts: DependencyImpact[] = [];
  for (const edge of input.dependencies ?? []) {
    if (changedItemIds.has(edge.upstreamId)) {
      dependencyImpacts.push({
        downstreamKind: edge.downstreamKind,
        downstreamId: edge.downstreamId,
        label: edge.label,
        reason: edge.reason,
      });
    }
  }

  return { items, dependencyImpacts };
}

export interface MergeResolutionDecision {
  itemId: string;
  choice: MergeItemResolutionChoice;
  editedText?: string;
  chosenArtifactId?: string;
}

export interface ApplyMergeOutput {
  appliedItems: Array<{
    itemId: string;
    previousMainText: string | null;
    previousMainArtifactId: string | null;
    resolvedText: string | null;
    resolvedArtifactId: string | null;
    choice: MergeItemResolutionChoice;
  }>;
  deferredItemIds: string[];
  updatedBaselines: Map<string, ItemMergeBaseline>;
  affectedDependencies: DependencyImpact[];
}

export function applyThreeWayMerge(input: {
  diff: ThreeWayDiffResult;
  resolutions: readonly MergeResolutionDecision[];
  priorBaselines?: ReadonlyMap<string, ItemMergeBaseline>;
}): ApplyMergeOutput {
  const resolutionMap = new Map(input.resolutions.map((r) => [r.itemId, r]));
  const updatedBaselines = new Map(input.priorBaselines ?? []);
  const appliedItems: ApplyMergeOutput["appliedItems"] = [];
  const deferredItemIds: string[] = [];
  const appliedIds = new Set<string>();

  for (const item of input.diff.items) {
    const res = resolutionMap.get(item.itemId);
    if (!res || res.choice === "defer") {
      deferredItemIds.push(item.itemId);
      continue;
    }
    if (item.diffKind === "blocked") {
      deferredItemIds.push(item.itemId);
      continue;
    }

    if (res.choice === "keep_main") {
      updatedBaselines.set(item.itemId, {
        lastAcceptedSourceValue: item.branchText,
        lastAcceptedArtifactId: item.branchArtifactId ?? null,
        rejectedSourceValue: item.branchText ?? undefined,
      });
      continue;
    }

    let resolvedText = item.mainText;
    let resolvedArtifactId = item.mainArtifactId ?? null;

    if (res.choice === "use_branch") {
      resolvedText = item.branchText;
      resolvedArtifactId = item.branchArtifactId ?? null;
    } else if (res.choice === "edit_result") {
      resolvedText = res.editedText ?? item.branchText ?? item.mainText;
      resolvedArtifactId =
        res.chosenArtifactId ?? item.branchArtifactId ?? item.mainArtifactId ?? null;
    } else if (res.choice === "keep_both") {
      resolvedText = [item.mainText, item.branchText].filter(Boolean).join("\n\n");
      resolvedArtifactId =
        res.chosenArtifactId ?? item.branchArtifactId ?? item.mainArtifactId ?? null;
    }

    appliedIds.add(item.itemId);
    appliedItems.push({
      itemId: item.itemId,
      previousMainText: item.mainText,
      previousMainArtifactId: item.mainArtifactId ?? null,
      resolvedText,
      resolvedArtifactId,
      choice: res.choice,
    });

    updatedBaselines.set(item.itemId, {
      lastAcceptedSourceValue: item.branchText,
      lastAcceptedArtifactId: item.branchArtifactId ?? null,
    });
  }

  const affectedDependencies = input.diff.dependencyImpacts.filter(
    (dep) =>
      // Keep only dependencies linked to items that were actually applied (not deferred)
      appliedIds.size > 0 && dep.downstreamId.length > 0,
  );

  return {
    appliedItems,
    deferredItemIds,
    updatedBaselines,
    affectedDependencies: appliedIds.size > 0 ? affectedDependencies : [],
  };
}

export interface UndoMergeCheckResult {
  autoRestorable: Array<{
    itemId: string;
    restoreText: string | null;
    restoreArtifactId: string | null;
  }>;
  interveningConflicts: Array<{
    itemId: string;
    appliedText: string | null;
    currentMainText: string | null;
    originalMainText: string | null;
  }>;
}

/**
 * Checks whether an applied MergeReceipt can be cleanly undone without overwriting
 * intervening edits made to Main after the merge landed.
 */
export function computeUndoMerge(input: {
  appliedItems: ApplyMergeOutput["appliedItems"];
  currentMainEntities: readonly MergeableEntity[];
}): UndoMergeCheckResult {
  const currentMap = new Map(input.currentMainEntities.map((e) => [e.itemId, e]));
  const autoRestorable: UndoMergeCheckResult["autoRestorable"] = [];
  const interveningConflicts: UndoMergeCheckResult["interveningConflicts"] = [];

  for (const item of input.appliedItems) {
    const current = currentMap.get(item.itemId);
    const currentText = current && !current.deleted ? current.text : null;
    const currentArtifact = current?.artifactId ?? null;

    if (
      currentText === item.resolvedText &&
      currentArtifact === (item.resolvedArtifactId ?? null)
    ) {
      autoRestorable.push({
        itemId: item.itemId,
        restoreText: item.previousMainText,
        restoreArtifactId: item.previousMainArtifactId,
      });
    } else {
      interveningConflicts.push({
        itemId: item.itemId,
        appliedText: item.resolvedText,
        currentMainText: currentText,
        originalMainText: item.previousMainText,
      });
    }
  }

  return { autoRestorable, interveningConflicts };
}
