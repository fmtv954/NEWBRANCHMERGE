import type { Branch } from "@rakazo/contracts";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import type { createSpaceRpc } from "../../lib/query/rpc";

export function SideReplyHistory({
  branch,
  messageId,
  rpc,
  onRestored,
}: {
  branch: Branch;
  messageId: string;
  rpc: ReturnType<typeof createSpaceRpc>;
  onRestored: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [restoring, setRestoring] = useState(false);
  const history = useQuery({
    enabled: open,
    staleTime: 0,
    queryKey: ["side-reply-history", branch.id, messageId],
    queryFn: () => rpc.projects.listMessageRevisions({ messageId }),
  });
  async function restore(revisionId: string) {
    setRestoring(true);
    setError(undefined);
    try {
      await rpc.projects.restoreMessageRevision({
        projectId: branch.projectId,
        branchId: branch.id,
        messageId,
        revisionId,
      });
      await onRestored();
      void history.refetch();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore this reply.");
    } finally {
      setRestoring(false);
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" size="xs" variant="ghost" aria-label="Reply history" />}
      >
        <History className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        {history.isPending ? <p className="px-2 text-xs">Loading history…</p> : null}
        {!history.isPending && !history.isError && !history.data?.revisions.length ? (
          <p className="px-2 text-xs">Original reply</p>
        ) : null}
        {history.data?.revisions.map((revision) => (
          <div
            key={revision.id}
            className="flex items-center justify-between gap-2 px-2 py-1 text-xs"
          >
            <span>Version {revision.version}</span>
            {revision.id === history.data.activeRevisionId ? (
              <span>Current</span>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={restoring || Boolean(branch.archivedAt)}
                onClick={() => void restore(revision.id)}
              >
                Restore
              </Button>
            )}
          </div>
        ))}
        {error || history.error ? (
          <p role="alert" className="px-2 text-xs text-destructive">
            {error || history.error?.message}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
