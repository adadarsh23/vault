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
  '\u{1F600}', // 😀
  '\u{1F601}', // 😁
  '\u{1F602}', // 😂
  '\u{1F923}', // 🤣
  '\u{1F603}', // 😃
  '\u{1F604}', // 😄
  '\u{1F605}', // 😅
  '\u{1F60A}', // 😊
  '\u{1F642}', // 🙂
  '\u{1F609}', // 😉
  '\u{1F60D}', // 😍
  '\u{1F970}', // 🥰
  '\u{1F618}', // 😘
  '\u{1F60E}', // 😎
  '\u{1F914}', // 🤔
  '\u{1F928}', // 🤨
  '\u{1F610}', // 😐
  '\u{1F644}', // 🙄
  '\u{1F62E}', // 😮
  '\u{1F632}', // 😲
  '\u{1F631}', // 😱
  '\u{1F622}', // 😢
  '\u{1F62D}', // 😭
  '\u{1F624}', // 😤
  '\u{1F621}', // 😡
  '\u{1F92F}', // 🤯
  '\u{1FAE0}', // 🫠
  '\u{1FAE1}', // 🫡

  '\u{1F44D}', // 👍
  '\u{1F44E}', // 👎
  '\u{1F44C}', // 👌
  '\u270C\uFE0F', // ✌️
  '\u{1F91E}', // 🤞
  '\u{1F91F}', // 🤟
  '\u{1F918}', // 🤘
  '\u{1F44F}', // 👏
  '\u{1F64C}', // 🙌
  '\u{1F64F}', // 🙏
  '\u{1F4AA}', // 💪
  '\u{1F91D}', // 🤝
  '\u{1F440}', // 👀

  '\u2764\uFE0F', // ❤️
  '\u{1F9E1}', // 🧡
  '\u{1F49B}', // 💛
  '\u{1F49A}', // 💚
  '\u{1F499}', // 💙
  '\u{1F49C}', // 💜
  '\u{1F5A4}', // 🖤
  '\u{1F90D}', // 🤍
  '\u{1F90E}', // 🤎
  '\u{1F496}', // 💖
  '\u{1F495}', // 💕
  '\u{1F4AF}', // 💯

  '\u{1F525}', // 🔥
  '\u2728', // ✨
  '\u2B50', // ⭐
  '\u{1F31F}', // 🌟
  '\u26A1', // ⚡
  '\u{1F680}', // 🚀
  '\u{1F389}', // 🎉
  '\u{1F38A}', // 🎊
  '\u{1F388}', // 🎈
  '\u{1F3C6}', // 🏆

  '\u2705', // ✅
  '\u2714\uFE0F', // ✔️
  '\u274C', // ❌
  '\u26A0\uFE0F', // ⚠️
  '\u2753', // ❓

  '\u{1F4A5}', // 💥
  '\u{1F3AF}', // 🎯
  '\u{1F48E}', // 💎
  '\u{1F451}', // 👑

  '\u{1F973}', // 🥳
  '\u{1F929}', // 🤩
  '\u{1F917}', // 🤗
  '\u{1F607}', // 😇
  '\u{1FAF6}', // 🫶
  '\u{1F972}', // 🥲
  '\u{1F634}', // 😴
  '\u{1F924}', // 🤤

  '\u{1F355}', // 🍕
  '\u2615', // ☕
  '\u{1F37B}', // 🍻
  '\u{1F3B5}', // 🎵
  '\u{1F3AE}', // 🎮
  '\u{1F410}', // 🐐
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
