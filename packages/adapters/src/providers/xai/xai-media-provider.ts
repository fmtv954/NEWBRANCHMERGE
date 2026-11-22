export interface XaiImageRequest {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  prompt: string;
  referenceImageUrl?: string;
  aspectRatio?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface XaiVideoSubmitRequest {
  apiKey: string;
  baseUrl?: string;
  model?: "grok-imagine-video-1.5" | "grok-imagine-video-1.5-lite";
  prompt: string;
  durationSec?: number;
  aspectRatio?: string;
  resolution?: "480p" | "720p";
  imageUrl?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function generateXaiImage(req: XaiImageRequest): Promise<{
  url: string | null;
  b64Json: string | null;
  revisedPrompt?: string;
}> {
  const baseUrl = (req.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const endpoint = req.referenceImageUrl
    ? `${baseUrl}/images/edits`
    : `${baseUrl}/images/generations`;
  const response = await (req.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model ?? "grok-imagine-image-2.0",
      prompt: req.prompt,
      ...(req.referenceImageUrl ? { image_url: req.referenceImageUrl } : {}),
      ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
      response_format: "url",
    }),
    signal: req.signal,
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`xAI Image API error (${response.status}): ${err.slice(0, 400)}`);
  }
  const data = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  };
  const first = data.data?.[0];
  return {
    url: first?.url ?? null,
    b64Json: first?.b64_json ?? null,
    revisedPrompt: first?.revised_prompt,
  };
}

export async function submitXaiVideoJob(req: XaiVideoSubmitRequest): Promise<{
  requestId: string;
}> {
  const baseUrl = (req.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const response = await (req.fetchImpl ?? fetch)(`${baseUrl}/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model ?? "grok-imagine-video-1.5-lite",
      prompt: req.prompt,
      ...(req.durationSec ? { duration: req.durationSec } : {}),
      ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
      ...(req.resolution ? { resolution: req.resolution } : {}),
      ...(req.imageUrl ? { image: { url: req.imageUrl } } : {}),
    }),
    signal: req.signal,
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`xAI Video submit error (${response.status}): ${err.slice(0, 400)}`);
  }
  const data = (await response.json()) as { request_id?: string; id?: string };
  const requestId = data.request_id ?? data.id;
  if (!requestId) throw new Error("xAI Video API did not return a request_id");
  return { requestId };
}

export async function pollXaiVideoJob(input: {
  apiKey: string;
  baseUrl?: string;
  requestId: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}> {
  const baseUrl = (input.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const response = await (input.fetchImpl ?? fetch)(`${baseUrl}/videos/${input.requestId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    signal: input.signal,
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`xAI Video poll error (${response.status}): ${err.slice(0, 400)}`);
  }
  const data = (await response.json()) as {
    status?: string;
    video?: { url?: string };
    url?: string;
    error?: string;
  };
  if (data.status === "done" || data.status === "completed") {
    return { status: "completed", videoUrl: data.video?.url ?? data.url };
  }
  if (data.status === "failed" || data.status === "expired") {
    return { status: "failed", error: data.error ?? `Job ${data.status}` };
  }
  return { status: data.status === "pending" ? "queued" : "processing" };
}
