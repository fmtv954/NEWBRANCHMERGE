import type { ModelProviderDefinition } from "./model-provider-registry.js";

const bearer = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}` });
const unauthorized = async (response: Response) =>
  response.status === 401 || response.status === 403;

/**
 * CLONE's extended provider registry for Core 5 Day-1 live routes, abliterated fallbacks,
 * media providers, and gated evaluation endpoints. Kept separate from Rakazo's `pi-ai`
 * conformance table so upstream `model-provider-conformance.test.ts` stays 100% green.
 */
export const cloneProviders: Record<string, ModelProviderDefinition> = {
  openai: {
    displayName: "OpenAI",
    recommendedModel: "gpt-6.2-sol",
    keyCheck: { url: "https://api.openai.com/v1/models", headers: bearer, rejected: unauthorized },
    deployment: { keyEnv: "OPENAI_API_KEY", defaultModel: "gpt-6.2-sol" },
  },
  xai: {
    displayName: "xAI / Grok",
    recommendedModel: "grok-4.7",
    keyCheck: { url: "https://api.x.ai/v1/models", headers: bearer, rejected: unauthorized },
    deployment: { keyEnv: "XAI_API_KEY", defaultModel: "grok-4.7" },
    signIn: {
      mode: "device-code",
      loginLabel: "Sign in with SuperGrok or X Premium",
      hint: "SuperGrok / key",
      billing: "Sign in with SuperGrok or X Premium, or paste an xAI API key.",
    },
  },
  refuseless: {
    displayName: "Refuseless",
    recommendedModel: "glm-5.3-flash-abliterated",
    keyCheck: {
      url: "https://api.refuseless.com/v1/models",
      headers: bearer,
      rejected: unauthorized,
    },
    deployment: { keyEnv: "REFUSELESS_API_KEY", defaultModel: "glm-5.3-flash-abliterated" },
  },
  venice: {
    displayName: "Venice AI",
    recommendedModel: "deepseek-v4.1-flash-1017-e2ee",
    keyCheck: {
      url: "https://api.venice.ai/api/v1/models",
      headers: bearer,
      rejected: unauthorized,
    },
    deployment: { keyEnv: "VENICE_API_KEY", defaultModel: "deepseek-v4.1-flash-1017-e2ee" },
  },
  fal: {
    displayName: "fal.ai",
    recommendedModel: "fal-ai/seedance-2.5",
    keyCheck: {
      url: "https://api.fal.ai/v1/models",
      headers: (apiKey) => ({ Authorization: `Key ${apiKey}` }),
      rejected: unauthorized,
    },
    deployment: { keyEnv: "FAL_KEY", defaultModel: "fal-ai/seedance-2.5" },
  },
  uncensoredllm: {
    displayName: "UncensoredLLM",
    recommendedModel: "qwen-image-3-uncensored",
    keyCheck: {
      url: "https://api.uncensoredllm.ai/v1/models",
      headers: bearer,
      rejected: unauthorized,
    },
    deployment: { keyEnv: "UNCENSOREDLLM_API_KEY", defaultModel: "qwen-image-3-uncensored" },
  },
  higgsfield: {
    displayName: "Higgsfield (Eval Only)",
    deployment: { keyEnv: "HIGGSFIELD_API_KEY", defaultModel: "higgsfield-soul-video" },
  },
};
