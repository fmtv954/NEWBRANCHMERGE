import { useLingui } from "@lingui/react/macro";
import { Button, cn } from "@rakazo/ui-web";
import { BookmarkPlus, Copy, GitBranch, TextQuote } from "lucide-react";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isDetachedRange } from "../../../lib/chat/quote-selection";
import { desktopBridge } from "../../../lib/platform/desktop";
import { useEventListener } from "../../../lib/use-event-listener";
import { isApplePlatform, quoteShortcutLabel } from "../shell-shortcuts";

export const QuoteSelectionButton = memo(function QuoteSelectionButton({
  range,
  onQuote,
  onBranch,
  onKeepInMain,
  inBranch = false,
}: {
  range: Range;
  onQuote: () => void;
  onBranch?: () => void;
  onKeepInMain?: () => void;
  inBranch?: boolean;
}) {
  const { t } = useLingui();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);

  const update = () => {
    if (isDetachedRange(range)) {
      setPlacement(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const width = buttonRef.current?.offsetWidth ?? 0;
    const height = buttonRef.current?.offsetHeight ?? 0;
    const above = rect.top >= height + 8;
    setPlacement({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(
        Math.max(rect.left + rect.width / 2, width / 2 + 8),
        window.innerWidth - width / 2 - 8,
      ),
      above,
    });
  };
  useLayoutEffect(update, [range]);
  useEventListener(window, "resize", update);
  // Scroll doesn't bubble — listen on the capture phase to catch any scroller.
  useEventListener(window, "scroll", update, { capture: true, passive: true });

  return createPortal(
    // The wrapper owns the offset so the button's pressed nudge cannot move it.
    <div
      data-quote-selection
      style={placement ? { top: placement.top, left: placement.left } : { visibility: "hidden" }}
      className={cn(
        "fixed z-50 -translate-x-1/2",
        placement?.above === false ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div
        ref={buttonRef}
        role="toolbar"
        aria-label={t`Selection actions`}
        onMouseDown={(event) => {
          // Keep the highlight alive until the click commits the action.
          event.preventDefault();
          event.stopPropagation();
        }}
        className="flex items-center gap-1 rounded-xl border border-glass-stroke bg-popover/95 p-1 shadow-md backdrop-blur-md"
      >
        <Button
          variant="ghost"
          size="sm"
          data-testid="quote-selection"
          onClick={onQuote}
          className="h-7 px-2.5 text-label"
        >
          <TextQuote strokeWidth={2} className="size-3.5" />
          {onBranch ? t`Ask here` : t`Reply`}
          <span className="hidden text-[11px] text-muted-foreground pointer-fine:inline">
            {quoteShortcutLabel({ desktop: Boolean(desktopBridge()), apple: isApplePlatform() })}
          </span>
        </Button>
        {onBranch ? (
          <Button
            variant="default"
            size="sm"
            data-testid="branch-selection"
            onClick={onBranch}
            className="h-7 bg-success px-2.5 text-label text-background hover:bg-success/90"
          >
            <GitBranch strokeWidth={2} className="size-3.5" />
            {t`Branch`}
          </Button>
        ) : null}
        {inBranch && onKeepInMain ? (
          <Button
            variant="ghost"
            size="sm"
            data-testid="keep-selection"
            onClick={onKeepInMain}
            className="h-7 px-2.5 text-label"
          >
            <BookmarkPlus strokeWidth={2} className="size-3.5" />
            {t`Keep in Main`}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          aria-label={t`Copy`}
          onClick={() => {
            const selected = range.toString();
            if (selected) void navigator.clipboard?.writeText(selected);
          }}
          className="h-7 px-2 text-label"
        >
          <Copy strokeWidth={2} className="size-3.5" />
          {t`Copy`}
        </Button>
      </div>
    </div>,
    document.body,
  );
});
