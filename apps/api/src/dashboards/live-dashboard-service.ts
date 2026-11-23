import type { Actor, BillingRoute } from "@rakazo/contracts";
import type { LiveDashboardSnapshot } from "@rakazo/core";
import { buildLiveDashboardSnapshot } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { requireProjectAccess } from "../projects/projects-service.js";

/**
 * Requirement #47: Deterministic Private Live Dashboard refresh service.
 * Reads UsageRecord + ModelCreditHold + Placement/ShotTake counts with zero LLM calls.
 */
export async function computeLiveDashboardSnapshot(
  prisma: PrismaClient,
  actor: Actor,
  input: {
    dashboardId: string;
    projectId?: string;
    occurrenceKey: string;
    since?: Date;
    subscriptionUsagePct?: number | null;
    alertThresholdPct?: number;
  },
): Promise<LiveDashboardSnapshot> {
  const since = input.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (input.projectId) {
    await requireProjectAccess(prisma, actor, input.projectId, "viewer");
  }
  const accessibleProjectFilter = input.projectId
    ? { id: input.projectId, spaceId: actor.spaceId }
    : {
        spaceId: actor.spaceId,
        OR: [{ ownerUserId: actor.userId }, { members: { some: { userId: actor.userId } } }],
      };

  const [usageRows, holdRows, approvedPlacements, approvedTakes] = await Promise.all([
    prisma.usageRecord.findMany({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        createdAt: { gte: since },
      },
      select: {
        provider: true,
        model: true,
        billingRoute: true,
        settledMicros: true,
        costUsd: true,
      },
    }),
    prisma.modelCreditHold.findMany({
      where: {
        userId: actor.userId,
        status: { in: ["held", "unknown_pending", "reconciling"] },
        createdAt: { gte: since },
      },
      select: { billingRoute: true, heldMicros: true },
    }),
    prisma.placement.count({
      where: {
        project: accessibleProjectFilter,
        removedAt: null,
        insertedAt: { gte: since },
      },
    }),
    prisma.shotTake.count({
      where: {
        status: "approved",
        createdAt: { gte: since },
        shot: { scene: { episode: { project: accessibleProjectFilter } } },
      },
    }),
  ]);

  const samples = [
    ...usageRows.map((u) => ({
      provider: u.provider,
      model: u.model,
      billingRoute: (u.billingRoute as BillingRoute | null) ?? "byok",
      confirmedMicros: u.settledMicros ?? BigInt(Math.round((u.costUsd ?? 0) * 1_000_000)),
      pendingMicros: 0n,
    })),
    ...holdRows.map((h) => ({
      provider: "pending",
      model: "in-flight",
      billingRoute: (h.billingRoute as BillingRoute) ?? "hosted_credits",
      confirmedMicros: 0n,
      pendingMicros: h.heldMicros,
    })),
  ];

  return buildLiveDashboardSnapshot({
    dashboardId: input.dashboardId,
    occurrenceKey: input.occurrenceKey,
    nowIso: new Date().toISOString(),
    samples,
    approvedOutputCount: approvedPlacements + approvedTakes,
    subscriptionUsagePct: input.subscriptionUsagePct ?? null,
    alertThresholdPct: input.alertThresholdPct,
  });
}
