import { oc } from "@orpc/contract";
import * as z from "zod";
import { Id, ThinkingLevelSchema } from "../ids.js";
import {
  BranchContextModeSchema,
  BranchSchema,
  CompareGroupSchema,
  ContextPreviewSchema,
  MergeItemResolutionChoiceSchema,
  MergeReceiptSchema,
  MergeReviewSchema,
  PlacementAnchorKindSchema,
  PlacementSchema,
  ProjectModeSchema,
  ProjectSchema,
  RunManifestSchema,
  SelectionBlockRangeSchema,
} from "./projects.js";

export const projectsRpc = {
  projects: {
    list: oc
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .output(z.array(ProjectSchema)),
    get: oc.input(z.object({ projectId: Id })).output(ProjectSchema),
    create: oc
      .input(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(2_000).optional(),
          mode: ProjectModeSchema.default("general"),
          instructions: z.string().max(40_000).optional(),
          defaultBotId: Id.optional(),
        }),
      )
      .output(z.object({ project: ProjectSchema, mainBranch: BranchSchema })),
    update: oc
      .input(
        z.object({
          projectId: Id,
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(2_000).optional(),
          instructions: z.string().max(40_000).optional(),
          archived: z.boolean().optional(),
        }),
      )
      .output(ProjectSchema),
    createIndependentChat: oc
      .input(
        z.object({
          title: z.string().min(1).max(200).optional(),
          isTemporary: z.boolean().optional(),
          assistantBotId: Id.optional(),
        }),
      )
      .output(z.object({ threadId: Id, assistantBotId: Id })),
    ensureThreadGraph: oc
      .input(z.object({ threadId: Id, title: z.string().max(200).optional() }))
      .output(
        z.object({
          project: ProjectSchema,
          branches: z.array(BranchSchema),
          activeBranchId: Id,
        }),
      ),
    moveThreadToProject: oc
      .input(
        z.object({
          threadId: Id,
          targetProjectId: Id.optional(),
          newProjectTitle: z.string().min(1).max(200).optional(),
        }),
      )
      .output(
        z.object({
          project: ProjectSchema,
          branch: BranchSchema,
        }),
      ),
    reorderMessageBlocks: oc
      .input(
        z.object({
          projectId: Id,
          branchId: Id,
          messageId: Id,
          orderedBlockIds: z.array(z.string().min(1)).min(1),
          idempotencyKey: z.string().min(1).max(200),
        }),
      )
      .output(
        z.object({
          revisionId: Id,
          messageId: Id,
          updatedMarkdown: z.string(),
        }),
      ),
  },
  branches: {
    list: oc
      .input(z.object({ projectId: Id, includeArchived: z.boolean().optional() }))
      .output(z.array(BranchSchema)),
    create: oc
      .input(
        z.object({
          projectId: Id,
          sourceBranchId: Id,
          name: z.string().min(1).max(200),
          sourceMessageId: Id.optional(),
          sourceMessageRevisionId: Id.optional(),
          sourceArtifactId: Id.optional(),
          inheritedUpToSeq: z.number().int().nonnegative().optional(),
          selectionRange: SelectionBlockRangeSchema.optional(),
          contextMode: BranchContextModeSchema.default("through_message"),
          pinnedRefIds: z.array(Id).optional(),
          defaultModelProvider: z.string().optional(),
          defaultModelId: z.string().optional(),
          defaultThinkingLevel: ThinkingLevelSchema.nullable().optional(),
        }),
      )
      .output(BranchSchema),
    switch: oc
      .input(z.object({ projectId: Id, branchId: Id }))
      .output(z.object({ branch: BranchSchema, placements: z.array(PlacementSchema) })),
    previewContext: oc
      .input(
        z.object({
          branchId: Id,
          modelProvider: z.string().optional(),
          modelId: z.string().optional(),
          extraPlacementIds: z.array(Id).optional(),
          extraArtifactIds: z.array(Id).optional(),
          excludedMessageIds: z.array(Id).optional(),
        }),
      )
      .output(ContextPreviewSchema),
    runManifest: oc.input(z.object({ runId: Id })).output(RunManifestSchema.nullable()),
    compareModels: oc
      .input(
        z.object({
          projectId: Id,
          sourceBranchId: Id,
          sourceMessageId: Id.optional(),
          selectionRange: SelectionBlockRangeSchema.optional(),
          contextMode: BranchContextModeSchema.default("through_message"),
          pinnedRefIds: z.array(Id).optional(),
          promptText: z.string().min(1),
          modelA: z.object({
            provider: z.string(),
            modelId: z.string(),
            thinkingLevel: ThinkingLevelSchema.nullable().optional(),
          }),
          modelB: z.object({
            provider: z.string(),
            modelId: z.string(),
            thinkingLevel: ThinkingLevelSchema.nullable().optional(),
          }),
          clientNonce: z.string().min(1).max(200),
        }),
      )
      .output(
        z.object({
          compareGroup: CompareGroupSchema,
          branchA: BranchSchema,
          branchB: BranchSchema,
        }),
      ),
    messages: oc
      .input(z.object({ branchId: Id }))
      .output(
        z.object({
          branchId: Id,
          threadId: Id,
          messages: z.array(
            z.object({
              id: Id,
              role: z.enum(["user", "assistant"]),
              text: z.string(),
              modelLabel: z.string().optional(),
              createdAt: z.string(),
            }),
          ),
        }),
      ),
    send: oc
      .input(
        z.object({
          branchId: Id,
          text: z.string().min(1).max(40_000),
          contextMode: BranchContextModeSchema.default("through_message"),
          provider: z.string().default("openai"),
          modelId: z.string().default("gpt-4o-mini"),
          focusQuote: z.string().max(12_000).optional(),
          personaId: z.string().max(100).optional(),
          personaPrompt: z.string().max(8_000).optional(),
        }),
      )
      .output(
        z.object({
          userMessage: z.object({
            id: Id,
            role: z.literal("user"),
            text: z.string(),
            createdAt: z.string(),
          }),
          assistantMessage: z.object({
            id: Id,
            role: z.literal("assistant"),
            text: z.string(),
            modelLabel: z.string(),
            createdAt: z.string(),
          }),
        }),
      ),
    rename: oc
      .input(z.object({ branchId: Id, name: z.string().min(1).max(200) }))
      .output(BranchSchema),
    archive: oc
      .input(z.object({ branchId: Id, archived: z.boolean() }))
      .output(BranchSchema),
  },
  placements: {
    list: oc.input(z.object({ branchId: Id })).output(z.array(PlacementSchema)),
    keepInMain: oc
      .input(
        z.object({
          projectId: Id,
          sourceBranchId: Id,
          targetBranchId: Id,
          sourceMessageId: Id.optional(),
          sourceMessageRevisionId: Id.optional(),
          sourceBlockIds: z.array(z.string()).optional(),
          sourceRange: SelectionBlockRangeSchema.optional(),
          sourceRangeDigest: z.string().optional(),
          artifactId: Id.optional(),
          excerptText: z.string().optional(),
          label: z.string().min(1).max(240),
          anchorKind: PlacementAnchorKindSchema.default("after_message"),
          anchorId: Id.optional(),
          useInNextMessage: z.boolean().default(false),
          pinnedAsContext: z.boolean().default(false),
          clientNonce: z.string().min(1).max(200),
        }),
      )
      .output(PlacementSchema),
    move: oc
      .input(
        z.object({
          placementId: Id,
          anchorKind: PlacementAnchorKindSchema,
          anchorId: Id.optional(),
          sortOrder: z.number().int().nonnegative().optional(),
        }),
      )
      .output(PlacementSchema),
    setContextFlags: oc
      .input(
        z.object({
          placementId: Id,
          useInNextMessage: z.boolean().optional(),
          pinnedAsContext: z.boolean().optional(),
        }),
      )
      .output(PlacementSchema),
    remove: oc.input(z.object({ placementId: Id })).output(z.object({ ok: z.literal(true) })),
    reorder: oc
      .input(
        z.object({
          branchId: Id,
          orderedPlacementIds: z.array(Id),
        }),
      )
      .output(z.array(PlacementSchema)),
  },
  merges: {
    preview: oc
      .input(
        z.object({
          projectId: Id,
          sourceBranchId: Id,
          targetBranchId: Id,
        }),
      )
      .output(MergeReviewSchema),
    apply: oc
      .input(
        z.object({
          mergeReviewId: Id,
          expectedTargetHeadRevisionId: Id.nullable(),
          idempotencyKey: z.string().min(1).max(200),
          resolutions: z.array(
            z.object({
              itemId: z.string().min(1),
              choice: MergeItemResolutionChoiceSchema,
              editedText: z.string().optional(),
              chosenArtifactId: Id.optional(),
            }),
          ),
        }),
      )
      .output(
        z.union([
          z.object({ outcome: z.literal("applied"), receipt: MergeReceiptSchema }),
          z.object({ outcome: z.literal("stale_refreshed"), refreshedReview: MergeReviewSchema }),
        ]),
      ),
    undo: oc
      .input(
        z.object({
          mergeReceiptId: Id,
          idempotencyKey: z.string().min(1).max(200),
        }),
      )
      .output(MergeReceiptSchema),
    executeStrategy: oc
      .input(
        z.object({
          projectId: Id,
          sourceBranchId: Id,
          targetBranchId: Id,
          strategy: z.enum(["ai_assisted", "replace", "append", "insert"]),
          selectedText: z.string().min(1).max(40_000),
          instructions: z.string().max(4_000).optional(),
          archiveAfterMerge: z.boolean().default(false),
          previewOnly: z.boolean().default(false),
        }),
      )
      .output(
        z.object({
          beforeText: z.string(),
          afterText: z.string(),
          targetMessageId: Id.nullable(),
          applied: z.boolean(),
          receipt: MergeReceiptSchema.nullable(),
          archivedBranchId: Id.nullable(),
          placement: PlacementSchema.nullable(),
        }),
      ),
  },
};
