import type { Branch, MergeSourceBlock } from "@rakazo/contracts";

export type BranchGenerationSettings = {
  contextMode: NonNullable<Branch["forkOrigin"]>["contextMode"];
  personaPrompt?: string;
  responseStyle: "direct" | "balanced" | "deep";
  temperature?: number;
  maxTokens?: number;
};

export type BranchCompareSource = {
  branchId: string;
  blocks: MergeSourceBlock[];
  prompt: string;
  settings: BranchGenerationSettings;
};
