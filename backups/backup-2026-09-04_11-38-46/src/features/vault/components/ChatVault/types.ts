// ===============================
// Chat Types & Constants
// ===============================

const DAY_MS = 24 * 60 * 60 * 1000;

// ===============================
// Timer Options
// ===============================

export const TIMER_OPTIONS = [
  {
    value: 'off',
    label: 'Off',
    durationMs: null,
  },
  {
    value: '24h',
    label: '24 Hours',
    durationMs: 1 * DAY_MS,
  },
  {
    value: '7d',
    label: '7 Days',
    durationMs: 7 * DAY_MS,
  },
  {
    value: '30d',
    label: '30 Days',
    durationMs: 30 * DAY_MS,
  },
  {
    value: '60d',
    label: '60 Days',
    durationMs: 60 * DAY_MS,
  },
  {
    value: '90d',
    label: '90 Days',
    durationMs: 90 * DAY_MS,
  },
  {
    value: '180d',
    label: '180 Days',
    durationMs: 180 * DAY_MS,
  },
  {
    value: '365d',
    label: '1 Year',
    durationMs: 365 * DAY_MS,
  },
  {
    value: '730d',
    label: '2 Years',
    durationMs: 730 * DAY_MS,
  },
  {
    value: '1095d',
    label: '3 Years',
    durationMs: 1095 * DAY_MS,
  },
  {
    value: '1825d',
    label: '5 Years',
    durationMs: 1825 * DAY_MS,
  },
  {
    value: '3650d',
    label: '10 Years',
    durationMs: 3650 * DAY_MS,
  },
  {
    value: '7300d',
    label: '20 Years',
    durationMs: 7300 * DAY_MS,
  },
  {
    value: '10950d',
    label: '30 Years',
    durationMs: 10950 * DAY_MS,
  },
] as const;

// ===============================
// Derived Types
// ===============================

export type DisappearingTimer = (typeof TIMER_OPTIONS)[number]['value'];

export type ChatListFilter = 'all';

export type ChatDetailTab = 'messages' | 'links';

export type AttachmentType = 'media' | 'link' | 'doc';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';

export type ConversationType = 'direct' | 'group';

// ===============================
// Attachments
// ===============================

export interface ChatAttachment {
  id: string;
  type: AttachmentType;
  label: string;
  url: string;
  sizeBytes?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  createdAt: number;
}

// ===============================
// Reactions
// ===============================

export interface MessageReaction {
  emoji: string;
  users: string[];
}

// ===============================
// Message Mentions
// ===============================

export interface MessageMention {
  userId: string;
  username?: string;
}

// ===============================
// Chat Message
// ===============================

export interface ChatMessage {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  createdAt: number;
  updatedAt?: number;
  editedAt?: number;
  deletedAt?: number;
  expiresAt?: number | null;
  status?: MessageStatus;
  mentions: string[];
  mentionDetails?: MessageMention[];
  reactions: Record<string, string[]>;
  reactionDetails?: MessageReaction[];
  attachments: ChatAttachment[];
  readBy: string[];
  bookmarkedBy?: string[];
  parentMessageId?: string;
  forwardedFromMessageId?: string;
  forwardedFromUserId?: string;
  isEncrypted?: boolean;
}

// ===============================
// Conversation Settings
// ===============================

export interface ConversationSettings {
  disappearingTimer: DisappearingTimer;
  muteNotifications?: boolean;
  allowMemberAdd?: boolean;
  allowMediaSharing?: boolean;
  encrypted?: boolean;
}

// ===============================
// Last Message Preview
// ===============================

export interface ConversationPreview {
  messageId: string;
  senderId: string;
  text: string;
  createdAt: number;
}

// ===============================
// Chat Conversation
// ===============================

export interface ChatConversation {
  id?: string;
  type?: ConversationType;
  title?: string;
  description?: string;
  avatarUrl?: string;
  participantIds?: string[];
  participants: string[];
  adminIds?: string[];
  messages: ChatMessage[];
  typingUserIds?: string[];
  pinnedMessageIds?: string[];
  archivedBy?: string[];
  blockedUserIds?: string[];
  settings?: ConversationSettings;
  disappearingTimer: DisappearingTimer;
  lastMessage?: ConversationPreview;
  createdAt?: number;
  updatedAt: number;
}

// ===============================
// Quick Reactions
// ===============================

export const QUICK_REACTIONS = [
  '\u{1F44D}', // 👍
  '\u2764\uFE0F', // ❤️
  '\u{1F602}', // 😂
  '\u{1F62E}', // 😮
  '\u{1F622}', // 😢
] as const;

export type QuickReaction = (typeof QUICK_REACTIONS)[number];

// ===============================
// Utility Helpers
// ===============================

export const getTimerDuration = (timer: DisappearingTimer): number | null => {
  const option = TIMER_OPTIONS.find((item) => item.value === timer);
  return option?.durationMs ?? null;
};

export const createExpiresAt = (timer: DisappearingTimer): number | null => {
  const duration = getTimerDuration(timer);
  if (!duration) {
    return null;
  }
  return Date.now() + duration;
};

// ===============================
// Example Empty Conversation
// ===============================

export const EMPTY_CONVERSATION: ChatConversation = {
  id: crypto.randomUUID(),
  type: 'direct',
  participantIds: [],
  participants: [],
  messages: [],
  settings: {
    disappearingTimer: 'off',
    encrypted: false,
  },
  disappearingTimer: 'off',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
