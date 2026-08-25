/* @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProfileCard } from '../../components/SettingsVault/ProfileCard';
import {
  getItemRawBytes,
  estimateVaultItemBytes,
  getMediaType,
  calculateMediaBreakdown,
  formatBytes,
} from '../../components/SettingsVault/Utils';
import { VaultItem } from '../../../../lib/storage';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../../hooks/useFastAvatar', () => ({
  useFastAvatar: () => ({
    avatarUrl: null,
    blurHash: null,
    isProcessing: false,
    isUploading: false,
    isOfflineQueued: false,
    error: null,
    processAndUploadAvatar: vi.fn(),
  }),
}));

const mockMediaBreakdown = {
  photo: { count: 5, bytes: 5000 },
  video: { count: 2, bytes: 20000 },
  audio: { count: 10, bytes: 15000 },
  other: { count: 3, bytes: 3000 },
};

const defaultProps = {
  username: 'johndoe',
  profile: {
    id: 'u_123',
    username: 'johndoe',
    profileName: 'John Doe',
    profilePhoto: 'https://example.com/avatar.jpg',
    twoFactorEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sessions: [],
  },
  isSavingProfile: false,
  onSaveProfile: vi.fn().mockResolvedValue({ saved: true }),
  syncHealthLabel: 'Healthy',
  lastSuccessfulSyncAt: Date.now(),
  storageUsedBytes: 43000,
  itemCount: 20,
  sessionsCount: 2,
  mediaBreakdown: mockMediaBreakdown,
  onNavigate: vi.fn(),
};

describe('ProfileCard Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders account profile snapshot accurately', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@johndoe/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0);
    expect(screen.getByText('Two-Factor Auth')).toBeTruthy();
    expect(screen.getByText('Active Sessions')).toBeTruthy();
    expect(screen.getByText('Security Protocol')).toBeTruthy();
    expect(screen.getByText('Storage Usage')).toBeTruthy();
  });

  it('opens profile editor modal upon clicking profile card', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    expect(screen.getByText('Edit Profile')).toBeTruthy();
    const displayNameInput = screen.getByPlaceholderText('Enter display name') as HTMLInputElement;
    expect(displayNameInput.value).toBe('John Doe');
  });

  it('asserts "Save Profile" button disabled state during loading (isSavingProfile)', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} isSavingProfile={true} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const saveButton = screen.getByRole('button', { name: /save profile/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('triggers onSaveProfile on clicking "Save Profile" button and closes modal', async () => {
    const onSaveProfileMock = vi.fn().mockResolvedValue({ saved: true });

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} onSaveProfile={onSaveProfileMock} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const displayNameInput = screen.getByPlaceholderText('Enter display name');
    fireEvent.change(displayNameInput, { target: { value: 'Jane Doe' } });

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(onSaveProfileMock).toHaveBeenCalledWith('Jane Doe', 'https://example.com/avatar.jpg');
    await waitFor(() => {
      expect(screen.queryByText('Edit Profile')).toBeNull();
    });
  });

  it('handles profile save failure gracefully without closing modal', async () => {
    const onSaveProfileMock = vi.fn().mockResolvedValue({
      saved: false,
      errorMessage: 'Network error saving profile',
    });

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} onSaveProfile={onSaveProfileMock} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(onSaveProfileMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Network error saving profile/i)).toBeTruthy();
      expect(screen.getByText('Edit Profile')).toBeTruthy();
    });
  });

  it('closes profile editor modal cleanly on clicking "Cancel" button without triggering onSaveProfile', () => {
    const onSaveProfileMock = vi.fn();

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} onSaveProfile={onSaveProfileMock} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(onSaveProfileMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Edit Profile')).toBeNull();
  });

  it('renders media and storage breakdown with accurate categories and stats', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Media & File Breakdown')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
    expect(screen.getByText('Videos')).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByText('All Other')).toBeTruthy();
  });

  it('triggers onNavigate when clicking video or photo breakdown cards', () => {
    const onNavigateMock = vi.fn();
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} onNavigate={onNavigateMock} />
      </MemoryRouter>,
    );

    const videoCard = screen.getByRole('button', { name: /view videos/i });
    fireEvent.click(videoCard);
    expect(onNavigateMock).toHaveBeenCalledWith('videos');

    const photoCard = screen.getByRole('button', { name: /view photos/i });
    fireEvent.click(photoCard);
    expect(onNavigateMock).toHaveBeenCalledWith('photos');
  });

  it('handles missing or undefined mediaBreakdown safely without throwing errors', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} mediaBreakdown={undefined as any} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Media & File Breakdown')).toBeTruthy();
    expect(screen.getByText('Videos')).toBeTruthy();
  });
});

describe('SettingsVault Utils Test Suite', () => {
  describe('formatBytes', () => {
    it('formats zero and negative bytes safely', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');
    });

    it('formats bytes, kilobytes, megabytes, and gigabytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1024 * 1024 * 5)).toBe('5.00 MB');
      expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
    });
  });

  describe('getItemRawBytes & estimateVaultItemBytes', () => {
    it('retrieves accurate size from video metadata even if in-memory content is empty', () => {
      const videoItem: VaultItem = {
        id: 'video-1',
        type: 'video',
        title: 'holiday_video.mp4',
        content: '', // stripped in memory for performance
        metadata: {
          size: 150 * 1024 * 1024, // 150 MB
          mimeType: 'video/mp4',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const rawBytes = getItemRawBytes(videoItem);
      expect(rawBytes).toBe(150 * 1024 * 1024);

      const estimated = estimateVaultItemBytes(videoItem);
      expect(estimated).toBeGreaterThanOrEqual(150 * 1024 * 1024);
    });

    it('retrieves size from Uint8Array when metadata.size is not provided', () => {
      const binaryItem: VaultItem = {
        id: 'photo-1',
        type: 'photo',
        title: 'picture.png',
        content: new Uint8Array([1, 2, 3, 4, 5]),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(getItemRawBytes(binaryItem)).toBe(5);
    });
  });

  describe('getMediaType', () => {
    it('identifies standard video types', () => {
      const item: VaultItem = {
        id: 'v1',
        type: 'video',
        title: 'clip',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(getMediaType(item)).toBe('video');
    });

    it('identifies video by MIME type even if item type is generic file', () => {
      const item: VaultItem = {
        id: 'v2',
        type: 'file',
        title: 'recording',
        content: '',
        metadata: { mimeType: 'video/webm' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(getMediaType(item)).toBe('video');
    });

    it('identifies video by file extension in title or metadata', () => {
      const item1: VaultItem = {
        id: 'v3',
        type: 'file',
        title: 'family_vacation.MP4',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(getMediaType(item1)).toBe('video');

      const item2: VaultItem = {
        id: 'v4',
        type: 'file',
        title: 'movie.mkv',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(getMediaType(item2)).toBe('video');
    });

    it('identifies photos and audio by extension or MIME type', () => {
      const photoItem: VaultItem = {
        id: 'p1',
        type: 'file',
        title: 'photo.JPEG',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(getMediaType(photoItem)).toBe('photo');

      const audioItem: VaultItem = {
        id: 'a1',
        type: 'file',
        title: 'voice_memo.mp3',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(getMediaType(audioItem)).toBe('audio');
    });
  });

  describe('calculateMediaBreakdown', () => {
    it('accurately tallies counts and bytes for videos, photos, audio, and other', () => {
      const items: VaultItem[] = [
        {
          id: 'v1',
          type: 'video',
          title: 'video1.mp4',
          content: '',
          metadata: { size: 50000 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'v2',
          type: 'file',
          title: 'video2.mkv',
          content: '',
          metadata: { size: 75000 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'p1',
          type: 'photo',
          title: 'image.jpg',
          content: '',
          metadata: { size: 20000 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'a1',
          type: 'audio',
          title: 'song.mp3',
          content: '',
          metadata: { size: 15000 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'd1',
          type: 'document',
          title: 'doc.pdf',
          content: '',
          metadata: { size: 10000 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const breakdown = calculateMediaBreakdown(items);

      expect(breakdown.video.count).toBe(2);
      expect(breakdown.video.bytes).toBe(125000);

      expect(breakdown.photo.count).toBe(1);
      expect(breakdown.photo.bytes).toBe(20000);

      expect(breakdown.audio.count).toBe(1);
      expect(breakdown.audio.bytes).toBe(15000);

      expect(breakdown.other.count).toBe(1);
      expect(breakdown.other.bytes).toBe(10000);
    });
  });
});
