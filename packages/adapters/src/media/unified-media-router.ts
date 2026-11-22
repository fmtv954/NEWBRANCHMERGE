import { findCatalogModel } from "@rakazo/contracts";
import { generateXaiImage, submitXaiVideoJob } from "../providers/xai/xai-media-provider.js";

export interface UnifiedMediaJobRequest {
  operationKey: string;
  provider: string;
  modelId: string;
  kind: "image_gen" | "image_edit" | "video_gen";
  prompt: string;
  startingImageUrl?: string;
  referenceImageUrls?: string[];
  aspectRatio?: string;
  durationSec?: number;
  resolution?: "480p" | "720p" | "1080p";
  apiKey: string;
  enableHiggsfieldEval?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface UnifiedMediaJobSubmission {
  operationKey: string;
  provider: string;
  modelId: string;
  status: "completed" | "queued";
  providerRequestId: string;
  outputUrl?: string | null;
  b64Json?: string | null;
}

/**
 * Validates model capabilities, gating policies (e.g., Higgsfield eval-only),
 * and required inputs (e.g., LTX 2.3 I2V starting image) BEFORE dispatching paid media jobs.
 */
export function validateMediaJobPreflight(req: UnifiedMediaJobRequest): void {
  const entry = findCatalogModel(req.provider, req.modelId);
  if (!entry) {
    throw new Error(`Unknown media model ${req.provider}:${req.modelId}`);
  }
  if (entry.evalOnly && !req.enableHiggsfieldEval) {
    throw new Error(
      `Model ${entry.displayName} is gated behind ENABLE_HIGGSFIELD_EVAL and disabled for standard/managed routing.`,
    );
  }
  if (!entry.modalities.includes(req.kind)) {
    throw new Error(`Model ${entry.displayName} does not support ${req.kind}.`);
  }
  if (req.modelId.includes("-i2v") && !req.startingImageUrl) {
    throw new Error(`Model ${entry.displayName} requires a startingImageUrl before dispatch.`);
  }
  if (req.kind === "image_edit" && !req.startingImageUrl && !req.referenceImageUrls?.length) {
    throw new Error(
      `Image edit on ${entry.displayName} requires a startingImageUrl or reference image.`,
    );
  }
}

export async function submitUnifiedMediaJob(
  req: UnifiedMediaJobRequest,
): Promise<UnifiedMediaJobSubmission> {
  validateMediaJobPreflight(req);
  const fetchImpl = req.fetchImpl ?? fetch;

  if (req.provider === "xai") {
    if (req.kind === "video_gen") {
      const { requestId } = await submitXaiVideoJob({
        apiKey: req.apiKey,
        model:
          req.modelId === "grok-imagine-video-1.5"
            ? "grok-imagine-video-1.5"
            : "grok-imagine-video-1.5-lite",
        prompt: req.prompt,
        durationSec: req.durationSec,
        aspectRatio: req.aspectRatio,
        resolution: req.resolution === "480p" ? "480p" : "720p",
        imageUrl: req.startingImageUrl,
        signal: req.signal,
        fetchImpl,
      });
      return {
        operationKey: req.operationKey,
        provider: req.provider,
        modelId: req.modelId,
        status: "queued",
        providerRequestId: requestId,
      };
    }

    const img = await generateXaiImage({
      apiKey: req.apiKey,
      model: req.modelId,
      prompt: req.prompt,
      referenceImageUrl: req.startingImageUrl ?? req.referenceImageUrls?.[0],
      aspectRatio: req.aspectRatio,
      signal: req.signal,
      fetchImpl,
    });
    return {
      operationKey: req.operationKey,
      provider: req.provider,
      modelId: req.modelId,
      status: "completed",
      providerRequestId: req.operationKey,
      outputUrl: img.url,
      b64Json: img.b64Json,
    };
  }

  if (req.provider === "fal") {
    const response = await fetchImpl(`https://queue.fal.run/${req.modelId}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: req.prompt,
        ...(req.startingImageUrl ? { image_url: req.startingImageUrl } : {}),
        ...(req.referenceImageUrls?.length ? { image_urls: req.referenceImageUrls } : {}),
        ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
        ...(req.durationSec ? { duration: String(req.durationSec) } : {}),
      }),
      signal: req.signal,
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      throw new Error(`fal.ai queue error (${response.status}): ${err.slice(0, 400)}`);
    }
    const data = (await response.json()) as { request_id: string };
    return {
      operationKey: req.operationKey,
      provider: req.provider,
      modelId: req.modelId,
      status: "queued",
      providerRequestId: data.request_id,
    };
  }

  if (req.provider === "uncensoredllm") {
    const endpoint =
      req.kind === "video_gen"
        ? "https://api.uncensoredllm.ai/v1/videos/generations"
        : "https://api.uncensoredllm.ai/v1/images/generations";
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.modelId,
        prompt: req.prompt,
        ...(req.startingImageUrl ? { image_url: req.startingImageUrl } : {}),
        ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
        ...(req.durationSec ? { duration: req.durationSec } : {}),
      }),
      signal: req.signal,
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      throw new Error(`UncensoredLLM media error (${response.status}): ${err.slice(0, 400)}`);
    }
    const data = (await response.json()) as {
      id?: string;
      request_id?: string;
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const firstUrl = data.data?.[0]?.url ?? null;
    if (firstUrl || data.data?.[0]?.b64_json) {
      return {
        operationKey: req.operationKey,
        provider: req.provider,
        modelId: req.modelId,
        status: "completed",
        providerRequestId: data.id ?? data.request_id ?? req.operationKey,
        outputUrl: firstUrl,
        b64Json: data.data?.[0]?.b64_json ?? null,
      };
    }
    return {
      operationKey: req.operationKey,
      provider: req.provider,
      modelId: req.modelId,
      status: "queued",
      providerRequestId: data.request_id ?? data.id ?? req.operationKey,
    };
  }

  throw new Error(`Media provider ${req.provider} adapter not wired for direct submit`);
}
