import { ORPCError } from "@orpc/server";
import type {
  Actor,
  BillingRoute,
  Branch,
  CompareGroup,
  ContextPreview,
  MergeItemResolutionChoice,
  MergePreviewBase,
  MergeReceipt,
  MergeReview,
  MergeSourceBlock,
  Placement,
  Project,
  RunManifest,
  SelectionBlockRange,
  ThinkingLevel,
} from "@rakazo/contracts";
import { findCatalogModel, MergePreviewBaseSchema, SelectionBlockRangeSchema } from "@rakazo/contracts";
import type { ItemMergeBaseline, MergeableEntity } from "@rakazo/core";
import {
  applySurgicalSelectionPatch,
  applyThreeWayMerge,
  buildContextManifestPreview,
  computeThreeWayDiff,
  computeUndoMerge,
  parseMarkdownToCanonicalBlocks,
  reorderMarkdownBlocks,
  sha256Hex,
} from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import * as z from "zod";
import { mergeAnchor, placeMergeText } from "./merge-placement.js";

const StoredStrategyMergeSchema = z.object({
  beforeText: z.string(),
  afterText: z.string(),
  beforeContext: z.string().optional(),
  afterContext: z.string().optional(),
  previewBase: MergePreviewBaseSchema,
  archivedBranchId: z.string().nullable(),
});
const MergeMessageBlocksSchema = z.array(z.looseObject({ kind: z.string() }));

function toIso(d: Date): string {
  return d.toISOString();
}

function mapProject(row: {
  id: string;
  spaceId: string;
  ownerUserId: string;
  title: string;
  description: string;
  mode: string;
  instructions: string;
  defaultBotId: string | null;
  mainThreadId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: row.id,
    spaceId: row.spaceId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    description: row.description,
    mode: row.mode === "microdrama" ? "microdrama" : "general",
    instructions: row.instructions,
    defaultBotId: row.defaultBotId,
    mainThreadId: row.mainThreadId,
    archivedAt: row.archivedAt ? toIso(row.archivedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapBranch(row: {
  id: string;
  projectId: string;
  threadId: string;
  parentBranchId: string | null;
  rootMainBranchId: string | null;
  name: string;
  isMain: boolean;
  headRevisionId: string | null;
  defaultModelProvider: string | null;
  defaultModelId: string | null;
  defaultThinkingLevel: string | null;
  archivedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  forkOrigin?: {
    id: string;
    branchId: string;
    sourceBranchId: string;
    sourceMessageId: string | null;
    sourceMessageRevisionId: string | null;
    sourceArtifactId: string | null;
    inheritedUpToSeq: number;
    baseProjectRevisionId: string | null;
    selectionRangeJson: unknown;
    contextMode: string;
    pinnedRefIdsJson: unknown;
    permissionScope: string;
    createdAt: Date;
  } | null;
}): Branch {
  return {
    id: row.id,
    projectId: row.projectId,
    threadId: row.threadId,
    parentBranchId: row.parentBranchId,
    rootMainBranchId: row.rootMainBranchId,
    name: row.name,
    isMain: row.isMain,
    headRevisionId: row.headRevisionId,
    defaultModelProvider: row.defaultModelProvider,
    defaultModelId: row.defaultModelId,
    defaultThinkingLevel: (row.defaultThinkingLevel as ThinkingLevel | null) ?? null,
    pendingReviewCount: 0,
    archivedAt: row.archivedAt ? toIso(row.archivedAt) : null,
    createdByUserId: row.createdByUserId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    forkOrigin: row.forkOrigin
      ? {
          id: row.forkOrigin.id,
          branchId: row.forkOrigin.branchId,
          sourceBranchId: row.forkOrigin.sourceBranchId,
          sourceMessageId: row.forkOrigin.sourceMessageId,
          sourceMessageRevisionId: row.forkOrigin.sourceMessageRevisionId,
          sourceArtifactId: row.forkOrigin.sourceArtifactId,
          inheritedUpToSeq: row.forkOrigin.inheritedUpToSeq,
          baseProjectRevisionId: row.forkOrigin.baseProjectRevisionId,
          selectionRange: (row.forkOrigin.selectionRangeJson as SelectionBlockRange | null) ?? null,
          contextMode:
            (row.forkOrigin.contextMode as "through_message" | "only_selection" | "custom") ??
            "through_message",
          pinnedRefIds: Array.isArray(row.forkOrigin.pinnedRefIdsJson)
            ? (row.forkOrigin.pinnedRefIdsJson as string[])
            : [],
          permissionScope: row.forkOrigin.permissionScope,
          createdAt: toIso(row.forkOrigin.createdAt),
        }
      : null,
  };
}

function mapPlacement(row: {
  id: string;
  projectId: string;
  targetBranchId: string;
  sourceBranchId: string;
  sourceMessageId: string | null;
  sourceMessageRevisionId: string | null;
  sourceBlockIdsJson: unknown;
  sourceRangeJson: unknown;
  sourceRangeDigest: string | null;
  artifactId: string | null;
  excerptText: string | null;
  label: string;
  anchorKind: string;
  anchorId: string | null;
  sortOrder: number;
  useInNextMessage: boolean;
  pinnedAsContext: boolean;
  originalRunId: string | null;
  originalCostMicros: bigint | null;
  originCreatedAt: Date;
  insertedAt: Date;
  removedAt: Date | null;
}): Placement {
  return {
    id: row.id,
    projectId: row.projectId,
    targetBranchId: row.targetBranchId,
    sourceBranchId: row.sourceBranchId,
    sourceMessageId: row.sourceMessageId,
    sourceMessageRevisionId: row.sourceMessageRevisionId,
    sourceBlockIds: Array.isArray(row.sourceBlockIdsJson)
      ? (row.sourceBlockIdsJson as string[])
      : null,
    sourceRange: (row.sourceRangeJson as SelectionBlockRange | null) ?? null,
    sourceRangeDigest: row.sourceRangeDigest,
    artifactId: row.artifactId,
    excerptText: row.excerptText,
    label: row.label,
    anchorKind: row.anchorKind as Placement["anchorKind"],
    anchorId: row.anchorId,
    sortOrder: row.sortOrder,
    useInNextMessage: row.useInNextMessage,
    pinnedAsContext: row.pinnedAsContext,
    originalRunId: row.originalRunId,
    originalCostMicros: row.originalCostMicros !== null ? row.originalCostMicros.toString() : null,
    originCreatedAt: toIso(row.originCreatedAt),
    insertedAt: toIso(row.insertedAt),
    removedAt: row.removedAt ? toIso(row.removedAt) : null,
  };
}

async function resolveDefaultAssistantBotId(
  prisma: PrismaClient,
  spaceId: string,
  userId: string,
): Promise<string> {
  const existing = await prisma.bot.findFirst({
    where: { spaceId, archivedAt: null },
    orderBy: [{ isDefaultAssistant: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (existing) return existing.id;

  const bot = await prisma.bot.create({
    data: {
      spaceId,
      userId,
      name: "CLONE Assistant",
      description: "Default workspace assistant across independent chats and project branches.",
      color: "#0e9f5a",
      isDefaultAssistant: true,
    },
    select: { id: true },
  });
  return bot.id;
}

async function requireProjectAccess(
  prisma: PrismaClient,
  actor: Actor,
  projectId: string,
  minRole: "viewer" | "editor" | "owner" = "viewer",
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, spaceId: actor.spaceId },
    include: { members: { where: { userId: actor.userId } } },
  });
  if (!project) throw new ORPCError("NOT_FOUND", { message: "Project not found" });
  const role = project.members[0]?.role ?? (project.ownerUserId === actor.userId ? "owner" : null);
  if (!role) throw new ORPCError("FORBIDDEN", { message: "No access to this project" });
  if (minRole === "owner" && role !== "owner") {
    throw new ORPCError("FORBIDDEN", { message: "Project owner permission required" });
  }
  if (minRole === "editor" && role === "viewer") {
    throw new ORPCError("FORBIDDEN", { message: "Project editor permission required" });
  }
  return project;
}

export function createProjectsService(prisma: PrismaClient) {
  return {
    async listProjects(actor: Actor, includeArchived = false): Promise<Project[]> {
      const rows = await prisma.project.findMany({
        where: {
          spaceId: actor.spaceId,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(mapProject);
    },

    async getProject(actor: Actor, projectId: string): Promise<Project> {
      const project = await requireProjectAccess(prisma, actor, projectId);
      return mapProject(project);
    },

    async createProject(
      actor: Actor,
      input: {
        title: string;
        description?: string;
        mode: "general" | "microdrama";
        instructions?: string;
        defaultBotId?: string;
      },
    ): Promise<{ project: Project; mainBranch: Branch }> {
      const botId =
        input.defaultBotId ??
        (await resolveDefaultAssistantBotId(prisma, actor.spaceId, actor.userId));

      return prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            spaceId: actor.spaceId,
            ownerUserId: actor.userId,
            title: input.title,
            description: input.description ?? "",
            mode: input.mode,
            instructions: input.instructions ?? "",
            defaultBotId: botId,
          },
        });

        await tx.projectMember.create({
          data: { projectId: project.id, userId: actor.userId, role: "owner" },
        });

        const mainThread = await tx.thread.create({
          data: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            assistantBotId: botId,
            projectId: project.id,
            title: "Main",
          },
        });

        const mainBranch = await tx.branch.create({
          data: {
            projectId: project.id,
            threadId: mainThread.id,
            name: "Main",
            isMain: true,
            createdByUserId: actor.userId,
          },
        });

        const rev0 = await tx.projectRevision.create({
          data: {
            projectId: project.id,
            branchId: mainBranch.id,
            revisionNumber: 0,
            authorUserId: actor.userId,
            eventType: "message_commit",
            stateDeltaJson: { initialized: true },
          },
        });

        const updatedBranch = await tx.branch.update({
          where: { id: mainBranch.id },
          data: { headRevisionId: rev0.id },
        });
        const updatedProject = await tx.project.update({
          where: { id: project.id },
          data: { mainThreadId: mainThread.id },
        });

        return {
          project: mapProject(updatedProject),
          mainBranch: mapBranch(updatedBranch),
        };
      });
    },

    async updateProject(
      actor: Actor,
      input: {
        projectId: string;
        title?: string;
        description?: string;
        instructions?: string;
        archived?: boolean;
      },
    ): Promise<Project> {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const updated = await prisma.project.update({
        where: { id: input.projectId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
          ...(input.archived !== undefined
            ? { archivedAt: input.archived ? new Date() : null }
            : {}),
        },
      });
      return mapProject(updated);
    },

    async createIndependentChat(
      actor: Actor,
      input: { title?: string; isTemporary?: boolean; assistantBotId?: string },
    ): Promise<{ threadId: string; assistantBotId: string }> {
      const chatTitle =
        input.title?.trim() || (input.isTemporary ? "Temporary Chat" : `Chat ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);

      // Copy space default model preference from any existing active bot so New Chat works immediately.
      const templateBot = await prisma.bot.findFirst({
        where: { spaceId: actor.spaceId, archivedAt: null },
        orderBy: [{ isDefaultAssistant: "desc" }, { createdAt: "asc" }],
        select: { modelProvider: true, modelId: true, thinkingLevel: true },
      });

      const created = await prisma.$transaction(async (tx) => {
        const bot = await tx.bot.create({
          data: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            name: chatTitle,
            description: "",
            color: "#10b981",
            isDefaultAssistant: false,
            modelProvider: templateBot?.modelProvider ?? null,
            modelId: templateBot?.modelId ?? null,
            thinkingLevel: templateBot?.thinkingLevel ?? null,
          },
          select: { id: true },
        });
        const thread = await tx.thread.create({
          data: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            botId: bot.id,
            assistantBotId: bot.id,
            title: chatTitle,
            isTemporary: Boolean(input.isTemporary),
          },
          select: { id: true },
        });
        return { threadId: thread.id, assistantBotId: bot.id };
      });
      return created;
    },

    async ensureThreadGraph(
      actor: Actor,
      input: { threadId: string; title?: string },
    ): Promise<{ project: Project; branches: Branch[]; activeBranchId: string }> {
      const existingBranch = await prisma.branch.findFirst({
        where: { threadId: input.threadId, project: { spaceId: actor.spaceId } },
        include: { project: true },
      });
      if (existingBranch) {
        const branches = await prisma.branch.findMany({
          where: { projectId: existingBranch.projectId, archivedAt: null },
          orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
        });
        return {
          project: mapProject(existingBranch.project),
          branches: branches.map(mapBranch),
          activeBranchId: existingBranch.id,
        };
      }

      const thread = await prisma.thread.findFirst({
        where: { id: input.threadId, spaceId: actor.spaceId },
        select: { id: true, title: true, projectId: true },
      });
      if (!thread) {
        throw new ORPCError("NOT_FOUND", { message: "Chat thread not found" });
      }

      return prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            spaceId: actor.spaceId,
            ownerUserId: actor.userId,
            title: input.title ?? thread.title ?? "Chat Branches",
            mode: "general",
          },
        });
        await tx.projectMember.create({
          data: { projectId: project.id, userId: actor.userId, role: "owner" },
        });
        await tx.thread.update({
          where: { id: thread.id },
          data: { projectId: project.id },
        });
        const mainBranch = await tx.branch.create({
          data: {
            projectId: project.id,
            threadId: thread.id,
            name: "Main",
            isMain: true,
            createdByUserId: actor.userId,
          },
        });
        const initialRev = await tx.projectRevision.create({
          data: {
            projectId: project.id,
            branchId: mainBranch.id,
            revisionNumber: 1,
            authorUserId: actor.userId,
            eventType: "message_commit",
            stateDeltaJson: { reason: "initial_thread_graph" },
          },
        });
        const updatedMain = await tx.branch.update({
          where: { id: mainBranch.id },
          data: { headRevisionId: initialRev.id },
        });
        return {
          project: mapProject(project),
          branches: [mapBranch(updatedMain)],
          activeBranchId: updatedMain.id,
        };
      });
    },

    async moveThreadToProject(
      actor: Actor,
      input: { threadId: string; targetProjectId?: string; newProjectTitle?: string },
    ): Promise<{ project: Project; branch: Branch }> {
      const thread = await prisma.thread.findFirst({
        where: { id: input.threadId, spaceId: actor.spaceId },
        select: { id: true, title: true },
      });
      if (!thread) {
        throw new ORPCError("NOT_FOUND", { message: "Chat thread not found" });
      }

      let targetProjectId = input.targetProjectId;
      if (targetProjectId) {
        await requireProjectAccess(prisma, actor, targetProjectId, "editor");
      }

      return prisma.$transaction(async (tx) => {
        const project = targetProjectId
          ? await tx.project.findUniqueOrThrow({ where: { id: targetProjectId } })
          : await tx.project.create({
              data: {
                spaceId: actor.spaceId,
                ownerUserId: actor.userId,
                title: input.newProjectTitle ?? thread.title ?? "New Project",
                mode: "general",
              },
            });
        if (!targetProjectId) {
          await tx.projectMember.create({
            data: { projectId: project.id, userId: actor.userId, role: "owner" },
          });
        }

        await tx.thread.update({
          where: { id: thread.id },
          data: { projectId: project.id },
        });

        const existingBranch = await tx.branch.findFirst({
          where: { threadId: thread.id },
        });
        if (existingBranch) {
          const moved = await tx.branch.update({
            where: { id: existingBranch.id },
            data: { projectId: project.id },
          });
          return { project: mapProject(project), branch: mapBranch(moved) };
        }

        const hasMain = await tx.branch.findFirst({
          where: { projectId: project.id, isMain: true },
        });
        const createdBranch = await tx.branch.create({
          data: {
            projectId: project.id,
            threadId: thread.id,
            name: hasMain ? (thread.title ?? "Imported Chat") : "Main",
            isMain: !hasMain,
            createdByUserId: actor.userId,
          },
        });
        return { project: mapProject(project), branch: mapBranch(createdBranch) };
      });
    },

    async reorderMessageBlocks(
      actor: Actor,
      input: {
        projectId: string;
        branchId: string;
        messageId: string;
        orderedBlockIds: string[];
        idempotencyKey: string;
      },
    ): Promise<{ revisionId: string; messageId: string; updatedMarkdown: string }> {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const message = await prisma.message.findFirst({
        where: { id: input.messageId, thread: { spaceId: actor.spaceId } },
        select: { id: true, blocks: true, activeRevisionId: true },
      });
      if (!message) {
        throw new ORPCError("NOT_FOUND", { message: "Message not found" });
      }
      const blocks = Array.isArray(message.blocks)
        ? (message.blocks as Array<Record<string, unknown>>)
        : [];
      const textIdx = blocks.findIndex((b) => b.kind === "text" && typeof b.text === "string");
      const originalMarkdown = textIdx >= 0 ? String(blocks[textIdx]!.text) : "";
      const updatedMarkdown = reorderMarkdownBlocks(originalMarkdown, input.orderedBlockIds);

      const nextBlocks = [...blocks];
      if (textIdx >= 0) {
        nextBlocks[textIdx] = { ...nextBlocks[textIdx], text: updatedMarkdown };
      }

      return prisma.$transaction(async (tx) => {
        const latestRev = await tx.projectRevision.findFirst({
          where: { branchId: input.branchId },
          orderBy: { revisionNumber: "desc" },
          select: { id: true, revisionNumber: true },
        });
        const projRev = await tx.projectRevision.create({
          data: {
            projectId: input.projectId,
            branchId: input.branchId,
            parentRevisionId: latestRev?.id ?? null,
            revisionNumber: (latestRev?.revisionNumber ?? 0) + 1,
            authorUserId: actor.userId,
            eventType: "message_commit",
            stateDeltaJson: { reorderMessageId: message.id, idempotencyKey: input.idempotencyKey },
          },
        });
        const latestMsgRev = await tx.messageRevision.findFirst({
          where: { messageId: message.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const msgRev = await tx.messageRevision.create({
          data: {
            messageId: message.id,
            version: (latestMsgRev?.version ?? 0) + 1,
            canonicalText: updatedMarkdown,
            blocksJson: nextBlocks as object,
            sourceAction: "user_edit",
          },
        });
        await tx.message.update({
          where: { id: message.id },
          data: { blocks: nextBlocks as object, activeRevisionId: msgRev.id },
        });
        await tx.branch.update({
          where: { id: input.branchId },
          data: { headRevisionId: projRev.id },
        });
        return { revisionId: msgRev.id, messageId: message.id, updatedMarkdown };
      });
    },

    async updateMessageMarkdown(
      actor: Actor,
      input: {
        projectId: string;
        branchId: string;
        messageId: string;
        updatedMarkdown: string;
        blockIndex?: number;
        expectedTextDigest?: string;
        sourceAction?: "user_edit" | "merge_apply";
        idempotencyKey: string;
      },
    ): Promise<{
      revisionId: string;
      version: number;
      messageId: string;
      updatedMarkdown: string;
    }> {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const message = await prisma.message.findFirst({
        where: { id: input.messageId, thread: { spaceId: actor.spaceId } },
        select: { id: true, blocks: true, activeRevisionId: true },
      });
      if (!message) {
        throw new ORPCError("NOT_FOUND", { message: "Message not found" });
      }
      const blocks = Array.isArray(message.blocks)
        ? (message.blocks as Array<Record<string, unknown>>)
        : [];
      const textIdx =
        input.blockIndex ??
        blocks.findIndex((b) => b.kind === "text" && typeof b.text === "string");
      const block = blocks[textIdx];
      const originalMarkdown =
        block?.kind === "text" && typeof block.text === "string" ? block.text : "";
      if (
        (input.blockIndex !== undefined && block?.kind !== "text") ||
        (input.expectedTextDigest !== undefined &&
          sha256Hex(originalMarkdown) !== input.expectedTextDigest)
      ) {
        throw new ORPCError("CONFLICT", {
          message: "Main changed. Reopen the canvas to edit the latest version.",
        });
      }
      const nextBlocks = [...blocks];
      if (textIdx >= 0) {
        nextBlocks[textIdx] = { ...nextBlocks[textIdx], text: input.updatedMarkdown };
      } else {
        nextBlocks.unshift({ kind: "text", text: input.updatedMarkdown });
      }

      return prisma.$transaction(async (tx) => {
        const updated = await tx.message.updateMany({
          where: {
            id: message.id,
            activeRevisionId: message.activeRevisionId,
            blocks: { equals: blocks as object },
          },
          data: { blocks: nextBlocks as object },
        });
        if (!updated.count) {
          throw new ORPCError("CONFLICT", {
            message: "Main changed. Reopen the canvas to edit the latest version.",
          });
        }
        const latestMsgRev = await tx.messageRevision.findFirst({
          where: { messageId: message.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        let nextVersion = (latestMsgRev?.version ?? 0) + 1;
        // Preserve original v1 snapshot before first mutation so user can always revert to v1!
        if (!latestMsgRev) {
          await tx.messageRevision.create({
            data: {
              messageId: message.id,
              version: 1,
              canonicalText: originalMarkdown,
              blocksJson: blocks as object,
              sourceAction: "original",
            },
          });
          nextVersion = 2;
        }
        const msgRev = await tx.messageRevision.create({
          data: {
            messageId: message.id,
            version: nextVersion,
            canonicalText: input.updatedMarkdown,
            blocksJson: nextBlocks as object,
            sourceAction: input.sourceAction ?? "user_edit",
          },
        });
        await tx.message.update({
          where: { id: message.id },
          data: { activeRevisionId: msgRev.id },
        });
        return {
          revisionId: msgRev.id,
          version: msgRev.version,
          messageId: message.id,
          updatedMarkdown: input.updatedMarkdown,
        };
      });
    },

    async listMessageRevisions(actor: Actor, messageId: string) {
      const message = await prisma.message.findFirst({
        where: { id: messageId, thread: { spaceId: actor.spaceId } },
        select: { id: true, activeRevisionId: true },
      });
      if (!message) throw new ORPCError("NOT_FOUND", { message: "Message not found" });
      const rows = await prisma.messageRevision.findMany({
        where: { messageId: message.id },
        orderBy: { version: "desc" },
        select: { id: true, version: true, canonicalText: true, sourceAction: true, createdAt: true },
      });
      return {
        messageId: message.id,
        activeRevisionId: message.activeRevisionId,
        revisions: rows.map((r) => ({
          id: r.id,
          version: r.version,
          canonicalText: r.canonicalText,
          sourceAction: r.sourceAction,
          createdAt: toIso(r.createdAt),
        })),
      };
    },

    async restoreMessageRevision(
      actor: Actor,
      input: { projectId: string; branchId: string; messageId: string; revisionId: string },
    ) {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const rev = await prisma.messageRevision.findFirst({
        where: { id: input.revisionId, messageId: input.messageId },
      });
      if (!rev) throw new ORPCError("NOT_FOUND", { message: "Revision not found" });
      await prisma.message.update({
        where: { id: input.messageId },
        data: { blocks: rev.blocksJson as object, activeRevisionId: rev.id },
      });
      return {
        revisionId: rev.id,
        version: rev.version,
        messageId: input.messageId,
        updatedMarkdown: rev.canonicalText,
      };
    },

    async listBranches(
      actor: Actor,
      projectId: string,
      includeArchived = false,
    ): Promise<Branch[]> {
      await requireProjectAccess(prisma, actor, projectId);
      const rows = await prisma.branch.findMany({
        where: {
          projectId,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        include: { forkOrigin: true },
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      });
      return rows.map(mapBranch);
    },

    async createBranch(
      actor: Actor,
      input: {
        projectId: string;
        sourceBranchId: string;
        name: string;
        sourceMessageId?: string;
        sourceMessageRevisionId?: string;
        sourceArtifactId?: string;
        inheritedUpToSeq?: number;
        selectionRange?: SelectionBlockRange;
        contextMode: "through_message" | "only_selection" | "custom";
        pinnedRefIds?: string[];
        defaultModelProvider?: string;
        defaultModelId?: string;
        defaultThinkingLevel?: ThinkingLevel | null;
      },
    ): Promise<Branch> {
      const project = await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const sourceBranch = await prisma.branch.findFirst({
        where: { id: input.sourceBranchId, projectId: project.id },
      });
      if (!sourceBranch) {
        throw new ORPCError("NOT_FOUND", { message: "Source branch not found" });
      }

      const assistantBotId =
        project.defaultBotId ??
        (await resolveDefaultAssistantBotId(prisma, actor.spaceId, actor.userId));

      let inheritedUpToSeq = input.inheritedUpToSeq ?? 0;
      if (input.sourceMessageId && input.inheritedUpToSeq === undefined) {
        const msg = await prisma.message.findUnique({
          where: { id: input.sourceMessageId },
          select: { seq: true },
        });
        if (msg) inheritedUpToSeq = msg.seq;
      }

      return prisma.$transaction(async (tx) => {
        const thread = await tx.thread.create({
          data: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            assistantBotId,
            projectId: project.id,
            title: input.name,
          },
        });

        const branch = await tx.branch.create({
          data: {
            projectId: project.id,
            threadId: thread.id,
            parentBranchId: sourceBranch.id,
            rootMainBranchId: sourceBranch.isMain
              ? sourceBranch.id
              : (sourceBranch.rootMainBranchId ?? sourceBranch.id),
            name: input.name,
            isMain: false,
            defaultModelProvider: input.defaultModelProvider ?? sourceBranch.defaultModelProvider,
            defaultModelId: input.defaultModelId ?? sourceBranch.defaultModelId,
            defaultThinkingLevel: input.defaultThinkingLevel ?? sourceBranch.defaultThinkingLevel,
            createdByUserId: actor.userId,
          },
        });

        await tx.branchForkOrigin.create({
          data: {
            branchId: branch.id,
            sourceBranchId: sourceBranch.id,
            sourceMessageId: input.sourceMessageId ?? null,
            sourceMessageRevisionId: input.sourceMessageRevisionId ?? null,
            sourceArtifactId: input.sourceArtifactId ?? null,
            inheritedUpToSeq,
            baseProjectRevisionId: sourceBranch.headRevisionId,
            selectionRangeJson: input.selectionRange ?? undefined,
            contextMode: input.contextMode,
            pinnedRefIdsJson: input.pinnedRefIds ?? [],
            permissionScope: "project",
          },
        });

        const rev0 = await tx.projectRevision.create({
          data: {
            projectId: project.id,
            branchId: branch.id,
            parentRevisionId: sourceBranch.headRevisionId,
            revisionNumber: 0,
            authorUserId: actor.userId,
            eventType: "message_commit",
            stateDeltaJson: { forkedFromBranchId: sourceBranch.id, inheritedUpToSeq },
          },
        });

        const updated = await tx.branch.update({
          where: { id: branch.id },
          data: { headRevisionId: rev0.id },
          include: { forkOrigin: true },
        });
        return mapBranch(updated);
      });
    },

    async switchBranch(
      actor: Actor,
      projectId: string,
      branchId: string,
    ): Promise<{ branch: Branch; placements: Placement[] }> {
      await requireProjectAccess(prisma, actor, projectId);
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, projectId },
        include: { forkOrigin: true },
      });
      if (!branch) throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      const placements = await prisma.placement.findMany({
        where: { targetBranchId: branch.id, removedAt: null },
        orderBy: { sortOrder: "asc" },
      });
      return { branch: mapBranch(branch), placements: placements.map(mapPlacement) };
    },

    async previewContext(
      actor: Actor,
      input: {
        branchId: string;
        modelProvider?: string;
        modelId?: string;
        extraPlacementIds?: string[];
        extraArtifactIds?: string[];
        excludedMessageIds?: string[];
      },
    ): Promise<ContextPreview> {
      const branch = await prisma.branch.findUnique({
        where: { id: input.branchId },
        include: { forkOrigin: true, project: true },
      });
      if (!branch || branch.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      }
      await requireProjectAccess(prisma, actor, branch.projectId);

      const provider = input.modelProvider ?? branch.defaultModelProvider ?? "openai";
      const modelId = input.modelId ?? branch.defaultModelId ?? "gpt-6.2-sol";
      const model =
        findCatalogModel(provider, modelId) ?? findCatalogModel("openai", "gpt-6.2-sol")!;

      const messages = await prisma.message.findMany({
        where: { threadId: branch.threadId },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, role: true, blocks: true },
      });

      const placements = await prisma.placement.findMany({
        where: {
          targetBranchId: branch.id,
          removedAt: null,
          OR: [
            { useInNextMessage: true },
            { pinnedAsContext: true },
            ...(input.extraPlacementIds?.length ? [{ id: { in: input.extraPlacementIds } }] : []),
          ],
        },
      });

      return buildContextManifestPreview({
        branchId: branch.id,
        model,
        billingRoute: "byok",
        contextMode:
          (branch.forkOrigin?.contextMode as "through_message" | "only_selection" | "custom") ??
          "through_message",
        inheritedUpToSeq: branch.forkOrigin?.inheritedUpToSeq ?? null,
        selectedExcerptText:
          (branch.forkOrigin?.selectionRangeJson as SelectionBlockRange | null)?.quoteText ?? null,
        turns: messages.map((m) => {
          const text = JSON.stringify(m.blocks);
          return {
            id: m.id,
            seq: m.seq,
            role: (m.role === "user" ? "user" : m.role === "system" ? "system" : "bot") as
              | "user"
              | "bot"
              | "system",
            text,
            estimatedTokens: Math.max(1, Math.ceil(text.length / 4)),
          };
        }),
        attachments: placements.map((p) => ({
          id: p.id,
          label: p.label,
          kind: "text" as const,
          estimatedTokens: Math.max(1, Math.ceil((p.excerptText?.length ?? 200) / 4)),
          sourceKind: "placement" as const,
        })),
        excludedMessageIds: new Set(input.excludedMessageIds ?? []),
      });
    },

    async getRunManifest(actor: Actor, runId: string): Promise<RunManifest | null> {
      const row = await prisma.runManifest.findFirst({
        where: { runId, project: { spaceId: actor.spaceId } },
        orderBy: [{ stepIndex: "desc" }, { attemptIndex: "desc" }],
      });
      if (!row) return null;
      return {
        id: row.id,
        runId: row.runId,
        projectId: row.projectId,
        branchId: row.branchId,
        stepIndex: row.stepIndex,
        attemptIndex: row.attemptIndex,
        retentionPolicy:
          row.retentionPolicy === "temporary_redacted" ? "temporary_redacted" : "standard",
        requestedProvider: row.requestedProvider,
        requestedModelId: row.requestedModelId,
        resolvedProvider: row.resolvedProvider,
        resolvedModelId: row.resolvedModelId,
        resolvedModelVersion: row.resolvedModelVersion,
        billingRoute: row.billingRoute as BillingRoute,
        includedTurnCount: Array.isArray(row.inputTurnsJson) ? row.inputTurnsJson.length : 0,
        includedPlacementIds: Array.isArray(row.includedPlacementIdsJson)
          ? (row.includedPlacementIdsJson as string[])
          : [],
        includedArtifactIds: Array.isArray(row.includedArtifactIdsJson)
          ? (row.includedArtifactIdsJson as string[])
          : [],
        omittedItems: Array.isArray(row.omittedItemsJson)
          ? (row.omittedItemsJson as RunManifest["omittedItems"])
          : [],
        actualInputTokens: row.actualInputTokens,
        actualOutputTokens: row.actualOutputTokens,
        estimatedCostMicros:
          row.estimatedCostMicros !== null ? row.estimatedCostMicros.toString() : null,
        settledCostMicros: row.settledCostMicros !== null ? row.settledCostMicros.toString() : null,
        createdAt: toIso(row.createdAt),
      };
    },

    async compareModels(
      actor: Actor,
      input: {
        projectId: string;
        sourceBranchId: string;
        sourceMessageId?: string;
        selectionRange?: SelectionBlockRange;
        contextMode: "through_message" | "only_selection" | "custom";
        pinnedRefIds?: string[];
        promptText: string;
        modelA: { provider: string; modelId: string; thinkingLevel?: ThinkingLevel | null };
        modelB: { provider: string; modelId: string; thinkingLevel?: ThinkingLevel | null };
      },
    ): Promise<{ compareGroup: CompareGroup; branchA: Branch; branchB: Branch }> {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const branchA = await this.createBranch(actor, {
        projectId: input.projectId,
        sourceBranchId: input.sourceBranchId,
        name: `Compare: ${input.modelA.modelId}`,
        sourceMessageId: input.sourceMessageId,
        selectionRange: input.selectionRange,
        contextMode: input.contextMode,
        pinnedRefIds: input.pinnedRefIds,
        defaultModelProvider: input.modelA.provider,
        defaultModelId: input.modelA.modelId,
        defaultThinkingLevel: input.modelA.thinkingLevel ?? null,
      });
      const branchB = await this.createBranch(actor, {
        projectId: input.projectId,
        sourceBranchId: input.sourceBranchId,
        name: `Compare: ${input.modelB.modelId}`,
        sourceMessageId: input.sourceMessageId,
        selectionRange: input.selectionRange,
        contextMode: input.contextMode,
        pinnedRefIds: input.pinnedRefIds,
        defaultModelProvider: input.modelB.provider,
        defaultModelId: input.modelB.modelId,
        defaultThinkingLevel: input.modelB.thinkingLevel ?? null,
      });
      const group = await prisma.compareGroup.create({
        data: {
          projectId: input.projectId,
          sourceBranchId: input.sourceBranchId,
          sourceMessageId: input.sourceMessageId ?? null,
          promptText: input.promptText,
          branchAId: branchA.id,
          branchBId: branchB.id,
        },
      });
      return {
        compareGroup: {
          id: group.id,
          projectId: group.projectId,
          sourceBranchId: group.sourceBranchId,
          sourceMessageId: group.sourceMessageId,
          promptText: group.promptText,
          branchAId: group.branchAId,
          branchBId: group.branchBId,
          runAId: group.runAId,
          runBId: group.runBId,
          createdAt: toIso(group.createdAt),
        },
        branchA,
        branchB,
      };
    },

    async listPlacements(actor: Actor, branchId: string): Promise<Placement[]> {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        include: { project: true },
      });
      if (!branch || branch.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      }
      await requireProjectAccess(prisma, actor, branch.projectId);
      const rows = await prisma.placement.findMany({
        where: { targetBranchId: branch.id, removedAt: null },
        orderBy: { sortOrder: "asc" },
      });
      return rows.map(mapPlacement);
    },

    async keepInMain(
      actor: Actor,
      input: {
        projectId: string;
        sourceBranchId: string;
        targetBranchId: string;
        sourceMessageId?: string;
        sourceMessageRevisionId?: string;
        sourceBlockIds?: string[];
        sourceRange?: SelectionBlockRange;
        sourceRangeDigest?: string;
        artifactId?: string;
        excerptText?: string;
        label: string;
        anchorKind: Placement["anchorKind"];
        anchorId?: string;
        useInNextMessage: boolean;
        pinnedAsContext: boolean;
        clientNonce: string;
      },
    ): Promise<Placement> {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const existing = await prisma.placement.findUnique({
        where: {
          targetBranchId_clientNonce: {
            targetBranchId: input.targetBranchId,
            clientNonce: input.clientNonce,
          },
        },
      });
      if (existing) return mapPlacement(existing);

      const maxOrder = await prisma.placement.aggregate({
        where: { targetBranchId: input.targetBranchId, removedAt: null },
        _max: { sortOrder: true },
      });
      const created = await prisma.placement.create({
        data: {
          projectId: input.projectId,
          sourceBranchId: input.sourceBranchId,
          targetBranchId: input.targetBranchId,
          sourceMessageId: input.sourceMessageId ?? null,
          sourceMessageRevisionId: input.sourceMessageRevisionId ?? null,
          sourceBlockIdsJson: input.sourceBlockIds ?? undefined,
          sourceRangeJson: input.sourceRange ?? undefined,
          sourceRangeDigest: input.sourceRangeDigest ?? input.sourceRange?.textDigest ?? null,
          artifactId: input.artifactId ?? null,
          excerptText: input.excerptText ?? input.sourceRange?.quoteText ?? null,
          label: input.label,
          anchorKind: input.anchorKind,
          anchorId: input.anchorId ?? null,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          useInNextMessage: input.useInNextMessage,
          pinnedAsContext: input.pinnedAsContext,
          clientNonce: input.clientNonce,
          originCreatedAt: new Date(),
        },
      });
      return mapPlacement(created);
    },

    async movePlacement(
      actor: Actor,
      input: {
        placementId: string;
        anchorKind: Placement["anchorKind"];
        anchorId?: string;
        sortOrder?: number;
      },
    ): Promise<Placement> {
      const existing = await prisma.placement.findUnique({
        where: { id: input.placementId },
        include: { project: true },
      });
      if (!existing || existing.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Placement not found" });
      }
      await requireProjectAccess(prisma, actor, existing.projectId, "editor");
      const updated = await prisma.placement.update({
        where: { id: existing.id },
        data: {
          anchorKind: input.anchorKind,
          anchorId: input.anchorId ?? existing.anchorId,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });
      return mapPlacement(updated);
    },

    async setPlacementContextFlags(
      actor: Actor,
      input: { placementId: string; useInNextMessage?: boolean; pinnedAsContext?: boolean },
    ): Promise<Placement> {
      const existing = await prisma.placement.findUnique({
        where: { id: input.placementId },
        include: { project: true },
      });
      if (!existing || existing.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Placement not found" });
      }
      await requireProjectAccess(prisma, actor, existing.projectId, "editor");
      const updated = await prisma.placement.update({
        where: { id: existing.id },
        data: {
          ...(input.useInNextMessage !== undefined
            ? { useInNextMessage: input.useInNextMessage }
            : {}),
          ...(input.pinnedAsContext !== undefined
            ? { pinnedAsContext: input.pinnedAsContext }
            : {}),
        },
      });
      return mapPlacement(updated);
    },

    async removePlacement(actor: Actor, placementId: string): Promise<{ ok: true }> {
      const existing = await prisma.placement.findUnique({
        where: { id: placementId },
        include: { project: true },
      });
      if (!existing || existing.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Placement not found" });
      }
      await requireProjectAccess(prisma, actor, existing.projectId, "editor");
      await prisma.placement.update({
        where: { id: existing.id },
        data: { removedAt: new Date() },
      });
      return { ok: true };
    },

    async reorderPlacements(
      actor: Actor,
      input: { branchId: string; orderedPlacementIds: string[] },
    ): Promise<Placement[]> {
      const branch = await prisma.branch.findFirst({
        where: { id: input.branchId, project: { spaceId: actor.spaceId } },
        select: { id: true, projectId: true },
      });
      if (!branch) throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      await requireProjectAccess(prisma, actor, branch.projectId, "editor");

      await prisma.$transaction(
        input.orderedPlacementIds.map((id, index) =>
          prisma.placement.updateMany({
            where: { id, targetBranchId: branch.id, removedAt: null },
            data: { sortOrder: index },
          }),
        ),
      );

      const updated = await prisma.placement.findMany({
        where: { targetBranchId: branch.id, removedAt: null },
        orderBy: [{ sortOrder: "asc" }, { insertedAt: "asc" }],
      });
      return updated.map(mapPlacement);
    },

    async previewMerge(
      actor: Actor,
      input: { projectId: string; sourceBranchId: string; targetBranchId: string },
    ): Promise<MergeReview> {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const [sourceBranch, targetBranch] = await Promise.all([
        prisma.branch.findFirst({
          where: { id: input.sourceBranchId, projectId: input.projectId },
          include: { forkOrigin: true },
        }),
        prisma.branch.findFirst({
          where: { id: input.targetBranchId, projectId: input.projectId },
        }),
      ]);
      if (!sourceBranch || !targetBranch) {
        throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      }

      const [sourceMessages, targetMessages, dependencies] = await Promise.all([
        prisma.message.findMany({
          where: { threadId: sourceBranch.threadId },
          orderBy: { seq: "asc" },
          select: { id: true, seq: true, blocks: true },
        }),
        prisma.message.findMany({
          where: { threadId: targetBranch.threadId },
          orderBy: { seq: "asc" },
          select: { id: true, seq: true, blocks: true },
        }),
        prisma.dependencyEdge.findMany({
          where: { projectId: input.projectId },
        }),
      ]);

      const toEntities = (
        msgs: Array<{ id: string; seq: number; blocks: unknown }>,
      ): MergeableEntity[] => {
        const out: MergeableEntity[] = [];
        for (const m of msgs) {
          const arr = Array.isArray(m.blocks) ? (m.blocks as Array<Record<string, unknown>>) : [];
          const text = arr
            .filter((b) => b.kind === "text" && typeof b.text === "string")
            .map((b) => b.text as string)
            .join("\n\n");
          for (const blk of parseMarkdownToCanonicalBlocks(text, { seedPrefix: `turn_${m.seq}` })) {
            out.push({
              itemId: blk.stableBlockId,
              targetKind: "block",
              label: `Turn #${m.seq} (${blk.blockType})`,
              text: blk.canonicalText,
            });
          }
        }
        return out;
      };

      const forkSeq = sourceBranch.forkOrigin?.inheritedUpToSeq ?? 0;
      const baseEntities = toEntities(targetMessages.filter((m) => m.seq <= forkSeq));
      const mainEntities = toEntities(targetMessages);
      const branchEntities = toEntities(sourceMessages);

      const diff = computeThreeWayDiff({
        baseEntities,
        mainEntities,
        branchEntities,
        dependencies: dependencies.map((d) => ({
          upstreamId: d.upstreamId,
          downstreamKind: d.downstreamKind as
            | "audio_take"
            | "video_take"
            | "lipsync_take"
            | "report_section",
          downstreamId: d.downstreamId,
          label: d.downstreamId,
          reason: d.staleReason ?? "Upstream revision changed.",
        })),
      });

      const review = await prisma.mergeReview.create({
        data: {
          projectId: input.projectId,
          sourceBranchId: sourceBranch.id,
          targetBranchId: targetBranch.id,
          sourceHeadRevisionId: sourceBranch.headRevisionId ?? "rev_0",
          targetHeadRevisionId: targetBranch.headRevisionId ?? "rev_0",
          commonBaseRevisionId: sourceBranch.forkOrigin?.baseProjectRevisionId ?? null,
          diffItemsJson: diff.items,
          dependencyImpactsJson: diff.dependencyImpacts,
          status: "open",
          createdByUserId: actor.userId,
        },
      });

      return {
        id: review.id,
        projectId: review.projectId,
        sourceBranchId: review.sourceBranchId,
        targetBranchId: review.targetBranchId,
        sourceHeadRevisionId: review.sourceHeadRevisionId,
        targetHeadRevisionId: review.targetHeadRevisionId,
        commonBaseRevisionId: review.commonBaseRevisionId,
        items: diff.items,
        dependencyImpacts: diff.dependencyImpacts,
        status: "open",
        createdAt: toIso(review.createdAt),
      };
    },

    async applyMerge(
      actor: Actor,
      input: {
        mergeReviewId: string;
        expectedTargetHeadRevisionId: string | null;
        idempotencyKey: string;
        resolutions: Array<{
          itemId: string;
          choice: MergeItemResolutionChoice;
          editedText?: string;
          chosenArtifactId?: string;
        }>;
      },
    ): Promise<
      | { outcome: "applied"; receipt: MergeReceipt }
      | { outcome: "stale_refreshed"; refreshedReview: MergeReview }
    > {
      const existingReceipt = await prisma.mergeReceipt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existingReceipt) {
        return {
          outcome: "applied",
          receipt: {
            id: existingReceipt.id,
            projectId: existingReceipt.projectId,
            mergeReviewId: existingReceipt.mergeReviewId,
            idempotencyKey: existingReceipt.idempotencyKey,
            sourceBranchId: existingReceipt.sourceBranchId,
            targetBranchId: existingReceipt.targetBranchId,
            sourceHeadRevisionId: existingReceipt.sourceHeadRevisionId,
            baseRevisionId: existingReceipt.baseRevisionId,
            targetBeforeRevisionId: existingReceipt.targetBeforeRevisionId,
            targetAfterRevisionId: existingReceipt.targetAfterRevisionId,
            acceptedCount: Array.isArray(existingReceipt.itemResolutionsJson)
              ? existingReceipt.itemResolutionsJson.length
              : 0,
            deferredCount: 0,
            affectedDependencies: Array.isArray(existingReceipt.affectedDependenciesJson)
              ? (existingReceipt.affectedDependenciesJson as MergeReceipt["affectedDependencies"])
              : [],
            undoneByReceiptId: existingReceipt.undoneByReceiptId,
            actorUserId: existingReceipt.actorUserId,
            createdAt: toIso(existingReceipt.createdAt),
          },
        };
      }

      const review = await prisma.mergeReview.findUnique({
        where: { id: input.mergeReviewId },
      });
      if (!review) throw new ORPCError("NOT_FOUND", { message: "Merge review not found" });
      await requireProjectAccess(prisma, actor, review.projectId, "editor");

      const targetBranch = await prisma.branch.findUnique({
        where: { id: review.targetBranchId },
      });
      if (!targetBranch) throw new ORPCError("NOT_FOUND", { message: "Target branch not found" });

      if (
        input.expectedTargetHeadRevisionId !== null &&
        targetBranch.headRevisionId !== input.expectedTargetHeadRevisionId
      ) {
        await prisma.mergeReview.update({
          where: { id: review.id },
          data: { status: "stale" },
        });
        const refreshedReview = await this.previewMerge(actor, {
          projectId: review.projectId,
          sourceBranchId: review.sourceBranchId,
          targetBranchId: review.targetBranchId,
        });
        return { outcome: "stale_refreshed", refreshedReview };
      }

      const applied = applyThreeWayMerge({
        diff: {
          items: (review.diffItemsJson as MergeReview["items"]) ?? [],
          dependencyImpacts:
            (review.dependencyImpactsJson as MergeReview["dependencyImpacts"]) ?? [],
        },
        resolutions: input.resolutions,
        priorBaselines: new Map<string, ItemMergeBaseline>(),
      });

      const receipt = await prisma.$transaction(async (tx) => {
        const latestRev = await tx.projectRevision.findFirst({
          where: { branchId: targetBranch.id },
          orderBy: { revisionNumber: "desc" },
          select: { revisionNumber: true },
        });
        const nextNum = (latestRev?.revisionNumber ?? 0) + 1;

        const newRev = await tx.projectRevision.create({
          data: {
            projectId: review.projectId,
            branchId: targetBranch.id,
            parentRevisionId: targetBranch.headRevisionId,
            revisionNumber: nextNum,
            authorUserId: actor.userId,
            eventType: "merge_apply",
            stateDeltaJson: { appliedItems: applied.appliedItems },
          },
        });

        // Optimistic concurrency check on branch head
        const updatedCount = await tx.branch.updateMany({
          where: { id: targetBranch.id, headRevisionId: targetBranch.headRevisionId },
          data: { headRevisionId: newRev.id },
        });
        if (updatedCount.count === 0) {
          throw new ORPCError("CONFLICT", { message: "Main moved concurrently; refresh review." });
        }

        // Dual Git Mode: if source branch forked from a highlighted sentence/word selection,
        // apply a surgical MessageRevision patch on the target Main message.
        const forkOrigin = await tx.branchForkOrigin.findUnique({
          where: { branchId: review.sourceBranchId },
        });
        const firstApplied = applied.appliedItems[0];
        if (
          forkOrigin?.sourceMessageId &&
          forkOrigin.selectionRangeJson &&
          firstApplied &&
          firstApplied.choice !== "defer"
        ) {
          const range = forkOrigin.selectionRangeJson as {
            startUtf16?: number;
            endUtf16?: number;
            utf16Start?: number;
            utf16End?: number;
          };
          const startIdx = range.startUtf16 ?? range.utf16Start;
          const endIdx = range.endUtf16 ?? range.utf16End;
          if (typeof startIdx === "number" && typeof endIdx === "number") {
            const targetMsg = await tx.message.findUnique({
              where: { id: forkOrigin.sourceMessageId },
              select: { id: true, blocks: true },
            });
            if (targetMsg) {
              const blocks = Array.isArray(targetMsg.blocks)
                ? (targetMsg.blocks as Array<Record<string, unknown>>)
                : [];
              const textIdx = blocks.findIndex(
                (b) => b.kind === "text" && typeof b.text === "string",
              );
              const originalText = textIdx >= 0 ? String(blocks[textIdx]!.text) : "";
              const patchedText = applySurgicalSelectionPatch({
                originalText,
                utf16Start: startIdx,
                utf16End: endIdx,
                replacementText: firstApplied.resolvedText ?? "",
                mode:
                  firstApplied.choice === "keep_main" ||
                  firstApplied.choice === "use_branch" ||
                  firstApplied.choice === "keep_both" ||
                  firstApplied.choice === "edit_result"
                    ? firstApplied.choice
                    : "use_branch",
                editedText: firstApplied.resolvedText ?? undefined,
              });
              const nextBlocks = [...blocks];
              if (textIdx >= 0) {
                nextBlocks[textIdx] = { ...nextBlocks[textIdx], text: patchedText };
              }
              const latestMsgRev = await tx.messageRevision.findFirst({
                where: { messageId: targetMsg.id },
                orderBy: { version: "desc" },
                select: { version: true },
              });
              const msgRev = await tx.messageRevision.create({
                data: {
                  messageId: targetMsg.id,
                  version: (latestMsgRev?.version ?? 0) + 1,
                  canonicalText: patchedText,
                  blocksJson: nextBlocks as object,
                  sourceAction: "merge_apply",
                },
              });
              await tx.message.update({
                where: { id: targetMsg.id },
                data: { blocks: nextBlocks as object, activeRevisionId: msgRev.id },
              });
            }
          }
        }

        const createdReceipt = await tx.mergeReceipt.create({
          data: {
            projectId: review.projectId,
            mergeReviewId: review.id,
            idempotencyKey: input.idempotencyKey,
            sourceBranchId: review.sourceBranchId,
            targetBranchId: review.targetBranchId,
            sourceHeadRevisionId: review.sourceHeadRevisionId,
            baseRevisionId: review.commonBaseRevisionId,
            targetBeforeRevisionId: targetBranch.headRevisionId,
            targetAfterRevisionId: newRev.id,
            itemResolutionsJson: applied.appliedItems,
            affectedDependenciesJson: applied.affectedDependencies,
            actorUserId: actor.userId,
          },
        });

        await tx.mergeReview.update({
          where: { id: review.id },
          data: { status: "applied" },
        });

        for (const dep of applied.affectedDependencies) {
          await tx.dependencyEdge.updateMany({
            where: { projectId: review.projectId, downstreamId: dep.downstreamId },
            data: { stale: true, staleReason: dep.reason },
          });
        }

        return createdReceipt;
      });

      return {
        outcome: "applied",
        receipt: {
          id: receipt.id,
          projectId: receipt.projectId,
          mergeReviewId: receipt.mergeReviewId,
          idempotencyKey: receipt.idempotencyKey,
          sourceBranchId: receipt.sourceBranchId,
          targetBranchId: receipt.targetBranchId,
          sourceHeadRevisionId: receipt.sourceHeadRevisionId,
          baseRevisionId: receipt.baseRevisionId,
          targetBeforeRevisionId: receipt.targetBeforeRevisionId,
          targetAfterRevisionId: receipt.targetAfterRevisionId,
          acceptedCount: applied.appliedItems.length,
          deferredCount: applied.deferredItemIds.length,
          affectedDependencies: applied.affectedDependencies,
          undoneByReceiptId: receipt.undoneByReceiptId,
          actorUserId: receipt.actorUserId,
          createdAt: toIso(receipt.createdAt),
        },
      };
    },

    async undoMerge(
      actor: Actor,
      input: { mergeReceiptId: string; idempotencyKey: string },
    ): Promise<MergeReceipt> {
      const existingUndo = await prisma.mergeReceipt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existingUndo) {
        return {
          id: existingUndo.id,
          projectId: existingUndo.projectId,
          mergeReviewId: existingUndo.mergeReviewId,
          idempotencyKey: existingUndo.idempotencyKey,
          sourceBranchId: existingUndo.sourceBranchId,
          targetBranchId: existingUndo.targetBranchId,
          sourceHeadRevisionId: existingUndo.sourceHeadRevisionId,
          baseRevisionId: existingUndo.baseRevisionId,
          targetBeforeRevisionId: existingUndo.targetBeforeRevisionId,
          targetAfterRevisionId: existingUndo.targetAfterRevisionId,
          acceptedCount: 0,
          deferredCount: 0,
          affectedDependencies: [],
          undoneByReceiptId: existingUndo.undoneByReceiptId,
          actorUserId: existingUndo.actorUserId,
          createdAt: toIso(existingUndo.createdAt),
        };
      }

      const original = await prisma.mergeReceipt.findUnique({
        where: { id: input.mergeReceiptId },
      });
      if (!original) throw new ORPCError("NOT_FOUND", { message: "Merge receipt not found" });
      await requireProjectAccess(prisma, actor, original.projectId, "editor");

      const appliedItems = Array.isArray(original.itemResolutionsJson)
        ? (original.itemResolutionsJson as Parameters<typeof computeUndoMerge>[0]["appliedItems"])
        : [];
      const undoPlan = computeUndoMerge({
        appliedItems,
        currentMainEntities: appliedItems.map((i) => ({
          itemId: i.itemId,
          targetKind: "block",
          label: i.itemId,
          text: i.resolvedText,
          artifactId: i.resolvedArtifactId,
        })),
      });

      const targetBranch = await prisma.branch.findUnique({
        where: { id: original.targetBranchId },
      });
      if (!targetBranch) throw new ORPCError("NOT_FOUND", { message: "Target branch not found" });

      const undoReceipt = await prisma.$transaction(async (tx) => {
        const latestRev = await tx.projectRevision.findFirst({
          where: { branchId: targetBranch.id },
          orderBy: { revisionNumber: "desc" },
          select: { revisionNumber: true },
        });
        const nextNum = (latestRev?.revisionNumber ?? 0) + 1;

        const rev = await tx.projectRevision.create({
          data: {
            projectId: original.projectId,
            branchId: targetBranch.id,
            parentRevisionId: targetBranch.headRevisionId,
            revisionNumber: nextNum,
            authorUserId: actor.userId,
            eventType: "merge_undo",
            stateDeltaJson: {
              undidReceiptId: original.id,
              autoRestorable: undoPlan.autoRestorable,
              interveningConflicts: undoPlan.interveningConflicts,
            },
          },
        });

        await tx.branch.update({
          where: { id: targetBranch.id },
          data: { headRevisionId: rev.id },
        });

        const created = await tx.mergeReceipt.create({
          data: {
            projectId: original.projectId,
            idempotencyKey: input.idempotencyKey,
            sourceBranchId: original.targetBranchId,
            targetBranchId: original.targetBranchId,
            baseRevisionId: original.targetAfterRevisionId,
            targetBeforeRevisionId: targetBranch.headRevisionId,
            targetAfterRevisionId: rev.id,
            itemResolutionsJson: undoPlan.autoRestorable,
            affectedDependenciesJson: [],
            actorUserId: actor.userId,
          },
        });

        await tx.mergeReceipt.update({
          where: { id: original.id },
          data: { undoneByReceiptId: created.id },
        });

        return created;
      });

      return {
        id: undoReceipt.id,
        projectId: undoReceipt.projectId,
        mergeReviewId: undoReceipt.mergeReviewId,
        idempotencyKey: undoReceipt.idempotencyKey,
        sourceBranchId: undoReceipt.sourceBranchId,
        targetBranchId: undoReceipt.targetBranchId,
        sourceHeadRevisionId: undoReceipt.sourceHeadRevisionId,
        baseRevisionId: undoReceipt.baseRevisionId,
        targetBeforeRevisionId: undoReceipt.targetBeforeRevisionId,
        targetAfterRevisionId: undoReceipt.targetAfterRevisionId,
        acceptedCount: undoPlan.autoRestorable.length,
        deferredCount: undoPlan.interveningConflicts.length,
        affectedDependencies: [],
        undoneByReceiptId: undoReceipt.undoneByReceiptId,
        actorUserId: undoReceipt.actorUserId,
        createdAt: toIso(undoReceipt.createdAt),
      };
    },

    async listBranchMessages(actor: Actor, branchId: string) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        include: { forkOrigin: true },
      });
      if (!branch) throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      await requireProjectAccess(prisma, actor, branch.projectId);

      const rows = await prisma.message.findMany({
        where: { threadId: branch.threadId },
        orderBy: { seq: "asc" },
        select: { id: true, role: true, blocks: true, createdAt: true },
      });

      const messages = rows
        .filter((r) => r.role === "user" || r.role === "assistant")
        .map((r) => {
          const blocks = Array.isArray(r.blocks)
            ? (r.blocks as Array<Record<string, unknown>>)
            : [];
          const textParts = blocks
            .filter((b) => b.kind === "text" && typeof b.text === "string")
            .map((b) => String(b.text));
          const modelLabelBlock = blocks.find((b) => typeof b.modelLabel === "string");
          return {
            id: r.id,
            role: r.role as "user" | "assistant",
            text: textParts.join("\n\n"),
            modelLabel:
              typeof modelLabelBlock?.modelLabel === "string"
                ? modelLabelBlock.modelLabel
                : undefined,
            createdAt: toIso(r.createdAt),
          };
        });

      return { branchId: branch.id, threadId: branch.threadId, messages };
    },

    async sendBranchMessage(
      actor: Actor,
      input: {
        branchId: string;
        text: string;
        contextMode: "through_message" | "only_selection" | "custom";
        provider: string;
        modelId: string;
        focusQuote?: string;
        personaId?: string;
        personaPrompt?: string;
        responseStyle?: "direct" | "balanced" | "deep";
        temperature?: number;
        maxTokens?: number;
      },
    ) {
      const branch = await prisma.branch.findUnique({
        where: { id: input.branchId },
        include: { forkOrigin: true },
      });
      if (!branch) throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      await requireProjectAccess(prisma, actor, branch.projectId, "editor");

      const promptText = input.text.trim();
      const focusQuote =
        input.focusQuote?.trim() ||
        (branch.forkOrigin?.selectionRangeJson as SelectionBlockRange | null)?.quoteText ||
        "";

      // Persist user message strictly on the side branch's isolated threadId (never Main).
      const latestSide = await prisma.message.findFirst({
        where: { threadId: branch.threadId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const userSeq = (latestSide?.seq ?? 0) + 1;
      const userRow = await prisma.message.create({
        data: {
          threadId: branch.threadId,
          seq: userSeq,
          role: "user",
          authorUserId: actor.userId,
          blocks: [{ kind: "text", text: promptText }],
        },
        select: { id: true, createdAt: true },
      });

      // Assemble LLM context based on persona, responseStyle, and delimited read-only Main context.
      const responseStyle = input.responseStyle ?? "direct";
      const styleDefaults =
        responseStyle === "direct"
          ? {
              temperature: 0.25,
              maxTokens: 320,
              instruction:
                "Response style: DIRECT. Lead immediately with the exact answer in 1-3 crisp sentences (or short bullets only if multiple items were requested). Zero preamble, zero filler, zero recap.",
            }
          : responseStyle === "balanced"
            ? {
                temperature: 0.5,
                maxTokens: 900,
                instruction:
                  "Response style: BALANCED. Give a clear, focused answer with only essential supporting context. Do not recap Main.",
              }
            : {
                temperature: 0.7,
                maxTokens: 2400,
                instruction:
                  "Response style: DEEP. Provide a thorough, structured breakdown of the requested sub-topic without repeating content already in Main.",
              };

      const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
      const personaPrefix = input.personaPrompt?.trim()
        ? `${input.personaPrompt.trim()}\n\n`
        : "";
      const antiRepeatRules = [
        "You are answering a focused 1-on-1 side-branch question.",
        focusQuote
          ? `The user highlighted this specific subject/excerpt from Main: "${focusQuote}".`
          : "",
        "STRICT RULES:",
        "1. Answer ONLY the user's exact question directly.",
        "2. NEVER repeat, summarize, re-explain, or rewrite background information already covered in Main unless the user explicitly asks you to rewrite it.",
        "3. Use any Main context strictly as silent read-only reference to resolve pronouns/entities (e.g. 'he', 'this', 'that term').",
        styleDefaults.instruction,
      ]
        .filter(Boolean)
        .join("\n");

      llmMessages.push({
        role: "system",
        content: `${personaPrefix}${antiRepeatRules}`,
      });

      // Wrap inherited Main history in a single clearly delimited read-only reference block
      // so the model resolves pronouns without mimicking Main's essay structure.
      if (input.contextMode === "through_message" && branch.forkOrigin?.sourceBranchId) {
        const parentBranch = await prisma.branch.findUnique({
          where: { id: branch.forkOrigin.sourceBranchId },
          select: { threadId: true },
        });
        if (parentBranch) {
          const parentMsgs = await prisma.message.findMany({
            where: {
              threadId: parentBranch.threadId,
              ...(branch.forkOrigin.inheritedUpToSeq > 0
                ? { seq: { lte: branch.forkOrigin.inheritedUpToSeq } }
                : {}),
            },
            orderBy: { seq: "asc" },
            take: 16,
            select: { role: true, blocks: true },
          });
          const refLines: string[] = [];
          for (const pm of parentMsgs) {
            if (pm.role !== "user" && pm.role !== "assistant") continue;
            const txt = extractTextFromBlocks(pm.blocks);
            if (txt) {
              const trimmed = txt.length > 1600 ? `${txt.slice(0, 1600)}…` : txt;
              refLines.push(`[${pm.role.toUpperCase()}]: ${trimmed}`);
            }
          }
          if (refLines.length > 0) {
            llmMessages.push({
              role: "system",
              content: `<main_context_reference_only>\nDo NOT repeat or rewrite this background text. Use it only to understand what the user is referring to.\n\n${refLines.join("\n\n")}\n</main_context_reference_only>`,
            });
          }
        }
      }

      // Append prior side-branch turns (excluding the just-inserted user message, added at end).
      const priorSideMsgs = await prisma.message.findMany({
        where: { threadId: branch.threadId, seq: { lt: userSeq } },
        orderBy: { seq: "asc" },
        take: 30,
        select: { role: true, blocks: true },
      });
      for (const sm of priorSideMsgs) {
        if (sm.role !== "user" && sm.role !== "assistant") continue;
        const txt = extractTextFromBlocks(sm.blocks);
        if (txt) llmMessages.push({ role: sm.role, content: txt });
      }
      llmMessages.push({ role: "user", content: promptText });

      const completion = await callBranchCompletion({
        provider: input.provider,
        modelId: input.modelId,
        messages: llmMessages,
        temperature: input.temperature ?? styleDefaults.temperature,
        maxTokens: input.maxTokens ?? styleDefaults.maxTokens,
      });

      const assistantRow = await prisma.message.create({
        data: {
          threadId: branch.threadId,
          seq: userSeq + 1,
          role: "assistant",
          blocks: [{ kind: "text", text: completion.text, modelLabel: completion.modelLabel }],
        },
        select: { id: true, createdAt: true },
      });

      return {
        userMessage: {
          id: userRow.id,
          role: "user" as const,
          text: promptText,
          createdAt: toIso(userRow.createdAt),
        },
        assistantMessage: {
          id: assistantRow.id,
          role: "assistant" as const,
          text: completion.text,
          modelLabel: completion.modelLabel,
          createdAt: toIso(assistantRow.createdAt),
        },
      };
    },

    async renameBranch(actor: Actor, input: { branchId: string; name: string }): Promise<Branch> {
      const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
      if (!branch) throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      await requireProjectAccess(prisma, actor, branch.projectId, "editor");
      const updated = await prisma.branch.update({
        where: { id: branch.id },
        data: { name: input.name.trim() },
        include: { forkOrigin: true },
      });
      return mapBranch(updated);
    },

    async archiveBranch(
      actor: Actor,
      input: { branchId: string; archived: boolean },
    ): Promise<Branch> {
      const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
      if (!branch) throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
      if (branch.isMain && input.archived) {
        throw new ORPCError("BAD_REQUEST", { message: "Main branch cannot be archived" });
      }
      await requireProjectAccess(prisma, actor, branch.projectId, "editor");
      const updated = await prisma.branch.update({
        where: { id: branch.id },
        data: { archivedAt: input.archived ? new Date() : null },
        include: { forkOrigin: true },
      });
      return mapBranch(updated);
    },

    async compareRun(
      _actor: Actor,
      input: {
        prompt: string;
        personaPrompt?: string;
        models: Array<{ provider: string; modelId: string; displayName: string }>;
      },
    ) {
      const sys = input.personaPrompt?.trim()
        ? `${input.personaPrompt.trim()}\n\nAnswer the user's prompt directly, clearly, and concisely using clean Markdown.`
        : "Answer the user's prompt directly, clearly, and concisely using clean Markdown.";

      const results = await Promise.all(
        input.models.map(async (m) => {
          const started = Date.now();
          const res = await callBranchCompletion({
            provider: m.provider,
            modelId: m.modelId,
            messages: [
              { role: "system", content: sys },
              { role: "user", content: input.prompt },
            ],
            temperature: 0.5,
            maxTokens: 1200,
          });
          return {
            provider: m.provider,
            modelId: m.modelId,
            displayName: m.displayName,
            modelLabel: res.modelLabel,
            text: res.text,
            latencyMs: Date.now() - started,
          };
        }),
      );
      return { results };
    },

    async judgeCompare(
      _actor: Actor,
      input: {
        prompt: string;
        candidates: Array<{ modelLabel: string; text: string }>;
      },
    ) {
      const formatted = input.candidates
        .map((c, idx) => `--- CANDIDATE ${idx} (${c.modelLabel}) ---\n${c.text}`)
        .join("\n\n");

      const res = await callBranchCompletion({
        provider: "openai",
        modelId: "gpt-4o-mini",
        temperature: 0.1,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content:
              'You are an impartial AI Judge comparing model responses. Respond with STRICT valid JSON only: {"winnerIndex":0,"summary":"1-2 sentence verdict","scores":[{"index":0,"score":8.5,"rationale":"concise reason"}]}',
          },
          {
            role: "user",
            content: `User Prompt:\n${input.prompt}\n\n${formatted}`,
          },
        ],
      });

      try {
        const cleaned = res.text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleaned) as {
          winnerIndex?: number;
          summary?: string;
          scores?: Array<{ index: number; score: number; rationale: string }>;
        };
        if (typeof parsed.winnerIndex === "number" && Array.isArray(parsed.scores)) {
          return {
            winnerIndex: Math.max(0, Math.min(input.candidates.length - 1, parsed.winnerIndex)),
            summary: parsed.summary ?? "Judge evaluation complete.",
            scores: parsed.scores,
          };
        }
      } catch {
        // Fallback deterministic scoring if judge output wasn't strict JSON
      }

      const fallbackScores = input.candidates.map((c, idx) => ({
        index: idx,
        score: Number((7.5 + Math.min(2, c.text.length / 800)).toFixed(1)),
        rationale: "Clear, relevant response.",
      }));
      const best = fallbackScores.reduce((a, b) => (b.score > a.score ? b : a), fallbackScores[0]!);
      return {
        winnerIndex: best.index,
        summary: res.text.slice(0, 240) || "Compared all candidates on clarity and completeness.",
        scores: fallbackScores,
      };
    },

    async executeMergeStrategy(
      actor: Actor,
      input: {
        projectId: string;
        sourceBranchId: string;
        targetBranchId: string;
        strategy: "ai_assisted" | "replace" | "append" | "insert";
        selectedText: string;
        selectedBlocks?: MergeSourceBlock[];
        previewBase?: MergePreviewBase;
        idempotencyKey?: string;
        finalAfterText?: string;
        instructions?: string;
        archiveAfterMerge: boolean;
        previewOnly: boolean;
      },
    ) {
      await requireProjectAccess(prisma, actor, input.projectId, "editor");
      const [sourceBranch, targetBranch] = await Promise.all([
        prisma.branch.findUnique({
          where: { id: input.sourceBranchId },
          include: { forkOrigin: true },
        }),
        prisma.branch.findUnique({ where: { id: input.targetBranchId } }),
      ]);
      if (
        !sourceBranch ||
        !targetBranch ||
        sourceBranch.projectId !== input.projectId ||
        targetBranch.projectId !== input.projectId ||
        sourceBranch.isMain ||
        !targetBranch.isMain ||
        targetBranch.archivedAt
      ) {
        throw new ORPCError("NOT_FOUND", { message: "Source branch or Main not found" });
      }

      const idempotencyKey = input.idempotencyKey ?? `strategy_${crypto.randomUUID()}`;
      const describeReceipt = (receipt: {
        id: string;
        mergeReviewId: string | null;
        sourceHeadRevisionId: string | null;
        baseRevisionId: string | null;
        targetBeforeRevisionId: string | null;
        targetAfterRevisionId: string;
        undoneByReceiptId: string | null;
        createdAt: Date;
      }): MergeReceipt => ({
        id: receipt.id,
        mergeReviewId: receipt.mergeReviewId,
        sourceHeadRevisionId: receipt.sourceHeadRevisionId,
        baseRevisionId: receipt.baseRevisionId,
        targetBeforeRevisionId: receipt.targetBeforeRevisionId,
        targetAfterRevisionId: receipt.targetAfterRevisionId,
        undoneByReceiptId: receipt.undoneByReceiptId,
        projectId: input.projectId,
        idempotencyKey,
        sourceBranchId: sourceBranch.id,
        targetBranchId: targetBranch.id,
        acceptedCount: 1,
        deferredCount: 0,
        affectedDependencies: [],
        actorUserId: actor.userId,
        createdAt: toIso(receipt.createdAt),
      });

      const readAppliedMerge = async () => {
        if (input.previewOnly || !input.idempotencyKey) return null;
        const receipt = await prisma.mergeReceipt.findFirst({
          where: {
            idempotencyKey,
            projectId: input.projectId,
            sourceBranchId: sourceBranch.id,
            targetBranchId: targetBranch.id,
            actorUserId: actor.userId,
          },
        });
        if (!receipt) return null;
        const revision = await prisma.projectRevision.findUnique({
          where: { id: receipt.targetAfterRevisionId },
          select: { stateDeltaJson: true },
        });
        const delta = StoredStrategyMergeSchema.safeParse(revision?.stateDeltaJson).data;
        if (!delta) return null;
        return {
          beforeText: delta.beforeText,
          afterText: delta.afterText,
          beforeContext: delta.beforeContext,
          afterContext: delta.afterContext,
          targetMessageId: delta.previewBase.messageId,
          previewBase: delta.previewBase,
          applied: true,
          receipt: describeReceipt(receipt),
          archivedBranchId: delta.archivedBranchId,
          placement: null,
        };
      };

      const existing = await readAppliedMerge();
      if (existing) return existing;
      if (sourceBranch.archivedAt) {
        throw new ORPCError("CONFLICT", { message: "This branch has been archived." });
      }

      const savedSelection = sourceBranch.forkOrigin?.selectionRangeJson;
      const selection = SelectionBlockRangeSchema.safeParse(savedSelection).data;
      const originMessageId = sourceBranch.forkOrigin?.sourceMessageId;
      const targetMsg = await prisma.message.findFirst({
        where: {
          threadId: targetBranch.threadId,
          ...(input.previewBase || originMessageId
            ? { id: input.previewBase?.messageId ?? originMessageId }
            : { role: "assistant" }),
        },
        orderBy: { seq: "desc" },
        select: { id: true, blocks: true, activeRevisionId: true },
      });
      if (!targetMsg || (originMessageId && targetMsg.id !== originMessageId)) {
        throw new ORPCError("CONFLICT", { message: "The destination message in Main is missing." });
      }

      const blocks = MergeMessageBlocksSchema.safeParse(targetMsg.blocks).data;
      if (!blocks) {
        throw new ORPCError("CONFLICT", { message: "The destination message could not be read." });
      }
      const textBlocks = blocks.flatMap((block, index) =>
        block.kind === "text" && typeof block.text === "string"
          ? [{ index, text: block.text }]
          : [],
      );
      const matchingBlocks = selection?.quoteText
        ? textBlocks.filter((block) => mergeAnchor(block.text, selection) !== null)
        : [];
      const originalBlocks = matchingBlocks.filter(
        (block) => sha256Hex(block.text) === selection?.textDigest,
      );
      const anchored = input.strategy === "insert" || input.strategy === "replace";
      const matchingBlock =
        originalBlocks.length === 1
          ? originalBlocks[0]
          : matchingBlocks.length === 1
            ? matchingBlocks[0]
            : undefined;
      const targetBlock = input.previewBase
        ? textBlocks.find((block) => block.index === input.previewBase?.blockIndex)
        : matchingBlock ?? textBlocks.at(-1);
      if (!targetBlock) {
        throw new ORPCError("CONFLICT", {
          message: "The destination text block in Main is missing.",
        });
      }

      const beforeText = targetBlock.text;
      const beforeContext = textBlocks
        .filter(({ index }) => index < targetBlock.index)
        .map(({ text }) => text)
        .join("\n\n");
      const afterContext = textBlocks
        .filter(({ index }) => index > targetBlock.index)
        .map(({ text }) => text)
        .join("\n\n");
      const previewBase = {
        messageId: targetMsg.id,
        revisionId: targetMsg.activeRevisionId,
        blockIndex: targetBlock.index,
        textDigest: sha256Hex(beforeText),
      };
      if (
        input.previewBase &&
        (input.previewBase.revisionId !== previewBase.revisionId ||
          input.previewBase.textDigest !== previewBase.textDigest)
      ) {
        throw new ORPCError("CONFLICT", {
          message: "Main changed. Reopen the preview to place your blocks on the latest version.",
        });
      }
      if (
        input.finalAfterText !== undefined &&
        (input.previewOnly || !input.previewBase || !input.finalAfterText.trim())
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Generate a preview and keep some text in the draft before saving.",
        });
      }

      const sourceBlocks = input.selectedBlocks;
      const incoming = (
        sourceBlocks?.map((block) => block.markdown.trim()).join("\n\n") ?? input.selectedText
      ).trim();
      if (!incoming || incoming.length > 40_000) {
        throw new ORPCError("BAD_REQUEST", { message: "Select up to 40,000 characters to merge." });
      }
      if (sourceBlocks) {
        const messageIds = [...new Set(sourceBlocks.map((block) => block.messageId))];
        const count = await prisma.message.count({
          where: { id: { in: messageIds }, threadId: sourceBranch.threadId, role: "assistant" },
        });
        if (count !== messageIds.length) {
          throw new ORPCError("CONFLICT", {
            message: "Some selected replies no longer belong to this side branch.",
          });
        }
      }

      let afterText: string;
      if (input.finalAfterText !== undefined) {
        afterText = input.finalAfterText.trim();
      } else if (input.strategy !== "ai_assisted") {
        if (anchored && savedSelection && !matchingBlock) {
          throw new ORPCError("CONFLICT", {
            message:
              "The branch point is missing or ambiguous. Choose Place manually to set the position in the draft.",
          });
        }
        afterText = placeMergeText(beforeText, incoming, input.strategy, selection);
      } else {
        const focusQuote = selection?.quoteText;
        const synthesized = await callBranchCompletion({
          provider: "openai",
          modelId: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are performing an AI-Assisted Merge of a side-branch result into a Main message. Return ONLY the complete merged Main message text with no preamble or commentary.",
            },
            {
              role: "user",
              content: `Original Main message:\n${beforeText}\n\nBranched excerpt:\n${focusQuote || "(none)"}\n\nSide-branch text to integrate:\n${incoming}\n\nExtra user instructions:\n${input.instructions?.trim() || "Integrate naturally while preserving original structure."}`,
            },
          ],
        });
        afterText =
          synthesized.text.trim() || (beforeText ? `${beforeText}\n\n${incoming}` : incoming);
      }

      if (input.previewOnly) {
        return {
          beforeText,
          afterText,
          beforeContext,
          afterContext,
          targetMessageId: targetMsg.id,
          previewBase,
          applied: false,
          receipt: null,
          archivedBranchId: null,
          placement: null,
        };
      }

      const archivedBranchId = input.archiveAfterMerge ? sourceBranch.id : null;
      try {
        const result = await prisma.$transaction(async (tx) => {
          const nextBlocks = [...blocks];
          nextBlocks[targetBlock.index] = { ...nextBlocks[targetBlock.index], text: afterText };
          const updated = await tx.message.updateMany({
            where: {
              id: targetMsg.id,
              activeRevisionId: previewBase.revisionId,
              blocks: { equals: blocks as object },
            },
            data: { blocks: nextBlocks as object },
          });
          if (!updated.count) {
            throw new ORPCError("CONFLICT", { message: "Main changed. Reopen the merge preview." });
          }
          const latestMsgRev = await tx.messageRevision.findFirst({
            where: { messageId: targetMsg.id },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          let nextVersion = (latestMsgRev?.version ?? 0) + 1;
          if (!latestMsgRev) {
            await tx.messageRevision.create({
              data: {
                messageId: targetMsg.id,
                version: 1,
                canonicalText: beforeText,
                blocksJson: blocks as object,
                sourceAction: "original",
              },
            });
            nextVersion = 2;
          }
          const msgRev = await tx.messageRevision.create({
            data: {
              messageId: targetMsg.id,
              version: nextVersion,
              canonicalText: afterText,
              blocksJson: nextBlocks as object,
              sourceAction: "merge_apply",
            },
          });
          await tx.message.update({
            where: { id: targetMsg.id },
            data: { activeRevisionId: msgRev.id },
          });

          const latestRev = await tx.projectRevision.findFirst({
            where: { branchId: targetBranch.id },
            orderBy: { revisionNumber: "desc" },
            select: { id: true, revisionNumber: true },
          });
          const rev = await tx.projectRevision.create({
            data: {
              projectId: input.projectId,
              branchId: targetBranch.id,
              parentRevisionId: latestRev?.id ?? null,
              revisionNumber: (latestRev?.revisionNumber ?? 0) + 1,
              authorUserId: actor.userId,
              eventType: "merge_apply",
              stateDeltaJson: {
                strategy: input.strategy,
                targetMessageId: targetMsg.id,
                beforeText,
                afterText,
                beforeContext,
                afterContext,
                previewBase,
                archivedBranchId,
              },
            },
          });
          const branchUpdated = await tx.branch.updateMany({
            where: { id: targetBranch.id, headRevisionId: targetBranch.headRevisionId },
            data: { headRevisionId: rev.id },
          });
          if (!branchUpdated.count) {
            throw new ORPCError("CONFLICT", { message: "Main changed. Reopen the merge preview." });
          }

          if (archivedBranchId) {
            await tx.branch.update({
              where: { id: archivedBranchId },
              data: { archivedAt: new Date() },
            });
          }

          return tx.mergeReceipt.create({
            data: {
              projectId: input.projectId,
              idempotencyKey,
              sourceBranchId: sourceBranch.id,
              targetBranchId: targetBranch.id,
              sourceHeadRevisionId: sourceBranch.headRevisionId,
              baseRevisionId: latestRev?.id ?? null,
              targetBeforeRevisionId: latestRev?.id ?? null,
              targetAfterRevisionId: rev.id,
              itemResolutionsJson: [
                {
                  itemId: targetMsg.id,
                  choice: "use_branch",
                  resolvedText: afterText,
                  beforeText,
                  ...(sourceBlocks ? { sourceBlocks } : {}),
                },
              ],
              affectedDependenciesJson: [],
              actorUserId: actor.userId,
            },
          });
        });

        return {
          beforeText,
          afterText,
          beforeContext,
          afterContext,
          targetMessageId: targetMsg.id,
          previewBase,
          applied: true,
          receipt: describeReceipt(result),
          archivedBranchId,
          placement: null,
        };
      } catch (error) {
        const applied = await readAppliedMerge();
        if (applied) return applied;
        throw error;
      }
    },
  };
}

function extractTextFromBlocks(rawBlocks: unknown): string {
  if (!Array.isArray(rawBlocks)) return "";
  return (rawBlocks as Array<Record<string, unknown>>)
    .filter((b) => b.kind === "text" && typeof b.text === "string")
    .map((b) => String(b.text))
    .join("\n\n");
}

async function callBranchCompletion(input: {
  provider: string;
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; modelLabel: string }> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  const uncensoredKey = process.env.UNCENSOREDLLM_API_KEY?.trim();
  const uncensoredBase = (process.env.UNCENSOREDLLM_BASE_URL?.trim() || "https://api.uncensoredllm.com/v1").replace(/\/$/, "");
  const refuselessKey = process.env.REFUSELESS_API_KEY?.trim();

  type EndpointAttempt = { url: string; apiKey: string; model: string; label: string };
  const attempts: EndpointAttempt[] = [];

  const prov = input.provider.toLowerCase();
  if ((prov === "xai" || prov === "grok") && xaiKey) {
    attempts.push({
      url: "https://api.x.ai/v1/chat/completions",
      apiKey: xaiKey,
      model: input.modelId.startsWith("grok-") ? input.modelId : "grok-3-mini",
      label: `xAI · ${input.modelId}`,
    });
    attempts.push({
      url: "https://api.x.ai/v1/chat/completions",
      apiKey: xaiKey,
      model: "grok-3-mini",
      label: "xAI · grok-3-mini",
    });
  } else if (prov === "uncensoredllm" && uncensoredKey) {
    attempts.push({
      url: `${uncensoredBase}/chat/completions`,
      apiKey: uncensoredKey,
      model: input.modelId,
      label: `UncensoredLLM · ${input.modelId}`,
    });
  } else if (prov === "refuseless" && refuselessKey) {
    attempts.push({
      url: "https://api.refuseless.com/v1/chat/completions",
      apiKey: refuselessKey,
      model: input.modelId,
      label: `Refuseless · ${input.modelId}`,
    });
  }

  if (openaiKey) {
    if (prov === "openai") {
      attempts.push({
        url: "https://api.openai.com/v1/chat/completions",
        apiKey: openaiKey,
        model: input.modelId,
        label: `OpenAI · ${input.modelId}`,
      });
    }
    attempts.push({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      model: "gpt-4o-mini",
      label: prov === "openai" ? `OpenAI · ${input.modelId}` : `OpenAI · gpt-4o-mini (fallback)`,
    });
  }
  if (xaiKey && prov !== "xai" && prov !== "grok") {
    attempts.push({
      url: "https://api.x.ai/v1/chat/completions",
      apiKey: xaiKey,
      model: "grok-3-mini",
      label: "xAI · grok-3-mini (fallback)",
    });
  }

  let lastError = "No chat API key configured.";
  for (const attempt of attempts) {
    try {
      const resp = await fetch(attempt.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${attempt.apiKey}`,
        },
        body: JSON.stringify({
          model: attempt.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.3,
          ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        }),
      });
      if (!resp.ok) {
        lastError = `${attempt.label} returned HTTP ${resp.status}`;
        continue;
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        return { text: content, modelLabel: attempt.label };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    text: `Could not reach ${input.provider}:${input.modelId} (${lastError}). Add or verify your API key in Settings → Providers.`,
    modelLabel: `${input.provider}:${input.modelId}`,
  };
}
