import { ORPCError } from "@orpc/server";
import type { A2uiSurfaceBlock, A2uiUserActionInput } from "@rakazo/contracts";
import { applyA2uiUserAction } from "@rakazo/core";
import type { RouterContext } from "./context.js";

const seenNoncesBySurface = new Map<string, Set<string>>();

export function a2uiRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    a2ui: {
      dispatchAction: authed.a2ui.dispatchAction.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: { spaceId: string } };
          input: A2uiUserActionInput;
        }) => {
          const branch = await deps.prisma.branch.findFirst({
            where: {
              id: input.branchId,
              projectId: input.projectId,
              project: { spaceId: context.actor.spaceId },
            },
            select: { id: true, threadId: true, headRevisionId: true },
          });
          if (!branch) {
            throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
          }

          const message = await deps.prisma.message.findFirst({
            where: { id: input.messageId, threadId: branch.threadId },
          });
          if (!message) {
            throw new ORPCError("NOT_FOUND", { message: "Message not found" });
          }

          const blocks = Array.isArray(message.blocks)
            ? (message.blocks as Array<Record<string, unknown>>)
            : [];
          const idx = blocks.findIndex(
            (b) => b.kind === "a2ui_surface" && b.surfaceId === input.surfaceId,
          );
          if (idx < 0) {
            throw new ORPCError("NOT_FOUND", { message: "A2UI surface not found on message" });
          }

          const surface = blocks[idx] as unknown as A2uiSurfaceBlock;
          const seen = seenNoncesBySurface.get(surface.surfaceId) ?? new Set<string>();
          const result = applyA2uiUserAction(surface, input, seen, branch.headRevisionId);

          if (!result.accepted) {
            return { accepted: false, deduplicated: false, reason: result.reason };
          }
          if (!result.deduplicated) {
            seenNoncesBySurface.set(surface.surfaceId, new Set(result.seenActionNonces));
            const nextBlocks = [...blocks];
            nextBlocks[idx] = result.nextSurface as unknown as Record<string, unknown>;
            await deps.prisma.message.update({
              where: { id: message.id },
              data: { blocks: nextBlocks as never },
            });
          }

          return {
            accepted: true,
            deduplicated: result.deduplicated,
            surface: result.nextSurface,
          };
        },
      ),
    },
  };
}
