import type { BillingRoute } from "@rakazo/contracts";
import { Badge, Button, Card } from "@rakazo/ui-web";
import { AlertTriangle, CheckCircle2, CreditCard, KeyRound, Laptop, Sparkles } from "lucide-react";

export interface SubscriptionRouteStatus {
  provider: string;
  label: string;
  route: BillingRoute;
  connected: boolean;
  usagePct?: number | null;
  resetLabel?: string | null;
  pausedReason?: string | null;
}

/**
 * Requirement #46 ("Use a plan you already pay for"):
 * Surfaces subscription sign-in first when available, keeps BYOK/CLONE Credits/Local
 * equally accessible, and enforces strict no-silent-spend pause on quota exhaustion.
 */
export function SubscriptionAuthCard({
  routes,
  activeRoute,
  onSelectRoute,
  onConnectSubscription,
  onApprovePaidFallback,
}: {
  routes: readonly SubscriptionRouteStatus[];
  activeRoute: BillingRoute;
  onSelectRoute: (route: BillingRoute, provider?: string) => void;
  onConnectSubscription: (provider: string) => void;
  onApprovePaidFallback?: (fromProvider: string) => void;
}) {
  const subscriptionRoutes = routes.filter((r) => r.route === "subscription");

  return (
    <Card className="space-y-3 border-border bg-card/80 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-body-sm font-medium text-foreground">
          <Sparkles className="size-4 text-success" />
          Use a plan you already pay for
        </div>
        <Badge variant="outline" className="text-[10px]">
          No silent spend
        </Badge>
      </div>

      <div className="space-y-2">
        {subscriptionRoutes.map((sub) => (
          <div
            key={sub.provider}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-body-sm"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                {sub.connected ? <CheckCircle2 className="size-3.5 text-success" /> : null}
                <span>{sub.label}</span>
              </div>
              {sub.connected ? (
                <div className="text-label text-muted-foreground">
                  {sub.usagePct !== null && sub.usagePct !== undefined
                    ? `${sub.usagePct}% used`
                    : "Connected"}
                  {sub.resetLabel ? ` · Resets ${sub.resetLabel}` : ""}
                </div>
              ) : (
                <div className="text-label text-muted-foreground">
                  Connect your existing subscription before buying credits
                </div>
              )}
            </div>

            {sub.connected ? (
              <Button
                type="button"
                size="sm"
                variant={activeRoute === "subscription" ? "default" : "outline"}
                className="h-7 px-2.5 text-label"
                onClick={() => onSelectRoute("subscription", sub.provider)}
              >
                Use my subscription
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-label"
                onClick={() => onConnectSubscription(sub.provider)}
              >
                Sign in
              </Button>
            )}

            {sub.pausedReason ? (
              <div className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-label text-warning">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {sub.pausedReason}
                </span>
                {onApprovePaidFallback ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onApprovePaidFallback(sub.provider)}
                  >
                    Switch to API / Credits
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <Button
          type="button"
          size="sm"
          variant={activeRoute === "byok" ? "default" : "outline"}
          className="h-7 text-label"
          onClick={() => onSelectRoute("byok")}
        >
          <KeyRound className="mr-1 size-3" />
          Use API key
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeRoute === "hosted_credits" ? "default" : "outline"}
          className="h-7 text-label"
          onClick={() => onSelectRoute("hosted_credits")}
        >
          <CreditCard className="mr-1 size-3" />
          CLONE credits
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeRoute === "local" ? "default" : "outline"}
          className="h-7 text-label"
          onClick={() => onSelectRoute("local")}
        >
          <Laptop className="mr-1 size-3" />
          Local model
        </Button>
      </div>
    </Card>
  );
}
