import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { PiAgentRuntime, resolveConnectedRunModel } from "@rakazo/adapters";
import type { Actor, ReplyGenerationSelection } from "@rakazo/contracts";
import { ClientError } from "@rakazo/core";
import { recordUsage } from "@rakazo/db";

export type ProjectCompletion = (
  actor: Actor,
  settings: ReplyGenerationSelection,
  context: {
    botId?: string | null;
    instructions: string;
    prompt: string;
    history: AgentRunRequest["history"];
  },
) => Promise<{ text: string; modelLabel: string }>;

export function createProjectCompletion(
  deps: Omit<Parameters<typeof resolveConnectedRunModel>[0], "runtime">,
): ProjectCompletion {
  const runtime = new PiAgentRuntime();
  return async (actor, settings, context) => {
    let model: AgentRunRequest["model"];
    try {
      model = await resolveConnectedRunModel(
        { ...deps, runtime },
        actor,
        settings.provider,
        settings.modelId,
        undefined,
        false,
        settings.thinkingLevel,
      );
    } catch {
      throw new ClientError(
        "BAD_REQUEST",
        "The selected model is unavailable. Check your model connection.",
      );
    }
    const operationId = crypto.randomUUID();
    const onUsage: NonNullable<AgentRunRequest["onUsage"]> = async (event) => {
      await recordUsage(deps.prisma, event, {
        spaceId: actor.spaceId,
        userId: actor.userId,
        botId: context.botId ?? undefined,
        operationId,
        operationKind: "answer",
      });
    };
    const signal = AbortSignal.timeout(120_000);
    const style =
      settings.responseStyle === "deep"
        ? "Give a detailed, well-structured response."
        : settings.responseStyle === "balanced"
          ? "Give a balanced, scannable response."
          : settings.responseStyle === "direct"
            ? "Answer directly."
            : "";
    for await (const event of runtime.run(
      {
        botId: context.botId ?? operationId,
        threadId: operationId,
        runId: operationId,
        model: {
          ...model,
          maxTokens: settings.maxTokens ?? model.maxTokens,
          temperature: settings.temperature,
        },
        prompt: context.prompt,
        instructions: [context.instructions, settings.personaPrompt, style]
          .filter(Boolean)
          .join("\n\n"),
        history: context.history,
        tools: [],
        allowSilentEmpty: true,
        usageOperationKind: "answer",
        onUsage,
      },
      { ...actor, botId: context.botId ?? operationId, operationId, traceId: operationId, signal },
    )) {
      if (event.type === "usage" && !event.accounted) await onUsage(event);
      if (event.type === "done" && event.text?.trim()) {
        return {
          text: event.text.trim(),
          modelLabel: `${settings.provider} · ${settings.modelId}`,
        };
      }
    }
    throw new ClientError(
      "SERVICE_UNAVAILABLE",
      "The selected model did not return a reply. Try again.",
    );
  };
}
