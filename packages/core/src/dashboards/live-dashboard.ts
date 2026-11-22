import type { BillingRoute } from "@rakazo/contracts";

export interface DashboardUsageSample {
  provider: string;
  model: string;
  billingRoute: BillingRoute;
  confirmedMicros: bigint;
  pendingMicros: bigint;
}

export interface LiveDashboardSnapshot {
  dashboardId: string;
  occurrenceKey: string;
  refreshedAtIso: string;
  llmCallsTriggered: 0;
  subscriptionUsagePct: number | null;
  confirmedApiDollars: string;
  pendingApiDollars: string;
  localExecutionCount: number;
  approvedOutputCount: number;
  costPerApprovedOutputDollars: string | null;
  byModel: Array<{
    provider: string;
    model: string;
    confirmedDollars: string;
    pendingDollars: string;
  }>;
  alertTriggered: boolean;
  alertReason: string | null;
}

function formatMicrosAsDollars(micros: bigint): string {
  const num = Number(micros) / 1_000_000;
  return `$${num.toFixed(2)}`;
}

/**
 * Requirement #47: Deterministic Private Live Dashboard snapshot builder.
 * Triggers ZERO LLM calls on simple refresh, separates subscription %, confirmed API $,
 * pending charges, local execution counts, and computes cost per approved output.
 */
export function buildLiveDashboardSnapshot(input: {
  dashboardId: string;
  occurrenceKey: string;
  nowIso: string;
  samples: readonly DashboardUsageSample[];
  approvedOutputCount: number;
  subscriptionUsagePct: number | null;
  alertThresholdPct?: number;
}): LiveDashboardSnapshot {
  let confirmedTotal = 0n;
  let pendingTotal = 0n;
  let localExecutionCount = 0;
  const byModelMap = new Map<
    string,
    { provider: string; model: string; confirmed: bigint; pending: bigint }
  >();

  for (const s of input.samples) {
    if (s.billingRoute === "local") {
      localExecutionCount++;
      continue;
    }
    if (s.billingRoute === "subscription") {
      continue;
    }
    confirmedTotal += s.confirmedMicros;
    pendingTotal += s.pendingMicros;

    const key = `${s.provider}:${s.model}`;
    const existing = byModelMap.get(key) ?? {
      provider: s.provider,
      model: s.model,
      confirmed: 0n,
      pending: 0n,
    };
    existing.confirmed += s.confirmedMicros;
    existing.pending += s.pendingMicros;
    byModelMap.set(key, existing);
  }

  const totalAttributable = confirmedTotal + pendingTotal;
  const costPerApprovedOutputDollars =
    input.approvedOutputCount > 0
      ? formatMicrosAsDollars(totalAttributable / BigInt(input.approvedOutputCount))
      : null;

  const threshold = input.alertThresholdPct ?? 80;
  const alertTriggered =
    input.subscriptionUsagePct !== null && input.subscriptionUsagePct >= threshold;

  return {
    dashboardId: input.dashboardId,
    occurrenceKey: input.occurrenceKey,
    refreshedAtIso: input.nowIso,
    llmCallsTriggered: 0,
    subscriptionUsagePct: input.subscriptionUsagePct,
    confirmedApiDollars: formatMicrosAsDollars(confirmedTotal),
    pendingApiDollars: formatMicrosAsDollars(pendingTotal),
    localExecutionCount,
    approvedOutputCount: input.approvedOutputCount,
    costPerApprovedOutputDollars,
    byModel: [...byModelMap.values()].map((m) => ({
      provider: m.provider,
      model: m.model,
      confirmedDollars: formatMicrosAsDollars(m.confirmed),
      pendingDollars: formatMicrosAsDollars(m.pending),
    })),
    alertTriggered,
    alertReason: alertTriggered
      ? `Subscription usage reached ${input.subscriptionUsagePct}% (threshold ${threshold}%).`
      : null,
  };
}
