import { describe, expect, it } from "vitest";
import {
  beginHoldReconciliation,
  createCreditHold,
  evaluateRouteFallbackPolicy,
  markHoldUnknownPending,
  refundCreditHold,
  settleCreditHold,
} from "./credit-holds.js";

describe("credit-holds", () => {
  it("tracks held -> unknown_pending -> reconciling -> settled with separate supplier and customer costs", () => {
    const held = createCreditHold({
      operationKey: "op_video_1",
      billingRoute: "hosted_credits",
      estimatedMicros: 500_000n,
    });
    expect(held.status).toBe("held");
    expect(held.heldMicros).toBe(500_000n);

    const unknown = markHoldUnknownPending(held, "req_xai_99");
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.state.status).toBe("unknown_pending");
    expect(unknown.state.providerRequestId).toBe("req_xai_99");

    const reconciling = beginHoldReconciliation(unknown.state);
    expect(reconciling.ok).toBe(true);
    if (!reconciling.ok) return;

    const settled = settleCreditHold(reconciling.state, {
      supplierCostMicros: 240_000n,
      customerChargeMicros: 300_000n,
    });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.state.status).toBe("settled");
    expect(settled.state.supplierCostMicros).toBe(240_000n);
    expect(settled.state.customerChargeMicros).toBe(300_000n);
    expect(settled.state.settledMicros).toBe(300_000n);

    // Cannot double-refund an already settled hold
    expect(refundCreditHold(settled.state)).toEqual({ ok: false, reason: "already_finalized" });
  });

  it("refunds full hold on provider failure and keeps BYOK/subscription holds at zero credit lock", () => {
    const held = createCreditHold({
      operationKey: "op_fail_1",
      billingRoute: "hosted_credits",
      estimatedMicros: 200_000n,
    });
    const refunded = refundCreditHold(held);
    expect(refunded.ok).toBe(true);
    if (refunded.ok) {
      expect(refunded.state.settledMicros).toBe(0n);
      expect(refunded.state.status).toBe("refunded");
    }

    const subHold = createCreditHold({
      operationKey: "op_sub_1",
      billingRoute: "subscription",
      estimatedMicros: 100_000n,
    });
    expect(subHold.heldMicros).toBe(0n);
  });

  it("enforces no-silent-spend when subscription or local routes fail", () => {
    const blocked = evaluateRouteFallbackPolicy({
      requestedRoute: "subscription",
      candidateFallbackRoute: "hosted_credits",
      userExplicitlyApprovedFallback: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.requiresUserPause).toBe(true);

    const approved = evaluateRouteFallbackPolicy({
      requestedRoute: "subscription",
      candidateFallbackRoute: "hosted_credits",
      userExplicitlyApprovedFallback: true,
    });
    expect(approved.allowed).toBe(true);
    expect(approved.requiresUserPause).toBe(false);
  });
});
