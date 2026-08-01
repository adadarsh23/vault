import { describe, it, expect } from 'vitest';
import { fuzzyMatch, getHighlightedParts, searchVaultItems } from '../../src/lib/fuzzy';
import { VaultItem } from '../../src/lib/storage';

describe('fuzzyMatch', () => {
  it('should return null if query characters are not a subsequence of the text', () => {
    expect(fuzzyMatch('xyz', 'hello world')).toBeNull();
    expect(fuzzyMatch('abc', 'acb')).toBeNull();
  });

  it('should return correct matches for simple exact/subsequence match', () => {
    const result1 = fuzzyMatch('abc', 'abc');
    expect(result1).not.toBeNull();
    expect(result1!.matches).toEqual([0, 1, 2]);

    const result2 = fuzzyMatch('abc', 'a_b_c');
    expect(result2).not.toBeNull();
    expect(result2!.matches).toEqual([0, 2, 4]);
  });

  it('should prioritize consecutive character matches', () => {
    // "no" matches consecutively in "notebook" vs non-consecutively in "nylon"
    const scoreConsecutive = fuzzyMatch('no', 'notebook')!.score;
    const scoreSpaced = fuzzyMatch('no', 'nylon')!.score;
    expect(scoreConsecutive).toBeGreaterThan(scoreSpaced);
  });

  it('should prioritize matches at word boundaries', () => {
    // "n" in "important note" (word start) vs "n" in "online" (middle of word)
    const scoreWordStart = fuzzyMatch('n', 'important note')!.score;
    const scoreMiddle = fuzzyMatch('n', 'online')!.score;
    expect(scoreWordStart).toBeGreaterThan(scoreMiddle);
  });

  it('should prioritize matches at camelCase transitions', () => {
    const scoreCamel = fuzzyMatch('c', 'myCoolNote')!.score; // matches 'C'
    const scoreMiddle = fuzzyMatch('c', 'mycoolnote')!.score; // matches 'c' in middle (not camel start)
    expect(scoreCamel).toBeGreaterThan(scoreMiddle);
  });

  it('should favor shorter text strings for identical queries', () => {
    const scoreShort = fuzzyMatch('note', 'note')!.score;
    const scoreLong = fuzzyMatch('note', 'note book')!.score;
    expect(scoreShort).toBeGreaterThan(scoreLong);
  });
});

describe('getHighlightedParts', () => {
  it('should return a single non-match part when matches are empty', () => {
    const text = 'hello';
    const parts = getHighlightedParts(text, []);
    expect(parts).toEqual([{ text: 'hello', isMatch: false }]);
  });

  it('should merge consecutive matches and non-matches correctly', () => {
    const text = 'Important Note';
    // Match "Note" at indices 10, 11, 12, 13
    const parts = getHighlightedParts(text, [10, 11, 12, 13]);
    expect(parts).toEqual([
      { text: 'Important ', isMatch: false },
      { text: 'Note', isMatch: true },
    ]);
  });

  it('should handle non-contiguous matches', () => {
    const text = 'a_b_c';
    // Match 'a', 'b', 'c' at indices 0, 2, 4
    const parts = getHighlightedParts(text, [0, 2, 4]);
    expect(parts).toEqual([
      { text: 'a', isMatch: true },
      { text: '_', isMatch: false },
      { text: 'b', isMatch: true },
      { text: '_', isMatch: false },
      { text: 'c', isMatch: true },
    ]);
  });
});

describe('searchVaultItems', () => {
  const mockTypeConfigs = {
    note: { label: 'Notes' },
    password: { label: 'Passwords' },
  };

  const mockItems: VaultItem[] = [
    {
      id: '1',
      type: 'note',
      title: 'Personal Budget Note',
      content: '',
      createdAt: 100,
      updatedAt: 200,
      folder: 'Finance',
      metadata: { tags: ['money', 'personal'] },
    },
    {
      id: '2',
      type: 'password',
      title: 'GitHub Login',
      content: '',
      createdAt: 110,
      updatedAt: 210,
      metadata: { tags: ['dev', 'social'] },
    },
  ];

  it('should return all items with score 0 when query is empty', () => {
    const results = searchVaultItems(mockItems, '', mockTypeConfigs);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0);
    expect(results[1].score).toBe(0);
  });

  it('should filter items by matching titles', () => {
    const results = searchVaultItems(mockItems, 'Git', mockTypeConfigs);
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('2');
    expect(results[0].titleMatches).toEqual([0, 1, 2]);
  });

  it('should search across folders and types', () => {
    const resultsFolder = searchVaultItems(mockItems, 'Finance', mockTypeConfigs);
    expect(resultsFolder).toHaveLength(1);
    expect(resultsFolder[0].item.id).toBe('1');
    expect(resultsFolder[0].folderMatches).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const resultsType = searchVaultItems(mockItems, 'Passwords', mockTypeConfigs);
    expect(resultsType).toHaveLength(1);
    expect(resultsType[0].item.id).toBe('2');
  });

  it('should search strictly tags when query is prefixed with #', () => {
    const results = searchVaultItems(mockItems, '#money', mockTypeConfigs);
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('1');
    expect(results[0].tagMatches).toEqual([
      { tag: 'money', matches: [0, 1, 2, 3, 4] },
    ]);
  });

  it('should show all tagged items when query is only #', () => {
    const results = searchVaultItems(mockItems, '#', mockTypeConfigs);
    expect(results).toHaveLength(2);
  });

  it('should exclude unsupported item types', () => {
    const mixedItems: VaultItem[] = [
      ...mockItems,
      {
        id: '3',
        type: 'unsupported_type' as any,
        title: 'Unsupported',
        content: '',
        createdAt: 100,
        updatedAt: 200,
      },
    ];
    const results = searchVaultItems(mixedItems, 'Unsupported', mockTypeConfigs);
    expect(results).toHaveLength(0);
  });
});
