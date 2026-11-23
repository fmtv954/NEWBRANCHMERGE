import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Branch, Group, NavLink, Project } from "@rakazo/contracts";
import { accountDisplay, inferAttachmentMimeType } from "@rakazo/core";
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Sidebar,
} from "@rakazo/ui-web";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileUp,
  Film,
  FolderInput,
  FolderKanban,
  GitBranch,
  MessageSquarePlus,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { ReactNode, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { PasskeyOffer } from "../../../components/account/PasskeyOffer";
import { useUsageHint } from "../../../components/billing/PlanUsage";
import { useBilling } from "../../../components/billing/SubscriptionGate";
import { CreateOrganizationDialog } from "../../../components/spaces/CreateOrganizationDialog";
import { InviteDialog } from "../../../components/spaces/InviteDialog";
import { useSignOut } from "../../../lib/auth/sign-out";
import { formatBillingDate } from "../../../lib/billing/billing";
import { readFileAsBase64 } from "../../../lib/composer/pending-attachments";
import type { BotsSidebarDensity } from "../../../lib/preferences/bots-sidebar-density-pref";
import { useQueryUserId } from "../../../lib/query/query";
import type { createSpaceRpc } from "../../../lib/query/rpc";
import { switchOrganization, useOrganizations } from "../../../lib/spaces/organizations";
import { ActivityList } from "../../space/ActivityList";
import { SpaceSearchResults } from "../../space/SpaceSearch";
import type { ChatMenuState } from "../chat/chat-context-menu";
import type { Panel } from "../right-panel-state";
import type { SettingsSection } from "../shell-overlay-url";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarHeader } from "./sidebar-header";
import type { SidebarSearch } from "./use-sidebar-search";

/** Focuses the search box once it renders, its text selected so typing replaces it. */
export function focusSidebarSearch() {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>('input[name="sidebar-search"]');
    input?.focus();
    input?.select();
  });
}

/**
 * Chromium keeps the top fade drawn when collapsing sections shrinks a scrolled list until it no
 * longer scrolls; replaying the fade's scroll-driven animations lets it settle at the top.
 */
function resetFadeWhenUnscrollable(event: UIEvent<HTMLDivElement>) {
  const list = event.currentTarget;
  if (list.scrollHeight > list.clientHeight) return;
  for (const animation of list.getAnimations()) {
    animation.cancel();
    animation.play();
  }
}

type User = { name?: string | null; email?: string; image?: string | null };

/** The bots sidebar: a drawer on phones, collapsible to icons elsewhere. */
export function ShellSidebar({
  isMobile,
  mobileOpen,
  setMobileOpen,
  density,
  collapsed,
  mini,
  setCollapsedPref,
  createMenuOpen,
  setCreateMenuOpen,
  search,
  bots,
  groups,
  collapsedSidebarSections,
  toggleSidebarSection,
  setPanel,
  navigate,
  setNewSpaceOpen,
  setCreateBotOpen,
  chatMenu,
  roster,
  archived,
  footerLogos,
  user,
  boardEnabled,
  navLinks,
  openSettings,
  openIntegrations,
  openSkills,
  openSpaceChat,
  rpc,
  activeProjectId,
  activeThreadId,
  onSelectProject,
  activeBranches,
  activeBranchId,
  onSelectBranch,
  studioOpen,
  onToggleStudio,
  onOpenKnowledge,
  onRefreshBots,
}: {
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  density: BotsSidebarDensity;
  collapsed: boolean;
  mini: boolean;
  setCollapsedPref: (collapsed: boolean) => void;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean) => void;
  search: SidebarSearch;
  bots: Bot[];
  groups: Group[];
  collapsedSidebarSections: ReadonlySet<string>;
  toggleSidebarSection: (key: string) => void;
  setPanel: (panel: Panel) => void;
  navigate: (path: string) => void;
  setNewSpaceOpen: (open: boolean) => void;
  setCreateBotOpen: (open: boolean) => void;
  chatMenu: ChatMenuState;
  roster: ReactNode;
  archived: ReactNode;
  footerLogos: Array<{ name: string; logo?: string | null }>;
  user: User | undefined;
  boardEnabled: boolean;
  navLinks: NavLink[];
  openSettings: (section: SettingsSection) => void;
  openIntegrations: () => void;
  openSkills: () => void;
  openSpaceChat: (spaceId: string, path: string) => void;
  rpc?: ReturnType<typeof createSpaceRpc>;
  activeProjectId?: string | null;
  activeThreadId?: string | null;
  onSelectProject?: (project: Project) => void;
  activeBranches?: readonly Branch[];
  activeBranchId?: string | null;
  onSelectBranch?: (branchId: string) => void;
  studioOpen?: boolean;
  onToggleStudio?: () => void;
  onOpenKnowledge?: () => void;
  onRefreshBots?: () => Promise<void> | void;
}) {
  const { t } = useLingui();
  const {
    query,
    setQuery,
    searchOpen,
    setSearchOpen,
    searchHits,
    searchLoading,
    searchError,
    retrySearch,
    showSpaceSearch,
    jumpToSearchHit,
    activityMode,
    toggleActivityMode,
    activityFilters,
    setActivityFilters,
    activityFiltersExpanded,
    setActivityFiltersExpanded,
    activityFiltersId,
    activityFilterCount,
  } = search;
  return (
    <>
      <button
        type="button"
        aria-label={t`Close navigation`}
        aria-hidden={mobileOpen ? undefined : true}
        inert={mobileOpen ? undefined : true}
        tabIndex={mobileOpen ? undefined : -1}
        onClick={() => setMobileOpen(false)}
        className={`absolute inset-y-0 end-0 start-[min(calc(100%-48px),316px)] z-30 bg-overlay transition-opacity duration-150 ease-out motion-reduce:transition-none md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <Sidebar
        collapsible={isMobile ? "none" : "icon"}
        side={document.documentElement.dir === "rtl" ? "right" : "left"}
        data-testid="bots-sidebar"
        data-space-switch="sidebar"
        inert={isMobile && !mobileOpen ? true : undefined}
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
        data-bots-sidebar-density={density}
        data-collapsed={collapsed ? "true" : "false"}
        className={
          isMobile
            ? `absolute inset-y-0 start-0 z-40 flex w-[calc(100%-48px)] max-w-[316px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar transition-transform duration-200 ease-out motion-reduce:transition-none ${mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}`
            : "h-full overflow-hidden border-sidebar-border"
        }
      >
        <SidebarHeader
          mini={mini}
          createMenuOpen={createMenuOpen}
          setCreateMenuOpen={setCreateMenuOpen}
          activityMode={activityMode}
          toggleActivityMode={toggleActivityMode}
          searchOpen={searchOpen}
          onSearch={() => {
            if (searchOpen) {
              if (activityMode) setActivityFilters({ ...activityFilters, query: "" });
              else setQuery("");
              setSearchOpen(false);
              return;
            }
            setSearchOpen(true);
            focusSidebarSearch();
          }}
          setBotsSidebarCollapsedPref={setCollapsedPref}
          bots={bots}
          setMobileSidebarOpen={setMobileOpen}
          setPanel={setPanel}
          navigate={navigate}
          setNewSpaceOpen={setNewSpaceOpen}
          setCreateBotOpen={setCreateBotOpen}
        />
        {mini ||
        !(
          searchOpen ||
          query ||
          (activityMode && (activityFilterCount > 0 || activityFiltersExpanded))
        ) ? null : (
          <InputGroup
            data-testid="sidebar-search"
            className="mx-2.5 mb-3 w-auto rounded-xl bg-card dark:bg-input border border-border text-muted-foreground focus-within:border-ring"
          >
            <InputGroupAddon>
              <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={activityMode ? activityFilters.query : query}
              onChange={(e) => {
                if (activityMode) setActivityFilters({ ...activityFilters, query: e.target.value });
                else setQuery(e.target.value);
              }}
              onKeyDown={(event) => {
                if (
                  event.key !== "Escape" ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229
                )
                  return;
                if (activityMode) setActivityFilters({ ...activityFilters, query: "" });
                else setQuery("");
                setSearchOpen(false);
              }}
              placeholder={activityMode ? t`Search runs` : t`Search`}
              aria-label={activityMode ? t`Search runs` : t`Search`}
              autoComplete="off"
              name="sidebar-search"
            />
            {activityMode ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  aria-label={t`Filters`}
                  aria-expanded={activityFiltersExpanded}
                  aria-controls={activityFiltersId}
                  onClick={() => setActivityFiltersExpanded((expanded) => !expanded)}
                  className="relative rounded-lg"
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  {activityFilterCount > 0 ? (
                    <span
                      data-testid="activity-filter-indicator"
                      aria-hidden="true"
                      className="absolute end-1 top-1 size-1.5 rounded-full bg-primary"
                    />
                  ) : null}
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        )}
        <div
          onScroll={resetFadeWhenUnscrollable}
          className="rk-scroll scroll-fade-y scroll-fade-12 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2.5"
        >
          {showSpaceSearch && !mini ? (
            <SpaceSearchResults
              hits={searchHits}
              loading={searchLoading}
              error={searchError}
              onRetry={retrySearch}
              onSelect={(hit) => jumpToSearchHit(hit)}
              chatMenu={chatMenu}
            />
          ) : activityMode && !mini ? (
            <ActivityList
              bots={bots}
              groups={groups}
              toggledSections={collapsedSidebarSections}
              onToggleSection={toggleSidebarSection}
              onOpenBot={(bot) => {
                setMobileOpen(false);
                navigate(`/app/${bot.id}`);
              }}
              onOpenGroup={(group) => {
                setMobileOpen(false);
                navigate(`/app/g/${group.id}`);
              }}
              filters={activityFilters}
              onFiltersChange={setActivityFilters}
              filtersExpanded={activityFiltersExpanded}
              filtersId={activityFiltersId}
              onOpenRun={(run) => {
                setMobileOpen(false);
                if (run.groupId) navigate(`/app/g/${run.groupId}`);
                else navigate(`/app/${run.botId}`);
              }}
            />
          ) : (
            <>
              {rpc && !mini ? (
                <ProjectsAndChatsShelf
                  rpc={rpc}
                  bots={bots}
                  activeProjectId={activeProjectId ?? null}
                  activeThreadId={activeThreadId ?? null}
                  collapsedSections={collapsedSidebarSections}
                  onToggleSection={toggleSidebarSection}
                  onSelectProject={(project) => {
                    onSelectProject?.(project);
                    if (project.mode === "microdrama") {
                      setPanel("microdrama-studio");
                    }
                    setMobileOpen(false);
                  }}
                  onOpenChat={(botId) => {
                    setMobileOpen(false);
                    navigate(`/app/${botId}`);
                  }}
                  onRefreshBots={onRefreshBots}
                />
              ) : null}
              {roster}
              {!mini &&
              activeBranches &&
              activeBranches.filter((b) => !b.isMain && !b.archivedAt).length > 0 &&
              onSelectBranch ? (
                <div className="mt-2 px-1">
                  <button
                    type="button"
                    onClick={() => toggleSidebarSection("clone-active-branches")}
                    className="flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    {collapsedSidebarSections.has("clone-active-branches") ? (
                      <ChevronRight className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                    <span>Chat Branches</span>
                    <span className="ml-auto text-[10px]">
                      {activeBranches.filter((b) => !b.isMain && !b.archivedAt).length}
                    </span>
                  </button>
                  {!collapsedSidebarSections.has("clone-active-branches") ? (
                    <div className="space-y-0.5 pl-1">
                      {activeBranches
                        .filter((b) => !b.isMain && !b.archivedAt)
                        .map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              onSelectBranch(b.id);
                              setMobileOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                              activeBranchId === b.id
                                ? "bg-success/15 text-success"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                            }`}
                          >
                            <GitBranch className="size-3.5 shrink-0 text-success" />
                            <span className="truncate">{b.name}</span>
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        {/* One height limit for every shelf, so open shelves never squeeze out the chat list. */}
        <div
          className={
            mini || activityMode
              ? "hidden"
              : "rk-scroll flex max-h-[40vh] shrink-0 flex-col overflow-y-auto px-2.5 pb-1"
          }
        >
          {archived}
        </div>
        <div className="space-y-1 px-2.5 pb-1.5">
          {onOpenKnowledge ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Knowledge Base"
              onClick={() => {
                onOpenKnowledge();
                setMobileOpen(false);
              }}
              className={`h-8 w-full justify-start gap-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground ${
                mini ? "justify-center px-0" : "px-2.5"
              }`}
            >
              <BookOpen className="size-3.5 shrink-0" />
              {!mini ? <span className="truncate">Knowledge Base</span> : null}
            </Button>
          ) : null}
          {onToggleStudio ? (
            <Button
              type="button"
              variant={studioOpen ? "default" : "outline"}
              size="sm"
              aria-label="Microdrama Studio"
              aria-pressed={Boolean(studioOpen)}
              onClick={() => {
                onToggleStudio();
                setMobileOpen(false);
              }}
              className={`h-8 w-full justify-start gap-2 rounded-xl text-xs font-medium ${
                mini ? "justify-center px-0" : "px-2.5"
              }`}
            >
              <Film className="size-3.5 shrink-0" />
              {!mini ? <span className="truncate">Microdrama Studio</span> : null}
            </Button>
          ) : null}
        </div>
        <div className={mini ? "hidden" : "contents"}>
          <PasskeyOffer />
        </div>
        <ShellSidebarFooter
          mini={mini}
          logos={footerLogos}
          user={user}
          boardEnabled={boardEnabled}
          navLinks={navLinks}
          closeMobileSidebar={() => setMobileOpen(false)}
          navigate={navigate}
          openSettings={openSettings}
          openIntegrations={openIntegrations}
          openSkills={openSkills}
          openSpaceChat={openSpaceChat}
        />
      </Sidebar>
    </>
  );
}

function ShellSidebarFooter({
  mini,
  logos,
  user,
  boardEnabled,
  navLinks,
  closeMobileSidebar,
  navigate,
  openSettings,
  openIntegrations,
  openSkills,
  openSpaceChat,
  rpc,
  activeProjectId,
  activeThreadId,
  onSelectProject,
  activeBranches,
  activeBranchId,
  onSelectBranch,
  studioOpen,
  onToggleStudio,
  onOpenKnowledge,
  onRefreshBots,
}: {
  mini: boolean;
  logos: Array<{ name: string; logo?: string | null }>;
  user: User | undefined;
  boardEnabled: boolean;
  navLinks: NavLink[];
  closeMobileSidebar: () => void;
  navigate: (path: string) => void;
  openSettings: (section: SettingsSection) => void;
  openIntegrations: () => void;
  openSkills: () => void;
  openSpaceChat: (spaceId: string, path: string) => void;
  rpc?: ReturnType<typeof createSpaceRpc>;
  activeProjectId?: string | null;
  activeThreadId?: string | null;
  onSelectProject?: (project: Project) => void;
  activeBranches?: readonly Branch[];
  activeBranchId?: string | null;
  onSelectBranch?: (branchId: string) => void;
  studioOpen?: boolean;
  onToggleStudio?: () => void;
  onOpenKnowledge?: () => void;
  onRefreshBots?: () => Promise<void> | void;
}) {
  const { t, i18n } = useLingui();
  const userId = useQueryUserId();
  const { organizations, activeOrganizationId } = useOrganizations();
  const { status: billing, showPlans } = useBilling();
  const freeUntil =
    billing?.funding === "byok" &&
    billing.byokFreeUntil &&
    new Date(billing.byokFreeUntil) > new Date()
      ? billing.byokFreeUntil
      : null;
  const usage = useUsageHint();
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const referral = billing?.referral;
  const [logOutError, setLogOutError] = useState<string | null>(null);
  const { signingOut, logOut } = useSignOut("/sign-in", (message) => {
    // A failed sign-out reloads the page: reopen the menu so its error shows.
    setMenuOpen(true);
    setLogOutError(message);
  });
  const { label: userName, initial: initials } = accountDisplay(user ?? {}, t`You`);
  const day = freeUntil ? formatBillingDate(freeUntil, i18n.locale || "en") : "";
  return (
    <>
      {freeUntil && !mini ? (
        <div className="mx-2.5 flex items-center justify-between gap-2 ps-2.5 text-body text-muted-foreground">
          <span className="min-w-0 truncate">
            <Trans>Free plan ends {day}</Trans>
          </span>
          {billing?.canManage ? (
            <Button variant="outline" size="sm" onClick={showPlans}>
              <Trans>Upgrade</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      <SidebarFooter
        mini={mini}
        logos={logos}
        name={userName}
        initials={initials}
        image={user?.image}
        email={user?.email}
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) setLogOutError(null);
        }}
        onIntegrations={() => {
          setMenuOpen(false);
          openIntegrations();
        }}
        onSkills={() => {
          setMenuOpen(false);
          openSkills();
        }}
        onBoard={
          boardEnabled
            ? () => {
                setMenuOpen(false);
                closeMobileSidebar();
                navigate("/app/board");
              }
            : undefined
        }
        links={navLinks}
        onLink={(link) => {
          setMenuOpen(false);
          closeMobileSidebar();
          navigate(`/app/x/${link.id}`);
        }}
        onArtifacts={() => {
          setMenuOpen(false);
          closeMobileSidebar();
          navigate("/app/artifacts");
        }}
        onSettings={() => {
          setMenuOpen(false);
          openSettings("general");
        }}
        usage={usage}
        onUsage={() => {
          setMenuOpen(false);
          openSettings("usage");
        }}
        onInvite={
          referral
            ? () => {
                setMenuOpen(false);
                setInviteOpen(true);
              }
            : undefined
        }
        onLogOut={() => {
          setLogOutError(null);
          void logOut();
        }}
        signingOut={signingOut}
        logOutError={logOutError}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        onSwitchOrganization={(organization) => {
          setMenuOpen(false);
          if (organization.id !== activeOrganizationId)
            void switchOrganization(userId, organization, openSpaceChat);
        }}
        onCreateOrganization={() => {
          setMenuOpen(false);
          setCreatingOrganization(true);
        }}
      />
      <CreateOrganizationDialog
        open={creatingOrganization}
        onOpenChange={setCreatingOrganization}
        openSpaceChat={openSpaceChat}
      />
      {referral ? (
        <InviteDialog referral={referral} open={inviteOpen} onOpenChange={setInviteOpen} />
      ) : null}
    </>
  );
}

function ProjectsAndChatsShelf({
  rpc,
  bots,
  activeProjectId,
  activeThreadId,
  collapsedSections,
  onToggleSection,
  onSelectProject,
  onOpenChat,
  onRefreshBots,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  bots: Bot[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  collapsedSections: ReadonlySet<string>;
  onToggleSection: (key: string) => void;
  onSelectProject: (project: Project) => void;
  onOpenChat: (botId: string) => void;
  onRefreshBots?: () => Promise<void> | void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [independentChats, setIndependentChats] = useState<
    Array<{ threadId: string; assistantBotId: string; title: string }>
  >([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectMode, setNewProjectMode] = useState<"general" | "microdrama">("general");
  const [busy, setBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc.projects
      .list({})
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const projectsCollapsed = collapsedSections.has("clone-projects");
  const chatsCollapsed = collapsedSections.has("clone-independent-chats");

  async function handleNewChat() {
    if (busy) return;
    setBusy(true);
    try {
      const created = await rpc.projects.createIndependentChat({});
      setIndependentChats((prev) => [
        {
          threadId: created.threadId,
          assistantBotId: created.assistantBotId,
          title: `Chat ${prev.length + 1}`,
        },
        ...prev,
      ]);
      await onRefreshBots?.();
      onOpenChat(created.assistantBotId);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartFromUpload(file: File) {
    if (busy) return;
    setBusy(true);
    try {
      const cleanName = file.name.replace(/\.[^.]+$/, "").slice(0, 48) || "Uploaded Document";
      const created = await rpc.projects.createIndependentChat({ title: cleanName });
      const mimeType =
        inferAttachmentMimeType(file.name, file.type) ?? (file.type || "application/octet-stream");
      const contentBase64 = await readFileAsBase64(file);
      const artifact = await rpc.artifacts.create({
        botId: created.assistantBotId,
        name: file.name,
        mimeType,
        contentBase64,
        clientNonce: `upload:${created.assistantBotId}:${crypto.randomUUID()}`,
      });
      setIndependentChats((prev) => [
        {
          threadId: created.threadId,
          assistantBotId: created.assistantBotId,
          title: cleanName,
        },
        ...prev,
      ]);
      await onRefreshBots?.();
      onOpenChat(created.assistantBotId);
      await rpc.threads.send({
        botId: created.assistantBotId,
        text: `I uploaded "${file.name}". Please review the attached file, summarize its key points, and suggest what we should explore next.`,
        artifactIds: [artifact.id],
        clientNonce: crypto.randomUUID(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteChat(botId: string) {
    try {
      await rpc.bots.remove({ botId, deleteMemories: true });
      setIndependentChats((prev) => prev.filter((c) => c.assistantBotId !== botId));
      await onRefreshBots?.();
    } catch {
      // ignore if already deleted
    }
  }

  async function handleCreateProject() {
    const title = newProjectTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const { project } = await rpc.projects.create({
        title,
        mode: newProjectMode,
        defaultBotId: bots[0]?.id,
      });
      setProjects((prev) => [project, ...prev]);
      setNewProjectTitle("");
      setCreatingProject(false);
      onSelectProject(project);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-2 space-y-1.5 border-b border-sidebar-border/60 pb-2">
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.ts,.tsx,.js,.py"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handleStartFromUpload(f);
        }}
      />
      <div className="grid grid-cols-2 gap-1.5 px-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void handleNewChat()}
          className="h-7 justify-start gap-1.5 px-2 text-xs"
        >
          <MessageSquarePlus className="size-3.5" />
          <span className="truncate">New Chat</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => uploadInputRef.current?.click()}
          className="h-7 justify-start gap-1.5 px-2 text-xs"
        >
          <FileUp className="size-3.5" />
          <span className="truncate">From Upload</span>
        </Button>
      </div>
      <div className="px-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setCreatingProject((open) => !open)}
          className="h-6 w-full justify-start gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          <span className="truncate">New Project</span>
        </Button>
      </div>

      {creatingProject ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-card/70 p-2">
          <Input
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            placeholder="Project title..."
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateProject();
            }}
          />
          <div className="flex items-center justify-between gap-1">
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={newProjectMode === "general" ? "default" : "ghost"}
                onClick={() => setNewProjectMode("general")}
                className="h-6 px-2 text-[11px]"
              >
                General
              </Button>
              <Button
                type="button"
                size="sm"
                variant={newProjectMode === "microdrama" ? "default" : "ghost"}
                onClick={() => setNewProjectMode("microdrama")}
                className="h-6 px-2 text-[11px]"
              >
                Microdrama
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!newProjectTitle.trim() || busy}
              onClick={() => void handleCreateProject()}
              className="h-6 px-2 text-[11px]"
            >
              Create
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => onToggleSection("clone-projects")}
          className="flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {projectsCollapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          <span>Projects</span>
          <span className="ml-auto text-[10px]">{projects.length}</span>
        </button>
        {!projectsCollapsed ? (
          <div className="space-y-0.5">
            {projects.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-muted-foreground">No projects yet</div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    activeProjectId === project.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectProject(project)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {project.mode === "microdrama" ? (
                      <Film className="size-3.5 shrink-0 text-success" />
                    ) : (
                      <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{project.title}</span>
                  </button>
                  {activeThreadId && activeProjectId !== project.id ? (
                    <button
                      type="button"
                      title={`Move current chat into ${project.title}`}
                      aria-label={`Move current chat into ${project.title}`}
                      onClick={() => {
                        void rpc.projects
                          .moveThreadToProject({
                            threadId: activeThreadId,
                            targetProjectId: project.id,
                          })
                          .then(() => onSelectProject(project))
                          .catch(() => undefined);
                      }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <FolderInput className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {independentChats.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => onToggleSection("clone-independent-chats")}
            className="flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {chatsCollapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            <span>Independent Chats</span>
            <span className="ml-auto text-[10px]">{independentChats.length}</span>
          </button>
          {!chatsCollapsed ? (
            <div className="space-y-0.5">
              {independentChats.map((chat) => (
                <div
                  key={chat.threadId}
                  className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50"
                >
                  <button
                    type="button"
                    onClick={() => onOpenChat(chat.assistantBotId)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MessageSquarePlus className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <button
                    type="button"
                    title="Delete chat"
                    aria-label={`Delete ${chat.title}`}
                    onClick={() => void handleDeleteChat(chat.assistantBotId)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
