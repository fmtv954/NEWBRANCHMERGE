import { Trans, useLingui } from "@lingui/react/macro";
import { MAX_MODEL_CONNECTION_LABEL } from "@rakazo/contracts";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  cn,
  Input,
  ListSearchInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionHeading,
} from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, KeyRound, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { ModelCredential } from "../../lib/models/model-auth";
import { useSave, useSpaceQueries } from "../../lib/query/query";
import { errorText } from "../../lib/query/user-error";
import { useListSearch } from "../../lib/use-list-search";
import type { ConnectableProvider } from "./role-model-picker";

/** Every connection the member has, with the way to add another, even for a connected provider. */
export function ProvidersSection({
  credentials,
  providers,
  name: nameOf,
  disabled,
  onAdd,
  onOpen,
  panel,
}: {
  credentials: ModelCredential[];
  /** Every provider that can be connected, connected ones included. */
  providers: ConnectableProvider[];
  /** A connection's name, such as "OpenAI" or "OpenAI (Work)". */
  name: (credential: ModelCredential) => string;
  disabled?: boolean;
  onAdd: (provider: ConnectableProvider) => void;
  /** Opens a connection's page. */
  onOpen: (credential: ModelCredential) => void;
  /** The form for a new connection, shown after the list. */
  panel?: ReactNode;
}) {
  return (
    <section className="mb-8" data-testid="model-providers">
      <SectionHeading className="mb-2.5">
        <Trans>Providers</Trans>
      </SectionHeading>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {[...credentials]
          // Saving a key reorders the account's connections; this list stays put.
          .sort((left, right) => nameOf(left).localeCompare(nameOf(right)))
          .map((credential) => (
            <li key={credential.id} data-testid={`model-provider-${credential.id}`}>
              <SettingsListRow
                disabled={disabled}
                onClick={() => onOpen(credential)}
                label={nameOf(credential)}
                labelTestId="provider-row-name"
              >
                {credential.reconnectRequired ? (
                  <span className="shrink-0 text-body-sm text-warning">
                    <Trans>Sign in again</Trans>
                  </span>
                ) : null}
              </SettingsListRow>
            </li>
          ))}
        <li>
          <AddProvider providers={providers} disabled={disabled} onPick={onAdd} />
        </li>
      </ul>
      {panel}
      <CloneQuickProviders providers={providers} disabled={disabled} onAdd={onAdd} />
    </section>
  );
}

function CloneQuickProviders({
  providers,
  disabled,
  onAdd,
}: {
  providers: ConnectableProvider[];
  disabled?: boolean;
  onAdd: (provider: ConnectableProvider) => void;
}) {
  const queries = useSpaceQueries();
  const statusList = useQuery(queries.media.providerStatus.queryOptions()).data;
  if (!statusList?.length) return null;

  function pickProvider(providerId: string) {
    const exact = providers.find((p) => p.id.toLowerCase() === providerId.toLowerCase());
    if (exact) {
      onAdd(exact);
      return;
    }
    const compat = providers.find((p) => p.id === "openai-compatible");
    if (compat) onAdd(compat);
  }

  return (
    <div className="mt-5" data-testid="clone-quick-providers">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-label font-medium text-muted-foreground">
          CLONE Provider Endpoints & Server Keys
        </span>
        <span className="text-[11px] text-muted-foreground">
          Click Connect to add or override a personal API key
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {statusList.map((item) => (
          <div
            key={item.provider}
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-body-sm font-medium text-foreground">
                  {item.label}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    item.hasEnvKey
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  {item.hasEnvKey ? "Server Key Active" : "Needs Key"}
                </span>
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {item.baseUrl}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => pickProvider(item.provider)}
              className="h-7 shrink-0 gap-1 px-2 text-xs"
            >
              <KeyRound className="size-3" />
              <span>{item.hasEnvKey ? "Override" : "Connect"}</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renames a connection: a button that opens its name field, saved on its own. */
export function ConnectionNameField({
  credential,
  disabled,
}: {
  credential: ModelCredential;
  /** Another save on the connection is in flight. */
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const queries = useSpaceQueries();
  const [name, setName] = useState<string | null>(null);
  const rename = useSave({
    save: (label: string, rpc) => rpc.models.rename({ credentialId: credential.id, label }),
    stale: [queries.models.credentials.key()],
    onSaved: () => setName(null),
  });
  const saving = rename.pending;
  if (name === null)
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ms-2.5 text-muted-foreground"
        disabled={disabled}
        onClick={() => setName(credential.label)}
      >
        <Trans>Rename</Trans>
      </Button>
    );
  const trimmed = name.trim();
  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || trimmed === credential.label) return setName(null);
        rename.run(trimmed);
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label={t`Name`}
          autoFocus
          maxLength={MAX_MODEL_CONNECTION_LABEL}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setName(null);
          }}
          className="h-10 text-foreground"
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-10"
          disabled={saving || disabled || !trimmed}
        >
          {saving ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
        </Button>
      </div>
      {rename.error ? (
        <p className="mt-2 text-body text-destructive">
          {errorText(rename.error, t`Could not rename connection`)}
        </p>
      ) : null}
    </form>
  );
}

function AddProvider({
  providers,
  disabled,
  onPick,
}: {
  providers: ConnectableProvider[];
  disabled?: boolean;
  onPick: (provider: ConnectableProvider) => void;
}) {
  const { t } = useLingui();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const {
    query,
    setQuery,
    showSearch,
    visible: matching,
  } = useListSearch(providers, { text: (provider) => provider.name });
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setQuery("");
        setOpen(next);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-b-xl px-3 py-3 text-start text-body text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="size-4" aria-hidden />
            <Trans>Add provider</Trans>
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={6}
        initialFocus={showSearch ? searchRef : undefined}
        className="w-[min(360px,var(--available-width))] gap-0 overflow-hidden p-0 motion-reduce:animate-none"
      >
        <Command
          tabIndex={showSearch ? undefined : 0}
          label={t`Add provider`}
          shouldFilter={false}
          loop
        >
          {showSearch ? (
            <ListSearchInput
              command
              inputRef={searchRef}
              query={query}
              setQuery={setQuery}
              label={t`Add provider`}
              placeholder={t`Search`}
            />
          ) : null}
          <CommandList className="rk-scroll max-h-80">
            <CommandEmpty>
              <Trans>No results</Trans>
            </CommandEmpty>
            <CommandGroup>
              {matching.map((provider) => (
                <CommandItem
                  key={`${provider.id}:${provider.baseUrl ?? ""}`}
                  value={`${provider.id}:${provider.baseUrl ?? ""}`}
                  onSelect={() => {
                    setOpen(false);
                    onPick(provider);
                  }}
                >
                  <span className="min-w-0 truncate">{provider.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** One row of a settings list that opens its own page. */
export function SettingsListRow({
  label,
  labelTestId,
  disabled,
  onClick,
  className,
  children,
}: {
  label: ReactNode;
  labelTestId?: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[52px] w-full items-center gap-2.5 py-2 ps-3 pe-3 text-start outline-none first:rounded-t-xl hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span
        data-testid={labelTestId}
        className="min-w-0 flex-1 truncate text-body-lg text-foreground"
      >
        {label}
      </span>
      {children}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
    </button>
  );
}
