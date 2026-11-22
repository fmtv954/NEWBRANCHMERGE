import { describe, expect, it, vi } from "vitest";
import { submitUnifiedMediaJob } from "../media/unified-media-router.js";
import { resolveProviderApiSwitch } from "./provider-router.js";

describe("API switch & mocked tests for providers without active key/balance", () => {
  it("switches away from Refuseless when key is missing/TBD", () => {
    const routed = resolveProviderApiSwitch({
      requestedProvider: "refuseless",
      modality: "chat",
      keys: {
        refuseless: "TBD",
        venice: "",
        xai: "xai-test-key",
        openai: "sk-test-key",
      },
    });

    expect(routed.switched).toBe(true);
    expect(routed.originalProvider).toBe("refuseless");
    expect(routed.switchReason).toBe("missing_api_key");
    expect(routed.provider).toBe("xai");
    expect(routed.modelId).toBe("grok-4.7");
  });

  it("switches away from UncensoredLLM on 402 insufficient balance to fal.ai", () => {
    const routed = resolveProviderApiSwitch({
      requestedProvider: "uncensoredllm",
      modality: "media",
      keys: {
        uncensoredllm: "sk-ullm-live-test",
        fal: "fal-test-key",
        xai: "xai-test-key",
      },
      exhaustedProviders: new Set(["uncensoredllm"]),
    });

    expect(routed.switched).toBe(true);
    expect(routed.originalProvider).toBe("uncensoredllm");
    expect(routed.switchReason).toBe("insufficient_balance_402");
    expect(routed.provider).toBe("fal");
    expect(routed.modelId).toBe("fal-ai/seedance-2.5");
  });

  it("switches away from Higgsfield when ENABLE_HIGGSFIELD_EVAL is false, and allows it when true", () => {
    const switched = resolveProviderApiSwitch({
      requestedProvider: "higgsfield",
      modality: "media",
      keys: { higgsfield: "hf-key", fal: "fal-key" },
      enableHiggsfieldEval: false,
    });
    expect(switched.switched).toBe(true);
    expect(switched.switchReason).toBe("eval_gate_disabled");
    expect(switched.provider).toBe("fal");

    const allowed = resolveProviderApiSwitch({
      requestedProvider: "higgsfield",
      modality: "media",
      keys: { higgsfield: "hf-key", fal: "fal-key" },
      enableHiggsfieldEval: true,
    });
    expect(allowed.switched).toBe(false);
    expect(allowed.provider).toBe("higgsfield");
  });

  it("mocks UncensoredLLM 402 response followed by fal.ai fallback dispatch", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("api.uncensoredllm.ai")) {
        return new Response(JSON.stringify({ error: "insufficient_balance" }), {
          status: 402,
          headers: { "content-type": "application/json" },
        });
      }
      if (target.includes("queue.fal.run")) {
        return new Response(JSON.stringify({ request_id: "fal_req_mock_123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    await expect(
      submitUnifiedMediaJob({
        operationKey: "op_ullm_1",
        provider: "uncensoredllm",
        modelId: "qwen-image-3-uncensored",
        kind: "image_gen",
        prompt: "Neon cyberpunk alley",
        apiKey: "sk-ullm-mock",
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("UncensoredLLM media error (402)");

    const fallbackRoute = resolveProviderApiSwitch({
      requestedProvider: "uncensoredllm",
      modality: "media",
      keys: { uncensoredllm: "sk-ullm-mock", fal: "fal_mock_key" },
      exhaustedProviders: new Set(["uncensoredllm"]),
    });

    const fallbackResult = await submitUnifiedMediaJob({
      operationKey: "op_ullm_1_fallback",
      provider: fallbackRoute.provider,
      modelId: fallbackRoute.modelId,
      kind: "video_gen",
      prompt: "Neon cyberpunk alley",
      apiKey: fallbackRoute.apiKey,
      fetchImpl: mockFetch,
    });

    expect(fallbackResult.provider).toBe("fal");
    expect(fallbackResult.status).toBe("queued");
    expect(fallbackResult.providerRequestId).toBe("fal_req_mock_123");
  });
});
