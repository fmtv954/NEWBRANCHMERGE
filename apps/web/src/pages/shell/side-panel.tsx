import { Trans, useLingui } from "@lingui/react/macro";
import type {
  Bot,
  CharacterRef,
  ContextPreview,
  Episode,
  Group,
  Scene,
  Shot,
  ThreadSnapshot,
} from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { X } from "lucide-react";
import { type ComponentProps, type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from "react";
import { ContextInspectorSheet } from "../../components/branching/ContextInspectorSheet";
import { MicrodramaStudioShell } from "../../components/microdrama/MicrodramaStudioShell";
import { PagesList } from "../../components/pages/PagesList";
import type { createSpaceRpc } from "../../lib/query/rpc";
import { RoutineEditor } from "../routines/RoutineEditor";
import type { RoutineList } from "../routines/RoutineList";
import { CreateGroupForm, GroupSettings } from "../space/GroupPanel";
import { BotSettings } from "./bots/bot-panel";
import { ResizableSidePanel } from "./resizable-side-panel";
import type { Panel } from "./right-panel-state";
import { firstThreadRoute } from "./use-shell-navigation";

/** The panel beside the chat: a bot, a routine, a group, or an import. */
export function ShellSidePanel({
  rpc,
  panel,
  setPanel,
  active,
  activeGroup,
  bots,
  groups,
  setBots,
  setGroups,
  navigate,
  refreshBots,
  refreshGroupThread,
  computerOpen,
  computerPanel,
  routineList,
  routineEditorProps,
  openBot,
  modelFocusRequest,
  onClearBot,
  discardChatAttachments,
  activeProjectId,
  activeBranchId,
  activeBranchInstructions,
  isBranch,
  onPinCharacterToContext,
  onPromoteInstructionsToMain,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  active: Bot | undefined;
  activeGroup: Group | undefined;
  bots: Bot[];
  groups: Group[];
  setBots: Dispatch<SetStateAction<Bot[]>>;
  setGroups: Dispatch<SetStateAction<Group[]>>;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  refreshBots: (includeArchived?: boolean) => Promise<void>;
  refreshGroupThread: (groupId: string) => Promise<ThreadSnapshot>;
  computerOpen: boolean;
  computerPanel: ReactNode;
  routineList: Omit<ComponentProps<typeof RoutineList>, "preview">;
  routineEditorProps: ComponentProps<typeof RoutineEditor> | null;
  openBot: (botId: string) => void;
  modelFocusRequest: number;
  onClearBot: (bot: Bot) => void;
  /** Drops a deleted chat's pending attachments with their previews. */
  discardChatAttachments: (threadKey: string) => void;
  activeProjectId?: string | null;
  activeBranchId?: string | null;
  activeBranchInstructions?: string | null;
  isBranch?: boolean;
  onPinCharacterToContext?: (char: CharacterRef) => void;
  onPromoteInstructionsToMain?: () => void;
}) {
  const { t } = useLingui();
  const open = Boolean(
    panel &&
      (active ||
        activeGroup ||
        panel === "microdrama-studio" ||
        panel === "context-inspector"),
  );
  const botView = panel === "routines" || panel === "pages" || panel === "settings" ? panel : null;

  async function createGroup(input: { name: string; botIds: string[] }) {
    const group = await rpc.groups.create(input);
    setGroups((current) =>
      current.some((item) => item.id === group.id) ? current : [group, ...current],
    );
    navigate(`/app/g/${group.id}`);
    setPanel(null);
    await refreshBots().catch(() => undefined);
  }

  return (
    <ResizableSidePanel open={open} panel={panel ?? "closed"}>
      {open ? (
        <div className="rk-scroll h-full w-full overflow-y-auto px-5 py-[17px]">
          {!(botView && active) &&
          panel !== "routine" &&
          panel !== "create-group" &&
          panel !== "group-settings" ? (
            <div className="mb-4 flex items-center justify-between">
              {!active && panel !== "settings" ? (
                <span className="text-body text-muted-foreground">
                  <Trans>Group</Trans>
                </span>
              ) : null}
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Close panel`}
                  onClick={() => setPanel(null)}
                >
                  <X size={16} strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          ) : null}
          {panel === "create-group" ? (
            <CreateGroupForm
              bots={bots}
              onCancel={() => setPanel(null)}
              onCreate={(input) => createGroup(input)}
              onOpenBot={(botId) => {
                setPanel(null);
                openBot(botId);
              }}
            />
          ) : null}
          {panel === "group-settings" && activeGroup ? (
            <GroupSettings
              key={activeGroup.id}
              group={activeGroup}
              bots={bots}
              pages={<PagesList groupId={activeGroup.id} />}
              onSave={async (input) => {
                const updated = await rpc.groups.update({ groupId: activeGroup.id, ...input });
                setGroups((current) =>
                  current.map((group) => (group.id === updated.id ? updated : group)),
                );
                void Promise.all([refreshBots(), refreshGroupThread(activeGroup.id)]).catch(
                  () => undefined,
                );
              }}
              onRemove={async () => {
                await rpc.groups.remove({ groupId: activeGroup.id });
                discardChatAttachments(activeGroup.id);
                const remainingGroups = groups.filter((group) => group.id !== activeGroup.id);
                setGroups(remainingGroups);
                setPanel(null);
                navigate(firstThreadRoute(bots, remainingGroups), { replace: true });
                await refreshBots().catch(() => undefined);
              }}
              onClose={() => setPanel(null)}
              onOpenBot={openBot}
              covered={computerOpen}
            />
          ) : null}
          {botView && active ? (
            <BotSettings
              key={active.id}
              bot={active}
              view={botView}
              onViewChange={setPanel}
              onClose={() => setPanel(null)}
              computer={computerPanel}
              routines={routineList}
              focusModel={modelFocusRequest}
              onSave={async ({ computerMode, ...patch }) => {
                if (computerMode !== undefined && computerMode !== active.computerMode) {
                  await rpc.bots.setComputer({
                    botId: active.id,
                    mode: computerMode,
                  });
                }
                const updated = await rpc.bots.update({ botId: active.id, ...patch });
                setBots((current) => current.map((bot) => (bot.id === updated.id ? updated : bot)));
                // Persistence succeeded; a failed navigation refresh must not undo the tool edit.
                await refreshBots().catch(() => undefined);
              }}
              onExport={async () => {
                const manifest = await rpc.export.bot({ botId: active.id });
                const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${active.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              onClear={() => onClearBot(active)}
            />
          ) : null}
          {panel === "routine" && routineEditorProps ? (
            <RoutineEditor {...routineEditorProps} />
          ) : null}
          {panel === "microdrama-studio" ? (
            <MicrodramaStudioPanel
              rpc={rpc}
              projectId={activeProjectId ?? null}
              onPinCharacterToContext={onPinCharacterToContext}
            />
          ) : null}
          {panel === "context-inspector" ? (
            <ContextInspectorPanel
              rpc={rpc}
              branchId={activeBranchId ?? null}
              branchInstructions={activeBranchInstructions}
              isBranch={Boolean(isBranch)}
              onPromoteInstructionsToMain={onPromoteInstructionsToMain}
            />
          ) : null}
        </div>
      ) : null}
    </ResizableSidePanel>
  );
}

function MicrodramaStudioPanel({
  rpc,
  projectId,
  onPinCharacterToContext,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId: string | null;
  onPinCharacterToContext?: (char: CharacterRef) => void;
}) {
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [characters, setCharacters] = useState<CharacterRef[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [approvedSpendMicros, setApprovedSpendMicros] = useState("0");

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      const episodes = await rpc.microdrama.episodes.list({ projectId }).catch(() => []);
      const firstEpisode = episodes[0];
      if (cancelled || !firstEpisode) return;
      const ws = await rpc.microdrama.episodes
        .getWorkspace({ episodeId: firstEpisode.id })
        .catch(() => null);
      if (cancelled || !ws) return;
      setEpisode(ws.episode);
      setCharacters(ws.characters);
      setScenes(ws.scenes);
      setShots(ws.shots);
      setApprovedSpendMicros(ws.approvedSpendMicros);
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc, projectId]);

  return (
    <MicrodramaStudioShell
      episode={episode}
      characters={characters}
      scenes={scenes}
      shots={shots}
      approvedSpendMicros={approvedSpendMicros}
      onCreateCharacter={async (input) => {
        if (!projectId) return;
        const created = await rpc.microdrama.cast.upsertCharacter({
          projectId,
          stableCode: input.stableCode,
          name: input.name,
          wardrobeNotes: input.wardrobeNotes,
        });
        setCharacters((prev) => [...prev.filter((c) => c.id !== created.id), created]);
      }}
      onPinCharacterToContext={(char) => onPinCharacterToContext?.(char)}
    />
  );
}

function ContextInspectorPanel({
  rpc,
  branchId,
  branchInstructions,
  isBranch,
  onPromoteInstructionsToMain,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  branchId: string | null;
  branchInstructions?: string | null;
  isBranch: boolean;
  onPromoteInstructionsToMain?: () => void;
}) {
  const [preview, setPreview] = useState<ContextPreview>({
    branchId: branchId ?? "main",
    requestedProvider: "openai",
    requestedModelId: "gpt-5.4",
    billingRoute: "hosted_credits",
    estimatedInputTokens: 0,
    contextWindow: 128_000,
    estimatedCostMicros: "0",
    includedMessageIds: [],
    includedPlacementIds: [],
    includedArtifactIds: [],
    omittedItems: [],
    warnings: [],
  });

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    void rpc.branches
      .previewContext({ branchId })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rpc, branchId]);

  return (
    <ContextInspectorSheet
      preview={preview}
      branchInstructions={branchInstructions}
      isBranch={isBranch}
      onPromoteInstructionsToMain={onPromoteInstructionsToMain}
    />
  );
}
