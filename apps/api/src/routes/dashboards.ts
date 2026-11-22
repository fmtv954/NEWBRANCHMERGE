import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
  type CloneProviderId,
  type ProviderCredentialsMap,
  resolveProviderApiSwitch,
  submitUnifiedMediaJob,
} from "@rakazo/adapters";
import { computeLiveDashboardSnapshot } from "../dashboards/live-dashboard-service.js";
import { runConnectorSelfTest } from "../integrations/connector-self-test.js";
import type { RouterContext } from "./context.js";

function readServerProviderKeys(): ProviderCredentialsMap {
  return {
    openai: process.env.OPENAI_API_KEY ?? null,
    xai: process.env.XAI_API_KEY ?? null,
    fal: process.env.FAL_KEY ?? process.env.MEDIA_GENERATION_API_KEY ?? null,
    uncensoredllm: process.env.UNCENSOREDLLM_API_KEY ?? null,
    refuseless: process.env.REFUSELESS_API_KEY ?? null,
    venice: process.env.VENICE_API_KEY ?? null,
    higgsfield: process.env.HIGGSFIELD_API_KEY ?? null,
  };
}

function hasKey(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0 && value.trim().toUpperCase() !== "TBD");
}

export function dashboardsRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    liveDashboards: {
      snapshot: authed.liveDashboards.snapshot.handler(async ({ context, input }) => {
        return computeLiveDashboardSnapshot(deps.prisma, context.actor, input);
      }),
    },
    connectors: {
      selfTest: authed.connectors.selfTest.handler(async ({ context, input }) => {
        return runConnectorSelfTest(deps.prisma, context.actor, input);
      }),
    },
    media: {
      providerStatus: authed.media.providerStatus.handler(async () => {
        const keys = readServerProviderKeys();
        return [
          {
            provider: "openai",
            label: "OpenAI",
            hasEnvKey: hasKey(keys.openai),
            baseUrl: "https://api.openai.com/v1",
            category: "frontier" as const,
          },
          {
            provider: "xai",
            label: "xAI / Grok",
            hasEnvKey: hasKey(keys.xai),
            baseUrl: "https://api.x.ai/v1",
            category: "frontier" as const,
          },
          {
            provider: "fal",
            label: "fal.ai (Seedance / Kling / Seedream)",
            hasEnvKey: hasKey(keys.fal),
            baseUrl: "https://queue.fal.run",
            category: "media" as const,
          },
          {
            provider: "uncensoredllm",
            label: "UncensoredLLM (Qwen / Wan / LTX)",
            hasEnvKey: hasKey(keys.uncensoredllm),
            baseUrl: "https://api.uncensoredllm.ai/v1",
            category: "uncensored" as const,
          },
          {
            provider: "refuseless",
            label: "Refuseless (Abliterated GLM / DeepSeek)",
            hasEnvKey: hasKey(keys.refuseless),
            baseUrl: "https://api.refuseless.com/v1",
            category: "uncensored" as const,
          },
          {
            provider: "venice",
            label: "Venice AI (Private E2EE)",
            hasEnvKey: hasKey(keys.venice),
            baseUrl: "https://api.venice.ai/api/v1",
            category: "uncensored" as const,
          },
        ];
      }),
      generate: authed.media.generate.handler(async ({ context, input }) => {
        const keys = readServerProviderKeys();
        const enableHiggsfieldEval = process.env.ENABLE_HIGGSFIELD_EVAL === "true";

        let route = resolveProviderApiSwitch({
          requestedProvider: input.provider as CloneProviderId,
          requestedModelId: input.modelId,
          modality: "media",
          keys,
          enableHiggsfieldEval,
          allowFallback: true,
        });

        const operationKey = `media_${randomUUID()}`;
        let submission: Awaited<ReturnType<typeof submitUnifiedMediaJob>>;

        try {
          submission = await submitUnifiedMediaJob({
            operationKey,
            provider: route.provider,
            modelId: route.modelId,
            kind: input.kind,
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            durationSec: input.durationSec,
            resolution: input.resolution,
            startingImageUrl: input.startingImageUrl,
            apiKey: route.apiKey,
            enableHiggsfieldEval,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Automatic runtime API switch when a provider returns 402 (insufficient balance)
          if (message.includes("(402)")) {
            const fallback = resolveProviderApiSwitch({
              requestedProvider: route.provider,
              modality: "media",
              keys,
              enableHiggsfieldEval,
              allowFallback: true,
              exhaustedProviders: new Set([route.provider]),
            });
            route = {
              ...fallback,
              switched: true,
              switchReason: "insufficient_balance_402",
              originalProvider: input.provider as CloneProviderId,
            };
            submission = await submitUnifiedMediaJob({
              operationKey: `${operationKey}_fb`,
              provider: route.provider,
              modelId: route.modelId,
              kind: input.kind,
              prompt: input.prompt,
              aspectRatio: input.aspectRatio,
              durationSec: input.durationSec,
              resolution: input.resolution,
              startingImageUrl: input.startingImageUrl,
              apiKey: route.apiKey,
              enableHiggsfieldEval,
            });
          } else {
            throw new ORPCError("BAD_GATEWAY", { message });
          }
        }

        let postedMessageId: string | null = null;
        if (input.threadId) {
          const thread = await deps.prisma.thread.findFirst({
            where: { id: input.threadId, spaceId: context.actor.spaceId },
            select: { id: true, botId: true },
          });
          if (thread) {
            const last = await deps.prisma.message.findFirst({
              where: { threadId: thread.id },
              orderBy: { seq: "desc" },
              select: { seq: true },
            });
            const baseSeq = last?.seq ?? 0;

            await deps.prisma.message.create({
              data: {
                threadId: thread.id,
                seq: baseSeq + 1,
                role: "user",
                authorUserId: context.actor.userId,
                blocks: [
                  {
                    kind: "text",
                    text: `[${input.kind === "video_gen" ? "Video" : "Image"} · ${input.provider}:${input.modelId}] ${input.prompt}`,
                  },
                ],
              },
            });

            const switchNote = route.switched
              ? `\n\n_Switched automatically from **${route.originalProvider}** (${route.switchReason}) to **${route.provider}:${route.modelId}**._`
              : "";
            const body =
              submission.status === "completed" && submission.outputUrl
                ? `Generated with **${submission.provider}:${submission.modelId}**${switchNote}\n\n![Generated output](${submission.outputUrl})\n\n[Open full media](${submission.outputUrl})`
                : `Queued **${input.kind === "video_gen" ? "video" : "image"}** job on **${submission.provider}:${submission.modelId}** (Request ID: \`${submission.providerRequestId}\`).${switchNote}`;

            const assistantMsg = await deps.prisma.message.create({
              data: {
                threadId: thread.id,
                seq: baseSeq + 2,
                role: "assistant",
                botId: thread.botId,
                blocks: [{ kind: "text", text: body }],
              },
              select: { id: true },
            });
            postedMessageId = assistantMsg.id;
          }
        }

        return {
          ok: true,
          switched: route.switched,
          switchReason: route.switchReason ?? null,
          originalProvider: route.originalProvider,
          actualProvider: submission.provider,
          actualModelId: submission.modelId,
          status: submission.status,
          providerRequestId: submission.providerRequestId,
          outputUrl: submission.outputUrl ?? null,
          messageId: postedMessageId,
        };
      }),
    },
  };
}
