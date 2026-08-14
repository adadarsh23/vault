import React, { useRef, useState } from 'react';
import { ChevronUp, ChevronRight, Loader2, Menu, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { ScrollButton } from '../../../../components/vault/ScrollButton';
import { VaultItem } from '../../../../lib/storage';
import { cn } from '../../../../lib/utils';
import { ChatMessage } from './types';
import { formatListTime, getAvatarLabel } from './utils';

interface ChatListPanelProps {
  activeChatId: string | null;
  filteredChats: VaultItem[];
  totalFilteredChats: number;
  lastMessagesByChatId: Record<string, ChatMessage | null>;
  pinningItemIds: string[];
  searchQuery: string;
  newChatTitle: string;
  isCreatingChat: boolean;
  hasMoreChats: boolean;
  isLoadingMoreChats: boolean;
  onOpenFolders: () => void;
  onSearchQueryChange: (value: string) => void;
  onNewChatTitleChange: (value: string) => void;
  onCreateChat: () => Promise<void>;
  onLoadMoreChats: () => void;
  onSelectChat: (chatId: string) => void;
  onTogglePin: (chatItemId: string) => Promise<void>;
  onDeleteChat: (chatItem: VaultItem) => Promise<void>;
  onChatDragStart: (event: React.DragEvent<HTMLDivElement>, chatId: string) => void;
}

export const ChatListPanel: React.FC<ChatListPanelProps> = ({
  activeChatId,
  filteredChats,
  totalFilteredChats,
  lastMessagesByChatId,
  pinningItemIds,
  searchQuery,
  newChatTitle,
  isCreatingChat,
  hasMoreChats,
  isLoadingMoreChats,
  onOpenFolders,
  onSearchQueryChange,
  onNewChatTitleChange,
  onCreateChat,
  onLoadMoreChats,
  onSelectChat,
  onTogglePin,
  onDeleteChat,
  onChatDragStart,
}) => {
  const headerTitle = searchQuery.trim() ? 'Search Results' : 'Chats';
  const [showListScrollTop, setShowListScrollTop] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <aside
      className={cn(
        'w-full shrink-0 flex-col gap-4 border-r border-white/5 pr-0 transition-colors sm:gap-5 md:w-72 md:pr-4 lg:w-72 xl:w-80 xl:gap-6 xl:pr-6',
        activeChatId ? 'hidden md:flex' : 'flex'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="mb-1 flex min-w-0 flex-1 items-center gap-3">
          <h1
            className="truncate text-2xl font-bold text-text transition-colors sm:text-3xl"
            title={headerTitle}
          >
            {headerTitle}
          </h1>
          <span className="shrink-0 whitespace-nowrap rounded-full border border-text/10 bg-text/5 px-2.5 py-0.5 text-xs font-bold text-text/50 shadow-inner">
            {totalFilteredChats} items
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="group relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/20 transition-colors group-focus-within:text-purple-400" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search chats"
            className="h-10 w-full rounded-xl border-white/5 bg-white/5 pl-10 pr-10 text-sm focus:border-purple-500/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text/30 transition-all hover:bg-white/10 hover:text-text/60"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="flex h-10 w-10 shrink-0 rounded-xl border-white/5 bg-white/5 hover:bg-white/10 md:hidden"
          onClick={onOpenFolders}
          aria-label="Open folders"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={newChatTitle}
          onChange={(event) => onNewChatTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void onCreateChat();
            }
          }}
          placeholder="Create a conversation"
          className="h-10 w-full rounded-xl border-white/5 bg-white/5 sm:flex-1"
        />
        <Button
          type="button"
          className="h-10 w-full rounded-xl px-4 sm:w-auto sm:px-3"
          onClick={() => void onCreateChat()}
          disabled={isCreatingChat}
          aria-label="Create new chat"
        >
          {isCreatingChat ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            setShowListScrollTop(element.scrollTop > 200);

            const nearBottom =
              element.scrollTop + element.clientHeight >= element.scrollHeight - 120;
            if (nearBottom && hasMoreChats && !isLoadingMoreChats) {
              onLoadMoreChats();
            }
          }}
          className="h-full space-y-3 overflow-y-auto pr-2 custom-scrollbar"
        >
          {filteredChats.length === 0 && (
            <div className="rounded-2xl border border-dashed border-text/15 bg-bg/40 px-4 py-8 text-center text-sm text-text/55">
              No chats found.
            </div>
          )}

          {filteredChats.map((chatItem) => {
            const lastMessage = lastMessagesByChatId[chatItem.id];
            const isActive = activeChatId === chatItem.id;
            const isPinning = pinningItemIds.includes(chatItem.id);
            const displayTitle = chatItem.title?.trim() || 'Untitled Chat';

            return (
              <div
                key={chatItem.id}
                role="button"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => onSelectChat(chatItem.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectChat(chatItem.id);
                  }
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  onChatDragStart(event, chatItem.id);
                }}
                draggable
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-text/20 xl:gap-4 xl:p-4',
                  isActive
                    ? 'border-purple-500/20 bg-purple-500/5 shadow-[0_0_20px_rgba(168,85,247,0.05)]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10'
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition-colors',
                    isActive ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-text/20'
                  )}
                >
                  {getAvatarLabel(displayTitle)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        'truncate text-sm font-semibold transition-colors',
                        isActive ? 'text-text' : 'text-text/70'
                      )}
                    >
                      {displayTitle}
                    </p>
                    <span className="text-[10px] font-medium tracking-tight text-text/30">
                      {formatListTime(lastMessage?.createdAt || chatItem.updatedAt)}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-xs text-text/55">
                    {lastMessage?.text?.trim() || 'No messages yet'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 self-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onTogglePin(chatItem.id);
                    }}
                    aria-label={chatItem.isPinned ? 'Unpin chat' : 'Pin chat'}
                    className={cn(
                      'h-8 w-8 rounded-full transition-all',
                      chatItem.isPinned
                        ? 'text-purple-400 bg-purple-400/10 hover:bg-purple-400/20'
                        : 'text-text/30 hover:text-text/80 hover:bg-white/10'
                    )}
                  >
                    {isPinning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pin className={cn('h-4 w-4', chatItem.isPinned && 'fill-current')} />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-text/35 hover:text-red-400"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteChat(chatItem);
                    }}
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isActive && <ChevronRight className="h-4 w-4 text-fuchsia-400" />}
                </div>
              </div>
            );
          })}
          {hasMoreChats && (
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="outline"
                onClick={onLoadMoreChats}
                disabled={isLoadingMoreChats}
                className="h-9 rounded-xl border-white/10 bg-white/5 px-4 text-xs"
              >
                {isLoadingMoreChats ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Loading chats...
                  </>
                ) : (
                  'Load more chats'
                )}
              </Button>
            </div>
          )}
        </div>
        <ScrollButton
          icon={ChevronUp}
          visible={showListScrollTop}
          onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="bottom-4 right-4"
        />
      </div>
    </aside>
  );
};
