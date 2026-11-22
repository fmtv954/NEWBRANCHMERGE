export type CloneProviderId =
  | "openai"
  | "xai"
  | "fal"
  | "uncensoredllm"
  | "refuseless"
  | "venice"
  | "higgsfield";

export interface ProviderCredentialsMap {
  openai?: string | null;
  xai?: string | null;
  fal?: string | null;
  uncensoredllm?: string | null;
  refuseless?: string | null;
  venice?: string | null;
  higgsfield?: string | null;
}

export interface ApiSwitchResult {
  provider: CloneProviderId;
  modelId: string;
  apiKey: string;
  switched: boolean;
  switchReason?:
    | "missing_api_key"
    | "insufficient_balance_402"
    | "eval_gate_disabled"
    | null;
  originalProvider?: CloneProviderId;
}

const DEFAULT_MODEL_BY_PROVIDER: Record<CloneProviderId, { chat: string; media: string }> = {
  openai: { chat: "gpt-6.2-sol", media: "gpt-image-1" },
  xai: { chat: "grok-4.7", media: "grok-imagine-image" },
  fal: { chat: "fal-ai/seedance-2.5", media: "fal-ai/seedance-2.5" },
  uncensoredllm: { chat: "qwen-3.5-uncensored", media: "qwen-image-3-uncensored" },
  refuseless: { chat: "glm-5.3-flash-abliterated", media: "glm-5.3-flash-abliterated" },
  venice: { chat: "deepseek-v4.1-flash-1017-e2ee", media: "deepseek-v4.1-flash-1017-e2ee" },
  higgsfield: { chat: "higgsfield-soul-video", media: "higgsfield-soul-video" },
};

const FALLBACK_CHAIN: Record<CloneProviderId, CloneProviderId[]> = {
  refuseless: ["venice", "xai", "openai"],
  uncensoredllm: ["fal", "xai", "venice"],
  higgsfield: ["fal", "xai"],
  venice: ["xai", "openai"],
  fal: ["xai", "openai"],
  xai: ["openai"],
  openai: ["xai"],
};

function hasUsableKey(key: string | null | undefined): key is string {
  return Boolean(key && key.trim().length > 0 && key.trim().toUpperCase() !== "TBD");
}

/**
 * Resolves which provider API to call and handles deterministic switching when a provider
 * has no API key (e.g. Refuseless TBD), is eval-gated (Higgsfield), or hits 402 balance exhaustion.
 */
export function resolveProviderApiSwitch(input: {
  requestedProvider: CloneProviderId;
  requestedModelId?: string;
  modality: "chat" | "media";
  keys: ProviderCredentialsMap;
  enableHiggsfieldEval?: boolean;
  allowFallback?: boolean;
  exhaustedProviders?: ReadonlySet<CloneProviderId>;
}): ApiSwitchResult {
  const allowFallback = input.allowFallback ?? true;
  const exhausted = input.exhaustedProviders ?? new Set<CloneProviderId>();

  const isEligible = (
    provider: CloneProviderId,
  ): { ok: true; key: string } | { ok: false; reason: NonNullable<ApiSwitchResult["switchReason"]> } => {
    if (provider === "higgsfield" && !input.enableHiggsfieldEval) {
      return { ok: false, reason: "eval_gate_disabled" };
    }
    if (exhausted.has(provider)) {
      return { ok: false, reason: "insufficient_balance_402" };
    }
    const key = input.keys[provider];
    if (!hasUsableKey(key)) {
      return { ok: false, reason: "missing_api_key" };
    }
    return { ok: true, key };
  };

  const primary = isEligible(input.requestedProvider);
  if (primary.ok) {
    return {
      provider: input.requestedProvider,
      modelId: input.requestedModelId ?? DEFAULT_MODEL_BY_PROVIDER[input.requestedProvider][input.modality],
      apiKey: primary.key,
      switched: false,
      switchReason: null,
    };
  }

  if (!allowFallback) {
    throw new Error(
      `Provider ${input.requestedProvider} unavailable (${primary.reason}) and fallback is disabled.`,
    );
  }

  for (const candidate of FALLBACK_CHAIN[input.requestedProvider]) {
    const check = isEligible(candidate);
    if (check.ok) {
      return {
        provider: candidate,
        modelId: DEFAULT_MODEL_BY_PROVIDER[candidate][input.modality],
        apiKey: check.key,
        switched: true,
        switchReason: primary.reason,
        originalProvider: input.requestedProvider,
      };
    }
  }

  throw new Error(
    `No usable fallback provider available for ${input.requestedProvider} (${primary.reason}).`,
  );
}
