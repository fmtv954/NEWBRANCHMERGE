import * as z from "zod";
import { BillingRouteSchema } from "../projects/projects.js";

export const ExecutionModeSchema = z.enum(["hosted", "local"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const WeightVariantSchema = z.enum(["standard", "abliterated", "fine_tuned", "open_weight"]);
export type WeightVariant = z.infer<typeof WeightVariantSchema>;

export const VerificationStatusSchema = z.enum([
  "discovered",
  "credential_connected",
  "live_tested",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const ModelVerificationBadgeSchema = z.enum([
  "official_api",
  "verified_weights",
  "reduced_filtering",
  "e2ee",
  "open_weight",
]);
export type ModelVerificationBadge = z.infer<typeof ModelVerificationBadgeSchema>;

export const ModelModalitySchema = z.enum([
  "text",
  "vision",
  "audio_in",
  "audio_out",
  "video_in",
  "image_gen",
  "image_edit",
  "video_gen",
]);
export type ModelModality = z.infer<typeof ModelModalitySchema>;

export const ModelCapabilitySchema = z.enum([
  "tools",
  "structured_output",
  "web_search",
  "x_search",
  "realtime_voice",
  "first_last_frame",
  "reference_images",
  "mask_edit",
  "a2ui_cards",
]);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const BillingUnitSchema = z.enum([
  "per_1m_tokens",
  "per_image",
  "per_second",
  "per_minute",
  "local_free",
]);
export type BillingUnit = z.infer<typeof BillingUnitSchema>;

export const CloneModelCatalogEntrySchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  executionMode: ExecutionModeSchema,
  weightVariant: WeightVariantSchema,
  billingRouteSupport: z.array(BillingRouteSchema).min(1),
  verificationStatus: VerificationStatusSchema.default("discovered"),
  dayOneCore: z.boolean().default(false),
  evalOnly: z.boolean().default(false),
  verificationBadges: z.array(ModelVerificationBadgeSchema),
  modalities: z.array(ModelModalitySchema),
  capabilities: z.array(ModelCapabilitySchema),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().optional(),
  billingUnit: BillingUnitSchema,
  pricingVersion: z.string(),
  inputPriceMicros: z.number().nonnegative(),
  outputPriceMicros: z.number().nonnegative().optional(),
  regionRetentionNote: z.string(),
});
export type CloneModelCatalogEntry = z.infer<typeof CloneModelCatalogEntrySchema>;

export const CLONE_MODEL_CATALOG: readonly CloneModelCatalogEntry[] = [
  // --- Core 5 Day-1: Direct OpenAI ---
  {
    provider: "openai",
    modelId: "gpt-6.2-sol",
    displayName: "GPT-6.2 Sol",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["subscription", "byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["text", "vision"],
    capabilities: ["tools", "structured_output", "web_search", "a2ui_cards"],
    contextWindow: 400_000,
    maxOutputTokens: 32_768,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 1_500_000,
    outputPriceMicros: 6_000_000,
    regionRetentionNote: "Direct OpenAI Responses API; zero training on API data by default.",
  },
  {
    provider: "openai",
    modelId: "gpt-6.2-astra",
    displayName: "GPT-6.2 Astra",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["subscription", "byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["text", "vision"],
    capabilities: ["tools", "structured_output", "web_search", "a2ui_cards"],
    contextWindow: 400_000,
    maxOutputTokens: 65_536,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 5_000_000,
    outputPriceMicros: 20_000_000,
    regionRetentionNote: "Direct OpenAI high-complexity reasoning & coding API.",
  },
  {
    provider: "openai",
    modelId: "gpt-image-2.6-sunburst",
    displayName: "GPT Image 2.6 Sunburst",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["image_gen", "image_edit"],
    capabilities: ["reference_images", "mask_edit"],
    contextWindow: 32_000,
    billingUnit: "per_image",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 40_000,
    regionRetentionNote: "Direct OpenAI image generation and reference editing.",
  },
  // --- Core 5 Day-1: Direct xAI / Grok ---
  {
    provider: "xai",
    modelId: "grok-4.7",
    displayName: "Grok 4.7",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["subscription", "byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["text", "vision"],
    capabilities: ["tools", "structured_output", "web_search", "x_search", "a2ui_cards"],
    contextWindow: 256_000,
    maxOutputTokens: 32_768,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 3_000_000,
    outputPriceMicros: 15_000_000,
    regionRetentionNote: "Direct xAI API with native Web Search and X Search tools.",
  },
  {
    provider: "xai",
    modelId: "grok-imagine-image-2.0",
    displayName: "Grok Imagine Image 2.0",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["image_gen", "image_edit"],
    capabilities: ["reference_images"],
    contextWindow: 16_000,
    billingUnit: "per_image",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 50_000,
    regionRetentionNote: "Direct xAI image generation and editing.",
  },
  {
    provider: "xai",
    modelId: "grok-imagine-video-1.5-lite",
    displayName: "Grok Imagine Video 1.5 Lite",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["video_gen"],
    capabilities: ["reference_images"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 60_000,
    regionRetentionNote: "Direct xAI fast draft video generation.",
  },
  {
    provider: "xai",
    modelId: "grok-imagine-video-1.5",
    displayName: "Grok Imagine Video 1.5",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["video_gen"],
    capabilities: ["reference_images", "first_last_frame"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 140_000,
    regionRetentionNote: "Direct xAI premium cinematic video generation.",
  },
  {
    provider: "xai",
    modelId: "grok-voice",
    displayName: "Grok Voice",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["audio_in", "audio_out", "text"],
    capabilities: ["realtime_voice", "tools"],
    contextWindow: 128_000,
    billingUnit: "per_minute",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 50_000,
    regionRetentionNote: "Direct xAI full-duplex realtime voice with barge-in.",
  },
  // --- Core 5 Day-1: Refuseless (Abliterated Text; key TBD) ---
  {
    provider: "refuseless",
    modelId: "glm-5.3-flash-abliterated",
    displayName: "GLM-5.3 Flash Abliterated",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "discovered",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["verified_weights", "open_weight"],
    modalities: ["text"],
    capabilities: ["tools", "structured_output", "a2ui_cards"],
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 100_000,
    outputPriceMicros: 350_000,
    regionRetentionNote:
      "Refuseless hosted abliterated endpoint; verify upstream retention before enterprise PII.",
  },
  {
    provider: "refuseless",
    modelId: "deepseek-v4.1-flash-abliterated",
    displayName: "DeepSeek V4.1 Flash 1017 Abliterated",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "discovered",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["verified_weights", "open_weight"],
    modalities: ["text", "vision"],
    capabilities: ["tools", "structured_output", "a2ui_cards"],
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 120_000,
    outputPriceMicros: 450_000,
    regionRetentionNote: "Refuseless hosted 552B MoE abliterated checkpoint.",
  },
  // --- Core 5 Day-1: fal.ai (Frontier Media) ---
  {
    provider: "fal",
    modelId: "bytedance/seedream/v5.5/text-to-image",
    displayName: "Seedream 5.5",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["image_gen", "image_edit"],
    capabilities: ["reference_images"],
    contextWindow: 8_000,
    billingUnit: "per_image",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 35_000,
    regionRetentionNote: "fal.ai queue API.",
  },
  {
    provider: "fal",
    modelId: "google/nano-banana-2.1/edit",
    displayName: "Nano Banana 2.1",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["image_gen", "image_edit"],
    capabilities: ["reference_images", "mask_edit"],
    contextWindow: 8_000,
    billingUnit: "per_image",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 80_000,
    regionRetentionNote: "fal.ai Nano Banana 2.1 reference/edit route.",
  },
  {
    provider: "fal",
    modelId: "fal-ai/seedance-2.5",
    displayName: "Seedance 2.5",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["video_gen"],
    capabilities: ["reference_images", "first_last_frame"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 200_000,
    regionRetentionNote: "fal.ai reference-led cinematic video route.",
  },
  {
    provider: "fal",
    modelId: "fal-ai/kling/v4/text-to-video",
    displayName: "Kling 4.0",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["video_gen"],
    capabilities: ["reference_images", "first_last_frame"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 157_000,
    regionRetentionNote: "fal.ai Kling 4.0 video route.",
  },
  // --- Core 5 Day-1: UncensoredLLM (Less-Restricted Media) ---
  {
    provider: "uncensoredllm",
    modelId: "qwen-image-3-uncensored",
    displayName: "Qwen Image 3 Uncensored",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["reduced_filtering"],
    modalities: ["image_gen"],
    capabilities: ["reference_images"],
    contextWindow: 8_000,
    billingUnit: "per_image",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 80_000,
    regionRetentionNote:
      "UncensoredLLM reduced-filtering image endpoint; confirm reseller terms for public billing.",
  },
  {
    provider: "uncensoredllm",
    modelId: "qwen-edit",
    displayName: "Qwen Edit",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["reduced_filtering"],
    modalities: ["image_edit"],
    capabilities: ["reference_images", "mask_edit"],
    contextWindow: 8_000,
    billingUnit: "per_image",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 37_500,
    regionRetentionNote: "UncensoredLLM reference image editing endpoint.",
  },
  {
    provider: "uncensoredllm",
    modelId: "wan-3.0-video-uncensored",
    displayName: "Wan 3.0 Video Uncensored",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["reduced_filtering"],
    modalities: ["video_gen"],
    capabilities: ["reference_images"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 100_000,
    regionRetentionNote: "UncensoredLLM Wan 3.0 video endpoint.",
  },
  {
    provider: "uncensoredllm",
    modelId: "ltx-2.3-i2v-uncensored",
    displayName: "LTX 2.3 I2V Uncensored",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "credential_connected",
    dayOneCore: true,
    evalOnly: false,
    verificationBadges: ["reduced_filtering"],
    modalities: ["video_gen"],
    capabilities: ["reference_images"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 80_000,
    regionRetentionNote: "UncensoredLLM LTX 2.3 image-to-video endpoint (requires starting image).",
  },
  // --- Immediate Abliterated Fallback & BYOK-Ready Registry Entries ---
  {
    provider: "venice",
    modelId: "deepseek-v4.1-flash-1017-e2ee",
    displayName: "DeepSeek V4.1 Flash E2EE (Text-Only)",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "discovered",
    dayOneCore: false,
    evalOnly: false,
    verificationBadges: ["verified_weights", "e2ee", "open_weight"],
    modalities: ["text"],
    capabilities: ["structured_output"],
    contextWindow: 128_000,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 380_000,
    outputPriceMicros: 1_500_000,
    regionRetentionNote: "Venice E2EE text-only route (no vision/media attachments).",
  },
  {
    provider: "openrouter",
    modelId: "glm-5.3-flash-abliterated",
    displayName: "GLM-5.3 Flash Abliterated (OpenRouter)",
    executionMode: "hosted",
    weightVariant: "abliterated",
    billingRouteSupport: ["byok"],
    verificationStatus: "discovered",
    dayOneCore: false,
    evalOnly: false,
    verificationBadges: ["open_weight"],
    modalities: ["text"],
    capabilities: ["tools", "structured_output", "a2ui_cards"],
    contextWindow: 128_000,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 150_000,
    outputPriceMicros: 450_000,
    regionRetentionNote: "OpenRouter BYOK fallback while Refuseless key is TBD.",
  },
  {
    provider: "anthropic",
    modelId: "claude-fable-5.2",
    displayName: "Claude Fable 5.2",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["subscription", "byok", "hosted_credits"],
    verificationStatus: "discovered",
    dayOneCore: false,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["text", "vision"],
    capabilities: ["tools", "structured_output", "a2ui_cards"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 5_000_000,
    outputPriceMicros: 25_000_000,
    regionRetentionNote: "Direct Anthropic API (BYOK / local Claude Code).",
  },
  {
    provider: "google",
    modelId: "gemini-4-carbon",
    displayName: "Gemini 4 Carbon",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok", "hosted_credits"],
    verificationStatus: "discovered",
    dayOneCore: false,
    evalOnly: false,
    verificationBadges: ["official_api"],
    modalities: ["text", "vision", "audio_in", "video_in"],
    capabilities: ["tools", "structured_output", "web_search", "a2ui_cards"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    billingUnit: "per_1m_tokens",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 1_250_000,
    outputPriceMicros: 5_000_000,
    regionRetentionNote: "Direct Google Gemini API (BYOK).",
  },
  {
    provider: "local-compatible",
    modelId: "huihui-qwen3.8-27b-abliterated",
    displayName: "Huihui Qwen3.8-27B Abliterated (Local)",
    executionMode: "local",
    weightVariant: "abliterated",
    billingRouteSupport: ["local"],
    verificationStatus: "discovered",
    dayOneCore: false,
    evalOnly: false,
    verificationBadges: ["verified_weights", "open_weight"],
    modalities: ["text", "vision"],
    capabilities: ["tools", "structured_output", "a2ui_cards"],
    contextWindow: 65_536,
    billingUnit: "local_free",
    pricingVersion: "local",
    inputPriceMicros: 0,
    outputPriceMicros: 0,
    regionRetentionNote: "Customer-operated Ollama/vLLM OpenAI-compatible server.",
  },
  // --- Gated Internal/BYOK Evaluation Entry (Never Managed Resale) ---
  {
    provider: "higgsfield",
    modelId: "higgsfield-soul-video",
    displayName: "Higgsfield (Eval Only)",
    executionMode: "hosted",
    weightVariant: "standard",
    billingRouteSupport: ["byok"],
    verificationStatus: "discovered",
    dayOneCore: false,
    evalOnly: true,
    verificationBadges: ["official_api"],
    modalities: ["video_gen", "image_gen"],
    capabilities: ["reference_images"],
    contextWindow: 8_000,
    billingUnit: "per_second",
    pricingVersion: "2026-11-v1",
    inputPriceMicros: 150_000,
    regionRetentionNote:
      "Internal/BYOK evaluation only (ENABLE_HIGGSFIELD_EVAL=true); restricted from managed resale.",
  },
];

export const ModelQualityTierSchema = z.enum([
  "flagship",
  "reasoning_coding",
  "cinema_media",
  "fast_daily",
  "uncensored",
]);
export type ModelQualityTier = z.infer<typeof ModelQualityTierSchema>;

export interface ModelGuideMeta {
  qualityTier: ModelQualityTier;
  qualityRank: number;
  tierLabel: string;
  useNote: string;
  isUncensored: boolean;
}

const MODEL_GUIDE_OVERRIDES: Record<string, ModelGuideMeta> = {
  "openai:gpt-6.2-sol": {
    qualityTier: "flagship",
    qualityRank: 1,
    tierLabel: "Flagship",
    useNote: "Top overall quality — deep reasoning, coding, vision & tool use (400K ctx)",
    isUncensored: false,
  },
  "openai:gpt-6.2-astra": {
    qualityTier: "fast_daily",
    qualityRank: 4,
    tierLabel: "Fast / Daily",
    useNote: "Low-latency daily chat, quick drafts & lightweight tool runs",
    isUncensored: false,
  },
  "anthropic:claude-fable-5.2": {
    qualityTier: "reasoning_coding",
    qualityRank: 2,
    tierLabel: "Coding & Think",
    useNote: "Best for long-form writing, nuanced editing & careful software architecture",
    isUncensored: false,
  },
  "google:gemini-4-carbon": {
    qualityTier: "reasoning_coding",
    qualityRank: 3,
    tierLabel: "Coding & Think",
    useNote: "Deep thinking, huge multimodal context (video/audio/vision) & strong coding",
    isUncensored: false,
  },
  "xai:grok-4.7": {
    qualityTier: "flagship",
    qualityRank: 2,
    tierLabel: "Flagship",
    useNote: "Real-time X & web search, fast multi-step reasoning & direct tone",
    isUncensored: false,
  },
  "openai:gpt-image-2.6-sunburst": {
    qualityTier: "cinema_media",
    qualityRank: 1,
    tierLabel: "Best Image",
    useNote: "High-fidelity text rendering, photorealistic composition & precise mask edits",
    isUncensored: false,
  },
  "fal:bytedance/seedream/v5.5/text-to-image": {
    qualityTier: "cinema_media",
    qualityRank: 2,
    tierLabel: "Cinema Image",
    useNote: "Cinematic lighting, character consistency & fast high-res stills via fal.ai",
    isUncensored: false,
  },
  "fal:google/nano-banana-2.1/edit": {
    qualityTier: "cinema_media",
    qualityRank: 3,
    tierLabel: "Image Edit",
    useNote: "Multi-reference image editing, wardrobe/prop swaps & style transfer",
    isUncensored: false,
  },
  "xai:grok-imagine-image-2.0": {
    qualityTier: "fast_daily",
    qualityRank: 4,
    tierLabel: "Fast Image",
    useNote: "Rapid concept art & expressive image generation directly via xAI",
    isUncensored: false,
  },
  "fal:fal-ai/seedance-2.5": {
    qualityTier: "cinema_media",
    qualityRank: 1,
    tierLabel: "Cinema Video",
    useNote: "Flagship 1080p video with first/last-frame control & character reference continuity",
    isUncensored: false,
  },
  "fal:fal-ai/kling/v4/text-to-video": {
    qualityTier: "cinema_media",
    qualityRank: 2,
    tierLabel: "Cinema Video",
    useNote: "Smooth camera motion, realistic physics & expressive dramatic acting",
    isUncensored: false,
  },
  "xai:grok-imagine-video-1.5": {
    qualityTier: "cinema_media",
    qualityRank: 3,
    tierLabel: "Direct Video",
    useNote: "720p direct xAI video generation with native audio & fast turnaround",
    isUncensored: false,
  },
  "xai:grok-imagine-video-1.5-lite": {
    qualityTier: "fast_daily",
    qualityRank: 4,
    tierLabel: "Fast Video",
    useNote: "Low-cost rapid storyboard previews & motion drafts (480p/720p)",
    isUncensored: false,
  },
  "refuseless:glm-5.3-flash-abliterated": {
    qualityTier: "uncensored",
    qualityRank: 1,
    tierLabel: "Uncensored Text",
    useNote: "Abliterated weights — reduced refusals for creative fiction, red-teaming & uncensored chat",
    isUncensored: true,
  },
  "refuseless:deepseek-v4.1-flash-abliterated": {
    qualityTier: "uncensored",
    qualityRank: 2,
    tierLabel: "Uncensored Think",
    useNote: "Abliterated DeepSeek reasoning & coding with reduced filtering",
    isUncensored: true,
  },
  "venice:deepseek-v4.1-flash-1017-e2ee": {
    qualityTier: "uncensored",
    qualityRank: 3,
    tierLabel: "Private Uncensored",
    useNote: "Private E2EE zero-retention text-only reasoning & uncensored fallback",
    isUncensored: true,
  },
  "openrouter:glm-5.3-flash-abliterated": {
    qualityTier: "uncensored",
    qualityRank: 4,
    tierLabel: "Uncensored Route",
    useNote: "Abliterated GLM-5.3 routed via OpenRouter when direct Refuseless key is absent",
    isUncensored: true,
  },
  "local-compatible:huihui-qwen3.8-27b-abliterated": {
    qualityTier: "uncensored",
    qualityRank: 5,
    tierLabel: "Local Uncensored",
    useNote: "100% local private abliterated model — zero cloud cost (Ollama / LM Studio)",
    isUncensored: true,
  },
  "uncensoredllm:qwen-image-3-uncensored": {
    qualityTier: "uncensored",
    qualityRank: 1,
    tierLabel: "Uncensored Image",
    useNote: "Unrestricted photorealistic & stylized image generation via UncensoredLLM",
    isUncensored: true,
  },
  "uncensoredllm:qwen-edit": {
    qualityTier: "uncensored",
    qualityRank: 2,
    tierLabel: "Uncensored Edit",
    useNote: "Unrestricted instruction-based image editing & reference restyling",
    isUncensored: true,
  },
  "uncensoredllm:wan-3.0-video-uncensored": {
    qualityTier: "uncensored",
    qualityRank: 1,
    tierLabel: "Uncensored Video",
    useNote: "Unrestricted text-to-video & cinematic scene synthesis via UncensoredLLM",
    isUncensored: true,
  },
  "uncensoredllm:ltx-2.3-i2v-uncensored": {
    qualityTier: "uncensored",
    qualityRank: 2,
    tierLabel: "Uncensored I2V",
    useNote: "Fast unrestricted image-to-video animation (requires starting image)",
    isUncensored: true,
  },
};

/**
 * Returns quality tier, sort rank, and real doc-backed 1-line guidance for any catalog
 * or connected OAuth/BYOK model (including GPT, Grok, Gemini, Claude, and abliterated models).
 */
export function getModelGuideMeta(
  provider: string,
  modelId: string,
  weightVariant?: WeightVariant,
): ModelGuideMeta {
  const exact = MODEL_GUIDE_OVERRIDES[`${provider}:${modelId}`];
  if (exact) return exact;

  const id = modelId.toLowerCase();
  const prov = provider.toLowerCase();
  const isUncensored =
    weightVariant === "abliterated" ||
    id.includes("abliterated") ||
    id.includes("uncensored") ||
    prov === "refuseless" ||
    prov === "uncensoredllm" ||
    prov === "venice";

  if (isUncensored) {
    return {
      qualityTier: "uncensored",
      qualityRank: 5,
      tierLabel: "Uncensored",
      useNote: "Reduced-filtering / abliterated weights for unrestricted creative & research workflows",
      isUncensored: true,
    };
  }
  if (id.includes("video") || id.includes("seedance") || id.includes("kling") || id.includes("wan")) {
    return {
      qualityTier: "cinema_media",
      qualityRank: 3,
      tierLabel: "Video",
      useNote: "Video generation model for scenes, storyboards & motion shots",
      isUncensored: false,
    };
  }
  if (id.includes("image") || id.includes("seedream") || id.includes("banana") || id.includes("flux")) {
    return {
      qualityTier: "cinema_media",
      qualityRank: 3,
      tierLabel: "Image",
      useNote: "Image generation & visual editing model",
      isUncensored: false,
    };
  }
  if (id.includes("codex") || id.includes("o3") || id.includes("o4") || id.includes("claude") || id.includes("neon") || id.includes("pro") || id.includes("reason") || id.includes("deepseek")) {
    return {
      qualityTier: "reasoning_coding",
      qualityRank: 2,
      tierLabel: "Coding & Think",
      useNote: "Strong thinking, multi-step problem solving & software engineering",
      isUncensored: false,
    };
  }
  if (id.includes("gpt-6") || id.includes("gpt-5") || id.includes("grok-4") || id.includes("sol") || id.includes("luna")) {
    return {
      qualityTier: "flagship",
      qualityRank: 1,
      tierLabel: "Flagship",
      useNote: "High-capability general reasoning, coding, vision & agent tool use",
      isUncensored: false,
    };
  }
  return {
    qualityTier: "fast_daily",
    qualityRank: 6,
    tierLabel: "Fast / Daily",
    useNote: "Fast everyday chat, summaries & lightweight tasks",
    isUncensored: false,
  };
}

export interface ModelBrandInfo {
  brand: string;
  routeLabel: string;
}

const PROVIDER_ROUTE_LABELS: Record<string, string> = {
  openai: "OpenAI",
  "openai-codex": "ChatGPT Sub",
  xai: "xAI",
  anthropic: "Anthropic",
  google: "Google",
  fal: "via fal.ai",
  refuseless: "via Refuseless",
  uncensoredllm: "via UncensoredLLM",
  venice: "via Venice",
  openrouter: "via OpenRouter",
  "local-compatible": "Local",
  higgsfield: "Higgsfield",
};

/**
 * Resolves the user-facing Model Brand (OpenAI, xAI / Grok, Anthropic, Google, ByteDance,
 * Kling, Qwen, DeepSeek, GLM, Wan, LTX) separately from the API host route.
 */
export function resolveModelBrand(provider: string, modelId: string): ModelBrandInfo {
  const prov = provider.toLowerCase();
  const id = modelId.toLowerCase();
  const routeLabel = PROVIDER_ROUTE_LABELS[prov] ?? provider;

  if (prov === "openai" || prov === "openai-codex" || id.startsWith("gpt-") || id.startsWith("o3") || id.startsWith("o4")) {
    return { brand: "OpenAI", routeLabel };
  }
  if (prov === "xai" || id.includes("grok")) {
    return { brand: "xAI / Grok", routeLabel };
  }
  if (prov === "anthropic" || id.includes("claude")) {
    return { brand: "Anthropic", routeLabel };
  }
  if (prov === "google" || id.startsWith("google/") || id.includes("gemini") || id.includes("nano-banana")) {
    return { brand: "Google", routeLabel };
  }
  if (id.includes("bytedance") || id.includes("seedance") || id.includes("seedream")) {
    return { brand: "ByteDance", routeLabel };
  }
  if (id.includes("kling")) {
    return { brand: "Kling", routeLabel };
  }
  if (id.includes("qwen")) {
    return { brand: "Qwen", routeLabel };
  }
  if (id.includes("deepseek")) {
    return { brand: "DeepSeek", routeLabel };
  }
  if (id.includes("glm")) {
    return { brand: "GLM", routeLabel };
  }
  if (id.includes("wan")) {
    return { brand: "Wan", routeLabel };
  }
  if (id.includes("ltx")) {
    return { brand: "LTX", routeLabel };
  }
  return { brand: routeLabel.replace(/^via /, ""), routeLabel };
}

function formatDollarCompact(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(3)}`;
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * Formats a concise, human-friendly cost estimate pill for any model row.
 */
export function formatModelCostEstimate(input: {
  billingUnit?: BillingUnit;
  inputPriceMicros?: number;
  outputPriceMicros?: number;
  isSubscription?: boolean;
  executionMode?: ExecutionMode;
}): string {
  if (input.isSubscription) return "Included · Sub";
  if (input.executionMode === "local" || input.billingUnit === "local_free") {
    return "Free · Local";
  }
  if (!input.billingUnit || input.inputPriceMicros === undefined) {
    return "API billed";
  }
  if (input.billingUnit === "per_image") {
    return `${formatDollarCompact(input.inputPriceMicros)}/img`;
  }
  if (input.billingUnit === "per_second") {
    return `${formatDollarCompact(input.inputPriceMicros)}/sec`;
  }
  if (input.billingUnit === "per_minute") {
    return `${formatDollarCompact(input.inputPriceMicros)}/min`;
  }
  const inStr = formatDollarCompact(input.inputPriceMicros);
  if (input.outputPriceMicros !== undefined) {
    const outStr = formatDollarCompact(input.outputPriceMicros);
    return `${inStr}/${outStr} · 1M`;
  }
  return `${inStr} · 1M`;
}

export function findCatalogModel(
  provider: string,
  modelId: string,
): CloneModelCatalogEntry | undefined {
  return CLONE_MODEL_CATALOG.find(
    (entry) => entry.provider === provider && entry.modelId === modelId,
  );
}

/** Task-first filter: returns models capable of the requested modality/capabilities. */
export function filterCatalogByTask(options: {
  modality?: ModelModality;
  capabilities?: readonly ModelCapability[];
  executionMode?: ExecutionMode;
  weightVariant?: WeightVariant;
  includeEvalOnly?: boolean;
}): CloneModelCatalogEntry[] {
  return CLONE_MODEL_CATALOG.filter((entry) => {
    if (entry.evalOnly && !options.includeEvalOnly) return false;
    if (options.modality && !entry.modalities.includes(options.modality)) return false;
    if (options.capabilities?.some((cap) => !entry.capabilities.includes(cap))) {
      return false;
    }
    if (options.executionMode && entry.executionMode !== options.executionMode) return false;
    if (options.weightVariant && entry.weightVariant !== options.weightVariant) return false;
    return true;
  });
}

export interface InputCompatibilityReport {
  compatible: boolean;
  unsupportedInputs: Array<{
    id: string;
    label: string;
    requiredModality: ModelModality;
    suggestion: string;
  }>;
}

export function validateModelInputCompatibility(
  model: Pick<CloneModelCatalogEntry, "displayName" | "modalities">,
  inputs: ReadonlyArray<{ id: string; label: string; kind: "image" | "video" | "audio" | "text" }>,
): InputCompatibilityReport {
  const unsupportedInputs: InputCompatibilityReport["unsupportedInputs"] = [];
  for (const input of inputs) {
    if (input.kind === "text") continue;
    const requiredModality: ModelModality =
      input.kind === "image" ? "vision" : input.kind === "video" ? "video_in" : "audio_in";
    if (!model.modalities.includes(requiredModality)) {
      unsupportedInputs.push({
        id: input.id,
        label: input.label,
        requiredModality,
        suggestion:
          input.kind === "video" || input.kind === "audio"
            ? `${model.displayName} cannot read ${input.kind} directly; switch to a multimodal route or attach its transcript.`
            : `${model.displayName} is text-only and cannot read images; switch to a vision-capable model or remove this attachment.`,
      });
    }
  }
  return {
    compatible: unsupportedInputs.length === 0,
    unsupportedInputs,
  };
}
