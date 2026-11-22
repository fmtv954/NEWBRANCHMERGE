import { describe, expect, it } from "vitest";
import { buildLiveDashboardSnapshot } from "./live-dashboard.js";

describe("live-dashboard", () => {
  it("computes cost per approved output, zero LLM calls, and >80% alert cleanly", () => {
    const snap = buildLiveDashboardSnapshot({
      dashboardId: "dash_1",
      occurrenceKey: "2026-11-22T01:00:00Z",
      nowIso: "2026-11-22T01:00:01Z",
      subscriptionUsagePct: 84,
      approvedOutputCount: 2,
      samples: [
        {
          provider: "openai",
          model: "gpt-6.2-sol",
          billingRoute: "byok",
          confirmedMicros: 1_500_000n,
          pendingMicros: 0n,
        },
        {
          provider: "xai",
          model: "grok-4.7",
          billingRoute: "hosted_credits",
          confirmedMicros: 500_000n,
          pendingMicros: 200_000n,
        },
        {
          provider: "local-compatible",
          model: "huihui-qwen3.8-27b-abliterated",
          billingRoute: "local",
          confirmedMicros: 0n,
          pendingMicros: 0n,
        },
      ],
    });

    expect(snap.llmCallsTriggered).toBe(0);
    expect(snap.confirmedApiDollars).toBe("$2.00");
    expect(snap.pendingApiDollars).toBe("$0.20");
    expect(snap.localExecutionCount).toBe(1);
    expect(snap.costPerApprovedOutputDollars).toBe("$1.10");
    expect(snap.alertTriggered).toBe(true);
  });

  it("returns null cost per approved output when denominator is zero", () => {
    const snap = buildLiveDashboardSnapshot({
      dashboardId: "dash_2",
      occurrenceKey: "occ_0",
      nowIso: "2026-11-22T01:00:01Z",
      subscriptionUsagePct: null,
      approvedOutputCount: 0,
      samples: [],
    });
    expect(snap.costPerApprovedOutputDollars).toBeNull();
    expect(snap.alertTriggered).toBe(false);
  });
});
