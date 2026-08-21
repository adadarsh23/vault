import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  getResolutionBadge,
  formatFileSize,
  filterAndSortMedia,
  groupMediaByTimeline,
} from '../mediaUtils';
import type { VaultItem } from '../../../../../lib/storage';

describe('mediaUtils - Gallery & Grid View functions', () => {
  describe('formatDuration', () => {
    it('formats seconds into mm:ss and hh:mm:ss', () => {
      expect(formatDuration(0)).toBe('');
      expect(formatDuration(45)).toBe('00:45');
      expect(formatDuration(75)).toBe('01:15');
      expect(formatDuration(225)).toBe('03:45');
      expect(formatDuration(3665)).toBe('1:01:05');
    });

    it('handles undefined or null gracefully', () => {
      expect(formatDuration(undefined)).toBe('');
      expect(formatDuration(null)).toBe('');
    });
  });

  describe('getResolutionBadge', () => {
    it('identifies 4K resolution', () => {
      expect(getResolutionBadge(3840, 2160)).toBe('4K');
      expect(getResolutionBadge(2160, 3840)).toBe('4K');
    });

    it('identifies 2K / QHD resolution', () => {
      expect(getResolutionBadge(2560, 1440)).toBe('2K');
    });

    it('identifies HD resolution', () => {
      expect(getResolutionBadge(1920, 1080)).toBe('HD');
      expect(getResolutionBadge(1280, 720)).toBe('HD');
    });

    it('identifies SD resolution', () => {
      expect(getResolutionBadge(640, 480)).toBe('SD');
    });

    it('returns null for missing dimensions', () => {
      expect(getResolutionBadge(undefined, undefined)).toBeNull();
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes into readable string', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1024 * 1024 * 14.2)).toBe('14.2 MB');
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
    });
  });

  describe('filterAndSortMedia', () => {
    const mockItems: VaultItem[] = [
      {
        id: '1',
        type: 'photo',
        title: 'Sunset.jpg',
        content: new Uint8Array(100),
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
        isPinned: false,
        metadata: { width: 1920, height: 1080, size: 5000 },
      },
      {
        id: '2',
        type: 'photo',
        title: 'Favorite Beach.jpg',
        content: new Uint8Array(200),
        createdAt: Date.now() - 5000,
        updatedAt: Date.now() - 5000,
        isPinned: true,
        metadata: { width: 3840, height: 2160, size: 15000 },
      },
      {
        id: '3',
        type: 'video',
        title: 'Drone Clip.mp4',
        content: new Uint8Array(500),
        createdAt: Date.now() - 800000000, // old
        updatedAt: Date.now() - 800000000,
        isPinned: false,
        metadata: { isLiveCapture: true, width: 3840, height: 2160, size: 50000 },
      },
      {
        id: '4',
        type: 'photo',
        title: 'Portrait.raw',
        content: new Uint8Array(300),
        createdAt: Date.now() - 2000,
        updatedAt: Date.now() - 2000,
        isPinned: false,
        metadata: { width: 1280, height: 720, size: 25000 },
      },
    ];

    it('filters by favorites', () => {
      const result = filterAndSortMedia(mockItems, 'favorites', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    it('filters by live captures', () => {
      const result = filterAndSortMedia(mockItems, 'live', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('3');
    });

    it('filters by 4k/hd resolution', () => {
      const result = filterAndSortMedia(mockItems, '4k', 'date-desc');
      expect(result.map((i) => i.id)).toEqual(['2', '1', '3']);
    });

    it('filters by raw / heic formats', () => {
      const result = filterAndSortMedia(mockItems, 'raw', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('4');
    });

    it('sorts by name A-Z and Z-A', () => {
      const asc = filterAndSortMedia(mockItems, 'all', 'name-asc');
      expect(asc[0].title).toBe('Drone Clip.mp4');
      expect(asc[asc.length - 1].title).toBe('Sunset.jpg');

      const desc = filterAndSortMedia(mockItems, 'all', 'name-desc');
      expect(desc[0].title).toBe('Sunset.jpg');
    });

    it('sorts by file size', () => {
      const result = filterAndSortMedia(mockItems, 'all', 'size-desc');
      expect(result[0].id).toBe('3'); // 50000
    });
  });

  describe('groupMediaByTimeline', () => {
    it('groups items into Today, Yesterday, and Month Year timeline buckets', () => {
      const now = Date.now();
      const yesterday = now - 86400000;
      const threeMonthsAgo = new Date(2026, 3, 15).getTime(); // April 2026

      const items: VaultItem[] = [
        {
          id: 'item-today',
          type: 'photo',
          title: 'Today Photo',
          content: '',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'item-yesterday',
          type: 'photo',
          title: 'Yesterday Photo',
          content: '',
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          id: 'item-april',
          type: 'photo',
          title: 'April Photo',
          content: '',
          createdAt: threeMonthsAgo,
          updatedAt: threeMonthsAgo,
        },
      ];

      const groups = groupMediaByTimeline(items);
      expect(groups.length).toBeGreaterThanOrEqual(2);
      expect(groups[0].label).toBe('Today');
      expect(groups[0].items[0].id).toBe('item-today');
      expect(groups[1].label).toBe('Yesterday');
      expect(groups[1].items[0].id).toBe('item-yesterday');
    });
  });

  describe('getMediaDimensions', () => {
    it('returns default fallback dimensions on invalid or non-decodable files', async () => {
      const { getMediaDimensions } = await import('../mediaUtils');
      const fakeVideoFile = new File(['mock content'], 'test.mp4', { type: 'video/mp4' });
      const dims = await getMediaDimensions(fakeVideoFile, 'video');
      expect(dims).toBeDefined();
      expect(dims?.aspectRatio).toBeGreaterThan(0);
      expect(dims?.width).toBeGreaterThan(0);
      expect(dims?.height).toBeGreaterThan(0);
    });
  });
});
