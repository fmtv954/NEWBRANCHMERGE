import * as z from "zod";
import { Id } from "../ids.js";

/**
 * Maps standard A2UI declarative component types onto Rakazo's existing 71 `@rakazo/page-kit`
 * and `@rakazo/ui-web` primitives so CLONE never rebuilds existing widgets.
 */
export const A2UI_CATALOG_COMPONENT_TYPES = [
  "Card",
  "Section",
  "Grid",
  "Text",
  "Callout",
  "Metrics",
  "Properties",
  "Status",
  "Rows",
  "Steps",
  "Checklist",
  "Table",
  "LineChart",
  "Bars",
  "Pie",
  "Diagram",
  "LinkCards",
  "ProductCard",
  "CardGrid",
  "CardCarousel",
  "Gallery",
  "Image",
  "Video",
  "Audio",
  "Button",
  "Select",
  "Input",
  "Toggle",
  "Checkbox",
  "ShotTakeCard",
  "ResearchPlanCard",
  "ModelCompareCard",
] as const;

export const A2uiComponentTypeSchema = z.enum(A2UI_CATALOG_COMPONENT_TYPES);
export type A2uiComponentType = z.infer<typeof A2uiComponentTypeSchema>;

export const A2uiComponentNodeSchema = z.object({
  id: z.string().min(1).max(120),
  parentId: z.string().min(1).max(120).nullable().optional(),
  componentType: A2uiComponentTypeSchema,
  props: z.record(z.string(), z.any()).default({}),
  /** JSON-pointer-like path into `dataModel`, e.g. `/plan/steps` or `/shot/dialogue`. */
  dataBinding: z.string().max(240).optional(),
  actionId: z.string().max(120).optional(),
});
export type A2uiComponentNode = z.infer<typeof A2uiComponentNodeSchema>;

export const A2uiCreateSurfaceSchema = z.object({
  op: z.literal("createSurface"),
  protocolVersion: z.literal("0.9.1").default("0.9.1"),
  surfaceId: Id,
  catalogId: z.string().min(1).default("clone.rakazo.v1"),
  title: z.string().max(200).optional(),
});

export const A2uiUpdateComponentsSchema = z.object({
  op: z.literal("updateComponents"),
  surfaceId: Id,
  components: z.array(A2uiComponentNodeSchema).max(200),
});

export const A2uiUpdateDataModelSchema = z.object({
  op: z.literal("updateDataModel"),
  surfaceId: Id,
  patch: z.record(z.string(), z.any()),
});

export const A2uiStreamEventSchema = z.discriminatedUnion("op", [
  A2uiCreateSurfaceSchema,
  A2uiUpdateComponentsSchema,
  A2uiUpdateDataModelSchema,
]);
export type A2uiStreamEvent = z.infer<typeof A2uiStreamEventSchema>;

export const A2uiUserActionInputSchema = z.object({
  projectId: Id,
  branchId: Id,
  messageId: Id,
  surfaceId: Id,
  componentId: z.string().min(1),
  actionId: z.string().min(1),
  payload: z.record(z.string(), z.any()).default({}),
  baseRevisionId: Id.nullable().optional(),
  actionNonce: z.string().min(1).max(200),
  wakeAgent: z.boolean().default(true),
  clientNonce: z.string().min(1).max(200),
});
export type A2uiUserActionInput = z.infer<typeof A2uiUserActionInputSchema>;

export const A2uiSurfaceBlockSchema = z.object({
  kind: z.literal("a2ui_surface"),
  protocolVersion: z.literal("0.9.1").default("0.9.1"),
  surfaceId: Id,
  catalogId: z.string().min(1).default("clone.rakazo.v1"),
  title: z.string().max(200).optional(),
  version: z.number().int().positive().default(1),
  components: z.array(A2uiComponentNodeSchema).max(200),
  dataModel: z.record(z.string(), z.any()).default({}),
});
export type A2uiSurfaceBlock = z.infer<typeof A2uiSurfaceBlockSchema>;
