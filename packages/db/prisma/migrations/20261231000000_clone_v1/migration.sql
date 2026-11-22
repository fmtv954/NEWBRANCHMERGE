-- DropForeignKey
ALTER TABLE "computer_updates" DROP CONSTRAINT "computer_updates_computerId_fkey";

-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_userId_fkey";

-- DropForeignKey
ALTER TABLE "meeting_calendar_authorizations" DROP CONSTRAINT "meeting_calendar_authorizations_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "meeting_calendar_authorizations" DROP CONSTRAINT "meeting_calendar_authorizations_userId_fkey";

-- DropForeignKey
ALTER TABLE "model_credit_accounts" DROP CONSTRAINT "model_credit_accounts_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "model_credit_entries" DROP CONSTRAINT "model_credit_entries_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "model_credit_lots" DROP CONSTRAINT "model_credit_lots_organizationId_fkey";

-- DropIndex
DROP INDEX "space_model_role_choices_model_connection_key";

-- DropIndex
DROP INDEX "user_model_role_choices_model_connection_key";

-- DropIndex
DROP INDEX "vault_credentials_userId_spaceId_name_key";

-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "isDefaultAssistant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "activeRevisionId" TEXT;

-- AlterTable
ALTER TABLE "routines" ADD COLUMN     "deliveryTarget" TEXT NOT NULL DEFAULT 'main_digest';

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "compareGroupId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "assistantBotId" TEXT,
ADD COLUMN     "isTemporary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN     "artifactId" TEXT,
ADD COLUMN     "billingRoute" TEXT,
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "estimatedMicros" BIGINT,
ADD COLUMN     "mediaDurationSec" DOUBLE PRECISION,
ADD COLUMN     "mediaResolution" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "settledMicros" BIGINT;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'general',
    "instructions" TEXT NOT NULL DEFAULT '',
    "memoryPolicyJson" JSONB NOT NULL DEFAULT '{}',
    "modelPolicyJson" JSONB NOT NULL DEFAULT '{}',
    "defaultBotId" TEXT,
    "mainThreadId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "parentBranchId" TEXT,
    "rootMainBranchId" TEXT,
    "name" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "headRevisionId" TEXT,
    "defaultModelProvider" TEXT,
    "defaultModelId" TEXT,
    "defaultThinkingLevel" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_fork_origins" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "sourceMessageRevisionId" TEXT,
    "sourceArtifactId" TEXT,
    "inheritedUpToSeq" INTEGER NOT NULL DEFAULT 0,
    "baseProjectRevisionId" TEXT,
    "selectionRangeJson" JSONB,
    "contextMode" TEXT NOT NULL DEFAULT 'through_message',
    "pinnedRefIdsJson" JSONB NOT NULL DEFAULT '[]',
    "permissionScope" TEXT NOT NULL DEFAULT 'project',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_fork_origins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_revisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "parentRevisionId" TEXT,
    "revisionNumber" INTEGER NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "stateDeltaJson" JSONB NOT NULL DEFAULT '{}',
    "mergeReceiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_revisions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "canonicalText" TEXT NOT NULL,
    "blocksJson" JSONB NOT NULL DEFAULT '[]',
    "sourceAction" TEXT NOT NULL DEFAULT 'initial',
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_block_versions" (
    "id" TEXT NOT NULL,
    "messageRevisionId" TEXT NOT NULL,
    "stableBlockId" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "canonicalText" TEXT NOT NULL,
    "language" TEXT,
    "textDigest" TEXT NOT NULL,
    "utf16Length" INTEGER NOT NULL,

    CONSTRAINT "content_block_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetBranchId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "sourceMessageRevisionId" TEXT,
    "sourceBlockIdsJson" JSONB,
    "sourceRangeJson" JSONB,
    "sourceRangeDigest" TEXT,
    "artifactId" TEXT,
    "excerptText" TEXT,
    "label" TEXT NOT NULL,
    "anchorKind" TEXT NOT NULL DEFAULT 'after_message',
    "anchorId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "useInNextMessage" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAsContext" BOOLEAN NOT NULL DEFAULT false,
    "originalRunId" TEXT,
    "originalCostMicros" BIGINT,
    "clientNonce" TEXT,
    "originCreatedAt" TIMESTAMP(3) NOT NULL,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_manifests" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "attemptIndex" INTEGER NOT NULL DEFAULT 0,
    "retentionPolicy" TEXT NOT NULL DEFAULT 'standard',
    "requestedProvider" TEXT NOT NULL,
    "requestedModelId" TEXT NOT NULL,
    "resolvedProvider" TEXT,
    "resolvedModelId" TEXT,
    "resolvedModelVersion" TEXT,
    "billingRoute" TEXT NOT NULL,
    "inputTurnsJson" JSONB NOT NULL DEFAULT '[]',
    "includedPlacementIdsJson" JSONB NOT NULL DEFAULT '[]',
    "includedArtifactIdsJson" JSONB NOT NULL DEFAULT '[]',
    "omittedItemsJson" JSONB NOT NULL DEFAULT '[]',
    "compressionSummary" TEXT,
    "tokenBudget" INTEGER,
    "actualInputTokens" INTEGER,
    "actualOutputTokens" INTEGER,
    "estimatedCostMicros" BIGINT,
    "settledCostMicros" BIGINT,
    "toolPermissionsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compare_groups" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "promptText" TEXT NOT NULL,
    "branchAId" TEXT NOT NULL,
    "branchBId" TEXT NOT NULL,
    "runAId" TEXT,
    "runBId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compare_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependency_edges" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "upstreamKind" TEXT NOT NULL,
    "upstreamId" TEXT NOT NULL,
    "upstreamVersion" TEXT NOT NULL,
    "downstreamKind" TEXT NOT NULL,
    "downstreamId" TEXT NOT NULL,
    "downstreamVersion" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependency_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_reviews" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "targetBranchId" TEXT NOT NULL,
    "sourceHeadRevisionId" TEXT NOT NULL,
    "targetHeadRevisionId" TEXT NOT NULL,
    "commonBaseRevisionId" TEXT,
    "diffItemsJson" JSONB NOT NULL DEFAULT '[]',
    "dependencyImpactsJson" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_receipts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mergeReviewId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "targetBranchId" TEXT NOT NULL,
    "sourceHeadRevisionId" TEXT,
    "baseRevisionId" TEXT,
    "targetBeforeRevisionId" TEXT,
    "targetAfterRevisionId" TEXT NOT NULL,
    "itemResolutionsJson" JSONB NOT NULL DEFAULT '[]',
    "affectedDependenciesJson" JSONB NOT NULL DEFAULT '[]',
    "undoneByReceiptId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_credit_holds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "jobId" TEXT,
    "operationKey" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "billingRoute" TEXT NOT NULL DEFAULT 'hosted_credits',
    "heldMicros" BIGINT NOT NULL,
    "supplierCostMicros" BIGINT,
    "customerChargeMicros" BIGINT,
    "settledMicros" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'held',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "model_credit_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_delivery_states" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_delivery_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT NOT NULL DEFAULT '',
    "scriptArtifactId" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "targetDurationSec" INTEGER NOT NULL DEFAULT 90,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_refs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stableCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "voiceProvider" TEXT,
    "voiceId" TEXT,
    "referenceArtifactIdsJson" JSONB NOT NULL DEFAULT '[]',
    "wardrobeNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prop_location_refs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stableCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "referenceArtifactIdsJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prop_location_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "slugline" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shots" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "stableShotCode" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "intent" TEXT NOT NULL DEFAULT '',
    "cameraLens" TEXT NOT NULL DEFAULT '35mm Prime',
    "framing" TEXT NOT NULL DEFAULT 'Medium',
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "dialogueText" TEXT NOT NULL DEFAULT '',
    "dialogueVersion" INTEGER NOT NULL DEFAULT 1,
    "characterRefIdsJson" JSONB NOT NULL DEFAULT '[]',
    "approvedVisualTakeId" TEXT,
    "approvedAudioTakeId" TEXT,
    "staleFlagsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_takes" (
    "id" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "artifactId" TEXT,
    "runId" TEXT,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputSnapshotJson" JSONB NOT NULL DEFAULT '{}',
    "costMicros" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shot_takes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_entity_overlays" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "overlayJson" JSONB NOT NULL DEFAULT '{}',
    "approvedTakeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_entity_overlays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_spaceId_archivedAt_updatedAt_idx" ON "projects"("spaceId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "projects_spaceId_mode_idx" ON "projects"("spaceId", "mode");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_threadId_key" ON "branches"("threadId");

-- CreateIndex
CREATE INDEX "branches_projectId_isMain_archivedAt_idx" ON "branches"("projectId", "isMain", "archivedAt");

-- CreateIndex
CREATE INDEX "branches_parentBranchId_idx" ON "branches"("parentBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_fork_origins_branchId_key" ON "branch_fork_origins"("branchId");

-- CreateIndex
CREATE INDEX "branch_fork_origins_sourceBranchId_idx" ON "branch_fork_origins"("sourceBranchId");

-- CreateIndex
CREATE INDEX "branch_fork_origins_sourceMessageId_idx" ON "branch_fork_origins"("sourceMessageId");

-- CreateIndex
CREATE INDEX "project_revisions_projectId_createdAt_idx" ON "project_revisions"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_revisions_branchId_revisionNumber_key" ON "project_revisions"("branchId", "revisionNumber");

-- CreateIndex
CREATE INDEX "message_revisions_messageId_createdAt_idx" ON "message_revisions"("messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_revisions_messageId_version_key" ON "message_revisions"("messageId", "version");

-- CreateIndex
CREATE INDEX "content_block_versions_stableBlockId_idx" ON "content_block_versions"("stableBlockId");

-- CreateIndex
CREATE UNIQUE INDEX "content_block_versions_messageRevisionId_orderIndex_key" ON "content_block_versions"("messageRevisionId", "orderIndex");

-- CreateIndex
CREATE INDEX "placements_targetBranchId_removedAt_sortOrder_idx" ON "placements"("targetBranchId", "removedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "placements_projectId_sourceBranchId_idx" ON "placements"("projectId", "sourceBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "placements_targetBranchId_clientNonce_key" ON "placements"("targetBranchId", "clientNonce");

-- CreateIndex
CREATE INDEX "run_manifests_runId_idx" ON "run_manifests"("runId");

-- CreateIndex
CREATE INDEX "run_manifests_projectId_branchId_createdAt_idx" ON "run_manifests"("projectId", "branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "run_manifests_runId_stepIndex_attemptIndex_key" ON "run_manifests"("runId", "stepIndex", "attemptIndex");

-- CreateIndex
CREATE INDEX "compare_groups_projectId_createdAt_idx" ON "compare_groups"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "dependency_edges_projectId_upstreamKind_upstreamId_idx" ON "dependency_edges"("projectId", "upstreamKind", "upstreamId");

-- CreateIndex
CREATE INDEX "dependency_edges_projectId_downstreamKind_downstreamId_idx" ON "dependency_edges"("projectId", "downstreamKind", "downstreamId");

-- CreateIndex
CREATE INDEX "merge_reviews_projectId_targetBranchId_status_idx" ON "merge_reviews"("projectId", "targetBranchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "merge_receipts_idempotencyKey_key" ON "merge_receipts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "merge_receipts_projectId_targetBranchId_createdAt_idx" ON "merge_receipts"("projectId", "targetBranchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "model_credit_holds_operationKey_key" ON "model_credit_holds"("operationKey");

-- CreateIndex
CREATE INDEX "model_credit_holds_organizationId_status_createdAt_idx" ON "model_credit_holds"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "model_credit_holds_runId_idx" ON "model_credit_holds"("runId");

-- CreateIndex
CREATE INDEX "model_credit_holds_providerRequestId_idx" ON "model_credit_holds"("providerRequestId");

-- CreateIndex
CREATE INDEX "routine_delivery_states_expiresAt_idx" ON "routine_delivery_states"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "routine_delivery_states_routineId_itemKey_key" ON "routine_delivery_states"("routineId", "itemKey");

-- CreateIndex
CREATE INDEX "episodes_projectId_createdAt_idx" ON "episodes"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "character_refs_projectId_stableCode_key" ON "character_refs"("projectId", "stableCode");

-- CreateIndex
CREATE UNIQUE INDEX "prop_location_refs_projectId_stableCode_key" ON "prop_location_refs"("projectId", "stableCode");

-- CreateIndex
CREATE INDEX "scenes_episodeId_orderIndex_idx" ON "scenes"("episodeId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_episodeId_sceneNumber_key" ON "scenes"("episodeId", "sceneNumber");

-- CreateIndex
CREATE INDEX "shots_sceneId_orderIndex_idx" ON "shots"("sceneId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "shots_sceneId_stableShotCode_key" ON "shots"("sceneId", "stableShotCode");

-- CreateIndex
CREATE INDEX "shot_takes_shotId_kind_status_idx" ON "shot_takes"("shotId", "kind", "status");

-- CreateIndex
CREATE INDEX "shot_takes_branchId_createdAt_idx" ON "shot_takes"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "branch_entity_overlays_entityKind_entityId_idx" ON "branch_entity_overlays"("entityKind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_entity_overlays_branchId_entityKind_entityId_key" ON "branch_entity_overlays"("branchId", "entityKind", "entityId");

-- CreateIndex
CREATE INDEX "runs_projectId_branchId_createdAt_idx" ON "runs"("projectId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "runs_compareGroupId_idx" ON "runs"("compareGroupId");

-- CreateIndex
CREATE INDEX "threads_assistantBotId_idx" ON "threads"("assistantBotId");

-- CreateIndex
CREATE INDEX "threads_projectId_archivedAt_idx" ON "threads"("projectId", "archivedAt");

-- CreateIndex
CREATE INDEX "usage_records_projectId_branchId_createdAt_idx" ON "usage_records"("projectId", "branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_assistantBotId_fkey" FOREIGN KEY ("assistantBotId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computer_updates" ADD CONSTRAINT "computer_updates_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "computers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_credit_accounts" ADD CONSTRAINT "model_credit_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_credit_entries" ADD CONSTRAINT "model_credit_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "model_credit_accounts"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_credit_lots" ADD CONSTRAINT "model_credit_lots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "model_credit_accounts"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_parentBranchId_fkey" FOREIGN KEY ("parentBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_fork_origins" ADD CONSTRAINT "branch_fork_origins_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES "project_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_block_versions" ADD CONSTRAINT "content_block_versions_messageRevisionId_fkey" FOREIGN KEY ("messageRevisionId") REFERENCES "message_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_manifests" ADD CONSTRAINT "run_manifests_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_manifests" ADD CONSTRAINT "run_manifests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_manifests" ADD CONSTRAINT "run_manifests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compare_groups" ADD CONSTRAINT "compare_groups_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_edges" ADD CONSTRAINT "dependency_edges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_reviews" ADD CONSTRAINT "merge_reviews_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_receipts" ADD CONSTRAINT "merge_receipts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_receipts" ADD CONSTRAINT "merge_receipts_mergeReviewId_fkey" FOREIGN KEY ("mergeReviewId") REFERENCES "merge_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_delivery_states" ADD CONSTRAINT "routine_delivery_states_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_refs" ADD CONSTRAINT "character_refs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prop_location_refs" ADD CONSTRAINT "prop_location_refs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_takes" ADD CONSTRAINT "shot_takes_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "shots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_takes" ADD CONSTRAINT "shot_takes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_entity_overlays" ADD CONSTRAINT "branch_entity_overlays_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "user_action_approval_rules_userId_effect_matchKind_matchValue_k" RENAME TO "user_action_approval_rules_userId_effect_matchKind_matchVal_key";

-- Allow CLONE project branches and independent assistant chats in threads_owner_chk
ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_owner_chk";
ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_chk"
  CHECK (
    num_nonnulls("botId", "groupId", "externalConversationId", "helperBotId") = 1
    OR "projectId" IS NOT NULL
    OR "assistantBotId" IS NOT NULL
  );
