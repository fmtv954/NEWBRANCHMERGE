import { describe, expect, it } from "vitest";
import { applyA2uiStreamEvent, applyA2uiUserAction } from "./a2ui-reducer.js";

describe("a2ui-reducer", () => {
  it("streams createSurface -> updateComponents -> updateDataModel progressively", () => {
    const s1 = applyA2uiStreamEvent(null, {
      op: "createSurface",
      protocolVersion: "0.9.1",
      surfaceId: "surf_research_1",
      catalogId: "clone.rakazo.v1",
      title: "Deep Research Plan",
    });
    expect(s1.version).toBe(1);

    const s2 = applyA2uiStreamEvent(s1, {
      op: "updateComponents",
      surfaceId: "surf_research_1",
      components: [
        {
          id: "btn_approve",
          parentId: null,
          componentType: "Button",
          props: { label: "Start Research", variant: "primary" },
          actionId: "approve_plan",
        },
      ],
    });
    expect(s2.components).toHaveLength(1);
    expect(s2.version).toBe(2);

    const s3 = applyA2uiStreamEvent(s2, {
      op: "updateDataModel",
      surfaceId: "surf_research_1",
      patch: { plan: { approved: false, sources: ["web", "x"] } },
    });
    expect(s3.dataModel).toEqual({ plan: { approved: false, sources: ["web", "x"] } });
  });

  it("deduplicates duplicate actionNonce clicks and rejects stale revisions", () => {
    const s1 = applyA2uiStreamEvent(null, {
      op: "createSurface",
      protocolVersion: "0.9.1",
      surfaceId: "surf_shot_1",
      catalogId: "clone.rakazo.v1",
    });
    const s2 = applyA2uiStreamEvent(s1, {
      op: "updateComponents",
      surfaceId: "surf_shot_1",
      components: [
        {
          id: "btn_render",
          parentId: null,
          componentType: "Button",
          props: { label: "Render Take" },
          actionId: "render_take",
        },
      ],
    });

    const first = applyA2uiUserAction(
      s2,
      {
        projectId: "proj_1",
        branchId: "br_1",
        messageId: "msg_1",
        surfaceId: "surf_shot_1",
        componentId: "btn_render",
        actionId: "render_take",
        payload: { selectedModel: "grok-imagine-video-1.5-lite" },
        baseRevisionId: "rev_10",
        actionNonce: "nonce_123",
        wakeAgent: true,
        clientNonce: "c_1",
      },
      new Set(),
      "rev_10",
    );
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.deduplicated).toBe(false);
    expect(first.nextSurface.dataModel).toEqual({
      selectedModel: "grok-imagine-video-1.5-lite",
    });

    // Duplicate click returns deduplicated=true without incrementing version
    const replay = applyA2uiUserAction(
      first.nextSurface,
      {
        projectId: "proj_1",
        branchId: "br_1",
        messageId: "msg_1",
        surfaceId: "surf_shot_1",
        componentId: "btn_render",
        actionId: "render_take",
        payload: { selectedModel: "grok-imagine-video-1.5-lite" },
        baseRevisionId: "rev_10",
        actionNonce: "nonce_123",
        wakeAgent: true,
        clientNonce: "c_1",
      },
      first.seenActionNonces,
      "rev_10",
    );
    expect(replay.accepted).toBe(true);
    if (replay.accepted) {
      expect(replay.deduplicated).toBe(true);
      expect(replay.nextSurface.version).toBe(first.nextSurface.version);
    }

    // Stale revision click is rejected
    const stale = applyA2uiUserAction(
      first.nextSurface,
      {
        projectId: "proj_1",
        branchId: "br_1",
        messageId: "msg_1",
        surfaceId: "surf_shot_1",
        componentId: "btn_render",
        actionId: "render_take",
        payload: { selectedModel: "seedance-2.5" },
        baseRevisionId: "rev_10",
        actionNonce: "nonce_456",
        wakeAgent: true,
        clientNonce: "c_2",
      },
      first.seenActionNonces,
      "rev_11",
    );
    expect(stale).toEqual({ accepted: false, reason: "stale_revision" });
  });
});
