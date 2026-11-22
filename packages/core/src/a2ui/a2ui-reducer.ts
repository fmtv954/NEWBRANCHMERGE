import type {
  A2uiComponentNode,
  A2uiStreamEvent,
  A2uiSurfaceBlock,
  A2uiUserActionInput,
} from "@rakazo/contracts";

function applyJsonPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof next[key] === "object" &&
      next[key] !== null &&
      !Array.isArray(next[key])
    ) {
      next[key] = applyJsonPatch(
        next[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      next[key] = value;
    }
  }
  return next;
}

function upsertComponents(
  existing: readonly A2uiComponentNode[],
  incoming: readonly A2uiComponentNode[],
): A2uiComponentNode[] {
  const byId = new Map<string, A2uiComponentNode>();
  for (const node of existing) byId.set(node.id, node);
  for (const node of incoming) byId.set(node.id, node);
  return [...byId.values()];
}

export function applyA2uiStreamEvent(
  current: A2uiSurfaceBlock | null,
  event: A2uiStreamEvent,
): A2uiSurfaceBlock {
  if (event.op === "createSurface") {
    return {
      kind: "a2ui_surface",
      protocolVersion: event.protocolVersion ?? "0.9.1",
      surfaceId: event.surfaceId,
      catalogId: event.catalogId,
      ...(event.title ? { title: event.title } : {}),
      version: current ? current.version + 1 : 1,
      components: [],
      dataModel: {},
    };
  }

  if (!current || current.surfaceId !== event.surfaceId) {
    throw new Error(`A2UI surface ${event.surfaceId} must be created before ${event.op}`);
  }

  if (event.op === "updateComponents") {
    return {
      ...current,
      version: current.version + 1,
      components: upsertComponents(current.components, event.components),
    };
  }

  return {
    ...current,
    version: current.version + 1,
    dataModel: applyJsonPatch(current.dataModel, event.patch),
  };
}

export type A2uiActionValidationResult =
  | {
      accepted: true;
      deduplicated: boolean;
      nextSurface: A2uiSurfaceBlock;
      seenActionNonces: ReadonlySet<string>;
    }
  | {
      accepted: false;
      reason: "surface_mismatch" | "stale_revision" | "unknown_component";
    };

/**
 * Validates and applies a bidirectional A2UI `userAction` with idempotent `actionNonce`
 * replay protection and `baseRevisionId` staleness checking.
 */
export function applyA2uiUserAction(
  surface: A2uiSurfaceBlock,
  action: A2uiUserActionInput,
  seenActionNonces: ReadonlySet<string>,
  currentBranchHeadRevisionId: string | null,
): A2uiActionValidationResult {
  if (surface.surfaceId !== action.surfaceId) {
    return { accepted: false, reason: "surface_mismatch" };
  }
  if (seenActionNonces.has(action.actionNonce)) {
    return {
      accepted: true,
      deduplicated: true,
      nextSurface: surface,
      seenActionNonces,
    };
  }
  if (
    action.baseRevisionId !== undefined &&
    action.baseRevisionId !== null &&
    currentBranchHeadRevisionId !== null &&
    action.baseRevisionId !== currentBranchHeadRevisionId
  ) {
    return { accepted: false, reason: "stale_revision" };
  }
  const hasComponent = surface.components.some((c) => c.id === action.componentId);
  if (!hasComponent) {
    return { accepted: false, reason: "unknown_component" };
  }

  const nextNonces = new Set(seenActionNonces);
  nextNonces.add(action.actionNonce);

  const nextSurface: A2uiSurfaceBlock = {
    ...surface,
    version: surface.version + 1,
    dataModel: applyJsonPatch(surface.dataModel, action.payload),
  };

  return {
    accepted: true,
    deduplicated: false,
    nextSurface,
    seenActionNonces: nextNonces,
  };
}
