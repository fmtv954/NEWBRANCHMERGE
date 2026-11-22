import * as z from "zod";
import { Id, IsoDate } from "../ids.js";

export const EpisodeAspectRatioSchema = z.enum(["9:16", "16:9", "2.39:1", "1:1"]);
export type EpisodeAspectRatio = z.infer<typeof EpisodeAspectRatioSchema>;

export const EpisodeStatusSchema = z.enum(["draft", "storyboard", "filming", "review", "exported"]);
export type EpisodeStatus = z.infer<typeof EpisodeStatusSchema>;

export const ShotTakeKindSchema = z.enum(["storyboard_frame", "video", "audio", "lipsync"]);
export type ShotTakeKind = z.infer<typeof ShotTakeKindSchema>;

export const ShotTakeStatusSchema = z.enum([
  "queued",
  "rendering",
  "ready",
  "approved",
  "stale",
  "failed",
]);
export type ShotTakeStatus = z.infer<typeof ShotTakeStatusSchema>;

export const EpisodeSchema = z.object({
  id: Id,
  projectId: Id,
  title: z.string().min(1).max(200),
  logline: z.string().max(2_000),
  scriptArtifactId: Id.nullable(),
  aspectRatio: EpisodeAspectRatioSchema,
  targetDurationSec: z.number().int().positive().max(3_600),
  status: EpisodeStatusSchema,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const CharacterRefSchema = z.object({
  id: Id,
  projectId: Id,
  stableCode: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(4_000),
  voiceProvider: z.string().nullable(),
  voiceId: z.string().nullable(),
  referenceArtifactIds: z.array(Id),
  wardrobeNotes: z.string().max(2_000),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type CharacterRef = z.infer<typeof CharacterRefSchema>;

export const PropLocationRefSchema = z.object({
  id: Id,
  projectId: Id,
  kind: z.enum(["prop", "location"]),
  stableCode: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(4_000),
  referenceArtifactIds: z.array(Id),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type PropLocationRef = z.infer<typeof PropLocationRefSchema>;

export const SceneSchema = z.object({
  id: Id,
  episodeId: Id,
  sceneNumber: z.number().int().positive(),
  slugline: z.string().min(1).max(240),
  summary: z.string().max(4_000),
  orderIndex: z.number().int().nonnegative(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Scene = z.infer<typeof SceneSchema>;

export const ShotTakeSchema = z.object({
  id: Id,
  shotId: Id,
  branchId: Id,
  kind: ShotTakeKindSchema,
  artifactId: Id.nullable(),
  runId: Id.nullable(),
  provider: z.string(),
  modelId: z.string(),
  costMicros: z.string().nullable(),
  status: ShotTakeStatusSchema,
  createdAt: IsoDate,
});
export type ShotTake = z.infer<typeof ShotTakeSchema>;

export const ShotSchema = z.object({
  id: Id,
  sceneId: Id,
  stableShotCode: z.string().min(1).max(80),
  orderIndex: z.number().int().nonnegative(),
  intent: z.string().max(2_000),
  cameraLens: z.string().max(120),
  framing: z.string().max(120),
  durationSec: z.number().positive().max(120),
  dialogueText: z.string(),
  dialogueVersion: z.number().int().positive(),
  characterRefIds: z.array(Id),
  approvedVisualTakeId: Id.nullable(),
  approvedAudioTakeId: Id.nullable(),
  staleFlags: z.record(z.string(), z.boolean()),
  takes: z.array(ShotTakeSchema).optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Shot = z.infer<typeof ShotSchema>;

export const EditorHandoffManifestSchema = z.object({
  formatVersion: z.literal("1.0"),
  projectId: Id,
  episodeId: Id,
  title: z.string(),
  aspectRatio: EpisodeAspectRatioSchema,
  files: z.array(
    z.object({
      relativePath: z.string(),
      artifactId: Id.nullable(),
      role: z.enum(["script", "project_brief", "shot_list", "manifest", "media"]),
    }),
  ),
  shots: z.array(
    z.object({
      stableShotCode: z.string(),
      sceneNumber: z.number().int().positive(),
      orderIndex: z.number().int().nonnegative(),
      durationSec: z.number().positive(),
      approvedVisualMediaPath: z.string().nullable(),
      approvedAudioMediaPath: z.string().nullable(),
    }),
  ),
});
export type EditorHandoffManifest = z.infer<typeof EditorHandoffManifestSchema>;
