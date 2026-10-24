// UI panels
export { ChatListPanel } from './ChatListPanel';
export { ChatConversationPanel } from './ChatConversationPanel';

// Types & constants
export {
  TIMER_OPTIONS,
  QUICK_REACTIONS,
  EMPTY_CONVERSATION,
  getTimerDuration,
  createExpiresAt,
} from './types';
export type {
  DisappearingTimer,
  ChatListFilter,
  ChatDetailTab,
  AttachmentType,
  MessageStatus,
  ConversationType,
  ChatAttachment,
  MessageReaction,
  MessageMention,
  ChatMessage,
  ConversationSettings,
  ConversationPreview,
  ChatConversation,
  QuickReaction,
} from './types';

// Chat helpers
export {
  toConversation,
  resolveMessageLifetime,
  extractAttachmentsFromText,
  extractMentions,
  isUserMentioned,
  isExpiredMessage,
  formatMessageTime,
  formatListTime,
  getAvatarLabel,
  getSafeExternalHref,
  renderMessageText,
} from './utils';
