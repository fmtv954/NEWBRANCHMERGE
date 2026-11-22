# Upstream Sync Ledger

- **Upstream Repository:** `https://github.com/elie222/rakazo`
- **Upstream Release Tag:** `v0.13.0`
- **Upstream Commit SHA:** `5f66c8174b11beea7d30124de9a3edd8f9e9668d`
- **Fork Working Branch:** `clone/v1-demo`
- **License:** Apache-2.0 (`LICENSE` and `NOTICE` preserved from upstream)

## Modification Boundary Notes

1. **Additive Schema & Runtime Extensions:**
   - `Thread.botId` (`@unique`) is preserved untouched so existing Rakazo 1:1 bot threads, routines, and approvals remain 100% compatible.
   - Multi-thread project conversations and branches bind through `Thread.assistantBotId`, `Thread.projectId`, and the `Project` / `Branch` / `BranchForkOrigin` / `ProjectRevision` / `Placement` / `MergeReview` / `MergeReceipt` tables.
   - V2 Microdrama schema tables (`Episode`, `CharacterRef`, `PropLocationRef`, `Scene`, `Shot`, `ShotTake`) are staged in `packages/db/prisma/schema.prisma` alongside typed contracts in `packages/contracts/src/microdrama/`.
2. **External Reference License Boundary:**
   - Ludwig Kienle's `ai-video-production-editor` is **GPLv3**. Do **not** import or bundle GPLv3 source files into this repository. Data exchange occurs strictly at documented file boundaries (`script.md`, `project-brief.md`, `shot-list.md`, `clone-handoff.json`).
