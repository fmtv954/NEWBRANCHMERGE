export interface XaiSearchCitation {
  url: string;
  title?: string;
  source: "web" | "x";
  publishedAt?: string;
  snippet?: string;
}

export interface XaiChatRequest {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  messages: ReadonlyArray<{ role: "system" | "user" | "assistant"; content: string }>;
  enableWebSearch?: boolean;
  enableXSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface XaiChatResult {
  requestId: string | null;
  resolvedModel: string;
  text: string;
  citations: XaiSearchCitation[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
}

/**
 * Direct xAI Responses / Chat adapter supporting Grok 4.7 with native `web_search`
 * and `x_search` tools and normalized citation cards.
 */
export async function runXaiChatCompletion(req: XaiChatRequest): Promise<XaiChatResult> {
  const baseUrl = (req.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const model = req.model ?? "grok-4.7";
  const tools: Array<Record<string, unknown>> = [];
  if (req.enableWebSearch) tools.push({ type: "web_search" });
  if (req.enableXSearch) tools.push({ type: "x_search" });

  const useResponses = tools.length > 0;
  const endpoint = useResponses ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;
  const payload = useResponses
    ? {
        model,
        input: req.messages.map((m) => ({ role: m.role, content: m.content })),
        tools,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxOutputTokens !== undefined ? { max_output_tokens: req.maxOutputTokens } : {}),
      }
    : {
        model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxOutputTokens !== undefined ? { max_tokens: req.maxOutputTokens } : {}),
      };

  const response = await (req.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: req.signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`xAI API error (${response.status}): ${errBody.slice(0, 400)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const requestId =
    (typeof data.id === "string" ? data.id : null) ?? response.headers.get("x-request-id");
  const resolvedModel = typeof data.model === "string" ? data.model : model;

  if (useResponses) {
    const output = Array.isArray(data.output)
      ? (data.output as Array<Record<string, unknown>>)
      : [];
    const textParts: string[] = [];
    const citations: XaiSearchCitation[] = [];

    for (const item of output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content as Array<Record<string, unknown>>) {
          if (typeof c.text === "string") textParts.push(c.text);
          if (Array.isArray(c.annotations)) {
            for (const ann of c.annotations as Array<Record<string, unknown>>) {
              if (typeof ann.url === "string") {
                citations.push({
                  url: ann.url,
                  title: typeof ann.title === "string" ? ann.title : undefined,
                  source:
                    ann.url.includes("x.com/") || ann.url.includes("twitter.com/") ? "x" : "web",
                });
              }
            }
          }
        }
      }
    }

    const usageObj = (data.usage as Record<string, unknown> | undefined) ?? {};
    return {
      requestId,
      resolvedModel,
      text: textParts.join("\n").trim(),
      citations,
      usage: {
        inputTokens: Number(usageObj.input_tokens ?? 0),
        outputTokens: Number(usageObj.output_tokens ?? 0),
        reasoningTokens: Number(
          (usageObj.output_tokens_details as Record<string, unknown> | undefined)
            ?.reasoning_tokens ?? 0,
        ),
      },
    };
  }

  const choices = Array.isArray(data.choices)
    ? (data.choices as Array<Record<string, unknown>>)
    : [];
  const message = (choices[0]?.message as Record<string, unknown> | undefined) ?? {};
  const usageObj = (data.usage as Record<string, unknown> | undefined) ?? {};
  const rawCitations = Array.isArray(data.citations) ? (data.citations as unknown[]) : [];
  const citations: XaiSearchCitation[] = rawCitations
    .filter((c): c is string => typeof c === "string")
    .map((url) => ({
      url,
      source: url.includes("x.com/") || url.includes("twitter.com/") ? "x" : "web",
    }));

  return {
    requestId,
    resolvedModel,
    text: typeof message.content === "string" ? message.content : "",
    citations,
    usage: {
      inputTokens: Number(usageObj.prompt_tokens ?? 0),
      outputTokens: Number(usageObj.completion_tokens ?? 0),
      reasoningTokens: 0,
    },
  };
}
