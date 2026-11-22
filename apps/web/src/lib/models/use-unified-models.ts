import {
  type Bot,
  CLONE_MODEL_CATALOG,
  formatModelCostEstimate,
  getModelGuideMeta,
  type ModelQualityTier,
  resolveModelBrand,
} from "@rakazo/contracts";
import { botModelPick, botModelState, modelOptionKey } from "@rakazo/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSpaceQueries } from "../query/query";

export type PickerTab = "frontier" | "uncensored";
export type ModalitySubFilter = "all" | "text" | "image" | "video";

export interface UnifiedModelRow {
  key: string;
  provider: string;
  modelId: string;
  displayName: string;
  brand: string;
  routeLabel: string;
  costLabel: string;
  kind: "text" | "image" | "video";
  qualityTier: ModelQualityTier;
  qualityRank: number;
  tierLabel: string;
  useNote: string;
  isUncensored: boolean;
  status: "connected" | "env_key" | "needs_key";
  saveKey?: string;
}

export interface SmartBrandGroup {
  brand: string;
  bestRank: number;
  showHeader: boolean;
  rows: UnifiedModelRow[];
}

const STATUS_ORDER = { connected: 0, env_key: 1, needs_key: 2 } as const;

export function sortUnifiedRowsByQuality(rows: UnifiedModelRow[]): UnifiedModelRow[] {
  return [...rows].sort((a, b) => {
    if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

export function groupUnifiedBySmartBrand(rows: UnifiedModelRow[]): SmartBrandGroup[] {
  const byBrand = new Map<string, UnifiedModelRow[]>();
  for (const row of rows) {
    const existing = byBrand.get(row.brand);
    if (existing) existing.push(row);
    else byBrand.set(row.brand, [row]);
  }
  const groups: SmartBrandGroup[] = [];
  for (const [brand, brandRows] of byBrand.entries()) {
    const sorted = sortUnifiedRowsByQuality(brandRows);
    groups.push({
      brand,
      bestRank: sorted[0]?.qualityRank ?? 99,
      showHeader: sorted.length > 1,
      rows: sorted,
    });
  }
  return groups.sort((a, b) => {
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return a.brand.localeCompare(b.brand);
  });
}

/**
 * Shared unified model source used by SideBranchModelPicker (matching Main's ComposerModelPicker):
 * - Merges Rakazo's live connected/subscription models (`queries.models.list` + `credentials` + `botModelState`)
 * - Merges the full `CLONE_MODEL_CATALOG` (Text, Image, Video, Uncensored)
 * - Resolves `defaultMainModelKey` so Side Chat automatically inherits whatever model Main is using.
 */
export function useUnifiedModels(activeBot?: Bot) {
  const queries = useSpaceQueries();
  const credentials = useQuery(queries.models.credentials.queryOptions()).data;
  const catalog = useQuery(queries.models.list.queryOptions()).data;
  const me = useQuery(queries.me.queryOptions()).data;

  const savedKey =
    activeBot?.modelProvider && activeBot?.modelId
      ? modelOptionKey(activeBot.modelProvider, activeBot.modelId)
      : "";

  const state = useMemo(() => {
    if (!credentials || !catalog || !me) return null;
    return botModelState({
      credentials,
      catalog,
      me,
      modelKey: savedKey,
      spaceDefaultLabel: "Space default",
    });
  }, [credentials, catalog, me, savedKey]);

  const { connectedProviders, subscriptionProviders } = useMemo(() => {
    const connected = new Set<string>();
    const subs = new Set<string>();
    for (const cred of credentials ?? []) {
      const prov = cred.provider.toLowerCase();
      if (cred.hasKey || cred.accountId) {
        connected.add(prov);
        if (prov.startsWith("openai")) connected.add("openai");
      }
      if (cred.accountId) subs.add(prov);
    }
    return { connectedProviders: connected, subscriptionProviders: subs };
  }, [credentials]);

  const allRows = useMemo<UnifiedModelRow[]>(() => {
    const map = new Map<string, UnifiedModelRow>();

    // 1. Live connected / runnable models from Rakazo's botModelState (exact same list as Main)
    for (const choice of state?.choices ?? []) {
      if (!choice.key) continue;
      const picked = botModelPick(choice.key);
      const provider = picked.modelProvider ?? "openai";
      const modelId = picked.modelId ?? choice.key;
      const meta = getModelGuideMeta(provider, modelId);
      const { brand, routeLabel } = resolveModelBrand(provider, modelId);
      const isSub =
        subscriptionProviders.has(provider.toLowerCase()) ||
        provider.toLowerCase() === "openai-codex";
      const uniqueKey = `${provider}:${modelId}`;
      map.set(uniqueKey, {
        key: uniqueKey,
        provider,
        modelId,
        displayName: choice.label,
        brand,
        routeLabel,
        costLabel: formatModelCostEstimate({ isSubscription: isSub }),
        kind: "text",
        qualityTier: meta.qualityTier,
        qualityRank: meta.qualityRank,
        tierLabel: meta.tierLabel,
        useNote: meta.useNote,
        isUncensored: meta.isUncensored,
        status: "connected",
        saveKey: choice.key,
      });
    }

    // 2. Full CLONE catalog (Text, Image, Video, Uncensored)
    for (const entry of CLONE_MODEL_CATALOG) {
      if (entry.evalOnly) continue;
      const uniqueKey = `${entry.provider}:${entry.modelId}`;
      if (map.has(uniqueKey)) continue;
      const meta = getModelGuideMeta(entry.provider, entry.modelId, entry.weightVariant);
      const { brand, routeLabel } = resolveModelBrand(entry.provider, entry.modelId);
      const kind: "text" | "image" | "video" = entry.modalities.includes("video_gen")
        ? "video"
        : entry.modalities.includes("image_gen")
          ? "image"
          : "text";
      const isConnected = connectedProviders.has(entry.provider.toLowerCase());
      map.set(uniqueKey, {
        key: uniqueKey,
        provider: entry.provider,
        modelId: entry.modelId,
        displayName: entry.displayName,
        brand,
        routeLabel,
        costLabel: formatModelCostEstimate(entry),
        kind,
        qualityTier: meta.qualityTier,
        qualityRank: meta.qualityRank,
        tierLabel: meta.tierLabel,
        useNote: meta.useNote,
        isUncensored: meta.isUncensored,
        status: isConnected ? "connected" : "needs_key",
      });
    }

    return sortUnifiedRowsByQuality([...map.values()]);
  }, [state?.choices, connectedProviders, subscriptionProviders]);

  // Default to whatever model Main is currently using!
  const defaultMainModelKey = useMemo(() => {
    if (activeBot?.modelProvider && activeBot?.modelId) {
      return `${activeBot.modelProvider}:${activeBot.modelId}`;
    }
    const firstConnected = state?.choices?.find((c) => Boolean(c.key));
    if (firstConnected?.key) {
      const picked = botModelPick(firstConnected.key);
      if (picked.modelProvider && picked.modelId) {
        return `${picked.modelProvider}:${picked.modelId}`;
      }
    }
    return allRows[0]?.key ?? "openai:gpt-4o-mini";
  }, [activeBot?.modelProvider, activeBot?.modelId, state?.choices, allRows]);

  return { allRows, defaultMainModelKey };
}
