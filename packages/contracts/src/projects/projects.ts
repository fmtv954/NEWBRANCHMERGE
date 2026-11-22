import * as z from "zod";
import { Id, IsoDate, ThinkingLevelSchema } from "../ids.js";

export const ProjectModeSchema = z.enum(["general", "microdrama"]);
export type ProjectMode = z.infer<typeof ProjectModeSchema>;

export const ProjectRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const BillingRouteSchema = z.enum(["subscription", "byok", "hosted_credits", "local"]);
export type BillingRoute = z.infer<typeof BillingRouteSchema>;

export const BranchContextModeSchema = z.enum(["through_message", "only_selection", "custom"]);
export type BranchContextMode = z.infer<typeof BranchContextModeSchema>;

export const CanonicalBlockTypeSchema = z.enum([
  "paragraph",
  "heading",
  "list_item",
  "code",
  "blockquote",
  "table",
]);
export type CanonicalBlockType = z.infer<typeof CanonicalBlockTypeSchema>;

export const CanonicalBlockSchema = z.object({
  stableBlockId: z.string().min(1),
  blockType: CanonicalBlockTypeSchema,
  orderIndex: z.number().int().nonnegative(),
  canonicalText: z.string(),
  language: z.string().nullable().optional(),
  textDigest: z.string().min(1),
  utf16Length: z.number().int().nonnegative(),
});
export type CanonicalBlock = z.infer<typeof CanonicalBlockSchema>;

export const SelectionBlockRangeSchema = z.object({
  startBlockId: z.string().min(1),
  endBlockId: z.string().min(1),
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().nonnegative(),
  quoteText: z.string().min(1),
  textDigest: z.string().min(1),
});
export type SelectionBlockRange = z.infer<typeof SelectionBlockRangeSchema>;

export const PlacementAnchorKindSchema = z.enum([
  "after_message",
  "before_message",
  "after_placement",
  "end_of_main",
]);
export type PlacementAnchorKind = z.infer<typeof PlacementAnchorKindSchema>;

export const ProjectSchema = z.object({
  id: Id,
  spaceId: Id,
  ownerUserId: Id,
  title: z.string().min(1).max(200),
  description: z.string().max(2_000),
  mode: ProjectModeSchema,
  instructions: z.string(),
  defaultBotId: Id.nullable(),
  mainThreadId: Id.nullable(),
  archivedAt: IsoDate.nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Project = z.infer<typeof ProjectSchema>;

export const BranchForkOriginSchema = z.object({
  id: Id,
  branchId: Id,
  sourceBranchId: Id,
  sourceMessageId: Id.nullable(),
  sourceMessageRevisionId: Id.nullable(),
  sourceArtifactId: Id.nullable(),
  inheritedUpToSeq: z.number().int().nonnegative(),
  baseProjectRevisionId: Id.nullable(),
  selectionRange: SelectionBlockRangeSchema.nullable(),
  contextMode: BranchContextModeSchema,
  pinnedRefIds: z.array(Id),
  permissionScope: z.string(),
  createdAt: IsoDate,
});
export type BranchForkOrigin = z.infer<typeof BranchForkOriginSchema>;

export const BranchSchema = z.object({
  id: Id,
  projectId: Id,
  threadId: Id,
  parentBranchId: Id.nullable(),
  rootMainBranchId: Id.nullable(),
  name: z.string().min(1).max(200),
  isMain: z.boolean(),
  headRevisionId: Id.nullable(),
  defaultModelProvider: z.string().nullable(),
  defaultModelId: z.string().nullable(),
  defaultThinkingLevel: ThinkingLevelSchema.nullable(),
  pendingReviewCount: z.number().int().nonnegative().default(0),
  archivedAt: IsoDate.nullable(),
  createdByUserId: Id,
  createdAt: IsoDate,
  updatedAt: IsoDate,
  forkOrigin: BranchForkOriginSchema.nullable().optional(),
});
export type Branch = z.infer<typeof BranchSchema>;

export const PlacementSchema = z.object({
  id: Id,
  projectId: Id,
  targetBranchId: Id,
  sourceBranchId: Id,
  sourceMessageId: Id.nullable(),
  sourceMessageRevisionId: Id.nullable().default(null),
  sourceBlockIds: z.array(z.string()).nullable(),
  sourceRange: SelectionBlockRangeSchema.nullable(),
  sourceRangeDigest: z.string().nullable().default(null),
  artifactId: Id.nullable(),
  excerptText: z.string().nullable(),
  label: z.string().min(1).max(240),
  anchorKind: PlacementAnchorKindSchema,
  anchorId: Id.nullable(),
  sortOrder: z.number().int().nonnegative(),
  useInNextMessage: z.boolean(),
  pinnedAsContext: z.boolean(),
  originalRunId: Id.nullable(),
  originalCostMicros: z.string().nullable(),
  originCreatedAt: IsoDate,
  insertedAt: IsoDate,
  removedAt: IsoDate.nullable(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const ContextOmittedItemSchema = z.object({
  kind: z.enum(["message", "attachment", "placement", "pinned_ref", "tool"]),
  id: z.string(),
  label: z.string(),
  reason: z.enum(["budget_limit", "unsupported_modality", "permission_denied", "user_excluded"]),
});
export type ContextOmittedItem = z.infer<typeof ContextOmittedItemSchema>;

export const ContextPreviewSchema = z.object({
  branchId: Id,
  requestedProvider: z.string(),
  requestedModelId: z.string(),
  billingRoute: BillingRouteSchema,
  contextWindow: z.number().int().positive(),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedCostMicros: z.string().nullable(),
  includedMessageIds: z.array(Id),
  includedPlacementIds: z.array(Id),
  includedArtifactIds: z.array(Id),
  omittedItems: z.array(ContextOmittedItemSchema),
  warnings: z.array(z.string()),
});
export type ContextPreview = z.infer<typeof ContextPreviewSchema>;

export const RunManifestSchema = z.object({
  id: Id,
  runId: Id,
  projectId: Id,
  branchId: Id,
  stepIndex: z.number().int().nonnegative(),
  attemptIndex: z.number().int().nonnegative().default(0),
  retentionPolicy: z.enum(["standard", "temporary_redacted"]).default("standard"),
  requestedProvider: z.string(),
  requestedModelId: z.string(),
  resolvedProvider: z.string().nullable(),
  resolvedModelId: z.string().nullable(),
  resolvedModelVersion: z.string().nullable(),
  billingRoute: BillingRouteSchema,
  includedTurnCount: z.number().int().nonnegative(),
  includedPlacementIds: z.array(Id),
  includedArtifactIds: z.array(Id),
  omittedItems: z.array(ContextOmittedItemSchema),
  actualInputTokens: z.number().int().nonnegative().nullable(),
  actualOutputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostMicros: z.string().nullable(),
  settledCostMicros: z.string().nullable(),
  createdAt: IsoDate,
});
export type RunManifest = z.infer<typeof RunManifestSchema>;

export const MergeDiffKindSchema = z.enum([
  "ready_to_apply",
  "keep_main_unchanged",
  "already_matched",
  "combinable",
  "conflict",
  "blocked",
]);
export type MergeDiffKind = z.infer<typeof MergeDiffKindSchema>;

export const MergeItemResolutionChoiceSchema = z.enum([
  "use_branch",
  "keep_main",
  "edit_result",
  "keep_both",
  "defer",
]);
export type MergeItemResolutionChoice = z.infer<typeof MergeItemResolutionChoiceSchema>;

export const MergeDiffItemSchema = z.object({
  itemId: z.string().min(1),
  targetKind: z.enum(["block", "artifact", "placement", "shot_field"]),
  label: z.string(),
  diffKind: MergeDiffKindSchema,
  baseText: z.string().nullable(),
  mainText: z.string().nullable(),
  branchText: z.string().nullable(),
  baseArtifactId: Id.nullable().optional(),
  mainArtifactId: Id.nullable().optional(),
  branchArtifactId: Id.nullable().optional(),
  blockedReason: z.string().nullable().optional(),
});
export type MergeDiffItem = z.infer<typeof MergeDiffItemSchema>;

export const DependencyImpactSchema = z.object({
  downstreamKind: z.enum(["audio_take", "video_take", "lipsync_take", "report_section"]),
  downstreamId: Id,
  label: z.string(),
  reason: z.string(),
});
export type DependencyImpact = z.infer<typeof DependencyImpactSchema>;

export const MergeReviewSchema = z.object({
  id: Id,
  projectId: Id,
  sourceBranchId: Id,
  targetBranchId: Id,
  sourceHeadRevisionId: Id,
  targetHeadRevisionId: Id,
  commonBaseRevisionId: Id.nullable(),
  items: z.array(MergeDiffItemSchema),
  dependencyImpacts: z.array(DependencyImpactSchema),
  status: z.enum(["open", "applied", "stale", "dismissed"]),
  createdAt: IsoDate,
});
export type MergeReview = z.infer<typeof MergeReviewSchema>;

export const MergeReceiptSchema = z.object({
  id: Id,
  projectId: Id,
  mergeReviewId: Id.nullable(),
  idempotencyKey: z.string().min(1),
  sourceBranchId: Id,
  targetBranchId: Id,
  sourceHeadRevisionId: Id.nullable().default(null),
  baseRevisionId: Id.nullable(),
  targetBeforeRevisionId: Id.nullable(),
  targetAfterRevisionId: Id,
  acceptedCount: z.number().int().nonnegative(),
  deferredCount: z.number().int().nonnegative(),
  affectedDependencies: z.array(DependencyImpactSchema),
  undoneByReceiptId: Id.nullable(),
  actorUserId: Id,
  createdAt: IsoDate,
});
export type MergeReceipt = z.infer<typeof MergeReceiptSchema>;

export const CompareGroupSchema = z.object({
  id: Id,
  projectId: Id,
  sourceBranchId: Id,
  sourceMessageId: Id.nullable(),
  promptText: z.string(),
  branchAId: Id,
  branchBId: Id,
  runAId: Id.nullable(),
  runBId: Id.nullable(),
  createdAt: IsoDate,
});
export type CompareGroup = z.infer<typeof CompareGroupSchema>;
