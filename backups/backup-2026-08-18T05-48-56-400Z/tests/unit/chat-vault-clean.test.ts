import { describe, expect, it } from 'vitest';
import { VaultItem } from '../../src/lib/storage';

describe('Chat Vault Clean Filtering Logic', () => {
  const sampleChats: VaultItem[] = [
    {
      id: 'chat-1',
      type: 'chat',
      title: 'Project Alpha',
      content: 'enc-1',
      folder: 'Work',
      createdAt: 1000,
      updatedAt: 1000,
      isPinned: false,
    },
    {
      id: 'chat-2',
      type: 'chat',
      title: 'Personal Journal',
      content: 'enc-2',
      folder: 'Personal',
      createdAt: 2000,
      updatedAt: 2000,
      isPinned: true,
    },
    {
      id: 'chat-3',
      type: 'chat',
      title: 'Project Beta',
      content: 'enc-3',
      folder: 'Work',
      createdAt: 3000,
      updatedAt: 3000,
      isPinned: false,
    },
  ];

  it('filters chats by search query correctly', () => {
    const query = 'project';
    const filtered = sampleChats.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));

    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(['chat-1', 'chat-3']);
  });

  it('filters chats by folder correctly', () => {
    const currentFolder = 'Work';
    const filtered = sampleChats.filter((c) => c.folder === currentFolder);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(['chat-1', 'chat-3']);
  });

  it('places pinned items at the top of the list', () => {
    const sorted = [...sampleChats].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

    expect(sorted[0].id).toBe('chat-2');
  });
});
