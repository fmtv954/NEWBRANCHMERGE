import { ORPCError } from "@orpc/server";
import type {
  Actor,
  CharacterRef,
  Episode,
  PropLocationRef,
  Scene,
  Shot,
  ShotTake,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

function toIso(d: Date): string {
  return d.toISOString();
}

export function createMicrodramaService(prisma: PrismaClient) {
  async function requireProject(actor: Actor, projectId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, spaceId: actor.spaceId },
    });
    if (!project) throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    return project;
  }

  return {
    async listEpisodes(actor: Actor, projectId: string): Promise<Episode[]> {
      await requireProject(actor, projectId);
      const rows = await prisma.episode.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        title: r.title,
        logline: r.logline,
        scriptArtifactId: r.scriptArtifactId,
        aspectRatio: r.aspectRatio as Episode["aspectRatio"],
        targetDurationSec: r.targetDurationSec,
        status: r.status as Episode["status"],
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      }));
    },

    async createEpisode(
      actor: Actor,
      input: {
        projectId: string;
        title: string;
        logline?: string;
        aspectRatio: Episode["aspectRatio"];
        targetDurationSec: number;
      },
    ): Promise<Episode> {
      await requireProject(actor, input.projectId);
      const r = await prisma.episode.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          logline: input.logline ?? "",
          aspectRatio: input.aspectRatio,
          targetDurationSec: input.targetDurationSec,
        },
      });
      return {
        id: r.id,
        projectId: r.projectId,
        title: r.title,
        logline: r.logline,
        scriptArtifactId: r.scriptArtifactId,
        aspectRatio: r.aspectRatio as Episode["aspectRatio"],
        targetDurationSec: r.targetDurationSec,
        status: r.status as Episode["status"],
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      };
    },

    async getWorkspace(actor: Actor, episodeId: string) {
      const episode = await prisma.episode.findUnique({
        where: { id: episodeId },
        include: { project: true },
      });
      if (!episode || episode.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Episode not found" });
      }

      const [chars, props, scenes] = await Promise.all([
        prisma.characterRef.findMany({
          where: { projectId: episode.projectId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.propLocationRef.findMany({
          where: { projectId: episode.projectId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.scene.findMany({
          where: { episodeId: episode.id },
          orderBy: { orderIndex: "asc" },
          include: {
            shots: {
              orderBy: { orderIndex: "asc" },
              include: { takes: { orderBy: { createdAt: "desc" } } },
            },
          },
        }),
      ]);

      const characters: CharacterRef[] = chars.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        stableCode: c.stableCode,
        name: c.name,
        description: c.description,
        voiceProvider: c.voiceProvider,
        voiceId: c.voiceId,
        referenceArtifactIds: Array.isArray(c.referenceArtifactIdsJson)
          ? (c.referenceArtifactIdsJson as string[])
          : [],
        wardrobeNotes: c.wardrobeNotes,
        createdAt: toIso(c.createdAt),
        updatedAt: toIso(c.updatedAt),
      }));

      const propsAndLocations: PropLocationRef[] = props.map((p) => ({
        id: p.id,
        projectId: p.projectId,
        kind: p.kind === "location" ? "location" : "prop",
        stableCode: p.stableCode,
        name: p.name,
        description: p.description,
        referenceArtifactIds: Array.isArray(p.referenceArtifactIdsJson)
          ? (p.referenceArtifactIdsJson as string[])
          : [],
        createdAt: toIso(p.createdAt),
        updatedAt: toIso(p.updatedAt),
      }));

      const mappedScenes: Scene[] = scenes.map((s) => ({
        id: s.id,
        episodeId: s.episodeId,
        sceneNumber: s.sceneNumber,
        slugline: s.slugline,
        summary: s.summary,
        orderIndex: s.orderIndex,
        createdAt: toIso(s.createdAt),
        updatedAt: toIso(s.updatedAt),
      }));

      let approvedSpend = 0n;
      let explorationSpend = 0n;
      const mappedShots: Shot[] = [];
      for (const s of scenes) {
        for (const sh of s.shots) {
          const takes: ShotTake[] = sh.takes.map((t) => {
            const c = t.costMicros ?? 0n;
            explorationSpend += c;
            if (t.status === "approved") approvedSpend += c;
            return {
              id: t.id,
              shotId: t.shotId,
              branchId: t.branchId,
              kind: t.kind as ShotTake["kind"],
              artifactId: t.artifactId,
              runId: t.runId,
              provider: t.provider,
              modelId: t.modelId,
              costMicros: t.costMicros !== null ? t.costMicros.toString() : null,
              status: t.status as ShotTake["status"],
              createdAt: toIso(t.createdAt),
            };
          });
          mappedShots.push({
            id: sh.id,
            sceneId: sh.sceneId,
            stableShotCode: sh.stableShotCode,
            orderIndex: sh.orderIndex,
            intent: sh.intent,
            cameraLens: sh.cameraLens,
            framing: sh.framing,
            durationSec: sh.durationSec,
            dialogueText: sh.dialogueText,
            dialogueVersion: sh.dialogueVersion,
            characterRefIds: Array.isArray(sh.characterRefIdsJson)
              ? (sh.characterRefIdsJson as string[])
              : [],
            approvedVisualTakeId: sh.approvedVisualTakeId,
            approvedAudioTakeId: sh.approvedAudioTakeId,
            staleFlags: (sh.staleFlagsJson as Record<string, boolean>) ?? {},
            takes,
            createdAt: toIso(sh.createdAt),
            updatedAt: toIso(sh.updatedAt),
          });
        }
      }

      return {
        episode: {
          id: episode.id,
          projectId: episode.projectId,
          title: episode.title,
          logline: episode.logline,
          scriptArtifactId: episode.scriptArtifactId,
          aspectRatio: episode.aspectRatio as Episode["aspectRatio"],
          targetDurationSec: episode.targetDurationSec,
          status: episode.status as Episode["status"],
          createdAt: toIso(episode.createdAt),
          updatedAt: toIso(episode.updatedAt),
        },
        characters,
        propsAndLocations,
        scenes: mappedScenes,
        shots: mappedShots,
        approvedSpendMicros: approvedSpend.toString(),
        explorationSpendMicros: explorationSpend.toString(),
      };
    },

    async upsertCharacter(
      actor: Actor,
      input: {
        id?: string;
        projectId: string;
        stableCode: string;
        name: string;
        description: string;
        voiceProvider?: string | null;
        voiceId?: string | null;
        referenceArtifactIds: string[];
        wardrobeNotes: string;
      },
    ): Promise<CharacterRef> {
      await requireProject(actor, input.projectId);
      const r = await prisma.characterRef.upsert({
        where: {
          projectId_stableCode: { projectId: input.projectId, stableCode: input.stableCode },
        },
        create: {
          projectId: input.projectId,
          stableCode: input.stableCode,
          name: input.name,
          description: input.description,
          voiceProvider: input.voiceProvider ?? null,
          voiceId: input.voiceId ?? null,
          referenceArtifactIdsJson: input.referenceArtifactIds,
          wardrobeNotes: input.wardrobeNotes,
        },
        update: {
          name: input.name,
          description: input.description,
          voiceProvider: input.voiceProvider ?? null,
          voiceId: input.voiceId ?? null,
          referenceArtifactIdsJson: input.referenceArtifactIds,
          wardrobeNotes: input.wardrobeNotes,
        },
      });
      return {
        id: r.id,
        projectId: r.projectId,
        stableCode: r.stableCode,
        name: r.name,
        description: r.description,
        voiceProvider: r.voiceProvider,
        voiceId: r.voiceId,
        referenceArtifactIds: Array.isArray(r.referenceArtifactIdsJson)
          ? (r.referenceArtifactIdsJson as string[])
          : [],
        wardrobeNotes: r.wardrobeNotes,
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      };
    },

    async upsertPropOrLocation(
      actor: Actor,
      input: {
        id?: string;
        projectId: string;
        kind: "prop" | "location";
        stableCode: string;
        name: string;
        description: string;
        referenceArtifactIds: string[];
      },
    ): Promise<PropLocationRef> {
      await requireProject(actor, input.projectId);
      const r = await prisma.propLocationRef.upsert({
        where: {
          projectId_stableCode: { projectId: input.projectId, stableCode: input.stableCode },
        },
        create: {
          projectId: input.projectId,
          kind: input.kind,
          stableCode: input.stableCode,
          name: input.name,
          description: input.description,
          referenceArtifactIdsJson: input.referenceArtifactIds,
        },
        update: {
          kind: input.kind,
          name: input.name,
          description: input.description,
          referenceArtifactIdsJson: input.referenceArtifactIds,
        },
      });
      return {
        id: r.id,
        projectId: r.projectId,
        kind: r.kind === "location" ? "location" : "prop",
        stableCode: r.stableCode,
        name: r.name,
        description: r.description,
        referenceArtifactIds: Array.isArray(r.referenceArtifactIdsJson)
          ? (r.referenceArtifactIdsJson as string[])
          : [],
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      };
    },

    async createScene(
      actor: Actor,
      input: {
        episodeId: string;
        sceneNumber: number;
        slugline: string;
        summary: string;
        orderIndex: number;
      },
    ): Promise<Scene> {
      const ep = await prisma.episode.findUnique({
        where: { id: input.episodeId },
        include: { project: true },
      });
      if (!ep || ep.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Episode not found" });
      }
      const r = await prisma.scene.create({
        data: {
          episodeId: input.episodeId,
          sceneNumber: input.sceneNumber,
          slugline: input.slugline,
          summary: input.summary,
          orderIndex: input.orderIndex,
        },
      });
      return {
        id: r.id,
        episodeId: r.episodeId,
        sceneNumber: r.sceneNumber,
        slugline: r.slugline,
        summary: r.summary,
        orderIndex: r.orderIndex,
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      };
    },

    async upsertShot(
      actor: Actor,
      input: {
        id?: string;
        sceneId: string;
        stableShotCode: string;
        orderIndex: number;
        intent: string;
        cameraLens: string;
        framing: string;
        durationSec: number;
        dialogueText: string;
        characterRefIds: string[];
      },
    ): Promise<Shot> {
      const sc = await prisma.scene.findUnique({
        where: { id: input.sceneId },
        include: { episode: { include: { project: true } } },
      });
      if (!sc || sc.episode.project.spaceId !== actor.spaceId) {
        throw new ORPCError("NOT_FOUND", { message: "Scene not found" });
      }
      const r = await prisma.shot.upsert({
        where: {
          sceneId_stableShotCode: { sceneId: input.sceneId, stableShotCode: input.stableShotCode },
        },
        create: {
          sceneId: input.sceneId,
          stableShotCode: input.stableShotCode,
          orderIndex: input.orderIndex,
          intent: input.intent,
          cameraLens: input.cameraLens,
          framing: input.framing,
          durationSec: input.durationSec,
          dialogueText: input.dialogueText,
          characterRefIdsJson: input.characterRefIds,
        },
        update: {
          orderIndex: input.orderIndex,
          intent: input.intent,
          cameraLens: input.cameraLens,
          framing: input.framing,
          durationSec: input.durationSec,
          dialogueText: input.dialogueText,
          dialogueVersion: { increment: 1 },
          characterRefIdsJson: input.characterRefIds,
        },
      });
      return {
        id: r.id,
        sceneId: r.sceneId,
        stableShotCode: r.stableShotCode,
        orderIndex: r.orderIndex,
        intent: r.intent,
        cameraLens: r.cameraLens,
        framing: r.framing,
        durationSec: r.durationSec,
        dialogueText: r.dialogueText,
        dialogueVersion: r.dialogueVersion,
        characterRefIds: Array.isArray(r.characterRefIdsJson)
          ? (r.characterRefIdsJson as string[])
          : [],
        approvedVisualTakeId: r.approvedVisualTakeId,
        approvedAudioTakeId: r.approvedAudioTakeId,
        staleFlags: (r.staleFlagsJson as Record<string, boolean>) ?? {},
        createdAt: toIso(r.createdAt),
        updatedAt: toIso(r.updatedAt),
      };
    },
  };
}
