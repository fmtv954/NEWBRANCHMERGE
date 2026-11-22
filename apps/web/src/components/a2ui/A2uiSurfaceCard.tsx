import type { A2uiComponentNode, A2uiSurfaceBlock } from "@rakazo/contracts";
import { Badge, Button, Card, Input, Switch } from "@rakazo/ui-web";
import { BookmarkPlus, GitBranch } from "lucide-react";
import { useState } from "react";

function resolveDataBinding(
  dataModel: Record<string, unknown>,
  binding: string | undefined,
): unknown {
  if (!binding) return undefined;
  const parts = binding.replace(/^\//, "").split("/").filter(Boolean);
  let cursor: unknown = dataModel;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

export function A2uiSurfaceCard({
  surface,
  onDispatchAction,
  onBranchFromSurface,
  onKeepInMain,
}: {
  surface: A2uiSurfaceBlock;
  onDispatchAction: (input: {
    surfaceId: string;
    componentId: string;
    actionId: string;
    payload: Record<string, unknown>;
  }) => Promise<void> | void;
  onBranchFromSurface?: (surface: A2uiSurfaceBlock) => void;
  onKeepInMain?: (surface: A2uiSurfaceBlock) => void;
}) {
  const [busyComponentId, setBusyComponentId] = useState<string | null>(null);
  const [localInputs, setLocalInputs] = useState<Record<string, string>>({});

  const roots = surface.components.filter((c) => !c.parentId);
  const childrenByParent = new Map<string, A2uiComponentNode[]>();
  for (const node of surface.components) {
    if (!node.parentId) continue;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  }

  const triggerAction = async (node: A2uiComponentNode, payload: Record<string, unknown>) => {
    if (!node.actionId) return;
    setBusyComponentId(node.id);
    try {
      await onDispatchAction({
        surfaceId: surface.surfaceId,
        componentId: node.id,
        actionId: node.actionId,
        payload,
      });
    } finally {
      setBusyComponentId(null);
    }
  };

  const renderNode = (node: A2uiComponentNode): React.ReactNode => {
    const bound = resolveDataBinding(surface.dataModel, node.dataBinding);
    const children = (childrenByParent.get(node.id) ?? []).map(renderNode);
    const props = node.props ?? {};

    switch (node.componentType) {
      case "Text":
        return (
          <p key={node.id} className="text-body-sm text-foreground/90">
            {String(bound ?? props.text ?? "")}
          </p>
        );
      case "Status":
        return (
          <Badge key={node.id} variant="outline" className="text-[11px]">
            {String(bound ?? props.label ?? "")}
          </Badge>
        );
      case "Callout":
        return (
          <div
            key={node.id}
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-body-sm"
          >
            {props.lead ? (
              <span className="font-medium text-foreground">{String(props.lead)} </span>
            ) : null}
            {String(bound ?? props.body ?? "")}
            {children}
          </div>
        );
      case "Metrics": {
        const metrics = (Array.isArray(bound) ? bound : props.metrics) as
          | Array<{ label: string; value: string; detail?: string }>
          | undefined;
        return (
          <div key={node.id} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(metrics ?? []).map((m, idx) => (
              <div key={idx} className="rounded-md border border-border bg-background/60 p-2.5">
                <div className="text-label text-muted-foreground">{m.label}</div>
                <div className="text-heading2 font-semibold text-foreground">{m.value}</div>
                {m.detail ? <div className="text-[11px] text-success">{m.detail}</div> : null}
              </div>
            ))}
          </div>
        );
      }
      case "Button":
        return (
          <Button
            key={node.id}
            type="button"
            size="sm"
            variant={props.variant === "primary" ? "default" : "outline"}
            disabled={busyComponentId === node.id}
            onClick={() => triggerAction(node, (props.payload as Record<string, unknown>) ?? {})}
          >
            {String(props.label ?? "Run")}
          </Button>
        );
      case "Input": {
        const val = localInputs[node.id] ?? String(bound ?? props.value ?? "");
        return (
          <div key={node.id} className="flex items-center gap-2">
            <Input
              value={val}
              placeholder={String(props.placeholder ?? "")}
              onChange={(e) => setLocalInputs((prev) => ({ ...prev, [node.id]: e.target.value }))}
              className="h-8 text-body-sm"
            />
            {node.actionId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyComponentId === node.id}
                onClick={() => triggerAction(node, { value: val })}
              >
                Save
              </Button>
            ) : null}
          </div>
        );
      }
      case "Toggle": {
        const switchId = `a2ui-toggle-${node.id}`;
        return (
          <div key={node.id} className="flex items-center justify-between gap-2 text-body-sm">
            <label htmlFor={switchId}>{String(props.label ?? "")}</label>
            <Switch
              id={switchId}
              checked={Boolean(bound ?? props.value)}
              disabled={busyComponentId === node.id}
              onCheckedChange={(checked) => triggerAction(node, { value: checked })}
            />
          </div>
        );
      }
      case "Grid":
        return (
          <div key={node.id} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {children}
          </div>
        );
      default:
        return (
          <div key={node.id} className="space-y-1.5">
            {props.heading ? (
              <div className="text-body-sm font-medium text-foreground">
                {String(props.heading)}
              </div>
            ) : null}
            {children}
          </div>
        );
    }
  };

  return (
    <Card className="border-border bg-card/80 p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-medium text-foreground">
            {surface.title ?? "Interactive Card"}
          </span>
          <Badge variant="outline" className="text-[10px]">
            A2UI v{surface.version}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {onBranchFromSurface ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-label"
              onClick={() => onBranchFromSurface(surface)}
            >
              <GitBranch className="mr-1 size-3" />
              Branch
            </Button>
          ) : null}
          {onKeepInMain ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-label"
              onClick={() => onKeepInMain(surface)}
            >
              <BookmarkPlus className="mr-1 size-3" />
              Keep
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2.5">{roots.map(renderNode)}</div>
    </Card>
  );
}
