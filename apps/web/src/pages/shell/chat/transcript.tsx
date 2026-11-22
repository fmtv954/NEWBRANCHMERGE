import { i18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { useTimeout } from "@rakazo/chat-ui/hooks";
import type {
  BotAvatarSet,
  CompareGroup,
  ComputerReleaseReason,
  LoginFieldInput,
  MergeReceipt,
  MergeReview,
  MessageReaction,
  Placement,
  ThreadMessage,
} from "@rakazo/contracts";
import type { ChildBotBlock, FoldedTranscript } from "@rakazo/core";
import {
  expandPeerReplies,
  groupVoiceChats,
  isPeerReceiptBlocks,
  liveActivityLine,
  liveMessageComposing,
  peerExchangeLines,
  projectBotMentions,
  projectMessageReactions,
  separateAskAnswers,
  timeSeparatorIds,
  unreadDividerMessageId,
  voiceChatHoldsMessage,
} from "@rakazo/core";
import type { GroupAvatarMember } from "@rakazo/ui-web";
import { Button, cn, Spinner } from "@rakazo/ui-web";
import { ArrowDown } from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import {
  Fragment,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActiveBotGlyph } from "../../../components/ai/CollaborationMarker";
import { BranchSetupDialog } from "../../../components/branching/BranchSetupDialog";
import {
  CompareModelsCard,
  InlineMergeReviewCard,
  KeptItemCard,
  MergeReceiptBanner,
} from "../../../components/branching/InlineBranchCards";
import { VoiceChatCard } from "../../../components/call/VoiceChatCard";
import {
  RunContinuityCard,
  type RunContinuityState,
} from "../../../components/runs/RunContinuityCard";
import {
  isDetachedRange,
  lastSelectedText,
  quoteDraftForSelection,
} from "../../../lib/chat/quote-selection";
import { messageHasVisibleBlocks } from "../../../lib/chat/tool-activity-view";
import { TRANSCRIPT_CONTENT_PADDING } from "../../../lib/chat/transcript-layout";
import { transcriptIsNearEnd, transcriptMovedDown } from "../../../lib/chat/transcript-scroll";
import type { ArtifactTarget } from "../../../lib/pages/artifact-open";
import { projectPageCards } from "../../../lib/pages/page-cards";
import type { createSpaceRpc, RpcClient } from "../../../lib/query/rpc";
import { useEventListener } from "../../../lib/use-event-listener";
import type { ImportSetupTarget } from "../bots/import-setup-card";
import { isEditableTarget } from "../shell-shortcuts";
import { TimeSeparator, UnreadDivider } from "./chat-context";
import { MessageView } from "./message-view";
import { QuoteSelectionButton } from "./quote-selection-button";

/** Bubbles stop at a readable line length instead of stretching with wide windows. */
export function bubbleFrameWidth(role: ThreadMessage["role"]) {
  return role === "user"
    ? "max-w-[min(84%,calc(100%_-_8rem),39rem)] [@media(hover:none)]:max-w-[min(84%,39rem)]"
    : "max-w-[min(88%,calc(100%_-_8rem),39rem)] [@media(hover:none)]:max-w-[min(88%,39rem)]";
}

/** Rows drawn in the frame a chat opens; the rest mount right after without blocking input. */
const FIRST_FRAME_ROWS = 20;

export const Transcript = memo(function Transcript({
  scrollRef,
  scrollRequest,
  onScrollRequestHandled,
  followRequest,
  artifactTarget,
  transcript,
  meId,
  showToolActivity,
  olderCursor,
  unreadAfterSeq,
  loadingOlder,
  answerableAskIds,
  dismissableAskIds,
  running,
  workingBots,
  workingRoutine,
  userBubble,
  onCallBack,
  onLoadOlder,
  onOpenBot,
  onAnswer,
  onReply,
  onMarkUnread,
  markedUnreadMessageId,
  onQuote,
  onQuoteShortcutChange,
  onReact,
  onJumpToMessage,
  onOpenPeerMessages,
  memberName,
  peerBot,
  onRefresh,
  onBotChanged,
  onAddRoutine,
  voiceReady,
  speakingMessageId,
  callHoldsSpeaker,
  onSpeak,
  onOpenComputer,
  onReleaseComputer,
  onOpenImportSetup,
  rpc,
  projectId,
  branchId,
  placements,
  activeMergeReview,
  compareGroups,
  mergeReceipts,
  runContinuity,
  onBranchCreated,
  reviewBlocksOpen,
  onInstantBranch,
  onReorderPlacements,
  onRemovePlacement,
  onCommitMessageMarkdown,
  onOpenRearrangeCanvas,
  onRegenerateMessage,
  onDismissMergeReceipt,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollRequest: { messageId: string; nonce: number } | null;
  onScrollRequestHandled: () => void;
  /** Changes when you send: the view moves to the end and follows the reply. */
  followRequest: number;
  artifactTarget: ArtifactTarget;
  transcript: FoldedTranscript<ThreadMessage>;
  meId?: string;
  showToolActivity: boolean;
  olderCursor: number | null;
  /** The seq read up to when this chat opened; null when nothing was unread. */
  unreadAfterSeq: number | null;
  loadingOlder: boolean;
  answerableAskIds: Set<string>;
  dismissableAskIds: Set<string>;
  running: boolean;
  workingBots: GroupAvatarMember[];
  workingRoutine?: string;
  /** Your bubbles take the bot's color in its own chat. */
  userBubble?: { background: string; foreground: string };
  /** Calls the bot back from a missed call in the transcript. */
  onCallBack?: () => void;
  onLoadOlder: () => void | Promise<void>;
  onOpenBot: (botId: string) => void;
  onAnswer: (
    message: ThreadMessage,
    text: string,
    fields?: LoginFieldInput[],
    dismiss?: boolean,
    remember?: false,
  ) => Promise<void>;
  onReply: (message: ThreadMessage) => void;
  onMarkUnread: (message: ThreadMessage) => void;
  markedUnreadMessageId?: string;
  onQuote: (message: ThreadMessage, quote: string) => void;
  onQuoteShortcutChange?: (handler: (() => boolean) | null) => void;
  onReact: (message: ThreadMessage, reaction: MessageReaction) => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
  onOpenPeerMessages: (peer: { peerBotId: string; peerBotName: string }) => void;
  memberName?: (botId: string | undefined) => string | undefined;
  peerBot: (
    botId: string,
  ) => { name?: string; color: string; status?: string; avatarSet?: BotAvatarSet } | undefined;
  onRefresh: () => Promise<void>;
  onBotChanged: () => Promise<void>;
  onAddRoutine: (name: string, prompt: string) => void;
  voiceReady: boolean;
  speakingMessageId: string | null;
  callHoldsSpeaker: boolean;
  onSpeak: (message: ThreadMessage) => void;
  onOpenComputer: (botId?: string, takeControl?: boolean) => void;
  onReleaseComputer: (
    botId: string,
    runId: string | undefined,
    reason: ComputerReleaseReason,
  ) => Promise<void>;
  onOpenImportSetup?: (target: ImportSetupTarget) => void;
  rpc: ReturnType<typeof createSpaceRpc>;
  projectId?: string | null;
  branchId?: string | null;
  placements?: readonly Placement[];
  activeMergeReview?: MergeReview | null;
  compareGroups?: readonly CompareGroup[];
  mergeReceipts?: readonly MergeReceipt[];
  runContinuity?: RunContinuityState | null;
  onBranchCreated?: (branchId: string) => void;
  reviewBlocksOpen?: boolean;
  onInstantBranch?: (input: {
    messageId: string;
    quoteText?: string;
    sourceMarkdown?: string;
  }) => void;
  onReorderPlacements?: (orderedIds: string[]) => Promise<void>;
  onRemovePlacement?: (placementId: string) => Promise<void>;
  onCommitMessageMarkdown?: (
    messageId: string,
    updatedMarkdown: string,
    blockIndex: number,
    originalMarkdown: string,
    client?: RpcClient,
  ) => Promise<void>;
  onOpenRearrangeCanvas?: (messageId: string, markdown: string, blockIndex: number) => void;
  onRegenerateMessage?: (message: ThreadMessage) => void;
  onDismissMergeReceipt?: (receiptId: string) => void;
}) {
  const { t } = useLingui();
  const [branchSetupOpen, setBranchSetupOpen] = useState(false);
  const [branchSourceMessageId, setBranchSourceMessageId] = useState<string | null>(null);
  const [draggedPlacementId, setDraggedPlacementId] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const following = useRef(true);
  const jumpScrolling = useRef(false);
  const autoScrolling = useRef(false);
  const lastScrollTop = useRef<number | null>(null);
  // The fallback that ends a smooth jump to the latest message when no scroll reaches the end.
  const [autoScrollFallback, setAutoScrollFallback] = useState<{ ms: number } | null>(null);
  const jumpButtonRef = useRef<HTMLButtonElement>(null);
  const [expandedPeerMarkers, setExpandedPeerMarkers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // A jump to a folded reply expands its marker; the scroll effect below then finds the row.
  useLayoutEffect(() => {
    const markerId = scrollRequest && transcript.markerOf.get(scrollRequest.messageId);
    if (!markerId) return;
    setExpandedPeerMarkers((expanded) =>
      expanded.has(markerId) ? expanded : new Set(expanded).add(markerId),
    );
  }, [scrollRequest, transcript]);
  const messages = useMemo(
    () => expandPeerReplies(transcript, expandedPeerMarkers),
    [transcript, expandedPeerMarkers],
  );
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const committedMentions = useRef(new Map<string, ChildBotBlock[]>());
  const mentionView = useMemo(() => {
    const view = projectBotMentions(messages);
    for (const [id, mentions] of view.mentions) {
      const previous = committedMentions.current.get(id);
      if (
        previous?.length === mentions.length &&
        mentions.every((block, index) => block === previous[index])
      ) {
        view.mentions.set(id, previous);
      }
    }
    return view;
  }, [messages]);
  const committedPages = useRef<ReturnType<typeof projectPageCards> | null>(null);
  const pageView = useMemo(() => {
    const view = projectPageCards(mentionView.visibleMessages);
    const committed = committedPages.current;
    if (!committed) return view;
    for (const [id, pages] of view.pages) {
      const previous = committed.pages.get(id);
      if (
        previous?.length === pages.length &&
        pages.every((block, index) => block === previous[index])
      ) {
        view.pages.set(id, previous);
      }
    }
    if (committed.cardsKey === view.cardsKey) view.isSuperseded = committed.isSuperseded;
    return view;
  }, [mentionView]);
  // A progress tick rebuilds these views. The jump still reads the latest folds, without a new
  // callback that would rerender every memoized message.
  const foldViews = useRef({ mentionView, pageView });
  useLayoutEffect(() => {
    foldViews.current = { mentionView, pageView };
    committedMentions.current = mentionView.mentions;
    committedPages.current = pageView;
  }, [mentionView, pageView]);
  const jumpToMessage = useCallback(
    (messageId: string) => {
      const views = foldViews.current;
      const target = views.mentionView.foldedInto.get(messageId) ?? messageId;
      onJumpToMessage(views.pageView.foldedInto.get(target) ?? target);
    },
    [onJumpToMessage],
  );
  const reactionView = useMemo(() => projectMessageReactions(pageView.visibleMessages), [pageView]);
  const separateAnswers = useMemo(
    () => separateAskAnswers(reactionView.visibleMessages),
    [reactionView.visibleMessages],
  );
  const visibleReceipts = reactionView.visibleMessages.filter((message) =>
    messageHasVisibleBlocks(message.blocks, showToolActivity),
  );
  const exchanges = peerExchangeLines({ ...transcript, messages: visibleReceipts });
  const shownMessages = visibleReceipts.filter(
    (message) => !exchanges.lineOf.has(message.id) || exchanges.lines.has(message.id),
  );
  const separatorIds = timeSeparatorIds(shownMessages);
  const unreadDividerId = unreadDividerMessageId(shownMessages, unreadAfterSeq, olderCursor, meId);
  // Remounted per chat, so each opened chat paints its latest rows before the full history.
  const [tailOnly, setTailOnly] = useState(true);
  useEffect(() => startTransition(() => setTailOnly(false)), []);
  // A jump needs older rows, and must keep them after it clears its request.
  if (tailOnly && scrollRequest) setTailOnly(false);
  const showTail = tailOnly && !scrollRequest;
  const items = groupVoiceChats(reactionView.visibleMessages).filter(
    (item) =>
      item.kind === "voiceChat" || messageHasVisibleBlocks(item.message.blocks, showToolActivity),
  );
  const shownItems = showTail ? items.slice(-FIRST_FRAME_ROWS) : items;
  const workingLabel =
    liveActivityLine(messages) ?? (workingRoutine ? t`Running ${workingRoutine}…` : t`Working…`);
  const [quoteDraft, setQuoteDraft] = useState<{
    message: ThreadMessage;
    text: string;
    range: Range;
    /** The range's text when armed: a rewrite that removes one endpoint moves it without collapsing. */
    rangeText: string;
  } | null>(null);
  const selectingWithMouse = useRef(false);
  const applyQuote = useCallback(() => {
    const selection = window.getSelection();
    if (
      !quoteDraft ||
      !selection ||
      selection.isCollapsed ||
      !selection.rangeCount ||
      isDetachedRange(quoteDraft.range) ||
      quoteDraft.range.toString() !== quoteDraft.rangeText
    ) {
      return false;
    }
    const range = selection.getRangeAt(0);
    if (
      range.compareBoundaryPoints(Range.START_TO_START, quoteDraft.range) !== 0 ||
      range.compareBoundaryPoints(Range.END_TO_END, quoteDraft.range) !== 0
    ) {
      return false;
    }
    onQuote(quoteDraft.message, quoteDraft.text);
    selection.removeAllRanges();
    setQuoteDraft(null);
    return true;
  }, [onQuote, quoteDraft]);
  useLayoutEffect(() => {
    onQuoteShortcutChange?.(
      quoteDraft ? () => !isEditableTarget(document.activeElement) && applyQuote() : null,
    );
    return () => onQuoteShortcutChange?.(null);
  }, [onQuoteShortcutChange, applyQuote, quoteDraft]);

  // A streaming edit can replace the selected nodes without firing selectionchange: replacing
  // both endpoints collapses the range, replacing one moves it; the pill must not keep its
  // stale placement either way.
  useLayoutEffect(() => {
    setQuoteDraft((prev) =>
      prev && (isDetachedRange(prev.range) || prev.range.toString() !== prev.rangeText)
        ? null
        : prev,
    );
  }, [messages]);

  const evaluateSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setQuoteDraft(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const contentOf = (node: Node) =>
      (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(
        "[data-quote-message-id]",
      ) ?? null;
    const startContent = contentOf(range.startContainer);
    const endContent = contentOf(lastSelectedText(range));
    // selection.toString() serializes the whole range (a Ctrl+A transcript is
    // unbounded), so it only runs once both endpoints sit in one message.
    const draft = quoteDraftForSelection(
      {
        startContent,
        endContent,
        text: startContent && startContent === endContent ? selection.toString() : "",
      },
      messageById,
    );
    setQuoteDraft((prev) => {
      if (!draft) return null;
      // Repeat firings for an unchanged selection reuse the draft so the
      // transcript isn't re-rendered by every unrelated selection event. A
      // moved selection (e.g. keyboard-selecting a second occurrence of the
      // same text) must carry its new Range — the pill anchors to it.
      if (
        prev &&
        prev.message === draft.message &&
        prev.text === draft.text &&
        prev.range.compareBoundaryPoints(Range.START_TO_START, range) === 0 &&
        prev.range.compareBoundaryPoints(Range.END_TO_END, range) === 0
      ) {
        return prev;
      }
      return { ...draft, range, rangeText: range.toString() };
    });
  }, [messageById]);

  // A click, selection or small nudge that ends near the end leaves the reader at the
  // latest message, so new messages keep following; scrolling away beyond it does not.
  const followIfNearEnd = useCallback(() => {
    const element = scrollRef.current;
    if (element && !jumpScrolling.current && transcriptIsNearEnd(element)) {
      following.current = true;
    }
  }, [scrollRef]);

  // Keyboard and assistive-tech selections never reach a mouseup, so the pill
  // lifecycle listens on selectionchange; the mouse flag keeps it hidden while
  // a drag is still in flight.
  useEventListener(
    document,
    "mousedown",
    (event) => {
      selectingWithMouse.current = true;
      if ((event.target as Element | null)?.closest?.("[data-quote-selection]")) return;
      setQuoteDraft(null);
    },
    true,
  );
  useEventListener(
    document,
    "mouseup",
    () => {
      selectingWithMouse.current = false;
      // Clicks and selection drags end here even when released over the composer.
      followIfNearEnd();
      evaluateSelection();
    },
    true,
  );
  useEventListener(document, "selectionchange", () => {
    if (!selectingWithMouse.current) evaluateSelection();
  });
  useEventListener(document, "keydown", (event) => {
    if (event.key === "Escape") setQuoteDraft(null);
  });
  // A drag that ends outside the window never fires document mouseup; reset
  // the flag on blur so keyboard selections keep working afterwards.
  useEventListener(window, "blur", () => {
    selectingWithMouse.current = false;
  });
  const snapToEnd = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    following.current = true;
    autoScrolling.current = false;
    setAtEnd(true);
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  }, [scrollRef]);

  const jumpToLatest = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    following.current = true;
    autoScrolling.current = !reducedMotion;
    setAtEnd(true);
    element.scrollTo({
      top: element.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    // Fallback only: onScroll clears autoScrolling once near-end is reached.
    setAutoScrollFallback({ ms: reducedMotion ? 0 : 2_000 });
  }, [scrollRef]);
  useTimeout(
    () => {
      autoScrolling.current = false;
    },
    autoScrollFallback?.ms ?? null,
    autoScrollFallback,
  );

  const scrolledJump = useRef<number | null>(null);
  const [jumpScroll, setJumpScroll] = useState<number | null>(null);
  const endJumpScroll = useCallback(() => {
    jumpScrolling.current = false;
    setJumpScroll(null);
  }, []);
  useTimeout(endJumpScroll, jumpScroll === null ? null : 2_000, jumpScroll);
  // A jump scroll must win over follow-the-tail: unfollow inside the commit
  // that mounts the row so a live commit cannot cancel the animation, keep
  // retrying while the pinned window is still rendering, and suppress the
  // near-end follow re-arm only for the jump's own scroll events — scrollend
  // (or user input interrupting it, which also fires scrollend) ends the
  // suppression, with the timeout as fallback when no scroll happens.
  useLayoutEffect(() => {
    if (!scrollRequest || scrolledJump.current === scrollRequest.nonce) return;
    const element = scrollRef.current;
    const row = element?.querySelector(
      `[data-message-id="${CSS.escape(exchanges.lineOf.get(scrollRequest.messageId) ?? scrollRequest.messageId)}"]`,
    );
    if (!element || !row) return;
    scrolledJump.current = scrollRequest.nonce;
    following.current = false;
    autoScrolling.current = false;
    jumpScrolling.current = true;
    setJumpScroll(scrollRequest.nonce);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Streaming layout updates can interrupt a smooth jump before it reaches the row.
    row.scrollIntoView({ behavior: "auto", block: "center" });
    row.animate(
      reducedMotion
        ? [{ backgroundColor: "var(--muted)" }, { backgroundColor: "var(--muted)" }]
        : [
            { backgroundColor: "transparent" },
            { backgroundColor: "var(--muted)" },
            { backgroundColor: "transparent" },
          ],
      { duration: 1200 },
    );
    onScrollRequestHandled();
  }, [messages, scrollRequest, scrollRef, onScrollRequestHandled, exchanges.lineOf]);

  const followedRequest = useRef(followRequest);
  useLayoutEffect(() => {
    if (followedRequest.current === followRequest) return;
    followedRequest.current = followRequest;
    snapToEnd();
  }, [followRequest, snapToEnd]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (following.current) snapToEnd();
    // Content can grow below a reader who is not following without any scroll event.
    else if (element) setAtEnd(transcriptIsNearEnd(element));
  }, [messages, running, showTail, scrollRef, snapToEnd]);

  useLayoutEffect(() => {
    const button = jumpButtonRef.current;
    if (atEnd && button && document.activeElement === button) {
      button.blur();
    }
  }, [atEnd]);

  const loadOlder = useCallback(() => {
    const wasFollowing = following.current;
    // Prepend must not race the messages-driven snap-to-end follow path.
    following.current = false;
    autoScrolling.current = false;
    const pending = onLoadOlder();
    if (!pending) return;
    return Promise.resolve(pending).catch((error) => {
      const element = scrollRef.current;
      if (wasFollowing && element && transcriptIsNearEnd(element)) {
        following.current = true;
        setAtEnd(true);
      }
      throw error;
    });
  }, [onLoadOlder, scrollRef]);

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="transcript"
        onPointerDown={(event) => {
          lastScrollTop.current = event.currentTarget.scrollTop;
          autoScrolling.current = false;
          following.current = false;
        }}
        onTouchStart={(event) => {
          lastScrollTop.current = event.currentTarget.scrollTop;
          autoScrolling.current = false;
          following.current = false;
        }}
        onScrollEnd={() => {
          followIfNearEnd();
          if (jumpScrolling.current) endJumpScroll();
        }}
        onWheel={(event) => {
          if (event.deltaY < 0) {
            lastScrollTop.current = event.currentTarget.scrollTop;
            autoScrolling.current = false;
            following.current = false;
          }
        }}
        onScroll={(event) => {
          const scrolledDown = transcriptMovedDown(
            lastScrollTop.current,
            event.currentTarget.scrollTop,
          );
          lastScrollTop.current = event.currentTarget.scrollTop;
          const nearEnd = transcriptIsNearEnd(event.currentTarget);
          setAtEnd(nearEnd);
          // A jump scroll owns the viewport until its animation settles; its
          // own near-end crossings must not re-arm tail-following.
          if (jumpScrolling.current) return;
          if (nearEnd) {
            if (scrolledDown) following.current = true;
            if (autoScrolling.current) {
              autoScrolling.current = false;
              setAutoScrollFallback(null);
            }
          } else if (!autoScrolling.current) {
            following.current = false;
          }
        }}
        className={`rk-scroll isolate flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto scroll-pt-16 scroll-pb-7 pt-20 pb-12 md:pt-[84px] md:pb-13 ${TRANSCRIPT_CONTENT_PADDING}`}
        style={
          userBubble
            ? ({
                "--chat-user": userBubble.background,
                "--chat-user-foreground": userBubble.foreground,
              } as CSSProperties)
            : undefined
        }
      >
        {olderCursor != null && !showTail ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            aria-label={t`Load earlier messages`}
            className="self-center text-muted-foreground"
          >
            {loadingOlder ? <Spinner aria-label={t`Loading…`} /> : null}
            {t`Load earlier messages`}
          </Button>
        ) : null}
        {shownItems.map((item) => {
          if (item.kind === "voiceChat") {
            return (
              <div key={item.key}>
                {item.messages[0] && separatorIds.has(item.messages[0].id) ? (
                  <TimeSeparator
                    createdAt={item.messages[0].createdAt}
                    locale={i18n.locale || "en"}
                  />
                ) : null}
                {voiceChatHoldsMessage(item, unreadDividerId) ? (
                  <UnreadDivider
                    afterSeparator={Boolean(
                      item.messages[0] && separatorIds.has(item.messages[0].id),
                    )}
                  />
                ) : null}
                <VoiceChatCard
                  group={item}
                  revealMessageId={scrollRequest?.messageId}
                  onCallBack={onCallBack}
                />
              </div>
            );
          }
          const message = item.message;
          const peerReceipt = isPeerReceiptBlocks(message.blocks);
          const messageReactions = reactionView.reactions.get(message.id);
          return (
            <Fragment key={message.id}>
              {separatorIds.has(message.id) ? (
                <TimeSeparator createdAt={message.createdAt} locale={i18n.locale || "en"} />
              ) : null}
              {message.id === unreadDividerId ? (
                <UnreadDivider afterSeparator={separatorIds.has(message.id)} />
              ) : null}
              <div
                data-message-id={message.id}
                className={peerReceipt ? "relative" : "group/message relative hover:z-[1]"}
              >
                <div
                  className={
                    peerReceipt
                      ? undefined
                      : `relative flex ${message.role === "user" ? "justify-end" : "justify-start"}`
                  }
                >
                  <div
                    data-testid={peerReceipt ? undefined : "message-bubble-frame"}
                    className={
                      peerReceipt
                        ? undefined
                        : message.blocks.some(
                              (block) =>
                                block.kind === "ask" ||
                                block.kind === "mcp_approval" ||
                                block.kind === "tool_question",
                            )
                          ? "relative w-full min-w-0 max-w-xl"
                          : `relative ${
                              message.blocks.some(
                                (block) =>
                                  block.kind === "app_connect" ||
                                  block.kind === "page" ||
                                  block.kind === "computer",
                              ) || pageView.pages.has(message.id)
                                ? "w-full"
                                : "w-fit"
                            } min-w-0 ${bubbleFrameWidth(message.role)}`
                    }
                  >
                    <MessageView
                      artifactTarget={artifactTarget}
                      message={message}
                      separateAnswers={separateAnswers.get(message.id)}
                      meId={meId}
                      markedUnread={message.id === markedUnreadMessageId}
                      mentions={mentionView.mentions.get(message.id)}
                      pages={pageView.pages.get(message.id)}
                      isPageSuperseded={pageView.isSuperseded}
                      canAnswer={answerableAskIds.has(message.id)}
                      canDismiss={dismissableAskIds.has(message.id)}
                      onOpenBot={onOpenBot}
                      onOpenPeerMessages={onOpenPeerMessages}
                      peerExchange={exchanges.lines.get(message.id)}
                      onAnswer={onAnswer}
                      speakerName={
                        peerReceipt
                          ? undefined
                          : message.role === "bot"
                            ? memberName?.(message.botId)
                            : undefined
                      }
                      memberName={memberName}
                      peerBot={peerBot}
                      replyParent={
                        message.replyToMessageId
                          ? messageById.get(message.replyToMessageId)
                          : undefined
                      }
                      onJumpToMessage={jumpToMessage}
                      onRefresh={onRefresh}
                      onBotChanged={onBotChanged}
                      onAddRoutine={onAddRoutine}
                      voiceReady={voiceReady}
                      speaking={speakingMessageId === message.id}
                      callHoldsSpeaker={callHoldsSpeaker}
                      onSpeak={onSpeak}
                      onOpenComputer={onOpenComputer}
                      onReleaseComputer={onReleaseComputer}
                      onOpenImportSetup={onOpenImportSetup}
                      rpc={rpc}
                      projectId={projectId}
                      branchId={branchId}
                      onBranch={
                        onInstantBranch
                          ? (msg) => onInstantBranch({ messageId: msg.id })
                          : undefined
                      }
                      reviewBlocksActive={reviewBlocksOpen}
                      onCommitMessageMarkdown={onCommitMessageMarkdown}
                      onOpenRearrangeCanvas={onOpenRearrangeCanvas}
                      onRegenerate={onRegenerateMessage}
                      onUndoMerge={
                        mergeReceipts && mergeReceipts.length > 0
                          ? async () => {
                              const receipt = mergeReceipts[0]!;
                              await rpc.merges.undo({
                                mergeReceiptId: receipt.id,
                                idempotencyKey: crypto.randomUUID(),
                              });
                              onDismissMergeReceipt?.(receipt.id);
                              await onRefresh();
                            }
                          : undefined
                      }
                      onBranchBlockText={
                        onInstantBranch
                          ? (msg, quoteText, sourceMarkdown) =>
                              onInstantBranch({ messageId: msg.id, quoteText, sourceMarkdown })
                          : undefined
                      }
                      showToolActivity={showToolActivity}
                      onReply={onReply}
                      onMarkUnread={onMarkUnread}
                      onReact={onReact}
                    />
                  </div>
                </div>
                {!peerReceipt && messageReactions ? (
                  <div
                    data-testid="message-reactions"
                    className={cn(
                      "mt-1 flex flex-wrap gap-1",
                      message.role === "user" && "justify-end",
                    )}
                  >
                    {[...messageReactions].map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className="rounded-full border border-border bg-muted px-2 py-0.5 text-label"
                      >
                        {emoji}
                        {count > 1 ? ` ${count}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </Fragment>
          );
        })}
        {running &&
        !messages.some(
          (message) => message.id.startsWith("progress:") && liveMessageComposing(message.blocks),
        ) ? (
          <ActiveBotGlyph bots={workingBots} label={workingLabel} />
        ) : null}
        {runContinuity ? <RunContinuityCard state={runContinuity} /> : null}
        {placements && placements.length > 0 ? (
          <div className="space-y-2.5 pt-2">
            {placements.map((placement, idx) => (
              <KeptItemCard
                key={placement.id}
                placement={placement}
                sourceBranchName="Branch"
                draggable={Boolean(onReorderPlacements)}
                onDragStart={() => setDraggedPlacementId(placement.id)}
                onDragOver={(e) => {
                  if (draggedPlacementId && draggedPlacementId !== placement.id) {
                    e.preventDefault();
                  }
                }}
                onDrop={() => {
                  if (!onReorderPlacements || !draggedPlacementId || draggedPlacementId === placement.id) {
                    return;
                  }
                  const ids = placements.map((p) => p.id);
                  const fromIdx = ids.indexOf(draggedPlacementId);
                  const toIdx = ids.indexOf(placement.id);
                  if (fromIdx < 0 || toIdx < 0) return;
                  const [moved] = ids.splice(fromIdx, 1);
                  if (moved) ids.splice(toIdx, 0, moved);
                  setDraggedPlacementId(null);
                  void onReorderPlacements(ids);
                }}
                canMoveUp={idx > 0}
                canMoveDown={idx < placements.length - 1}
                onMoveUp={
                  onReorderPlacements && idx > 0
                    ? () => {
                        const next = placements.map((p) => p.id);
                        const [item] = next.splice(idx, 1);
                        if (item) next.splice(idx - 1, 0, item);
                        void onReorderPlacements(next);
                      }
                    : undefined
                }
                onMoveDown={
                  onReorderPlacements && idx < placements.length - 1
                    ? () => {
                        const next = placements.map((p) => p.id);
                        const [item] = next.splice(idx, 1);
                        if (item) next.splice(idx + 1, 0, item);
                        void onReorderPlacements(next);
                      }
                    : undefined
                }
                onRemove={onRemovePlacement ? (id) => void onRemovePlacement(id) : undefined}
                onViewSource={(_srcBranchId, srcMessageId) => {
                  if (srcMessageId) onJumpToMessage(srcMessageId);
                }}
                onMove={() => undefined}
                onToggleNextMessage={() => undefined}
              />
            ))}
          </div>
        ) : null}
        {compareGroups?.map((group) => (
          <CompareModelsCard
            key={group.id}
            promptText={group.promptText}
            branchA={{
              branchId: group.branchAId,
              modelLabel: "Model A",
              costEstimate: "—",
              previewText: "",
            }}
            branchB={{
              branchId: group.branchBId,
              modelLabel: "Model B",
              costEstimate: "—",
              previewText: "",
            }}
            onKeepResult={async (chosenBranchId, previewText) => {
              if (!projectId || !branchId) return;
              await rpc.placements.keepInMain({
                projectId,
                sourceBranchId: chosenBranchId,
                targetBranchId: branchId,
                excerptText: previewText,
                label: "Compared result",
                clientNonce: crypto.randomUUID(),
              });
              await onRefresh();
            }}
          />
        ))}
        {activeMergeReview ? (
          <InlineMergeReviewCard
            review={activeMergeReview}
            sourceBranchName="Branch"
            onDefer={() => undefined}
            onApply={async (resolutions) => {
              await rpc.merges.apply({
                mergeReviewId: activeMergeReview.id,
                expectedTargetHeadRevisionId: activeMergeReview.targetHeadRevisionId,
                idempotencyKey: crypto.randomUUID(),
                resolutions,
              });
              await onRefresh();
            }}
          />
        ) : null}
        {/* Pure Main stream: no MergeReceiptBanner line inside chat; Undo lives inline beside Branch · Regenerate · Expand · History */}
        <div className="h-24 shrink-0" aria-hidden="true" />
      </div>
      {quoteDraft ? (
        <QuoteSelectionButton
          range={quoteDraft.range}
          onQuote={applyQuote}
          onBranch={
            onInstantBranch
              ? () => {
                  const quoteText = quoteDraft.range.toString().trim();
                  const fullText = quoteDraft.message.blocks
                    .filter((b) => b.kind === "text")
                    .map((b) => ("text" in b ? b.text : ""))
                    .join("\n\n");
                  const idx = quoteText ? fullText.indexOf(quoteText) : -1;
                  window.getSelection()?.removeAllRanges();
                  setQuoteDraft(null);
                  onInstantBranch({
                    messageId: quoteDraft.message.id,
                    quoteText: quoteText || undefined,
                    sourceMarkdown:
                      idx >= 0 && fullText.indexOf(quoteText, idx + 1) < 0 ? fullText : undefined,
                  });
                }
              : undefined
          }
        />
      ) : null}
      <BranchSetupDialog
        open={branchSetupOpen}
        onOpenChange={setBranchSetupOpen}
        inheritedMessageCount={messages.length}
        pinnedRefCount={placements?.length ?? 0}
        onOpenBranch={async (input) => {
          if (!projectId || !branchId) return;
          const created = await rpc.branches.create({
            projectId,
            sourceBranchId: branchId,
            name: input.name,
            sourceMessageId: branchSourceMessageId ?? undefined,
            contextMode: input.contextMode,
            defaultModelProvider: input.modelProvider,
            defaultModelId: input.modelId,
          });
          setBranchSetupOpen(false);
          onBranchCreated?.(created.id);
        }}
        onCompareModels={async (input) => {
          if (!projectId || !branchId) return;
          await rpc.branches.compareModels({
            projectId,
            sourceBranchId: branchId,
            sourceMessageId: branchSourceMessageId ?? undefined,
            contextMode: input.contextMode,
            promptText: "Compare models on this branch",
            modelA: input.modelA,
            modelB: input.modelB,
            clientNonce: crypto.randomUUID(),
          });
          setBranchSetupOpen(false);
          await onRefresh();
        }}
      />
      <Button
        ref={jumpButtonRef}
        variant="floating"
        size="icon-lg"
        aria-label={t`Jump to latest`}
        aria-hidden={atEnd}
        tabIndex={atEnd ? -1 : 0}
        onClick={jumpToLatest}
        className={`absolute bottom-11 left-1/2 z-20 -translate-x-1/2 shadow-md transition-[opacity,transform,background-color] duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${
          atEnd ? "pointer-events-none translate-y-2 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <ArrowDown strokeWidth={1.8} className="size-[17px]" />
      </Button>
    </div>
  );
});

/**
 * Floating Quote action anchored to the selection's bounding rect. Measures
 * itself after mount so it can flip below the selection when there is no room
 * above and stay clamped inside the viewport; re-anchors on scroll/resize.
 */
