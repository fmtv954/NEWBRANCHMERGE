import type { BillingRoute } from "@rakazo/contracts";

export type CreditHoldStatus = "held" | "unknown_pending" | "reconciling" | "settled" | "refunded";

export interface CreditHoldState {
  operationKey: string;
  billingRoute: BillingRoute;
  heldMicros: bigint;
  supplierCostMicros: bigint | null;
  customerChargeMicros: bigint | null;
  settledMicros: bigint | null;
  providerRequestId: string | null;
  status: CreditHoldStatus;
}

export type CreditHoldTransitionResult =
  | { ok: true; state: CreditHoldState }
  | { ok: false; reason: "already_finalized" | "invalid_transition" | "silent_spend_blocked" };

export function createCreditHold(input: {
  operationKey: string;
  billingRoute: BillingRoute;
  estimatedMicros: bigint;
}): CreditHoldState {
  const heldMicros = input.billingRoute === "hosted_credits" ? input.estimatedMicros : 0n;
  return {
    operationKey: input.operationKey,
    billingRoute: input.billingRoute,
    heldMicros,
    supplierCostMicros: null,
    customerChargeMicros: null,
    settledMicros: null,
    providerRequestId: null,
    status: "held",
  };
}

/**
 * Called when a paid submission times out or drops after dispatch and may have been accepted
 * upstream. Blocks duplicate paid retries until reconciliation completes.
 */
export function markHoldUnknownPending(
  state: CreditHoldState,
  providerRequestId?: string | null,
): CreditHoldTransitionResult {
  if (state.status === "settled" || state.status === "refunded") {
    return { ok: false, reason: "already_finalized" };
  }
  return {
    ok: true,
    state: {
      ...state,
      providerRequestId: providerRequestId ?? state.providerRequestId,
      status: "unknown_pending",
    },
  };
}

export function beginHoldReconciliation(state: CreditHoldState): CreditHoldTransitionResult {
  if (state.status !== "unknown_pending" && state.status !== "held") {
    return { ok: false, reason: "invalid_transition" };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "reconciling",
    },
  };
}

export function settleCreditHold(
  state: CreditHoldState,
  input: {
    supplierCostMicros: bigint;
    customerChargeMicros: bigint;
    providerRequestId?: string | null;
  },
): CreditHoldTransitionResult {
  if (state.status === "settled" || state.status === "refunded") {
    return { ok: false, reason: "already_finalized" };
  }
  const settledMicros = state.billingRoute === "hosted_credits" ? input.customerChargeMicros : 0n;
  return {
    ok: true,
    state: {
      ...state,
      supplierCostMicros: input.supplierCostMicros,
      customerChargeMicros: input.customerChargeMicros,
      settledMicros,
      providerRequestId: input.providerRequestId ?? state.providerRequestId,
      status: "settled",
    },
  };
}

export function refundCreditHold(state: CreditHoldState): CreditHoldTransitionResult {
  if (state.status === "settled" || state.status === "refunded") {
    return { ok: false, reason: "already_finalized" };
  }
  return {
    ok: true,
    state: {
      ...state,
      supplierCostMicros: 0n,
      customerChargeMicros: 0n,
      settledMicros: 0n,
      status: "refunded",
    },
  };
}

/**
 * Enforces Requirement #46 (no silent spend): a denied or exhausted subscription/BYOK route
 * must pause and ask the user before switching to a billable route.
 */
export function evaluateRouteFallbackPolicy(input: {
  requestedRoute: BillingRoute;
  candidateFallbackRoute: BillingRoute;
  userExplicitlyApprovedFallback: boolean;
}): { allowed: boolean; requiresUserPause: boolean; reason: string } {
  if (input.requestedRoute === input.candidateFallbackRoute) {
    return { allowed: true, requiresUserPause: false, reason: "same_route" };
  }
  if (
    (input.requestedRoute === "subscription" || input.requestedRoute === "local") &&
    (input.candidateFallbackRoute === "hosted_credits" ||
      input.candidateFallbackRoute === "byok") &&
    !input.userExplicitlyApprovedFallback
  ) {
    return {
      allowed: false,
      requiresUserPause: true,
      reason:
        "Subscription or local route unavailable; paused to prevent silent billable API fallback.",
    };
  }
  return {
    allowed: input.userExplicitlyApprovedFallback,
    requiresUserPause: !input.userExplicitlyApprovedFallback,
    reason: input.userExplicitlyApprovedFallback ? "user_approved_switch" : "approval_required",
  };
}
