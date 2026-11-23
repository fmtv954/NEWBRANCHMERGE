import type { Block, BlockNoteEditor } from "@blocknote/core";
import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import type {
  DefaultReactSuggestionItem,
  FormattingToolbarProps,
  SuggestionMenuProps,
} from "@blocknote/react";
import {
  BlockColorsItem,
  DragHandleButton,
  DragHandleMenu,
  FormattingToolbar,
  getFormattingToolbarItems,
  RemoveBlockItem,
  SideMenu,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorState,
  useExtensionState,
} from "@blocknote/react";
import { Plus, RemoveFormatting, Scissors, X } from "lucide-react";
import { splitParagraph } from "./sentence-blocks";

export function splitCanvasParagraph(editor: BlockNoteEditor, block: Block) {
  if (block.type !== "paragraph") return;
  const sentences = splitParagraph(block.content);
  const [first, ...rest] = sentences;
  if (!first || !rest.length) return;

  editor.transact(() => {
    editor.updateBlock(block, { content: first });
    editor.insertBlocks(
      rest.map((content) => ({ type: "paragraph", content })),
      block,
      "after",
    );
  });
}

function CanvasDragHandleMenu() {
  const editor = useBlockNoteEditor();
  const components = useComponentsContext();
  const dictionary = useDictionary();
  const hoveredBlockId = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block.id,
  });
  const block = hoveredBlockId ? editor.getBlock(hoveredBlockId) : undefined;
  if (!components) return null;

  const MenuItem = components.Generic.Menu.Item;
  const canSplit = block?.type === "paragraph" && splitParagraph(block.content).length > 1;

  return (
    <DragHandleMenu>
      {canSplit ? (
        <MenuItem
          className="bn-menu-item"
          icon={<Scissors className="size-4" />}
          onClick={() => splitCanvasParagraph(editor, block)}
        >
          Split into sentences
        </MenuItem>
      ) : null}
      <RemoveBlockItem>{dictionary.drag_handle.delete_menuitem}</RemoveBlockItem>
      <BlockColorsItem>{dictionary.drag_handle.colors_menuitem}</BlockColorsItem>
      <TableRowHeaderItem>{dictionary.drag_handle.header_row_menuitem}</TableRowHeaderItem>
      <TableColumnHeaderItem>{dictionary.drag_handle.header_column_menuitem}</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}

export type TemporaryInsertBlock = { id: string; returnTo: string };

export function openCanvasInsertMenu(
  editor: BlockNoteEditor,
  block: Block,
  onTemporaryBlock: (block: TemporaryInsertBlock) => void,
) {
  const menu = editor.getExtension(SuggestionMenu);
  if (!menu) return;
  const target =
    Array.isArray(block.content) && block.content.length === 0
      ? block
      : editor.insertBlocks([{ type: "paragraph" }], block, "after")[0];
  if (!target) return;
  if (target.id !== block.id) onTemporaryBlock({ id: target.id, returnTo: block.id });
  editor.setTextCursorPosition(target);
  menu.openSuggestionMenu("/");
}

export function CanvasSideMenu({
  onTemporaryBlock,
}: {
  onTemporaryBlock: (block: TemporaryInsertBlock) => void;
}) {
  const editor = useBlockNoteEditor();
  const components = useComponentsContext();
  const dictionary = useDictionary();
  const hoveredId = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block.id,
  });
  const block = hoveredId ? editor.getBlock(hoveredId) : undefined;
  const Button = components?.SideMenu.Button;
  return (
    <SideMenu>
      {block && Button ? (
        <Button
          className="bn-button"
          label={dictionary.side_menu.add_block_label}
          icon={<Plus size={24} data-test="dragHandleAdd" />}
          onClick={() => openCanvasInsertMenu(editor, block, onTemporaryBlock)}
        />
      ) : null}
      <DragHandleButton dragHandleMenu={CanvasDragHandleMenu} />
    </SideMenu>
  );
}

export function CanvasFormattingToolbar(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor();
  const components = useComponentsContext();
  const hasSelectedText = useEditorState({
    editor,
    selector: ({ editor }) => Boolean(editor.getSelectedText().trim()),
  });
  const ToolbarButton = components?.FormattingToolbar.Button;

  return (
    <FormattingToolbar {...props}>
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      {hasSelectedText && ToolbarButton ? (
        <ToolbarButton
          label="Clear formatting"
          mainTooltip="Clear formatting"
          icon={<RemoveFormatting className="size-4" />}
          onClick={() =>
            editor.removeStyles({
              bold: true,
              italic: true,
              underline: true,
              strike: true,
              code: true,
              textColor: "default",
              backgroundColor: "default",
            })
          }
        />
      ) : null}
    </FormattingToolbar>
  );
}

export function CanvasInsertMenu({
  items,
  selectedIndex,
  loadingState,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const editor = useBlockNoteEditor();
  const components = useComponentsContext();
  if (!components) return null;
  const Menu = components.SuggestionMenu;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-popover">
      <div className="flex justify-end border-b border-border px-1 py-0.5">
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close insert menu"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const menu = editor.getExtension(SuggestionMenu);
            menu?.clearQuery();
            menu?.closeMenu();
            editor.focus();
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      <Menu.Root id="bn-suggestion-menu" className="bn-suggestion-menu">
        {items.map((item, index) => (
          <div key={item.title}>
            {item.group && item.group !== items[index - 1]?.group ? (
              <Menu.Label className="bn-suggestion-menu-label">{item.group}</Menu.Label>
            ) : null}
            <Menu.Item
              className="bn-suggestion-menu-item"
              item={item}
              id={`bn-suggestion-menu-item-${index}`}
              isSelected={index === selectedIndex}
              onClick={() => onItemClick?.(item)}
            />
          </div>
        ))}
        {items.length === 0 && loadingState === "loaded" ? (
          <Menu.EmptyItem className="bn-suggestion-menu-item">No matching blocks</Menu.EmptyItem>
        ) : null}
        {loadingState !== "loaded" ? <Menu.Loader className="bn-suggestion-menu-loader" /> : null}
      </Menu.Root>
    </div>
  );
}
