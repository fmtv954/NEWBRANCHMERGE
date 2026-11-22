import { oc } from "@orpc/contract";
import * as z from "zod";
import { A2uiSurfaceBlockSchema, A2uiUserActionInputSchema } from "./a2ui.js";

export const a2uiRpc = {
  a2ui: {
    dispatchAction: oc.input(A2uiUserActionInputSchema).output(
      z.object({
        accepted: z.boolean(),
        deduplicated: z.boolean().default(false),
        reason: z.string().optional(),
        surface: A2uiSurfaceBlockSchema.optional(),
      }),
    ),
  },
};
