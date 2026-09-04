import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { encryptData, decryptData } from '../../lib/cryptoPrimitives';
import { getStringContent, parseJsonSafely } from '../../lib/vaultItemContent';
import { VaultItem } from '../../lib/storage';
import { sortPinnedFirst } from '../../lib/pinning';
import { useVaultStore } from '../../store/vaultStore';
import { useShallow } from 'zustand/react/shallow';
import { logActivity } from '../../lib/activity';
import { logger } from '../../lib/logger';
import { setDraggedVaultItem } from '../../lib/vaultDragDrop';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import {
  ChatConversationPanel,
  ChatConversation,
  ChatDetailTab,
  ChatAttachment,
  DisappearingTimer,
  ChatListPanel,
  ChatMessage,
  extractAttachmentsFromText,
  extractMentions,
  getSafeExternalHref,
  isExpiredMessage,
  resolveMessageLifetime,
  toConversation,
} from './components/ChatVault';

const CHAT_DECRYPT_BATCH_SIZE = 20;
const CHAT_LIST_PAGE_SIZE = 30;
const CHAT_MESSAGE_MAX_LENGTH = 8000;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const candidate = error as { message?: unknown; error?: { message?: unknown } } | null;

  if (typeof candidate?.error?.message === 'string') {
    return candidate.error.message;
  }

  if (typeof candidate?.message === 'string') {
    return candidate.message;
  }

  return fallback;
};

const createChatError = (message: string): Error => new Error(message);

export const ChatVault: React.FC = () => {
  const { items, masterKey, username, addItem, updateItem, removeItem, togglePin, pinningItemIds } =
    useVaultStore(
      useShallow((state) => ({
        items: state.items,
        masterKey: state.masterKey,
        username: state.username || 'You',
        addItem: state.addItem,
        updateItem: state.updateItem,
        removeItem: state.removeItem,
        togglePin: state.togglePin,
        pinningItemIds: state.pinningItemIds,
      })),
    );

  const [chatPayloads, setChatPayloads] = useState<Record<string, ChatConversation>>({});
  const [failedChatIds, setFailedChatIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatTitle, setNewChatTitle] = useState('');
  const [isMobileFolderMenuOpen, setIsMobileFolderMenuOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<ChatDetailTab>('messages');
  const [draftMessage, setDraftMessage] = useState('');
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [visibleChatCount, setVisibleChatCount] = useState(CHAT_LIST_PAGE_SIZE);
  const [isLoadingChatBatch, setIsLoadingChatBatch] = useState(false);
  const [hasMoreChatPayloads, setHasMoreChatPayloads] = useState(false);
  const [chatLoadErrors, setChatLoadErrors] = useState<Record<string, string>>({});
  const [loadingChatIds, setLoadingChatIds] = useState<Set<string>>(new Set());
  const expiringCleanupInFlight = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatBatchCursorRef = useRef(0);
  const chatBatchInFlightRef = useRef(false);

  const chats = useMemo(() => items.filter((item) => item.type === 'chat'), [items]);
  const chatItemById = useMemo(() => new Map(chats.map((item) => [item.id, item])), [chats]);

  const {
    folders,
    currentFolder,
    setCurrentFolder,
    isAddingFolder,
    setIsAddingFolder,
    newFolderName,
    setNewFolderName,
    editingFolder,
    setEditingFolder,
    editingFolderName,
    setEditingFolderName,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveToFolder,
  } = useVaultFolders('chat');

  const markChatLoadFailed = useCallback((chatId: string, error: unknown, fallback: string) => {
    const message = getErrorMessage(error, fallback);
    setFailedChatIds((previous) => {
      const next = new Set(previous);
      next.add(chatId);
      return next;
    });
    setChatLoadErrors((previous) => ({
      ...previous,
      [chatId]: message,
    }));
    logger.warn('Chat conversation failed to load', {
      chatId,
      error,
      reason: message,
    });
  }, []);

  const markChatLoadSucceeded = useCallback((chatId: string) => {
    setFailedChatIds((previous) => {
      if (!previous.has(chatId)) return previous;
      const next = new Set(previous);
      next.delete(chatId);
      return next;
    });
    setChatLoadErrors((previous) => {
      if (!previous[chatId]) return previous;
      const next = { ...previous };
      delete next[chatId];
      return next;
    });
  }, []);

  const persistConversation = useCallback(
    async (item: VaultItem, nextConversation: ChatConversation) => {
      if (!masterKey && !useVaultStore.getState().isDecoyMode) {
        throw createChatError('Unlock the vault before updating chats');
      }

      let encryptedContent: string;
      try {
        encryptedContent = await encryptData(JSON.stringify(nextConversation), masterKey);
      } catch (error) {
        logger.error('Chat conversation encryption failed', {
          chatId: item.id,
          error,
        });
        throw createChatError('Failed to encrypt chat update');
      }

      try {
        await updateItem(item.id, {
          title: item.title,
          content: encryptedContent,
        });
      } catch (error) {
        logger.error('Chat conversation save failed', {
          chatId: item.id,
          error,
        });
        throw error;
      }

      setChatPayloads((previous) => ({
        ...previous,
        [item.id]: nextConversation,
      }));
      markChatLoadSucceeded(item.id);
    },
    [markChatLoadSucceeded, masterKey, updateItem],
  );

  const loadConversationForChat = useCallback(
    async (chatItem: VaultItem): Promise<ChatConversation> => {
      if (!masterKey && !useVaultStore.getState().isDecoyMode) {
        throw createChatError('Unlock the vault before opening chats');
      }
      const encryptedContent = getStringContent(chatItem.content);
      const decrypted = await decryptData(encryptedContent || '', masterKey);

      let parsed = parseJsonSafely<ChatConversation>(decrypted || '');
      if (!parsed && chatItem.metadata) {
        parsed = chatItem.metadata as any;
      }
      const conversation = toConversation(parsed) || {
        participants: [username],
        disappearingTimer: 'off',
        messages: [],
        updatedAt: Date.now(),
      };

      return conversation;
    },
    [masterKey, username],
  );

  const loadChatById = useCallback(
    async (chatId: string) => {
      if (chatPayloads[chatId] || loadingChatIds.has(chatId)) return;

      const chatItem = chatItemById.get(chatId);
      if (!chatItem) return;

      setLoadingChatIds((previous) => {
        const next = new Set(previous);
        next.add(chatId);
        return next;
      });

      try {
        const conversation = await loadConversationForChat(chatItem);
        setChatPayloads((previous) => ({
          ...previous,
          [chatId]: conversation,
        }));
        markChatLoadSucceeded(chatId);
      } catch (error) {
        markChatLoadFailed(chatId, error, 'Failed to load this chat conversation');
      } finally {
        setLoadingChatIds((previous) => {
          if (!previous.has(chatId)) return previous;
          const next = new Set(previous);
          next.delete(chatId);
          return next;
        });
      }
    },
    [
      chatItemById,
      chatPayloads,
      loadConversationForChat,
      loadingChatIds,
      markChatLoadFailed,
      markChatLoadSucceeded,
    ],
  );

  const loadNextChatBatch = useCallback(async () => {
    if ((!masterKey && !useVaultStore.getState().isDecoyMode) || chatBatchInFlightRef.current)
      return;

    const unloadedIndex = chats.findIndex(
      (chatItem) => !chatPayloads[chatItem.id] && !failedChatIds.has(chatItem.id),
    );

    if (unloadedIndex === -1) {
      setHasMoreChatPayloads(false);
      return;
    }

    chatBatchCursorRef.current = unloadedIndex;
    const end = Math.min(unloadedIndex + CHAT_DECRYPT_BATCH_SIZE, chats.length);
    const chatBatch = chats
      .slice(unloadedIndex, end)
      .filter((chatItem) => !chatPayloads[chatItem.id] && !failedChatIds.has(chatItem.id));

    if (chatBatch.length === 0) {
      chatBatchCursorRef.current = end;
      const remainingUnloaded = chats.some((c) => !chatPayloads[c.id] && !failedChatIds.has(c.id));
      setHasMoreChatPayloads(remainingUnloaded);
      return;
    }

    const payloadEntries: Array<[string, ChatConversation]> = [];

    chatBatchInFlightRef.current = true;
    setIsLoadingChatBatch(true);

    try {
      await Promise.all(
        chatBatch.map(async (chatItem) => {
          try {
            const conversation = await loadConversationForChat(chatItem);
            payloadEntries.push([chatItem.id, conversation]);
            markChatLoadSucceeded(chatItem.id);
          } catch (error) {
            markChatLoadFailed(chatItem.id, error, 'Failed to load this chat conversation');
          }
        }),
      );

      setChatPayloads((previous) => ({
        ...previous,
        ...Object.fromEntries(payloadEntries),
      }));
      chatBatchCursorRef.current = end;
      const remainingUnloaded = chats.some(
        (c) =>
          !payloadEntries.some(([id]) => id === c.id) &&
          !chatPayloads[c.id] &&
          !failedChatIds.has(c.id),
      );
      setHasMoreChatPayloads(remainingUnloaded);
    } finally {
      chatBatchInFlightRef.current = false;
      setIsLoadingChatBatch(false);
    }
  }, [
    chatPayloads,
    chats,
    failedChatIds,
    loadConversationForChat,
    markChatLoadFailed,
    markChatLoadSucceeded,
    masterKey,
  ]);

  useEffect(() => {
    if (!masterKey) {
      setHasMoreChatPayloads(false);
      setIsLoadingChatBatch(false);
      return;
    }

    const currentChatIds = new Set(chats.map((c) => c.id));
    setChatPayloads((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const id of Object.keys(next)) {
        if (!currentChatIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : previous;
    });

    const hasUnloaded = chats.some((c) => !chatPayloads[c.id] && !failedChatIds.has(c.id));
    setHasMoreChatPayloads(hasUnloaded);

    if (hasUnloaded && !chatBatchInFlightRef.current) {
      void loadNextChatBatch();
    }
  }, [chats, masterKey]);

  const filteredChats = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filtered = chats.filter((chatItem) => {
      const chatTitle = chatItem.title?.toLowerCase() || '';
      const matchesSearch = normalizedSearch.length === 0 || chatTitle.includes(normalizedSearch);
      const matchesFolder = currentFolder === null ? true : chatItem.folder === currentFolder;
      return matchesSearch && matchesFolder;
    });
    return sortPinnedFirst(filtered);
  }, [chats, currentFolder, searchQuery]);

  useEffect(() => {
    setVisibleChatCount(CHAT_LIST_PAGE_SIZE);
  }, [currentFolder, searchQuery]);

  const visibleChats = useMemo(
    () => filteredChats.slice(0, visibleChatCount),
    [filteredChats, visibleChatCount],
  );

  const hasMoreVisibleChats = visibleChatCount < filteredChats.length;

  const handleLoadMoreVisibleChats = useCallback(() => {
    setVisibleChatCount((previous) =>
      Math.min(previous + CHAT_LIST_PAGE_SIZE, filteredChats.length),
    );
  }, [filteredChats.length]);

  const activeChatItem = useMemo(
    () => (activeChatId ? chatItemById.get(activeChatId) || null : null),
    [activeChatId, chatItemById],
  );

  const activeConversation = useMemo(
    () => (activeChatId ? chatPayloads[activeChatId] || null : null),
    [activeChatId, chatPayloads],
  );

  useEffect(() => {
    if (!masterKey || !hasMoreChatPayloads || isLoadingChatBatch) return;

    const hasMissingPayload = visibleChats.some(
      (chatItem) => !chatPayloads[chatItem.id] && !failedChatIds.has(chatItem.id),
    );
    if (!hasMissingPayload) return;

    void loadNextChatBatch();
  }, [
    chatPayloads,
    failedChatIds,
    hasMoreChatPayloads,
    isLoadingChatBatch,
    loadNextChatBatch,
    masterKey,
    visibleChats,
  ]);

  const activeVisibleMessages = useMemo(() => {
    if (!activeConversation) return [];
    const now = Date.now();
    return activeConversation.messages.filter((message) => !isExpiredMessage(message, now));
  }, [activeConversation]);

  const activeThreadedMessages = useMemo(() => {
    const rootMessages = activeVisibleMessages.filter((message) => !message.parentMessageId);
    const repliesByParentId = new Map<string, ChatMessage[]>();

    for (const message of activeVisibleMessages) {
      if (!message.parentMessageId) continue;
      const existing = repliesByParentId.get(message.parentMessageId) || [];
      existing.push(message);
      repliesByParentId.set(message.parentMessageId, existing);
    }

    for (const entries of repliesByParentId.values()) {
      entries.sort((a, b) => a.createdAt - b.createdAt);
    }

    return { rootMessages, repliesByParentId };
  }, [activeVisibleMessages]);

  const activeAttachments = useMemo(() => {
    const deduped = new Map<string, ChatAttachment>();

    for (const message of activeVisibleMessages) {
      const messageAttachments = Array.isArray(message.attachments) ? message.attachments : [];

      const detectedFromText = extractAttachmentsFromText(message.text);
      const combined = [...messageAttachments, ...detectedFromText];

      for (const attachment of combined) {
        const key = `${attachment.type}:${attachment.url}`;
        if (!deduped.has(key)) {
          deduped.set(key, attachment);
        }
      }
    }

    return Array.from(deduped.values());
  }, [activeVisibleMessages]);

  const lastMessagesByChatId = useMemo(() => {
    const now = Date.now();
    const map: Record<string, ChatMessage | null> = {};
    for (const chatItem of chats) {
      const conversation = chatPayloads[chatItem.id];
      if (!conversation) {
        map[chatItem.id] = null;
        continue;
      }
      const latest = conversation.messages.reduce<ChatMessage | null>((currentLatest, message) => {
        if (isExpiredMessage(message, now)) return currentLatest;
        if (!currentLatest || message.createdAt > currentLatest.createdAt) {
          return message;
        }
        return currentLatest;
      }, null);
      map[chatItem.id] = latest || null;
    }
    return map;
  }, [chatPayloads, chats]);

  useEffect(() => {
    if (!activeChatId) return;
    if (chatItemById.has(activeChatId)) return;

    setActiveChatId(null);
    setReplyTargetId(null);
    setDetailTab('messages');
  }, [activeChatId, chatItemById]);

  useEffect(() => {
    if (!masterKey) return;
    const now = Date.now();
    for (const chatItem of chats) {
      const conversation = chatPayloads[chatItem.id];
      if (!conversation || expiringCleanupInFlight.current.has(chatItem.id)) {
        continue;
      }

      const hasExpired = conversation.messages.some((message) => isExpiredMessage(message, now));
      if (!hasExpired) continue;

      const cleanedConversation: ChatConversation = {
        ...conversation,
        messages: conversation.messages.filter((message) => !isExpiredMessage(message, now)),
        updatedAt: Date.now(),
      };

      expiringCleanupInFlight.current.add(chatItem.id);
      void persistConversation(chatItem, cleanedConversation)
        .catch((error) => {
          logger.warn('Failed to remove expired chat messages', {
            chatId: chatItem.id,
            error,
          });
        })
        .finally(() => {
          expiringCleanupInFlight.current.delete(chatItem.id);
        });
    }
  }, [chatPayloads, chats, masterKey, persistConversation]);

  const handleCreateChat = useCallback(async () => {
    const title = newChatTitle.trim();
    if (!title) {
      toast.error('Enter a chat name');
      return;
    }
    if (!masterKey && !useVaultStore.getState().isDecoyMode) {
      toast.error('Unlock the vault before creating chats');
      return;
    }
    if (isCreatingChat) {
      return;
    }

    const seedConversation: ChatConversation = {
      participants: [username],
      disappearingTimer: 'off',
      messages: [],
      updatedAt: Date.now(),
    };

    setIsCreatingChat(true);
    try {
      const encryptedContent = await encryptData(JSON.stringify(seedConversation), masterKey);
      const createdItem = await addItem({
        type: 'chat',
        title,
        content: encryptedContent,
        folder: currentFolder || undefined,
      });
      setChatPayloads((previous) => ({
        ...previous,
        [createdItem.id]: seedConversation,
      }));
      setSearchQuery('');
      setActiveChatId(createdItem.id);
      setNewChatTitle('');
      toast.success('Chat created');
      logActivity({
        actionType: 'item_create',
        itemName: title,
        description: 'Chat conversation created',
        status: 'success',
      });
    } catch (error) {
      logger.error('Failed to create chat conversation', {
        error,
        title,
      });
      toast.error(getErrorMessage(error, 'Failed to create chat'));
    } finally {
      setIsCreatingChat(false);
    }
  }, [addItem, currentFolder, isCreatingChat, masterKey, newChatTitle, username]);

  const handleDeleteChat = useCallback(
    async (chatItem: VaultItem) => {
      const shouldDelete =
        typeof window === 'undefined' ? true : window.confirm(`Delete chat "${chatItem.title}"?`);
      if (!shouldDelete) return;

      try {
        await removeItem(chatItem.id);
        setChatPayloads((previous) => {
          const next = { ...previous };
          delete next[chatItem.id];
          return next;
        });
        setFailedChatIds((previous) => {
          if (!previous.has(chatItem.id)) return previous;
          const next = new Set(previous);
          next.delete(chatItem.id);
          return next;
        });
        setChatLoadErrors((previous) => {
          if (!previous[chatItem.id]) return previous;
          const next = { ...previous };
          delete next[chatItem.id];
          return next;
        });
        setActiveChatId((previous) => (previous === chatItem.id ? null : previous));
        toast.success('Chat deleted');
      } catch (error) {
        logger.error('Failed to delete chat', {
          chatId: chatItem.id,
          error,
        });
        toast.error(getErrorMessage(error, 'Failed to delete chat'));
      }
    },
    [removeItem],
  );

  const handleTogglePin = useCallback(
    async (chatItemId: string) => {
      try {
        await togglePin(chatItemId);
      } catch (error) {
        logger.warn('Failed to toggle chat pin', {
          chatId: chatItemId,
          error,
        });
      }
    },
    [togglePin],
  );

  const handleSendMessage = useCallback(async () => {
    if (!activeChatItem || !activeConversation) {
      toast.error('Select a chat first');
      return;
    }
    if (isSendingMessage) return;

    const text = draftMessage.trim();
    if (!text) return;
    if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
      toast.error(`Message must be ${CHAT_MESSAGE_MAX_LENGTH} characters or less`);
      return;
    }
    if (
      replyTargetId &&
      !activeConversation.messages.some((message) => message.id === replyTargetId)
    ) {
      setReplyTargetId(null);
      toast.error('The message you were replying to is no longer available');
      return;
    }

    const mentions = extractMentions(text);
    const attachments = extractAttachmentsFromText(text);
    const expiryWindow = resolveMessageLifetime(activeConversation.disappearingTimer);
    const now = Date.now();

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: username,
      text,
      createdAt: now,
      status: 'sending',
      mentions,
      reactions: {},
      attachments,
      readBy: [username],
      parentMessageId: replyTargetId || undefined,
      expiresAt: expiryWindow ? now + expiryWindow : null,
    };

    const nextConversation: ChatConversation = {
      ...activeConversation,
      messages: [...activeConversation.messages, message],
      updatedAt: now,
    };

    const sentConversation: ChatConversation = {
      ...nextConversation,
      messages: nextConversation.messages.map((entry) =>
        entry.id === message.id ? { ...entry, status: 'sent' } : entry,
      ),
    };

    setIsSendingMessage(true);
    setChatPayloads((previous) => ({
      ...previous,
      [activeChatItem.id]: nextConversation,
    }));
    setDraftMessage('');
    setReplyTargetId(null);

    try {
      await persistConversation(activeChatItem, sentConversation);
      logActivity({
        actionType: 'item_update',
        itemName: activeChatItem.title,
        description: 'Sent chat message',
        status: 'success',
      });
    } catch (error) {
      setChatPayloads((previous) => {
        const currentConversation = previous[activeChatItem.id];
        if (!currentConversation) return previous;

        return {
          ...previous,
          [activeChatItem.id]: {
            ...currentConversation,
            messages: currentConversation.messages.map((entry) =>
              entry.id === message.id ? { ...entry, status: 'failed' } : entry,
            ),
          },
        };
      });
      logger.error('Failed to send chat message', {
        chatId: activeChatItem.id,
        error,
      });
      toast.error(getErrorMessage(error, 'Failed to send message'));
    } finally {
      setIsSendingMessage(false);
    }
  }, [
    activeChatItem,
    activeConversation,
    draftMessage,
    isSendingMessage,
    persistConversation,
    replyTargetId,
    username,
  ]);

  const handleUpdateDisappearingTimer = useCallback(
    async (timer: DisappearingTimer) => {
      if (!activeChatItem || !activeConversation) return;
      if (activeConversation.disappearingTimer === timer) return;

      try {
        await persistConversation(activeChatItem, {
          ...activeConversation,
          disappearingTimer: timer,
          updatedAt: Date.now(),
        });
      } catch (error) {
        logger.error('Failed to update chat disappearing timer', {
          chatId: activeChatItem.id,
          timer,
          error,
        });
        toast.error(getErrorMessage(error, 'Failed to update timer'));
      }
    },
    [activeChatItem, activeConversation, persistConversation],
  );

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!activeChatItem || !activeConversation) return;
      if (busyMessageId) return;
      if (!activeConversation.messages.some((message) => message.id === messageId)) {
        toast.error('Message no longer exists');
        return;
      }
      setBusyMessageId(messageId);
      const previousConversation = activeConversation;

      const nextConversation: ChatConversation = {
        ...activeConversation,
        messages: activeConversation.messages.map((message) => {
          if (message.id !== messageId) return message;
          const existingUsers = message.reactions[emoji] || [];
          const hasReacted = existingUsers.includes(username);
          const nextUsers = hasReacted
            ? existingUsers.filter((entry) => entry !== username)
            : [...existingUsers, username];
          const nextReactions = {
            ...message.reactions,
            [emoji]: nextUsers,
          };
          if (nextUsers.length === 0) {
            delete nextReactions[emoji];
          }
          return { ...message, reactions: nextReactions };
        }),
        updatedAt: Date.now(),
      };

      setChatPayloads((previous) => ({
        ...previous,
        [activeChatItem.id]: nextConversation,
      }));

      try {
        await persistConversation(activeChatItem, nextConversation);
      } catch (error) {
        setChatPayloads((previous) => ({
          ...previous,
          [activeChatItem.id]: previousConversation,
        }));
        logger.error('Failed to update chat reaction', {
          chatId: activeChatItem.id,
          messageId,
          error,
        });
        toast.error(getErrorMessage(error, 'Failed to update reaction'));
      } finally {
        setBusyMessageId(null);
      }
    },
    [activeChatItem, activeConversation, busyMessageId, persistConversation, username],
  );

  const attachmentList = useMemo(() => {
    if (detailTab === 'messages') return [];

    const deduped = new Map<string, ChatAttachment>();
    for (const attachment of activeAttachments) {
      const safeHref = getSafeExternalHref(attachment.url);
      if (!safeHref) continue;

      const existing = deduped.get(safeHref);
      if (!existing || existing.createdAt < attachment.createdAt) {
        deduped.set(safeHref, {
          ...attachment,
          url: safeHref,
        });
      }
    }

    return Array.from(deduped.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [activeAttachments, detailTab]);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setActiveChatId(chatId);
      setDetailTab('messages');
      setReplyTargetId(null);

      void loadChatById(chatId);
    },
    [loadChatById],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full gap-3 overflow-hidden p-3 sm:p-4 lg:gap-4 lg:p-4 xl:gap-6 xl:p-8">
      <FolderSidebar
        items={chats}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleCreateFolder={handleCreateFolder}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        handleMoveToFolder={handleMoveToFolder}
        title="Chat folders"
        allItemLabel="All Chats"
        allItemIcon={<MessageSquareText className="h-4 w-4" />}
      />

      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden transition-colors">
        <MobileFolderMenu
          isOpen={isMobileFolderMenuOpen}
          onClose={() => setIsMobileFolderMenuOpen(false)}
          items={chats}
          folders={folders}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
          isAddingFolder={isAddingFolder}
          setIsAddingFolder={setIsAddingFolder}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          handleCreateFolder={handleCreateFolder}
          editingFolder={editingFolder}
          setEditingFolder={setEditingFolder}
          editingFolderName={editingFolderName}
          setEditingFolderName={setEditingFolderName}
          handleRenameFolder={handleRenameFolder}
          handleDeleteFolder={handleDeleteFolder}
          title="Chat folders"
          allItemLabel="All Chats"
          allItemIcon={<MessageSquareText className="h-4 w-4" />}
        />

        <ChatListPanel
          activeChatId={activeChatId}
          filteredChats={visibleChats}
          totalFilteredChats={filteredChats.length}
          lastMessagesByChatId={lastMessagesByChatId}
          pinningItemIds={pinningItemIds}
          searchQuery={searchQuery}
          newChatTitle={newChatTitle}
          isCreatingChat={isCreatingChat}
          hasMoreChats={hasMoreVisibleChats}
          isLoadingMoreChats={isLoadingChatBatch}
          onOpenFolders={() => setIsMobileFolderMenuOpen(true)}
          onSearchQueryChange={setSearchQuery}
          onNewChatTitleChange={setNewChatTitle}
          onCreateChat={handleCreateChat}
          onLoadMoreChats={handleLoadMoreVisibleChats}
          onSelectChat={handleSelectChat}
          onTogglePin={handleTogglePin}
          onDeleteChat={handleDeleteChat}
          onChatDragStart={(event, chatId) => {
            setDraggedVaultItem(event, chatId);
          }}
        />

        <ChatConversationPanel
          activeChatId={activeChatId}
          activeChatItem={activeChatItem}
          activeConversation={activeConversation}
          activeVisibleMessages={activeVisibleMessages}
          activeThreadedMessages={activeThreadedMessages}
          detailTab={detailTab}
          attachmentList={attachmentList}
          replyTargetId={replyTargetId}
          draftMessage={draftMessage}
          busyMessageId={busyMessageId}
          isSendingMessage={isSendingMessage}
          isLoadingActiveChat={activeChatId ? loadingChatIds.has(activeChatId) : false}
          username={username}
          failedChatIds={failedChatIds}
          chatLoadErrors={chatLoadErrors}
          messagesEndRef={messagesEndRef}
          onBackToList={() => {
            setActiveChatId(null);
            setReplyTargetId(null);
          }}
          onDetailTabChange={setDetailTab}
          onDisappearingTimerChange={handleUpdateDisappearingTimer}
          onReplyTargetChange={setReplyTargetId}
          onDraftMessageChange={setDraftMessage}
          onRetryLoadChat={() => {
            if (activeChatId) {
              void loadChatById(activeChatId);
            }
          }}
          onSendMessage={handleSendMessage}
          onToggleReaction={handleToggleReaction}
        />
      </div>
    </div>
  );
};
