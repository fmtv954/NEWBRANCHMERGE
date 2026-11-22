import { ORPCError } from "@orpc/server";
import { createMicrodramaService } from "../microdrama/microdrama-service.js";
import type { RouterContext } from "./context.js";

export function microdramaRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  const service = createMicrodramaService(deps.prisma);
  const v2Stub = () => {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "V2 Microdrama production pipeline activates in Phases 10–13.",
    });
  };

  return {
    microdrama: {
      episodes: {
        list: authed.microdrama.episodes.list.handler(({ context, input }) =>
          service.listEpisodes(context.actor, input.projectId),
        ),
        create: authed.microdrama.episodes.create.handler(({ context, input }) =>
          service.createEpisode(context.actor, input),
        ),
        getWorkspace: authed.microdrama.episodes.getWorkspace.handler(({ context, input }) =>
          service.getWorkspace(context.actor, input.episodeId),
        ),
      },
      cast: {
        upsertCharacter: authed.microdrama.cast.upsertCharacter.handler(({ context, input }) =>
          service.upsertCharacter(context.actor, input),
        ),
        upsertPropOrLocation: authed.microdrama.cast.upsertPropOrLocation.handler(
          ({ context, input }) => service.upsertPropOrLocation(context.actor, input),
        ),
      },
      shots: {
        createScene: authed.microdrama.shots.createScene.handler(({ context, input }) =>
          service.createScene(context.actor, input),
        ),
        upsertShot: authed.microdrama.shots.upsertShot.handler(({ context, input }) =>
          service.upsertShot(context.actor, input),
        ),
      },
      pipeline: {
        runDirectorPass: authed.microdrama.pipeline.runDirectorPass.handler(v2Stub),
        generateShotTake: authed.microdrama.pipeline.generateShotTake.handler(v2Stub),
        runContinuityReview: authed.microdrama.pipeline.runContinuityReview.handler(v2Stub),
        exportEditorBundle: authed.microdrama.pipeline.exportEditorBundle.handler(v2Stub),
        importEditorBundle: authed.microdrama.pipeline.importEditorBundle.handler(v2Stub),
      },
    },
  };
}
