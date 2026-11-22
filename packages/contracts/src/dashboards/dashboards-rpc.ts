import { oc } from "@orpc/contract";
import * as z from "zod";
import { Id } from "../ids.js";

export const LiveDashboardSnapshotSchema = z.object({
  dashboardId: Id,
  occurrenceKey: z.string(),
  refreshedAtIso: z.string(),
  llmCallsTriggered: z.literal(0),
  subscriptionUsagePct: z.number().nullable(),
  confirmedApiDollars: z.string(),
  pendingApiDollars: z.string(),
  localExecutionCount: z.number().int().nonnegative(),
  approvedOutputCount: z.number().int().nonnegative(),
  costPerApprovedOutputDollars: z.string().nullable(),
  byModel: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      confirmedDollars: z.string(),
      pendingDollars: z.string(),
    }),
  ),
  alertTriggered: z.boolean(),
  alertReason: z.string().nullable(),
});

export const ConnectorSelfTestResultSchema = z.object({
  serverId: Id,
  botId: Id,
  ok: z.boolean(),
  stages: z.object({
    accountCheck: z.object({ passed: z.boolean(), detail: z.string() }),
    toolDiscovery: z.object({
      passed: z.boolean(),
      discoveredCount: z.number().int().nonnegative(),
      detail: z.string(),
    }),
    permissionCheck: z.object({ passed: z.boolean(), detail: z.string() }),
    readOnlyInvocation: z.object({ passed: z.boolean(), detail: z.string() }),
  }),
  reconnectRequired: z.boolean(),
});

export const MediaGenerateInputSchema = z.object({
  threadId: Id.optional(),
  provider: z.enum([
    "openai",
    "xai",
    "fal",
    "uncensoredllm",
    "refuseless",
    "venice",
    "higgsfield",
  ]),
  modelId: z.string().min(1),
  kind: z.enum(["image_gen", "image_edit", "video_gen"]),
  prompt: z.string().min(1).max(8_000),
  aspectRatio: z.string().max(20).optional(),
  durationSec: z.number().int().positive().max(60).optional(),
  resolution: z.enum(["480p", "720p", "1080p"]).optional(),
  startingImageUrl: z.string().url().optional(),
});

export const MediaGenerateOutputSchema = z.object({
  ok: z.boolean(),
  switched: z.boolean(),
  switchReason: z.string().nullable().optional(),
  originalProvider: z.string().optional(),
  actualProvider: z.string(),
  actualModelId: z.string(),
  status: z.enum(["completed", "queued"]),
  providerRequestId: z.string(),
  outputUrl: z.string().nullable().optional(),
  messageId: Id.nullable().optional(),
});

export const ProviderEnvStatusSchema = z.object({
  provider: z.string(),
  label: z.string(),
  hasEnvKey: z.boolean(),
  baseUrl: z.string(),
  category: z.enum(["frontier", "media", "uncensored"]),
});

export const dashboardsRpc = {
  liveDashboards: {
    snapshot: oc
      .input(
        z.object({
          dashboardId: Id,
          projectId: Id.optional(),
          occurrenceKey: z.string().min(1).max(200),
          subscriptionUsagePct: z.number().min(0).max(100).nullable().optional(),
          alertThresholdPct: z.number().min(1).max(100).optional(),
        }),
      )
      .output(LiveDashboardSnapshotSchema),
  },
  connectors: {
    selfTest: oc
      .input(z.object({ serverId: Id, botId: Id }))
      .output(ConnectorSelfTestResultSchema),
  },
  media: {
    providerStatus: oc.output(z.array(ProviderEnvStatusSchema)),
    generate: oc.input(MediaGenerateInputSchema).output(MediaGenerateOutputSchema),
  },
};
