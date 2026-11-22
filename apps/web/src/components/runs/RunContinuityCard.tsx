import { Badge, Button, Card } from "@rakazo/ui-web";
import { AlertCircle, CheckCircle2, Clock, Play, ShieldAlert } from "lucide-react";

export interface RunContinuityState {
  runId: string;
  status: "running" | "waiting_approval" | "checking_provider" | "paused" | "completed" | "failed";
  lastCompletedStep: string;
  nextAction: string;
  blocker?: string | null;
  pendingApprovalLabel?: string | null;
  artifactResultLabel?: string | null;
}

/**
 * Customer-Pain Fix #1 & #3: Compact run continuity card shared across desktop and mobile
 * so delegated/background work never appears opaque and uncertain provider states pause cleanly.
 */
export function RunContinuityCard({
  state,
  onResume,
  onApprove,
}: {
  state: RunContinuityState;
  onResume?: (runId: string) => void;
  onApprove?: (runId: string) => void;
}) {
  return (
    <Card className="border-border bg-card/70 px-3.5 py-2.5 text-body-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {state.status === "completed" ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : state.status === "failed" ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : state.status === "waiting_approval" ? (
            <ShieldAlert className="size-4 text-warning" />
          ) : (
            <Clock className="size-4 text-status-working" />
          )}
          <span className="font-medium text-foreground">Run {state.runId.slice(0, 8)}</span>
          <Badge variant="outline" className="text-[10px]">
            {state.status === "checking_provider" ? "Checking provider" : state.status}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {state.status === "waiting_approval" && onApprove ? (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-label"
              onClick={() => onApprove(state.runId)}
            >
              {state.pendingApprovalLabel ?? "Approve"}
            </Button>
          ) : null}
          {state.status === "paused" && onResume ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-label"
              onClick={() => onResume(state.runId)}
            >
              <Play className="mr-1 size-3" />
              Resume
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 text-label text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="text-foreground/80">Last step:</span> {state.lastCompletedStep}
        </div>
        <div>
          <span className="text-foreground/80">Next:</span> {state.nextAction}
        </div>
      </div>

      {state.blocker ? (
        <p className="mt-1.5 text-label text-warning">Blocker: {state.blocker}</p>
      ) : null}
      {state.artifactResultLabel ? (
        <p className="mt-1 text-label text-success">Output: {state.artifactResultLabel}</p>
      ) : null}
    </Card>
  );
}
