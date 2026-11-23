import type { Bot, ModelPersona, ReplyGenerationSelection, ThinkingLevel } from "@rakazo/contracts";
import { CLONE_SYSTEM_PERSONAS } from "@rakazo/contracts";
import { credentialForModel, modelThinkingLevels } from "@rakazo/core";
import { Button, Dialog, DialogContent, DialogTitle, OptionSelect } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { thinkingLevelLabel } from "../../lib/models/model-catalog";
import { useUnifiedModels } from "../../lib/models/use-unified-models";
import { useSpaceQueries } from "../../lib/query/query";
import type { createSpaceRpc } from "../../lib/query/rpc";
import { PersonaPicker } from "./PersonaPicker";

const levels = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ThinkingLevel[];

export type RegenerateTarget = { branchId: string; messageId: string };
type RegeneratedReply = Awaited<
  ReturnType<ReturnType<typeof createSpaceRpc>["branches"]["regenerate"]>
>;

export function RegenerateReplyDialog({
  rpc,
  target,
  activeBot,
  fallback,
  persona: defaultPersona,
  onRegenerated,
  onClose,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  target: RegenerateTarget;
  activeBot?: Bot;
  fallback?: Partial<ReplyGenerationSelection>;
  persona?: ModelPersona;
  onRegenerated: (result: RegeneratedReply) => void | Promise<void>;
  onClose: () => void;
}) {
  const { allRows, defaultMainModelKey } = useUnifiedModels(activeBot);
  const queries = useSpaceQueries();
  const { data: catalog, isPending: modelsLoading } = useQuery(queries.models.list.queryOptions());
  const credentials = useQuery(queries.models.credentials.queryOptions()).data;
  const original = useQuery({
    queryKey: ["reply-regeneration-settings", target.branchId, target.messageId],
    queryFn: () => rpc.branches.regenerationDefaults(target),
  });
  const [modelKey, setModelKey] = useState<string>();
  const [thinking, setThinking] = useState<ThinkingLevel | "default">();
  const [persona, setPersona] = useState<ModelPersona>();
  const [request, setRequest] = useState<{ key: string; settings: ReplyGenerationSelection }>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const defaults = original.data ?? fallback;
  const originalKey =
    defaults?.provider && defaults.modelId ? `${defaults.provider}:${defaults.modelId}` : undefined;
  const models = allRows.filter(({ kind, status }) => kind === "text" && status !== "needs_key");
  const model =
    models.find(({ key }) => key === (modelKey ?? originalKey ?? defaultMainModelKey)) ??
    models.find(({ key }) => key === defaultMainModelKey) ??
    models[0];
  const capability = catalog?.find(
    ({ provider, id }) => provider === model?.provider && id === model?.modelId,
  );
  const credential = credentialForModel(credentials ?? [], model?.provider, model?.modelId);
  const efforts = modelThinkingLevels(credential, capability, model?.modelId);
  const supported = levels.filter((level) => efforts.includes(level));
  const preferred = thinking ?? defaults?.thinkingLevel ?? "default";
  const effort = supported.some((level) => level === preferred) ? preferred : "default";
  const personaId =
    persona?.id ??
    original.data?.personaId ??
    defaultPersona?.id ??
    fallback?.personaId ??
    "default";
  const personaPrompt =
    persona?.systemPrompt ??
    original.data?.personaPrompt ??
    defaultPersona?.systemPrompt ??
    fallback?.personaPrompt;

  async function regenerate() {
    if (!model || running) return;
    setRunning(true);
    setError(undefined);
    const submission = request ?? {
      key: crypto.randomUUID(),
      settings: {
        ...defaults,
        provider: model.provider,
        modelId: model.modelId,
        thinkingLevel: effort === "default" ? undefined : effort,
        personaId: personaId === "default" ? undefined : personaId,
        personaPrompt: personaPrompt || undefined,
      },
    };
    setRequest(submission);
    try {
      const result = await rpc.branches.regenerate({
        ...target,
        settings: submission.settings,
        idempotencyKey: submission.key,
      });
      if (!mounted.current) return;
      await onRegenerated(result);
      onClose();
    } catch (err) {
      if (mounted.current)
        setError(err instanceof Error ? err.message : "Could not regenerate this reply.");
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !running) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!running}>
        <DialogTitle>Regenerate reply</DialogTitle>
        <OptionSelect
          aria-label="Model"
          value={model?.key ?? null}
          disabled={running || original.isPending}
          options={models.map(({ key, displayName }) => ({ value: key, label: displayName }))}
          onValueChange={(key) => {
            setModelKey(key);
            setThinking("default");
            setRequest(undefined);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className={running ? "pointer-events-none opacity-60" : ""}>
            <PersonaPicker
              selectedPersonaId={personaId}
              onSelectPersona={(value) => {
                if (!running) {
                  setPersona(value ?? CLONE_SYSTEM_PERSONAS[0]);
                  setRequest(undefined);
                }
              }}
            />
          </div>
          {supported.length ? (
            <OptionSelect<ThinkingLevel | "default">
              aria-label="Thinking effort"
              size="sm"
              className="w-36"
              disabled={running}
              value={effort}
              options={[
                { value: "default", label: "Model default" },
                ...supported.map((level) => ({ value: level, label: thinkingLevelLabel(level) })),
              ]}
              onValueChange={(value) => {
                setThinking(value);
                setRequest(undefined);
              }}
            />
          ) : null}
        </div>
        {!modelsLoading && !model ? (
          <p className="text-sm text-muted-foreground">
            Connect a text model to regenerate replies.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          disabled={!model || running || original.isPending}
          onClick={() => void regenerate()}
        >
          {running ? "Regenerating…" : request ? "Retry regeneration" : "Regenerate"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
