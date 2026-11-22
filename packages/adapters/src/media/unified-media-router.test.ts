import { describe, expect, it } from "vitest";
import { validateMediaJobPreflight } from "./unified-media-router.js";

describe("unified-media-router preflight", () => {
  it("blocks LTX 2.3 I2V without a starting image", () => {
    expect(() =>
      validateMediaJobPreflight({
        operationKey: "op_1",
        provider: "uncensoredllm",
        modelId: "ltx-2.3-i2v-uncensored",
        kind: "video_gen",
        prompt: "Tonya turns toward the window",
        apiKey: "test",
      }),
    ).toThrow(/startingImageUrl/);
  });

  it("blocks gated Higgsfield unless ENABLE_HIGGSFIELD_EVAL is enabled", () => {
    expect(() =>
      validateMediaJobPreflight({
        operationKey: "op_2",
        provider: "higgsfield",
        modelId: "higgsfield-soul-video",
        kind: "video_gen",
        prompt: "Scene 1",
        apiKey: "test",
      }),
    ).toThrow(/ENABLE_HIGGSFIELD_EVAL/);
  });

  it("accepts valid xAI Grok Imagine Video 1.5 Lite job", () => {
    expect(() =>
      validateMediaJobPreflight({
        operationKey: "op_3",
        provider: "xai",
        modelId: "grok-imagine-video-1.5-lite",
        kind: "video_gen",
        prompt: "Quiet kitchen reveal",
        apiKey: "test",
      }),
    ).not.toThrow();
  });
});
