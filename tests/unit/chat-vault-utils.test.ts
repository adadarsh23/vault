import { describe, expect, it } from 'vitest';
import {
  extractAttachmentsFromText,
  getSafeExternalHref,
  isUserMentioned,
  toConversation,
} from '../../src/features/vault/components/ChatVault/utils';

describe('chat vault utils', () => {
  it('normalizes legacy or malformed conversation payloads safely', () => {
    const normalized = toConversation({
      participants: ['Ada', 42, 'Grace'],
      disappearingTimer: 'forever',
      messages: [
        {
          id: 'message-1',
          sender: 'Ada',
          text: 'hello @Grace',
          createdAt: Number.NaN,
          mentions: ['Grace', 7],
          reactions: {
            thumbs: ['Grace', null],
          },
          attachments: [
            {
              id: 'attachment-1',
              type: 'unsafe-type',
              label: 'doc',
              url: 'https://example.com/doc.pdf',
              createdAt: Number.NaN,
            },
          ],
          readBy: ['Ada', false],
        },
        null,
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.participants).toEqual(['Ada', 'Grace']);
    expect(normalized?.disappearingTimer).toBe('off');
    expect(normalized?.messages).toHaveLength(1);
    expect(normalized?.messages[0]?.sender).toBe('Ada');
    expect(normalized?.messages[0]?.mentions).toEqual(['Grace']);
    expect(normalized?.messages[0]?.reactions).toEqual({ thumbs: ['Grace'] });
    expect(normalized?.messages[0]?.attachments[0]?.type).toBe('link');
    expect(normalized?.messages[0]?.readBy).toEqual(['Ada']);
  });

  it('rejects invalid conversation shapes', () => {
    expect(toConversation(null)).toBeNull();
    expect(toConversation({ messages: 'not-an-array' })).toBeNull();
  });

  it('deduplicates and stabilizes extracted links', () => {
    const first = extractAttachmentsFromText(
      'See example.com/docs, then https://example.com/docs.'
    );
    const second = extractAttachmentsFromText('Again: https://example.com/docs');

    expect(first).toHaveLength(1);
    expect(first[0]?.url).toBe('https://example.com/docs');
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it('only allows http and https external links', () => {
    expect(getSafeExternalHref('example.com')).toBe('https://example.com/');
    expect(getSafeExternalHref('https://example.com/path')).toBe('https://example.com/path');
    expect(getSafeExternalHref('ftp://example.com/file')).toBeNull();
  });

  it('correctly matches user mentions including case sensitivity, @all, and @everyone', () => {
    expect(isUserMentioned(['adarsh'], 'Adarsh')).toBe(true);
    expect(isUserMentioned(['all'], 'Alice')).toBe(true);
    expect(isUserMentioned(['everyone'], 'Bob')).toBe(true);
    expect(isUserMentioned(['adarsh23'], 'adarsh23')).toBe(true);
    expect(isUserMentioned(['john'], 'Jane')).toBe(false);
    expect(isUserMentioned([], 'Adarsh')).toBe(false);
  });
});
