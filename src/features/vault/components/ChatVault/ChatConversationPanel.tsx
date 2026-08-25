import React from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  Loader2,
  MessageCircleReply,
  MessageSquareText,
  RefreshCcw,
  Send,
  TriangleAlert,
  X,
} from 'lucide-react';
import { ScrollButton } from '../../../../components/vault/ScrollButton';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { VaultItem } from '../../../../lib/storage';
import { cn } from '../../../../lib/utils';
import {
  ChatAttachment,
  ChatConversation,
  ChatDetailTab,
  ChatMessage,
  DisappearingTimer,
  QUICK_REACTIONS,
  TIMER_OPTIONS,
} from './types';
import {
  extractAttachmentsFromText,
  formatMessageTime,
  getAvatarLabel,
  getSafeExternalHref,
  renderMessageText,
} from './utils';

import { PHOTO_FILE_EXTENSIONS } from '../../../../lib/fileHandling';

const IMAGE_EXTENSIONS = new Set<string>(PHOTO_FILE_EXTENSIONS.map((ext) => ext.toLowerCase()));

const IMAGE_FORMAT_HINT_KEYS = ['format', 'fm', 'ext', 'mime', 'type'];

interface ChatConversationPanelProps {
  activeChatId: string | null;
  activeChatItem: VaultItem | null;
  activeConversation: ChatConversation | null;
  activeVisibleMessages: ChatMessage[];
  activeThreadedMessages: {
    rootMessages: ChatMessage[];
    repliesByParentId: Map<string, ChatMessage[]>;
  };
  detailTab: ChatDetailTab;
  attachmentList: ChatAttachment[];
  replyTargetId: string | null;
  draftMessage: string;
  busyMessageId: string | null;
  isSendingMessage: boolean;
  isLoadingActiveChat: boolean;
  username: string;
  failedChatIds: Set<string>;
  chatLoadErrors: Record<string, string>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onBackToList: () => void;
  onDetailTabChange: (tab: ChatDetailTab) => void;
  onDisappearingTimerChange: (timer: DisappearingTimer) => Promise<void>;
  onReplyTargetChange: (messageId: string | null) => void;
  onDraftMessageChange: (value: string) => void;
  onRetryLoadChat: () => void;
  onSendMessage: () => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
}

export const ChatConversationPanel: React.FC<ChatConversationPanelProps> = ({
  activeChatId,
  activeChatItem,
  activeConversation,
  activeVisibleMessages,
  activeThreadedMessages,
  detailTab,
  attachmentList,
  replyTargetId,
  draftMessage,
  busyMessageId,
  isSendingMessage,
  isLoadingActiveChat,
  username,
  failedChatIds,
  chatLoadErrors,
  messagesEndRef,
  onBackToList,
  onDetailTabChange,
  onDisappearingTimerChange,
  onReplyTargetChange,
  onDraftMessageChange,
  onRetryLoadChat,
  onSendMessage,
  onToggleReaction,
}) => {
  const isImageUrl = React.useCallback((value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) return false;

    if (/^data:image\//i.test(trimmed)) {
      return true;
    }

    const safeHref = getSafeExternalHref(trimmed);
    if (!safeHref) return false;

    try {
      const parsed = new URL(safeHref);
      const pathname = parsed.pathname.toLowerCase();
      const filename = pathname.split('/').pop() || '';
      const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : '';

      if (extension && IMAGE_EXTENSIONS.has(extension)) {
        return true;
      }

      for (const key of IMAGE_FORMAT_HINT_KEYS) {
        const hint = parsed.searchParams.get(key)?.toLowerCase();
        if (!hint) continue;

        if (
          hint.startsWith('image/') ||
          IMAGE_EXTENSIONS.has(hint) ||
          IMAGE_EXTENSIONS.has(hint.replace(/^image\//, ''))
        ) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }, []);
  const formatAttachmentDate = React.useCallback((timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);
  const activeChatTitle = activeChatItem?.title?.trim() || 'Untitled Chat';
  const activeChatLoadError = activeChatItem ? chatLoadErrors[activeChatItem.id] : undefined;
  const contentScrollRef = React.useRef<HTMLDivElement | null>(null);
  const activeChatIdRef = React.useRef<string | null>(null);
  const initialScrollDoneRef = React.useRef<boolean>(false);
  const prevMessagesCountRef = React.useRef<number>(0);
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [showScrollBottom, setShowScrollBottom] = React.useState(false);
  const [activeReactionTrayMessageId, setActiveReactionTrayMessageId] = React.useState<
    string | null
  >(null);
  const [copiedAttachmentId, setCopiedAttachmentId] = React.useState<string | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const copiedAttachmentTimerRef = React.useRef<number | null>(null);
  const LONG_PRESS_REACTION_MS = 180;

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearCopiedAttachmentTimer = React.useCallback(() => {
    if (copiedAttachmentTimerRef.current !== null) {
      window.clearTimeout(copiedAttachmentTimerRef.current);
      copiedAttachmentTimerRef.current = null;
    }
  }, []);

  const copyLinkToClipboard = React.useCallback(
    async (attachmentId: string, value: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else if (typeof document !== 'undefined') {
          const textArea = document.createElement('textarea');
          textArea.value = value;
          textArea.setAttribute('readonly', 'true');
          textArea.style.position = 'absolute';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        } else {
          return;
        }

        setCopiedAttachmentId(attachmentId);
        toast.success('Link copied to clipboard');
        clearCopiedAttachmentTimer();
        copiedAttachmentTimerRef.current = window.setTimeout(() => {
          setCopiedAttachmentId((current) => (current === attachmentId ? null : current));
        }, 1200);
      } catch {
        toast.error('Unable to copy link');
      }
    },
    [clearCopiedAttachmentTimer],
  );

  const handleMessageLongPressStart = React.useCallback(
    (messageId: string) => {
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setActiveReactionTrayMessageId(messageId);
      }, LONG_PRESS_REACTION_MS);
    },
    [clearLongPressTimer, LONG_PRESS_REACTION_MS],
  );

  React.useEffect(
    () => () => {
      clearLongPressTimer();
      clearCopiedAttachmentTimer();
    },
    [clearCopiedAttachmentTimer, clearLongPressTimer],
  );

  React.useEffect(() => {
    setActiveReactionTrayMessageId(null);
  }, [activeChatId, detailTab]);

  React.useEffect(() => {
    if (activeChatIdRef.current !== activeChatId) {
      activeChatIdRef.current = activeChatId;
      initialScrollDoneRef.current = false;
      prevMessagesCountRef.current = 0;
    }
  }, [activeChatId]);

  const updateScrollButtons = React.useCallback(() => {
    const element = contentScrollRef.current;
    if (!element) return;
    const threshold = 24;
    const nextShowTop = element.scrollTop > threshold;
    const nextShowBottom =
      element.scrollTop + element.clientHeight < element.scrollHeight - threshold;
    setShowScrollTop(nextShowTop);
    setShowScrollBottom(nextShowBottom);
  }, []);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = contentScrollRef.current;
    if (!element) return;

    try {
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    } catch {
      element.scrollTop = element.scrollHeight;
    }

    if (behavior === 'auto') {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  const handleImageLoad = React.useCallback(() => {
    const element = contentScrollRef.current;
    if (!element) return;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 150;
    if (!initialScrollDoneRef.current || isNearBottom) {
      element.scrollTop = element.scrollHeight;
    }
    updateScrollButtons();
  }, [updateScrollButtons]);

  const getMessageDayKey = React.useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }, []);

  const formatMessageDayLabel = React.useCallback((timestamp: number): string => {
    const target = new Date(timestamp);
    target.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';

    return target.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
  }, []);

  // Handle automatic scrolling to bottom when opening a chat or when new messages arrive
  React.useEffect(() => {
    if (detailTab !== 'messages' || !activeConversation || activeVisibleMessages.length === 0) {
      return;
    }

    const element = contentScrollRef.current;
    if (!element) return;

    if (!initialScrollDoneRef.current) {
      // First time loading this chat: immediately scroll to bottom and reinforce across animation frames & timeouts
      element.scrollTop = element.scrollHeight;

      const timers: number[] = [];
      const raf1 = window.requestAnimationFrame(() => {
        if (element) {
          element.scrollTop = element.scrollHeight;
          updateScrollButtons();
        }
        window.requestAnimationFrame(() => {
          if (element) {
            element.scrollTop = element.scrollHeight;
            updateScrollButtons();
          }
        });
        timers.push(
          window.setTimeout(() => {
            if (element) {
              element.scrollTop = element.scrollHeight;
              updateScrollButtons();
            }
          }, 50),
        );
        timers.push(
          window.setTimeout(() => {
            if (element) {
              element.scrollTop = element.scrollHeight;
              updateScrollButtons();
            }
          }, 150),
        );
        timers.push(
          window.setTimeout(() => {
            if (element) {
              element.scrollTop = element.scrollHeight;
              updateScrollButtons();
            }
          }, 300),
        );
      });

      initialScrollDoneRef.current = true;
      prevMessagesCountRef.current = activeVisibleMessages.length;

      return () => {
        window.cancelAnimationFrame(raf1);
        timers.forEach((t) => window.clearTimeout(t));
      };
    } else {
      // Subsequent new messages
      if (activeVisibleMessages.length > prevMessagesCountRef.current) {
        const lastMsg = activeVisibleMessages[activeVisibleMessages.length - 1];
        const isFromMe = lastMsg?.sender === username;
        const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;

        if (isFromMe || isNearBottom) {
          scrollToBottom('smooth');
        } else {
          updateScrollButtons();
        }
        prevMessagesCountRef.current = activeVisibleMessages.length;
      }
    }
  }, [
    activeChatId,
    activeConversation,
    activeVisibleMessages,
    detailTab,
    scrollToBottom,
    updateScrollButtons,
    username,
  ]);

  // Keep scroll pinned to bottom on layout/resize if at bottom or initial load
  React.useEffect(() => {
    const element = contentScrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => {
      const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
      if (!initialScrollDoneRef.current || isNearBottom) {
        element.scrollTop = element.scrollHeight;
      }
      updateScrollButtons();
    });

    resizeObserver.observe(element);
    if (element.firstElementChild) {
      resizeObserver.observe(element.firstElementChild);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeChatId, updateScrollButtons]);

  React.useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateScrollButtons();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [updateScrollButtons, detailTab, activeVisibleMessages.length, attachmentList.length]);

  return (
    <section className={cn('h-full min-w-0 flex-1', activeChatId ? 'block' : 'hidden md:block')}>
      {!activeChatItem || !activeConversation ? (
        <div className="h-full overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.01] transition-colors custom-scrollbar md:rounded-3xl">
          <div className="flex min-h-full items-center justify-center pt-40 pb-40">
            {activeChatItem ? (
              <div className="w-full max-w-md px-4 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
                  {isLoadingActiveChat ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <TriangleAlert className="h-6 w-6" />
                  )}
                </div>
                <p className="text-sm font-semibold text-text/75">
                  {isLoadingActiveChat ? 'Loading conversation...' : 'Conversation unavailable'}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-text/45">
                  {isLoadingActiveChat
                    ? 'Decrypting the selected chat.'
                    : activeChatLoadError || 'The selected chat could not be opened.'}
                </p>
                {!isLoadingActiveChat && failedChatIds.has(activeChatItem.id) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 h-9 rounded-xl border-white/10 bg-white/5 px-4 text-xs"
                    onClick={onRetryLoadChat}
                  >
                    <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </div>
            ) : (
              <div className="group text-center">
                <MessageSquareText className="mx-auto mb-4 h-16 w-16 text-text/5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
                <p className="text-sm font-medium text-text/30">Select a chat to view messages</p>
                <p className="mt-2 text-[10px] uppercase tracking-widest text-text/20">
                  Vault Secure Chat
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-none bg-card-bg/30 shadow-none md:rounded-3xl">
          <header className="border-b border-card-border px-3 py-3 transition-colors sm:px-4 md:py-4 xl:px-6">
            <div className="flex flex-nowrap items-center justify-between gap-2 overflow-hidden sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-1 shrink-0 rounded-full text-text/60 hover:text-white md:h-9 md:w-9 md:-ml-1 md:hidden"
                  onClick={onBackToList}
                  aria-label="Back to chat list"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-sm font-semibold text-fuchsia-400 sm:h-10 sm:w-10">
                  {getAvatarLabel(activeChatTitle)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold tracking-tight text-text sm:text-lg md:text-2xl">
                    {activeChatTitle}
                  </p>
                  <p className="text-xs text-text/55">{activeVisibleMessages.length} Chats</p>
                </div>
              </div>

              <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 whitespace-nowrap sm:gap-2">
                {(
                  [
                    {
                      id: 'messages',
                      icon: MessageSquareText,
                    },
                    { id: 'links', icon: Link2 },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = detailTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onDetailTabChange(tab.id)}
                      className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        active
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-text'
                          : 'border-text/10 bg-bg/60 text-text/65 hover:text-text',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {/* {tab.label} */}
                    </button>
                  );
                })}
                <div className="ml-1 flex items-center gap-2">
                  <select
                    className="h-9 min-w-0 max-w-[6.75rem] rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-text appearance-none sm:max-w-[9rem] sm:px-3 md:max-w-none"
                    value={activeConversation.disappearingTimer}
                    onChange={(event) =>
                      void onDisappearingTimerChange(event.target.value as DisappearingTimer)
                    }
                  >
                    {TIMER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-bg text-text">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </header>

          <div className="relative min-h-0 flex-1">
            <div
              ref={contentScrollRef}
              onScroll={updateScrollButtons}
              className="h-full overflow-y-auto px-2.5 py-3 custom-scrollbar sm:px-3 md:px-5"
            >
              {detailTab === 'messages' ? (
                <div className="space-y-4 pb-1 md:space-y-5">
                  {activeThreadedMessages.rootMessages.length === 0 && (
                    <div className="flex min-h-[55vh] items-center justify-center">
                      <div className="w-full max-w-md rounded-2xl border border-dashed border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent px-4 py-7 text-center">
                        <MessageSquareText className="mx-auto mb-2 h-5 w-5 text-fuchsia-400" />
                        <p className="text-sm font-medium text-text/75">No messages yet</p>
                        <p className="mt-1 text-xs text-text/50">
                          Start the conversation by sending the first message.
                        </p>
                      </div>
                    </div>
                  )}

                  {activeThreadedMessages.rootMessages.map((message, index) => {
                    const replies = activeThreadedMessages.repliesByParentId.get(message.id) || [];
                    const previousMessage =
                      index > 0 ? activeThreadedMessages.rootMessages[index - 1] : null;
                    const showDayDivider =
                      !previousMessage ||
                      getMessageDayKey(previousMessage.createdAt) !==
                        getMessageDayKey(message.createdAt);
                    const isMine = message.sender === username;
                    const reactionTrayOpen = activeReactionTrayMessageId === message.id;
                    const messageAttachments = Array.isArray(message.attachments)
                      ? message.attachments
                      : [];
                    const inferredAttachments = extractAttachmentsFromText(message.text);
                    const imageLinks = Array.from(
                      new Set(
                        [...messageAttachments, ...inferredAttachments]
                          .map((attachment) => getSafeExternalHref(attachment.url))
                          .filter(
                            (href): href is string => typeof href === 'string' && isImageUrl(href),
                          ),
                      ),
                    );

                    return (
                      <React.Fragment key={message.id}>
                        {showDayDivider && (
                          <div className="flex justify-center py-1.5">
                            <span className="rounded-full border border-text/10 bg-bg/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text/55">
                              {formatMessageDayLabel(message.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn('group flex', isMine ? 'justify-end' : 'justify-start')}
                          onMouseEnter={() => setActiveReactionTrayMessageId(message.id)}
                          onMouseLeave={() =>
                            setActiveReactionTrayMessageId((current) =>
                              current === message.id ? null : current,
                            )
                          }
                          onTouchStart={() => handleMessageLongPressStart(message.id)}
                          onTouchEnd={clearLongPressTimer}
                          onTouchCancel={clearLongPressTimer}
                          onTouchMove={clearLongPressTimer}
                        >
                          <div className="flex min-w-0 max-w-[96%] flex-col gap-1 sm:max-w-[88%] lg:max-w-[72%]">
                            <div
                              className={cn(
                                'relative min-w-0 rounded-2xl border px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-colors',
                                isMine
                                  ? 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/14 to-emerald-500/6 text-text'
                                  : 'border-white/10 bg-white/[0.025] text-text',
                              )}
                            >
                              {!isMine && (
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-400">
                                  {message.sender}
                                </p>
                              )}

                              {renderMessageText(
                                message.text,
                                isMine,
                                'text-sm leading-relaxed',
                                8,
                              )}

                              {imageLinks.length > 0 && (
                                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:max-w-[24rem]">
                                  {imageLinks.map((href) => (
                                    <a
                                      key={`${message.id}-${href}`}
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="group/image block overflow-hidden rounded-xl border border-white/10 bg-black/20"
                                    >
                                      <img
                                        src={href}
                                        alt="Shared image"
                                        loading="lazy"
                                        onLoad={handleImageLoad}
                                        className="h-auto max-h-64 w-full object-cover transition-transform duration-300 group-hover/image:scale-[1.01]"
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}

                              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] sm:text-[10px]">
                                <span className="font-medium tracking-wide text-text/50">
                                  {formatMessageTime(message.createdAt)}
                                </span>

                                <span className="flex flex-wrap items-center gap-1">
                                  {Object.keys(message.reactions).length > 0 ? (
                                    Object.entries(message.reactions).map(([emoji, users]) => (
                                      <span
                                        key={`${message.id}-reaction-${emoji}`}
                                        className="inline-flex items-center gap-0 rounded-full border border-text/15 bg-bg/45 px-1 py-0"
                                      >
                                        <span className="text-[9px] leading-none">{emoji}</span>
                                        <span className="text-[9px] font-semibold text-text/70">
                                          {users.length}
                                        </span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="italic text-text/40">No reactions</span>
                                  )}
                                </span>

                                {message.status === 'failed' && (
                                  <span className="rounded-full border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-300">
                                    Failed
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onReplyTargetChange(message.id)}
                                  className="ml-auto inline-flex h-5 items-center gap-1 rounded-full border border-transparent px-1.5 text-[9px] font-semibold text-text/65 transition-colors hover:border-text/15 hover:bg-text/10 hover:text-text sm:h-6 sm:px-2 sm:text-[10px]"
                                >
                                  <MessageCircleReply className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  Reply
                                </button>
                              </div>
                            </div>

                            <div
                              className={cn(
                                'flex flex-wrap gap-1.5 transition-all duration-100',
                                reactionTrayOpen
                                  ? 'max-h-40 opacity-100'
                                  : 'max-h-0 overflow-hidden opacity-0 pointer-events-none md:group-hover:max-h-40 md:group-hover:opacity-100 md:group-hover:pointer-events-auto',
                              )}
                            >
                              {QUICK_REACTIONS.map((emoji) => {
                                const count = message.reactions[emoji]?.length || 0;
                                return (
                                  <button
                                    key={`${message.id}-${emoji}`}
                                    type="button"
                                    disabled={busyMessageId === message.id}
                                    onClick={() => {
                                      void onToggleReaction(message.id, emoji);
                                      if (
                                        typeof window !== 'undefined' &&
                                        window.matchMedia('(hover: none)').matches
                                      ) {
                                        setActiveReactionTrayMessageId(null);
                                      }
                                    }}
                                    className={cn(
                                      'emoji-3d-chip inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-150',
                                      'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_14px_rgba(0,0,0,0.24)]',
                                      'hover:-translate-y-0.5 active:translate-y-0 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_7px_rgba(0,0,0,0.2)]',
                                      count > 0
                                        ? 'emoji-3d-chip-active border-emerald-400/35 bg-gradient-to-b from-emerald-400/25 to-emerald-500/10 text-fuchsia-400'
                                        : 'border-text/15 bg-gradient-to-b from-white/14 to-white/[0.03] text-text/80 hover:from-white/20 hover:to-white/[0.06]',
                                    )}
                                  >
                                    <span className="emoji-3d-glyph text-[13px] [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.45))_drop-shadow(0_2px_3px_rgba(0,0,0,0.35))]">
                                      {emoji}
                                    </span>
                                    {count > 0 && <span>{count}</span>}
                                  </button>
                                );
                              })}
                            </div>

                            {replies.length > 0 && (
                              <div className="space-y-2 border-l-2 border-emerald-500/20 pl-3">
                                {replies.map((reply) => (
                                  <div
                                    key={reply.id}
                                    className="rounded-xl border border-white/10 bg-bg/35 px-2.5 py-2"
                                  >
                                    <div className="mb-0.5 flex items-center justify-between gap-2">
                                      <p className="truncate text-[11px] font-semibold text-text/75">
                                        {reply.sender}
                                      </p>
                                      <span className="shrink-0 text-[10px] text-text/40">
                                        {formatMessageTime(reply.createdAt)}
                                      </span>
                                    </div>
                                    {renderMessageText(
                                      reply.text,
                                      isMine,
                                      'text-xs leading-relaxed',
                                      4,
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}

                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="space-y-2">
                  {attachmentList.map((attachment) => {
                    const safeHref = getSafeExternalHref(attachment.url);
                    if (!safeHref) {
                      return (
                        <div
                          key={attachment.id}
                          className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-2.5"
                        >
                          <p className="truncate text-sm text-text/60" title={attachment.label}>
                            {attachment.label}
                          </p>
                          <p className="mt-1 text-[10px] text-text/40">
                            {formatAttachmentDate(attachment.createdAt)}
                          </p>
                          <div className="mt-2 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                void copyLinkToClipboard(
                                  attachment.id,
                                  attachment.url || attachment.label,
                                )
                              }
                              className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] font-semibold text-text/65 transition-colors hover:bg-white/10 hover:text-text"
                              aria-label="Copy link"
                            >
                              {copiedAttachmentId === attachment.id ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              {copiedAttachmentId === attachment.id ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={attachment.id}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition-colors hover:bg-white/[0.05]"
                      >
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md px-0.5 py-0.5"
                          aria-label={`Open link: ${attachment.label}`}
                        >
                          <p className="truncate text-sm text-text/85" title={attachment.label}>
                            {attachment.label}
                          </p>
                          <p className="mt-1 text-[10px] text-text/45">
                            {formatAttachmentDate(attachment.createdAt)}
                          </p>
                        </a>
                        <div className="mt-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => void copyLinkToClipboard(attachment.id, safeHref)}
                            className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] font-semibold text-text/65 transition-colors hover:bg-white/10 hover:text-text"
                            aria-label="Copy link"
                          >
                            {copiedAttachmentId === attachment.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedAttachmentId === attachment.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {attachmentList.length === 0 && (
                    <div className="flex min-h-[55vh] items-center justify-center">
                      <div className="w-full max-w-md rounded-2xl border border-dashed border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent px-4 py-7 text-center">
                        <Link2 className="mx-auto mb-2 h-5 w-5 text-fuchsia-400" />
                        <p className="text-sm font-medium text-text/75">No links found</p>
                        <p className="mt-1 text-xs text-text/50">
                          Shared links will appear here once messages include URLs.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <ScrollButton
              icon={ChevronUp}
              visible={showScrollTop}
              ariaLabel="Scroll to top"
              onClick={() =>
                contentScrollRef.current?.scrollTo({
                  top: 0,
                  behavior: 'smooth',
                })
              }
              className="right-4 top-4"
            />
            <ScrollButton
              icon={ChevronDown}
              visible={showScrollBottom}
              ariaLabel="Scroll to bottom"
              onClick={() => scrollToBottom('smooth')}
              className="bottom-4 right-4"
            />
          </div>

          <footer className="mt-auto border-t border-card-border bg-white/[0.01] px-2.5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5 sm:px-3 md:px-4 xl:px-6">
            {failedChatIds.has(activeChatItem.id) && (
              <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                Some conversation data could not be decrypted.
              </div>
            )}

            {replyTargetId && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-xs text-fuchsia-400">
                Replying in thread
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-blue-500/20"
                  onClick={() => onReplyTargetChange(null)}
                  aria-label="Cancel reply"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <Input
                value={draftMessage}
                onChange={(event) => onDraftMessageChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void onSendMessage();
                  }
                }}
                placeholder="Type a message..."
                disabled={isSendingMessage}
                className="h-11 min-w-0 rounded-xl border-white/10 bg-white/5"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl sm:h-11 sm:w-11"
                onClick={() => void onSendMessage()}
                disabled={isSendingMessage || !draftMessage.trim()}
                aria-label="Send message"
              >
                {isSendingMessage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
};
