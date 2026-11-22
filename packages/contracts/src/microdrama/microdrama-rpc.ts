import { oc } from "@orpc/contract";
import * as z from "zod";
import { Id } from "../ids.js";
import {
  CharacterRefSchema,
  EditorHandoffManifestSchema,
  EpisodeAspectRatioSchema,
  EpisodeSchema,
  PropLocationRefSchema,
  SceneSchema,
  ShotSchema,
  ShotTakeKindSchema,
  ShotTakeSchema,
} from "./microdrama.js";

export const microdramaRpc = {
  microdrama: {
    episodes: {
      list: oc.input(z.object({ projectId: Id })).output(z.array(EpisodeSchema)),
      create: oc
        .input(
          z.object({
            projectId: Id,
            title: z.string().min(1).max(200),
            logline: z.string().max(2_000).optional(),
            aspectRatio: EpisodeAspectRatioSchema.default("9:16"),
            targetDurationSec: z.number().int().positive().max(3_600).default(90),
          }),
        )
        .output(EpisodeSchema),
      getWorkspace: oc.input(z.object({ episodeId: Id })).output(
        z.object({
          episode: EpisodeSchema,
          characters: z.array(CharacterRefSchema),
          propsAndLocations: z.array(PropLocationRefSchema),
          scenes: z.array(SceneSchema),
          shots: z.array(ShotSchema),
          approvedSpendMicros: z.string(),
          explorationSpendMicros: z.string(),
        }),
      ),
    },
    cast: {
      upsertCharacter: oc
        .input(
          z.object({
            id: Id.optional(),
            projectId: Id,
            stableCode: z.string().min(1).max(80),
            name: z.string().min(1).max(160),
            description: z.string().max(4_000).default(""),
            voiceProvider: z.string().nullable().optional(),
            voiceId: z.string().nullable().optional(),
            referenceArtifactIds: z.array(Id).default([]),
            wardrobeNotes: z.string().max(2_000).default(""),
          }),
        )
        .output(CharacterRefSchema),
      upsertPropOrLocation: oc
        .input(
          z.object({
            id: Id.optional(),
            projectId: Id,
            kind: z.enum(["prop", "location"]),
            stableCode: z.string().min(1).max(80),
            name: z.string().min(1).max(160),
            description: z.string().max(4_000).default(""),
            referenceArtifactIds: z.array(Id).default([]),
          }),
        )
        .output(PropLocationRefSchema),
    },
    shots: {
      createScene: oc
        .input(
          z.object({
            episodeId: Id,
            sceneNumber: z.number().int().positive(),
            slugline: z.string().min(1).max(240),
            summary: z.string().max(4_000).default(""),
            orderIndex: z.number().int().nonnegative(),
          }),
        )
        .output(SceneSchema),
      upsertShot: oc
        .input(
          z.object({
            id: Id.optional(),
            sceneId: Id,
            stableShotCode: z.string().min(1).max(80),
            orderIndex: z.number().int().nonnegative(),
            intent: z.string().max(2_000).default(""),
            cameraLens: z.string().max(120).default("35mm Prime"),
            framing: z.string().max(120).default("Medium"),
            durationSec: z.number().positive().max(120).default(4),
            dialogueText: z.string().default(""),
            characterRefIds: z.array(Id).default([]),
          }),
        )
        .output(ShotSchema),
    },
    // V2 Pipeline Stubs (implemented in Phases 10–13)
    pipeline: {
      runDirectorPass: oc
        .input(
          z.object({
            episodeId: Id,
            branchId: Id,
            scriptArtifactId: Id,
            modelProvider: z.string().optional(),
            modelId: z.string().optional(),
          }),
        )
        .output(
          z.object({
            jobId: Id,
            createdSceneCount: z.number().int(),
            createdShotCount: z.number().int(),
          }),
        ),
      generateShotTake: oc
        .input(
          z.object({
            shotId: Id,
            branchId: Id,
            kind: ShotTakeKindSchema,
            provider: z.string(),
            modelId: z.string(),
            compareProvider: z.string().optional(),
            compareModelId: z.string().optional(),
          }),
        )
        .output(z.object({ takes: z.array(ShotTakeSchema) })),
      runContinuityReview: oc.input(z.object({ episodeId: Id, branchId: Id })).output(
        z.object({
          flaggedShotIds: z.array(Id),
          summary: z.string(),
        }),
      ),
      exportEditorBundle: oc
        .input(z.object({ episodeId: Id, branchId: Id }))
        .output(EditorHandoffManifestSchema),
      importEditorBundle: oc
        .input(
          z.object({
            projectId: Id,
            targetBranchId: Id,
            manifest: EditorHandoffManifestSchema,
            scriptMarkdown: z.string().optional(),
            shotListMarkdown: z.string().optional(),
          }),
        )
        .output(z.object({ branchId: Id, updatedShotCount: z.number().int() })),
    },
  },
};
