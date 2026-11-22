import type { Branch } from "@rakazo/contracts";
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@rakazo/ui-web";
import { Archive, Check, ChevronDown, GitBranch, Plus } from "lucide-react";
import { useState } from "react";

export function BranchSwitcher({
  branches,
  activeBranchId,
  onSelectBranch,
  onJumpToOrigin,
  onCreateBranch,
  showArchived = false,
  onToggleShowArchived,
}: {
  branches: readonly Branch[];
  activeBranchId: string | null;
  onSelectBranch: (branchId: string) => void;
  onJumpToOrigin?: (branch: Branch) => void;
  onCreateBranch?: () => void;
  showArchived?: boolean;
  onToggleShowArchived?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleBranches = showArchived ? branches : branches.filter((b) => !b.archivedAt);
  const active =
    branches.find((b) => b.id === activeBranchId) ?? visibleBranches[0] ?? branches[0];
  const archivedCount = branches.filter((b) => Boolean(b.archivedAt)).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="floating"
            size="sm"
            className="app-no-drag h-7 gap-1.5 px-2.5 text-label font-medium"
          />
        }
      >
        <GitBranch className="size-3.5 text-success" />
        <span className="max-w-32 truncate">{active?.name ?? "Main"}</span>
        {active && active.pendingReviewCount > 0 ? (
          <Badge className="h-4 bg-warning/20 px-1 text-[10px] text-warning">
            {active.pendingReviewCount}
          </Badge>
        ) : null}
        <ChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search branches…" />
          <CommandList>
            <CommandEmpty>No branches found.</CommandEmpty>
            <CommandGroup heading="Project branches">
              {visibleBranches.map((branch) => (
                <CommandItem
                  key={branch.id}
                  value={branch.name}
                  onSelect={() => {
                    onSelectBranch(branch.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-medium">
                      <span className="truncate">{branch.name}</span>
                      {branch.archivedAt ? (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] text-muted-foreground">
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                    {branch.forkOrigin?.selectionRange?.quoteText ? (
                      <div className="truncate text-[11px] text-muted-foreground">
                        “{branch.forkOrigin.selectionRange.quoteText}”
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {branch.pendingReviewCount > 0 ? (
                      <Badge variant="outline" className="text-[10px] text-warning">
                        {branch.pendingReviewCount}
                      </Badge>
                    ) : null}
                    {branch.id === activeBranchId ? (
                      <Check className="size-3.5 text-success" />
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {onCreateBranch || onToggleShowArchived || (active && !active.isMain && onJumpToOrigin) ? (
            <div className="space-y-1 border-t border-border p-1.5">
              {onCreateBranch ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-1.5 text-label"
                  onClick={() => {
                    onCreateBranch();
                    setOpen(false);
                  }}
                >
                  <Plus className="size-3.5" />
                  <span>New branch from here</span>
                </Button>
              ) : null}
              {onToggleShowArchived && (archivedCount > 0 || showArchived) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-1.5 text-label text-muted-foreground"
                  onClick={() => onToggleShowArchived()}
                >
                  <Archive className="size-3.5" />
                  <span>
                    {showArchived
                      ? "Hide archived branches"
                      : `Show archived (${archivedCount})`}
                  </span>
                </Button>
              ) : null}
              {active && !active.isMain && onJumpToOrigin ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start text-label"
                  onClick={() => {
                    onJumpToOrigin(active);
                    setOpen(false);
                  }}
                >
                  Jump to origin in Main
                </Button>
              ) : null}
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
