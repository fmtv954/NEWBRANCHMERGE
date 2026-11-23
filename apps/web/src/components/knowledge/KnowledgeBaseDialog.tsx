import type { Artifact } from "@rakazo/contracts";
import { inferAttachmentMimeType } from "@rakazo/core";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@rakazo/ui-web";
import {
  BookOpen,
  Download,
  FileText,
  Loader2,
  MessageSquarePlus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { readFileAsBase64 } from "../../lib/composer/pending-attachments";
import { downloadArtifactBytes } from "../../lib/pages/artifact-open";
import type { createSpaceRpc } from "../../lib/query/rpc";
import { KnowledgeSection, SpaceMemorySection } from "../../pages/space/KnowledgeSection";

type ListedArtifact = Artifact & { versionCount: number };

function decodeBase64Bytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function KnowledgeBaseDialog({
  open,
  onOpenChange,
  rpc,
  activeBotId,
  onStartChatWithArtifact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rpc: ReturnType<typeof createSpaceRpc>;
  activeBotId?: string | null;
  onStartChatWithArtifact?: (artifact: ListedArtifact) => Promise<void>;
}) {
  const [tab, setTab] = useState("documents");
  const [items, setItems] = useState<ListedArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpc.artifacts.listSpace({ limit: 60 });
      setItems(res.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load Knowledge Base files.");
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    if (open) void loadArtifacts();
  }, [open, loadArtifacts]);

  async function handleUploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (!activeBotId) {
      toast.error("Open or create a chat first so uploaded files have a home bot.");
      return;
    }
    setUploading(true);
    let uploadedCount = 0;
    try {
      for (const file of Array.from(fileList)) {
        const mimeType =
          inferAttachmentMimeType(file.name, file.type) ??
          (file.type || "application/octet-stream");
        const contentBase64 = await readFileAsBase64(file);
        await rpc.artifacts.create({
          botId: activeBotId,
          name: file.name,
          mimeType,
          contentBase64,
          clientNonce: `kb:${activeBotId}:${crypto.randomUUID()}`,
        });
        uploadedCount++;
      }
      if (uploadedCount > 0) {
        toast.success(
          uploadedCount === 1
            ? "Uploaded file to Knowledge Base"
            : `Uploaded ${uploadedCount} files to Knowledge Base`,
        );
        await loadArtifacts();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "File upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(item: ListedArtifact) {
    setBusyId(item.id);
    try {
      const full = await rpc.artifacts.getById({ artifactId: item.id });
      const bytes = decodeBase64Bytes(full.contentBase64);
      downloadArtifactBytes(full.name, full.mimeType, bytes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download file.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: ListedArtifact) {
    setBusyId(item.id);
    try {
      await rpc.artifacts.remove({ artifactId: item.id });
      setItems((prev) => prev.filter((a) => a.id !== item.id));
      toast.success(`Deleted ${item.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete file.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.mimeType.toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[82vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-success" />
            <DialogTitle className="text-base font-semibold">Knowledge Base Center</DialogTitle>
            <Badge variant="outline" className="text-[11px]">
              {items.length} {items.length === 1 ? "file" : "files"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 pr-6">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.ts,.tsx,.js,.py"
              onChange={(e) => {
                void handleUploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={uploading || !activeBotId}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 gap-1.5"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              <span>{uploading ? "Uploading…" : "Upload files"}</span>
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-5 py-2">
            <TabsList className="h-8">
              <TabsTrigger value="documents" className="text-xs">
                Uploaded Documents ({items.length})
              </TabsTrigger>
              <TabsTrigger value="memory" className="text-xs">
                Shared &amp; Bot Memory
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="documents"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden p-5"
          >
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search uploaded PDFs, CSVs, Markdown, images…"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading Knowledge Base…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                  <FileText className="mb-2 size-7 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-foreground">
                    {search ? "No matching files" : "No uploaded documents yet"}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Upload PDFs, CSVs, Markdown, Word docs, or images. Files are stored in durable
                    Artifact Storage and survive across sessions.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5"
                    disabled={uploading || !activeBotId}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Upload your first document
                  </Button>
                </div>
              ) : (
                filtered.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.name}
                        </span>
                        {item.versionCount > 1 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            v{item.versionCount}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{item.mimeType}</span>
                        <span>·</span>
                        <span>{formatFileSize(item.size)}</span>
                        <span>·</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {onStartChatWithArtifact ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={busyId === item.id}
                          onClick={async () => {
                            setBusyId(item.id);
                            try {
                              await onStartChatWithArtifact(item);
                              onOpenChange(false);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="h-7 gap-1 px-2 text-[11px]"
                        >
                          <MessageSquarePlus className="size-3" />
                          <span>Chat</span>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busyId === item.id}
                        aria-label={`Download ${item.name}`}
                        onClick={() => void handleDownload(item)}
                        className="h-7 px-2"
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busyId === item.id}
                        aria-label={`Delete ${item.name}`}
                        onClick={() => void handleDelete(item)}
                        className="h-7 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="memory" className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <SpaceMemorySection />
            {activeBotId ? (
              <section className="rounded-xl border border-border px-4 py-4">
                <h3 className="text-sm font-semibold text-foreground">Current Chat Memory</h3>
                <div className="mt-2">
                  <KnowledgeSection botId={activeBotId} />
                </div>
              </section>
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
