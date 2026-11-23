import type { MergeSourceBlock } from "@rakazo/contracts";
import { Button, Dialog, DialogContent, DialogTitle, OptionSelect } from "@rakazo/ui-web";
import { useState } from "react";
import type { BranchExportFormat } from "./branch-export";

const formats = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word (.docx)" },
  { value: "md", label: "Markdown" },
  { value: "json", label: "JSON" },
] satisfies { value: BranchExportFormat; label: string }[];

export function BranchExportDialog({
  branchName,
  allBlocks,
  selectedBlocks,
  onClose,
}: {
  branchName: string;
  allBlocks: MergeSourceBlock[];
  selectedBlocks: MergeSourceBlock[];
  onClose: () => void;
}) {
  const [scope, setScope] = useState(selectedBlocks.length ? "selected" : "all");
  const [format, setFormat] = useState<BranchExportFormat>("md");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const blocks = scope === "selected" ? selectedBlocks : allBlocks;

  async function download() {
    setWorking(true);
    setError(undefined);
    try {
      const { exportBranchBlocks } = await import("./branch-export");
      await exportBranchBlocks(branchName, blocks, format);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Export Side Chat</DialogTitle>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Blocks</legend>
          <label className="flex gap-2">
            <input
              type="radio"
              checked={scope === "selected"}
              disabled={!selectedBlocks.length}
              onChange={() => setScope("selected")}
            />{" "}
            Selected blocks ({selectedBlocks.length})
          </label>
          <label className="flex gap-2">
            <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> All
            generated blocks ({allBlocks.length})
          </label>
        </fieldset>
        <OptionSelect
          aria-label="Export format"
          value={format}
          options={formats}
          onValueChange={(value) => {
            if (value) setFormat(value);
          }}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="button" disabled={working || !blocks.length} onClick={() => void download()}>
          {format === "pdf" ? "Print or save as PDF" : "Download"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
