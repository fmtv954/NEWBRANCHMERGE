import type { A2uiSurfaceBlock } from "@rakazo/contracts";

/**
 * Phase 6 Deep Research Plan builder: emits a declarative A2UI v0.9.1 surface
 * so users can edit sub-questions, toggle Web/X/Files sources, and start research.
 */
export function buildDeepResearchPlanSurface(input: {
  surfaceId: string;
  topic: string;
  steps: string[];
  sources: { web: boolean; x: boolean; projectFiles: boolean };
}): A2uiSurfaceBlock {
  return {
    kind: "a2ui_surface",
    protocolVersion: "0.9.1",
    surfaceId: input.surfaceId,
    catalogId: "clone.rakazo.v1",
    title: `Research Plan: ${input.topic}`,
    version: 1,
    components: [
      {
        id: "plan_callout",
        parentId: null,
        componentType: "Callout",
        props: {
          lead: "Editable Plan:",
          body: `${input.steps.length} research steps ready. Adjust sources or approve below.`,
        },
      },
      {
        id: "toggle_web",
        parentId: null,
        componentType: "Toggle",
        props: { label: "Include Web Search" },
        dataBinding: "/sources/web",
        actionId: "toggle_source_web",
      },
      {
        id: "toggle_x",
        parentId: null,
        componentType: "Toggle",
        props: { label: "Include X Search (Grok)" },
        dataBinding: "/sources/x",
        actionId: "toggle_source_x",
      },
      {
        id: "toggle_files",
        parentId: null,
        componentType: "Toggle",
        props: { label: "Include Pinned Project Files" },
        dataBinding: "/sources/projectFiles",
        actionId: "toggle_source_files",
      },
      {
        id: "btn_start",
        parentId: null,
        componentType: "Button",
        props: { label: "Approve & Run Deep Research", variant: "primary" },
        actionId: "start_deep_research",
      },
    ],
    dataModel: {
      topic: input.topic,
      steps: input.steps,
      sources: input.sources,
      approved: false,
    },
  };
}
