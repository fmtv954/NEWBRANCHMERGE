import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createProjectsService } from "./projects-service.js";

const actor: Actor = {
  userId: "user",
  spaceId: "space",
  email: "user@example.test",
  isDeploymentOwner: false,
};
const selectedBlocks = [
  { messageId: "side-answer", blockId: "third", markdown: "**Third.**" },
  { messageId: "side-answer", blockId: "first", markdown: "[First](https://example.test)." },
];
const input = {
  projectId: "project",
  sourceBranchId: "side",
  targetBranchId: "main",
  strategy: "append" as const,
  selectedText: "Fallback that must not be inserted.",
  selectedBlocks,
  archiveAfterMerge: true,
};

function fixture() {
  const source = {
    id: "side",
    threadId: "side-thread",
    projectId: "project",
    isMain: false,
    archivedAt: null as Date | null,
    headRevisionId: "side-head",
    forkOrigin: { sourceMessageId: "message", selectionRangeJson: null },
  };
  const target = {
    id: "main",
    threadId: "main-thread",
    projectId: "project",
    isMain: true,
    archivedAt: null,
    headRevisionId: "main-head",
  };
  const message = {
    id: "message",
    activeRevisionId: null as string | null,
    blocks: [
      { kind: "text", text: "An earlier text block remains unchanged." },
      { kind: "steps", steps: [] },
      { kind: "text", text: "Main start.\n\nMain end." },
    ],
  };
  const projectRevision = { id: "new-project-revision", stateDeltaJson: null as unknown };
  const receipt = {
    id: "receipt",
    mergeReviewId: null,
    baseRevisionId: "main-head",
    targetBeforeRevisionId: "main-head",
    targetAfterRevisionId: projectRevision.id,
    sourceHeadRevisionId: "side-head",
    undoneByReceiptId: null,
    createdAt: new Date(0),
  };
  const recordedReceipt = vi.fn(async () => {
    prisma.mergeReceipt.findFirst.mockResolvedValue(receipt);
    return receipt;
  });
  const prisma = {
    project: { findFirst: vi.fn(async () => ({ ownerUserId: actor.userId, members: [] })) },
    branch: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "side" ? source : target,
      ),
      update: vi.fn(async () => {
        source.archivedAt = new Date();
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    message: {
      findFirst: vi.fn(async () => message as typeof message | null),
      count: vi.fn(async () => 1),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(),
    },
    messageRevision: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "message-revision" })),
    },
    projectRevision: {
      findFirst: vi.fn(async () => ({ id: "main-head", revisionNumber: 1 })),
      create: vi.fn(async ({ data }: { data: { stateDeltaJson: unknown } }) => {
        projectRevision.stateDeltaJson = data.stateDeltaJson;
        return projectRevision;
      }),
      findUnique: vi.fn(async () => projectRevision),
    },
    mergeReceipt: {
      findFirst: vi.fn(async () => null as typeof receipt | null),
      create: recordedReceipt,
    },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(prisma)),
  };
  return { prisma, message, service: createProjectsService(prisma as unknown as PrismaClient) };
}

describe("execute merge strategy", () => {
  it("commits the arranged selection once and keeps other blocks and receipt text intact", async () => {
    const { prisma, service } = fixture();
    const preview = await service.executeMergeStrategy(actor, { ...input, previewOnly: true });
    expect(preview.beforeContext).toBe("An earlier text block remains unchanged.");
    expect(preview.afterText).toBe(
      "Main start.\n\nMain end.\n\n**Third.**\n\n[First](https://example.test).",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const final = "Main start.\n\n**Third.**\n\n[First](https://example.test).\n\nMain end.";
    const apply = {
      ...input,
      previewOnly: false,
      previewBase: preview.previewBase,
      finalAfterText: final,
      idempotencyKey: "confirmed-preview",
    };
    const first = await service.executeMergeStrategy(actor, apply);
    const replay = await service.executeMergeStrategy(actor, apply);

    expect(first).toEqual(replay);
    expect(first.afterText).toBe(final);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          blocks: [
            { kind: "text", text: "An earlier text block remains unchanged." },
            { kind: "steps", steps: [] },
            { kind: "text", text: final },
          ],
        },
      }),
    );
    expect(prisma.mergeReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemResolutionsJson: [
            expect.objectContaining({ resolvedText: final, sourceBlocks: selectedBlocks }),
          ],
        }),
      }),
    );
    expect(prisma.branch.update).toHaveBeenCalledTimes(1);
  });

  it("can retry the same preview after a failed write", async () => {
    const { prisma, service } = fixture();
    const preview = await service.executeMergeStrategy(actor, { ...input, previewOnly: true });
    const apply = {
      ...input,
      previewOnly: false,
      previewBase: preview.previewBase,
      finalAfterText: preview.afterText,
      idempotencyKey: "retry-after-failure",
    };
    prisma.message.updateMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.executeMergeStrategy(actor, apply)).rejects.toThrow("database unavailable");
    expect(prisma.branch.update).not.toHaveBeenCalled();
    await expect(service.executeMergeStrategy(actor, apply)).resolves.toMatchObject({ applied: true });
    expect(prisma.mergeReceipt.create).toHaveBeenCalledTimes(1);
  });

  it("never archives the branch if the destination is missing or changed", async () => {
    const { prisma, message, service } = fixture();
    const preview = await service.executeMergeStrategy(actor, { ...input, previewOnly: true });
    const apply = {
      ...input,
      previewOnly: false,
      previewBase: preview.previewBase,
      finalAfterText: preview.afterText,
    };

    message.activeRevisionId = "newer-message-revision";
    await expect(service.executeMergeStrategy(actor, apply)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    prisma.message.findFirst.mockResolvedValue(null);
    await expect(service.executeMergeStrategy(actor, apply)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });
});
