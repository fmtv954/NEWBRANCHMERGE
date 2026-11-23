import { randomUUID } from "node:crypto";
import type { Actor } from "@rakazo/contracts";
import {
  asSystem,
  createDb,
  provisionMessagingIdentity,
  runAsSystem,
  runAsTenant,
} from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createProjectsService } from "./projects-service.js";

describe.skipIf(process.env.VERIFY_DATABASE !== "1" || !process.env.DATABASE_URL)(
  "Side Chat merge and regeneration (PostgreSQL)",
  () => {
    it("keeps branch history for repeated merges and regenerates a reply in place", async () => {
      const { prisma, pool } = createDb(process.env.DATABASE_URL!);
      const system = asSystem(prisma);
      const identity = await runAsSystem("test fixture", () =>
        provisionMessagingIdentity(prisma, {
          address: `side-workflow-${randomUUID()}`,
          provider: "test",
        }),
      );
      const actor: Actor = {
        spaceId: identity.spaceId,
        userId: identity.userId,
        email: "side-workflow@example.test",
        isDeploymentOwner: false,
      };
      const complete = vi.fn(async () => ({
        text: "Regenerated reply.",
        modelLabel: "Test model",
      }));
      const service = createProjectsService(prisma, complete);
      try {
        const { project, branches } = await runAsTenant(actor, () =>
          service.ensureThreadGraph(actor, { threadId: identity.threadId, title: "Workflow" }),
        );
        const main = branches.find((branch) => branch.isMain)!;
        const original = await system.message.create({
          data: {
            threadId: main.threadId,
            seq: 1,
            role: "assistant",
            blocks: [{ kind: "text", text: "Original Main." }],
          },
        });
        const side = await runAsTenant(actor, () =>
          service.createBranch(actor, {
            projectId: project.id,
            sourceBranchId: main.id,
            sourceMessageId: original.id,
            name: "Side",
            contextMode: "through_message",
          }),
        );
        const first = await system.message.create({
          data: {
            threadId: side.threadId,
            seq: 1,
            role: "user",
            blocks: [{ kind: "text", text: "First question." }],
          },
        });
        const reply = await system.message.create({
          data: {
            threadId: side.threadId,
            seq: first.seq + 1,
            role: "assistant",
            blocks: [
              { kind: "text", text: "First answer." },
              { kind: "text", text: "More text." },
            ],
          },
        });
        await system.message.createMany({
          data: [
            {
              threadId: side.threadId,
              seq: 3,
              role: "user",
              blocks: [{ kind: "text", text: "Second question." }],
            },
            {
              threadId: side.threadId,
              seq: 4,
              role: "assistant",
              blocks: [{ kind: "text", text: "Second answer." }],
            },
          ],
        });
        await runAsTenant(actor, async () => {
          const listed = await service.listBranchMessages(actor, side.id);
          const secondReply = listed.messages[3]!;
          const merge = {
            projectId: project.id,
            sourceBranchId: side.id,
            targetBranchId: main.id,
            strategy: "append" as const,
            archiveAfterMerge: false,
            previewOnly: false,
          };
          await service.executeMergeStrategy(actor, {
            ...merge,
            selectedText: "First answer.\n\nMore text.",
            selectedBlocks: [
              { messageId: reply.id, blockId: "one-b", markdown: "More text." },
              { messageId: reply.id, blockId: "one-a", markdown: "First answer." },
            ],
          });
          const reopened = await service.listBranchMessages(actor, side.id);
          expect(reopened.messages).toEqual(listed.messages);
          const second = await service.executeMergeStrategy(actor, {
            ...merge,
            selectedText: secondReply.text,
            selectedBlocks: [
              { messageId: secondReply.id, blockId: "two", markdown: secondReply.text },
            ],
          });
          expect(second.afterText).toBe(
            "Original Main.\n\nMore text.\n\nFirst answer.\n\nSecond answer.",
          );
          const request = {
            branchId: side.id,
            messageId: reply.id,
            idempotencyKey: "retry-same",
            settings: { provider: "test", modelId: "selected", thinkingLevel: "high" as const },
          };
          complete.mockRejectedValueOnce(new Error("Provider failed"));
          await expect(service.regenerate(actor, request)).rejects.toThrow("Provider failed");
          expect((await service.listBranchMessages(actor, side.id)).messages).toEqual(
            listed.messages,
          );
          expect(await service.regenerate(actor, request)).toMatchObject({
            id: reply.id,
            text: "Regenerated reply.",
          });
          const after = await service.listBranchMessages(actor, side.id);
          expect(after.messages.map(({ id }) => id)).toEqual(listed.messages.map(({ id }) => id));
          expect(after.messages[3]).toEqual(secondReply);
          expect(await service.regenerate(actor, request)).toMatchObject({
            id: reply.id,
            text: "Regenerated reply.",
          });
          expect(complete).toHaveBeenCalledTimes(2);
          expect(complete).toHaveBeenLastCalledWith(
            actor,
            request.settings,
            expect.objectContaining({
              prompt: "First question.",
              history: [],
            }),
          );
          const revisions = await service.listMessageRevisions(actor, reply.id);
          expect(revisions.revisions.map(({ canonicalText }) => canonicalText)).toEqual([
            "Regenerated reply.",
            "First answer.\n\nMore text.",
          ]);
          await service.restoreMessageRevision(actor, {
            projectId: project.id,
            branchId: side.id,
            messageId: reply.id,
            revisionId: revisions.revisions[1]!.id,
          });
          expect((await service.listBranchMessages(actor, side.id)).messages).toEqual(
            listed.messages,
          );

          complete.mockClear();
          complete.mockRejectedValueOnce(new Error("First model unavailable"));
          const comparison = await service.compareRun(actor, {
            prompt: "Compare the selected ideas.",
            personaPrompt: "Write as an editor.",
            source: {
              branchId: side.id,
              contextMode: "only_selection",
              responseStyle: "deep",
              temperature: 0.4,
              maxTokens: 512,
              blocks: [
                { messageId: secondReply.id, blockId: "two", markdown: secondReply.text },
                { messageId: reply.id, blockId: "one", markdown: "First answer." },
              ],
            },
            models: [
              { provider: "test", modelId: "first", displayName: "First model" },
              { provider: "test", modelId: "second", displayName: "Second model" },
            ],
          });
          expect(comparison.results).toMatchObject([
            { modelId: "first", error: "First model unavailable" },
            { modelId: "second", text: "Regenerated reply." },
          ]);
          expect(complete).toHaveBeenLastCalledWith(
            actor,
            expect.objectContaining({
              modelId: "second",
              personaPrompt: "Write as an editor.",
              responseStyle: "deep",
              temperature: 0.4,
              maxTokens: 512,
            }),
            expect.objectContaining({
              prompt:
                "Compare the selected ideas.\n\nSelected reference blocks:\nSecond answer.\n\nFirst answer.",
              history: [],
            }),
          );
        });

        await system.message.create({
          data: {
            threadId: main.threadId,
            seq: 2,
            role: "user",
            blocks: [{ kind: "text", text: "Question in Main." }],
          },
        });
        const mainReply = await system.message.create({
          data: {
            threadId: main.threadId,
            seq: 3,
            role: "assistant",
            blocks: [{ kind: "text", text: "Reply in Main." }],
          },
        });
        await runAsTenant(actor, async () => {
          const request = {
            branchId: main.id,
            messageId: mainReply.id,
            idempotencyKey: "main-regeneration",
            settings: { provider: "test", modelId: "second", personaPrompt: "Write as an editor." },
          };
          expect(await service.regenerate(actor, request)).toMatchObject({
            id: mainReply.id,
            text: "Regenerated reply.",
          });
          expect(complete).toHaveBeenLastCalledWith(
            actor,
            request.settings,
            expect.objectContaining({
              prompt: "Question in Main.",
            }),
          );
          const { messages } = await service.listBranchMessages(actor, main.id);
          expect(messages.map(({ id }) => id).filter((id) => id === mainReply.id)).toHaveLength(1);
          expect(messages).toHaveLength(3);
        });
      } finally {
        await system.messagingIdentity.deleteMany({ where: { userId: identity.userId } });
        await system.organization.deleteMany({ where: { id: identity.spaceId } });
        await system.user.deleteMany({ where: { id: identity.userId } });
        await prisma.$disconnect();
        await pool.end();
      }
    });
  },
);
