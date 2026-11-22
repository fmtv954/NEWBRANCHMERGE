import { createProjectsService } from "../projects/projects-service.js";
import type { RouterContext } from "./context.js";

export function projectsRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  const service = createProjectsService(deps.prisma);

  return {
    projects: {
      list: authed.projects.list.handler(({ context, input }) =>
        service.listProjects(context.actor, input?.includeArchived ?? false),
      ),
      get: authed.projects.get.handler(({ context, input }) =>
        service.getProject(context.actor, input.projectId),
      ),
      create: authed.projects.create.handler(({ context, input }) =>
        service.createProject(context.actor, input),
      ),
      update: authed.projects.update.handler(({ context, input }) =>
        service.updateProject(context.actor, input),
      ),
      createIndependentChat: authed.projects.createIndependentChat.handler(({ context, input }) =>
        service.createIndependentChat(context.actor, input),
      ),
      ensureThreadGraph: authed.projects.ensureThreadGraph.handler(({ context, input }) =>
        service.ensureThreadGraph(context.actor, input),
      ),
      moveThreadToProject: authed.projects.moveThreadToProject.handler(({ context, input }) =>
        service.moveThreadToProject(context.actor, input),
      ),
      reorderMessageBlocks: authed.projects.reorderMessageBlocks.handler(({ context, input }) =>
        service.reorderMessageBlocks(context.actor, input),
      ),
    },
    branches: {
      list: authed.branches.list.handler(({ context, input }) =>
        service.listBranches(context.actor, input.projectId, input.includeArchived ?? false),
      ),
      create: authed.branches.create.handler(({ context, input }) =>
        service.createBranch(context.actor, input),
      ),
      switch: authed.branches.switch.handler(({ context, input }) =>
        service.switchBranch(context.actor, input.projectId, input.branchId),
      ),
      previewContext: authed.branches.previewContext.handler(({ context, input }) =>
        service.previewContext(context.actor, input),
      ),
      runManifest: authed.branches.runManifest.handler(({ context, input }) =>
        service.getRunManifest(context.actor, input.runId),
      ),
      compareModels: authed.branches.compareModels.handler(({ context, input }) =>
        service.compareModels(context.actor, input),
      ),
      messages: authed.branches.messages.handler(({ context, input }) =>
        service.listBranchMessages(context.actor, input.branchId),
      ),
      send: authed.branches.send.handler(({ context, input }) =>
        service.sendBranchMessage(context.actor, input),
      ),
      rename: authed.branches.rename.handler(({ context, input }) =>
        service.renameBranch(context.actor, input),
      ),
      archive: authed.branches.archive.handler(({ context, input }) =>
        service.archiveBranch(context.actor, input),
      ),
    },
    placements: {
      list: authed.placements.list.handler(({ context, input }) =>
        service.listPlacements(context.actor, input.branchId),
      ),
      keepInMain: authed.placements.keepInMain.handler(({ context, input }) =>
        service.keepInMain(context.actor, input),
      ),
      move: authed.placements.move.handler(({ context, input }) =>
        service.movePlacement(context.actor, input),
      ),
      setContextFlags: authed.placements.setContextFlags.handler(({ context, input }) =>
        service.setPlacementContextFlags(context.actor, input),
      ),
      remove: authed.placements.remove.handler(({ context, input }) =>
        service.removePlacement(context.actor, input.placementId),
      ),
      reorder: authed.placements.reorder.handler(({ context, input }) =>
        service.reorderPlacements(context.actor, input),
      ),
    },
    merges: {
      preview: authed.merges.preview.handler(({ context, input }) =>
        service.previewMerge(context.actor, input),
      ),
      apply: authed.merges.apply.handler(({ context, input }) =>
        service.applyMerge(context.actor, input),
      ),
      undo: authed.merges.undo.handler(({ context, input }) =>
        service.undoMerge(context.actor, input),
      ),
      executeStrategy: authed.merges.executeStrategy.handler(({ context, input }) =>
        service.executeMergeStrategy(context.actor, input),
      ),
    },
  };
}
