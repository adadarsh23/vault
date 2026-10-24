import type { ReactNode } from 'react';
import { cn } from '../../../../lib/utils';
import {
  AttachmentType,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  DisappearingTimer,
  getTimerDuration,
} from './types';

const URL_PATTERN =
  /\b((?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>"']*)?)/gi;
const MENTION_PATTERN = /@([a-zA-Z0-9._-]+)/g;
const ATTACHMENT_TYPES: AttachmentType[] = ['media', 'link', 'doc'];
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.;!?]+$/g;
const TIMER_VALUES = new Set<DisappearingTimer>([
  'off',
  '24h',
  '7d',
  '30d',
  '60d',
  '90d',
  '180d',
  '365d',
  '730d',
  '1095d',
  '1825d',
  '3650d',
  '7300d',
  '10950d',
]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const toAttachmentType = (value: unknown): AttachmentType =>
  ATTACHMENT_TYPES.includes(value as AttachmentType) ? (value as AttachmentType) : 'link';

const splitUrlToken = (token: string): { sanitizedUrl: string; trailingText: string } => {
  const sanitizedUrl = token.replace(TRAILING_URL_PUNCTUATION_PATTERN, '');
  const trailingText = token.slice(sanitizedUrl.length);
  return { sanitizedUrl, trailingText };
};

const toSafeExternalHref = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasExplicitProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasExplicitProtocol && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
};

export const getSafeExternalHref = (value: string): string | null => toSafeExternalHref(value);

const normalizeTimer = (value: unknown): DisappearingTimer => {
  if (typeof value === 'string' && TIMER_VALUES.has(value as DisappearingTimer)) {
    return value as DisappearingTimer;
  }
  return 'off';
};

export const toConversation = (value: unknown): ChatConversation | null => {
  const parsed = value as Partial<ChatConversation> | null;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
    return null;
  }

  const participants = Array.isArray(parsed.participants)
    ? parsed.participants.filter((entry): entry is string => typeof entry === 'string')
    : Array.isArray(parsed.participantIds)
      ? parsed.participantIds.filter((entry): entry is string => typeof entry === 'string')
      : [];

  const timerValue = parsed.disappearingTimer ?? parsed.settings?.disappearingTimer;
  const disappearingTimer = normalizeTimer(timerValue);
  const fallbackNow = Date.now();

  const rawMessages = parsed.messages as unknown[];
  const messages: ChatMessage[] = rawMessages
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => {
      const typedEntry = entry as Partial<ChatMessage>;
      return {
        id: typeof typedEntry.id === 'string' ? typedEntry.id : crypto.randomUUID(),
        sender: typeof typedEntry.sender === 'string' ? typedEntry.sender : 'Unknown',
        senderId: typeof typedEntry.senderId === 'string' ? typedEntry.senderId : undefined,
        text: typeof typedEntry.text === 'string' ? typedEntry.text : '',
        createdAt: isFiniteNumber(typedEntry.createdAt) ? typedEntry.createdAt : fallbackNow,
        updatedAt: isFiniteNumber(typedEntry.updatedAt) ? typedEntry.updatedAt : undefined,
        editedAt: isFiniteNumber(typedEntry.editedAt) ? typedEntry.editedAt : undefined,
        deletedAt: isFiniteNumber(typedEntry.deletedAt) ? typedEntry.deletedAt : undefined,
        status:
          typedEntry.status === 'sending' ||
          typedEntry.status === 'sent' ||
          typedEntry.status === 'delivered' ||
          typedEntry.status === 'seen' ||
          typedEntry.status === 'failed'
            ? typedEntry.status
            : undefined,
        mentions: Array.isArray(typedEntry.mentions)
          ? typedEntry.mentions.filter((mention): mention is string => typeof mention === 'string')
          : [],
        mentionDetails: Array.isArray(typedEntry.mentionDetails)
          ? typedEntry.mentionDetails
              .filter(
                (mention): mention is { userId: string; username?: string } =>
                  !!mention &&
                  typeof mention === 'object' &&
                  typeof mention.userId === 'string' &&
                  (mention.username === undefined || typeof mention.username === 'string'),
              )
              .map((mention) => ({
                userId: mention.userId,
                username: mention.username,
              }))
          : undefined,
        reactions:
          typedEntry.reactions && typeof typedEntry.reactions === 'object'
            ? Object.fromEntries(
                Object.entries(typedEntry.reactions).map(([emoji, users]) => [
                  emoji,
                  toStringArray(users),
                ]),
              )
            : {},
        reactionDetails: Array.isArray(typedEntry.reactionDetails)
          ? typedEntry.reactionDetails
              .filter(
                (reaction): reaction is { emoji: string; users: string[] } =>
                  !!reaction &&
                  typeof reaction === 'object' &&
                  typeof reaction.emoji === 'string' &&
                  Array.isArray(reaction.users),
              )
              .map((reaction) => ({
                emoji: reaction.emoji,
                users: reaction.users.filter((user): user is string => typeof user === 'string'),
              }))
          : undefined,
        attachments: Array.isArray(typedEntry.attachments)
          ? typedEntry.attachments
              .filter(
                (attachment): attachment is ChatAttachment =>
                  !!attachment &&
                  typeof attachment === 'object' &&
                  isString(attachment.id) &&
                  isString(attachment.type) &&
                  isString(attachment.label) &&
                  isString(attachment.url),
              )
              .map((attachment) => ({
                ...attachment,
                type: toAttachmentType(attachment.type),
                sizeBytes: isFiniteNumber(attachment.sizeBytes) ? attachment.sizeBytes : undefined,
                mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : undefined,
                thumbnailUrl:
                  typeof attachment.thumbnailUrl === 'string' ? attachment.thumbnailUrl : undefined,
                createdAt: isFiniteNumber(attachment.createdAt)
                  ? attachment.createdAt
                  : fallbackNow,
              }))
          : [],
        readBy: toStringArray(typedEntry.readBy),
        bookmarkedBy: toStringArray(typedEntry.bookmarkedBy),
        parentMessageId:
          typeof typedEntry.parentMessageId === 'string' ? typedEntry.parentMessageId : undefined,
        forwardedFromMessageId:
          typeof typedEntry.forwardedFromMessageId === 'string'
            ? typedEntry.forwardedFromMessageId
            : undefined,
        forwardedFromUserId:
          typeof typedEntry.forwardedFromUserId === 'string'
            ? typedEntry.forwardedFromUserId
            : undefined,
        isEncrypted:
          typeof typedEntry.isEncrypted === 'boolean' ? typedEntry.isEncrypted : undefined,
        expiresAt:
          typedEntry.expiresAt === null
            ? null
            : isFiniteNumber(typedEntry.expiresAt)
              ? typedEntry.expiresAt
              : undefined,
      };
    });

  return {
    id: typeof parsed.id === 'string' ? parsed.id : undefined,
    type: parsed.type === 'group' || parsed.type === 'direct' ? parsed.type : undefined,
    title: typeof parsed.title === 'string' ? parsed.title : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
    participantIds:
      Array.isArray(parsed.participantIds) &&
      parsed.participantIds.every((entry) => typeof entry === 'string')
        ? parsed.participantIds
        : undefined,
    participants,
    adminIds:
      Array.isArray(parsed.adminIds) && parsed.adminIds.every((entry) => typeof entry === 'string')
        ? parsed.adminIds
        : undefined,
    disappearingTimer,
    settings: {
      disappearingTimer,
      muteNotifications:
        typeof parsed.settings?.muteNotifications === 'boolean'
          ? parsed.settings.muteNotifications
          : undefined,
      allowMemberAdd:
        typeof parsed.settings?.allowMemberAdd === 'boolean'
          ? parsed.settings.allowMemberAdd
          : undefined,
      allowMediaSharing:
        typeof parsed.settings?.allowMediaSharing === 'boolean'
          ? parsed.settings.allowMediaSharing
          : undefined,
      encrypted:
        typeof parsed.settings?.encrypted === 'boolean' ? parsed.settings.encrypted : undefined,
    },
    messages,
    updatedAt: isFiniteNumber(parsed.updatedAt) ? parsed.updatedAt : fallbackNow,
    createdAt: isFiniteNumber(parsed.createdAt) ? parsed.createdAt : fallbackNow,
  };
};

export const resolveMessageLifetime = (timer: DisappearingTimer): number | null =>
  getTimerDuration(timer);

const classifyAttachmentType = (url: string): ChatAttachment['type'] => {
  const lower = url.toLowerCase();
  if (
    /\.(png|jpe?g|gif|webp|svg|mp4|mov|avi|m4v|webm)$/i.test(lower) ||
    lower.includes('image') ||
    lower.includes('video')
  ) {
    return 'media';
  }
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md)$/i.test(lower)) {
    return 'doc';
  }
  return 'link';
};

const createStableAttachmentId = (type: ChatAttachment['type'], safeHref: string): string => {
  let hash = 0;
  for (let index = 0; index < safeHref.length; index += 1) {
    hash = (hash * 31 + safeHref.charCodeAt(index)) >>> 0;
  }

  return `${type}-${hash.toString(36)}`;
};

export const extractAttachmentsFromText = (text: string): ChatAttachment[] => {
  const matches = Array.from(text.matchAll(URL_PATTERN));
  const uniqueLinks = new Map<string, string>();

  for (const match of matches) {
    const token = match[0];
    const { sanitizedUrl } = splitUrlToken(token);
    if (!sanitizedUrl) continue;
    const safeHref = toSafeExternalHref(sanitizedUrl);
    if (!safeHref || uniqueLinks.has(safeHref)) continue;
    uniqueLinks.set(safeHref, sanitizedUrl);
  }

  return Array.from(uniqueLinks.entries()).map(([safeHref, label]) => {
    const type = classifyAttachmentType(safeHref);
    return {
      id: createStableAttachmentId(type, safeHref),
      type,
      label,
      url: safeHref,
      createdAt: Date.now(),
    };
  });
};

export const extractMentions = (text: string): string[] => {
  const matches = text.matchAll(MENTION_PATTERN);
  return Array.from(new Set(Array.from(matches).map(([, username]) => username)));
};

export const isUserMentioned = (mentions: string[], username: string): boolean => {
  if (!Array.isArray(mentions) || mentions.length === 0) return false;
  const normUser = username.trim().toLowerCase();
  if (!normUser) return false;
  return mentions.some((mention) => {
    if (typeof mention !== 'string') return false;
    const normMention = mention.trim().toLowerCase();
    if (!normMention) return false;
    return (
      normMention === normUser ||
      normMention === 'all' ||
      normMention === 'everyone' ||
      normUser.includes(normMention) ||
      normMention.includes(normUser)
    );
  });
};

export const isExpiredMessage = (message: ChatMessage, now: number): boolean =>
  typeof message.expiresAt === 'number' && message.expiresAt <= now;

export const formatMessageTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatListTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

export const getAvatarLabel = (value: string): string => {
  const cleaned = value.trim();
  if (!cleaned) return 'C';
  return cleaned.charAt(0).toUpperCase();
};

export const renderMessageText = (
  text: string,
  isMine: boolean,
  sizeClass = 'text-sm',
  truncateLines?: number,
): ReactNode => {
  const parts: ReactNode[] = [];
  const matches = Array.from(text.matchAll(URL_PATTERN));
  let cursor = 0;

  matches.forEach((match, index) => {
    const token = match[0];
    const start = match.index ?? 0;
    const end = start + token.length;

    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }

    const { sanitizedUrl, trailingText } = splitUrlToken(token);

    const safeHref = toSafeExternalHref(sanitizedUrl);

    if (safeHref) {
      parts.push(
        <a
          key={`link-${index}-${start}`}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'underline decoration-dotted underline-offset-2 transition-colors',
            isMine
              ? 'text-fuchsia-400 hover:text-fuchsia-400'
              : 'text-fuchsia-400 hover:text-fuchsia-400',
          )}
        >
          {sanitizedUrl}
        </a>,
      );
    } else {
      parts.push(token);
    }

    if (trailingText) {
      parts.push(trailingText);
    }
    cursor = end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  if (parts.length === 0) {
    parts.push(text);
  }

  return (
    <span
      className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', sizeClass)}
      style={
        truncateLines && truncateLines > 0
          ? {
              display: '-webkit-box',
              WebkitLineClamp: truncateLines,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }
          : undefined
      }
    >
      {parts}
    </span>
  );
};
