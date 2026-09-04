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

const mockCreateObjectURL = vi.fn(() => 'blob:mock-avatar-preview');
const mockRevokeObjectURL = vi.fn();

if (typeof window !== 'undefined') {
  window.URL.createObjectURL = mockCreateObjectURL;
  window.URL.revokeObjectURL = mockRevokeObjectURL;
}
if (typeof globalThis.URL !== 'undefined') {
  globalThis.URL.createObjectURL = mockCreateObjectURL;
  globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
}

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

let mockFastAvatarState = {
  avatarUrl: null as string | null,
  blurHash: null as string | null,
  isProcessing: false,
  isUploading: false,
  uploadProgress: 0,
  isOfflineQueued: false,
  error: null as string | null,
  processAndUploadAvatar: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../../hooks/useFastAvatar', () => ({
  useFastAvatar: () => mockFastAvatarState,
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
    mockFastAvatarState = {
      avatarUrl: null,
      blurHash: null,
      isProcessing: false,
      isUploading: false,
      uploadProgress: 0,
      isOfflineQueued: false,
      error: null,
      processAndUploadAvatar: vi.fn().mockResolvedValue(undefined),
    };
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

  it('disables upload photo button and shows loading state when isUploading is true', () => {
    mockFastAvatarState.isUploading = true;

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    expect(screen.getByText('Uploading...')).toBeTruthy();
    expect(screen.getByText('Uploading photo...')).toBeTruthy();

    const fileInput = document.getElementById('profile-photo-file-input') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);

    const saveButton = screen.getByRole('button', { name: /save profile/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const cancelButton = screen.getByRole('button', { name: /cancel/i }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
  });

  it('disables upload photo button and shows loading state when isProcessing is true', () => {
    mockFastAvatarState.isProcessing = true;

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    expect(screen.getByText('Processing...')).toBeTruthy();
    expect(screen.getByText('Processing photo...')).toBeTruthy();

    const fileInput = document.getElementById('profile-photo-file-input') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);

    const saveButton = screen.getByRole('button', { name: /save profile/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const cancelButton = screen.getByRole('button', { name: /cancel/i }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
  });

  it('handles local image file selection and invokes processAndUploadAvatar', async () => {
    const processMock = vi.fn().mockResolvedValue(undefined);
    mockFastAvatarState.processAndUploadAvatar = processMock;

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const fileInput = document.getElementById('profile-photo-file-input') as HTMLInputElement;
    const testFile = new File(['dummy content'], 'avatar.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(processMock).toHaveBeenCalled();
    });

    expect(processMock.mock.calls[0][0].name).toBe('avatar.png');
    expect(processMock.mock.calls[0][0].type).toBe('image/png');
  });

  it('displays error when selecting a non-image file', async () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const fileInput = document.getElementById('profile-photo-file-input') as HTMLInputElement;
    const txtFile = new File(['dummy'], 'document.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Please select a valid image file/i)).toBeTruthy();
    });
  });

  it('displays error when selecting a file over 35MB', async () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const fileInput = document.getElementById('profile-photo-file-input') as HTMLInputElement;
    const hugeFile = new File(['x'.repeat(100)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(hugeFile, 'size', { value: 40 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [hugeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Image file must be under 35MB/i)).toBeTruthy();
    });
  });

  it('renders word letter initials avatar and opens letter avatar preview modal', async () => {
    render(
      <MemoryRouter>
        <ProfileCard
          {...defaultProps}
          profile={{
            ...defaultProps.profile,
            profilePhoto: 'none',
            profileName: 'John Doe',
          }}
        />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    // Should display the word letter initials "JD"
    expect(screen.getAllByText('JD').length).toBeGreaterThan(0);
    expect(screen.getByText('Letter avatar preview')).toBeTruthy();

    // Clicking the letter avatar button opens the enlarged letter avatar preview modal
    const letterAvatarButton = screen.getByRole('button', { name: /open letter avatar preview/i });
    fireEvent.click(letterAvatarButton);

    expect(screen.getByRole('heading', { level: 4, name: /John Doe/i })).toBeTruthy();
    expect(screen.getByText('Letter Avatar Preview')).toBeTruthy();
  });

  it('dynamically updates word letter initials when typing in display name input', async () => {
    render(
      <MemoryRouter>
        <ProfileCard
          {...defaultProps}
          profile={{
            ...defaultProps.profile,
            profilePhoto: 'none',
            profileName: 'Alice Smith',
          }}
        />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    expect(screen.getAllByText('AS').length).toBeGreaterThan(0);

    const nameInput = screen.getByPlaceholderText('Enter display name');
    fireEvent.change(nameInput, { target: { value: 'Robert Brown' } });

    expect(screen.getAllByText('RB').length).toBeGreaterThan(0);
  });

  it('displays circular crop preview guide and percentage when uploading an image', async () => {
    mockFastAvatarState.isUploading = true;
    mockFastAvatarState.uploadProgress = 65;
    mockFastAvatarState.avatarUrl = 'https://example.com/photo.jpg';

    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    expect(screen.getByText('Circle Crop Preview')).toBeTruthy();
    expect(screen.getAllByText(/65%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Inside circle \(Visible\)/i)).toBeTruthy();
    expect(screen.getByText(/Outside circle \(Cropped out\)/i)).toBeTruthy();

    // Toggle hide/show
    const toggleButton = screen.getByRole('button', { name: /hide/i });
    fireEvent.click(toggleButton);
    expect(screen.getByRole('button', { name: /show/i })).toBeTruthy();
  });

  it('closes profile editor modal cleanly via top-right close X button', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const closeButton = screen.getByRole('button', { name: /close edit profile dialog/i });
    fireEvent.click(closeButton);

    expect(screen.queryByText('Edit Profile')).toBeNull();
  });

  it('closes enlarged preview on Escape key without dismissing the edit profile modal', () => {
    render(
      <MemoryRouter>
        <ProfileCard
          {...defaultProps}
          profile={{
            ...defaultProps.profile,
            profilePhoto: 'none',
            profileName: 'John Doe',
          }}
        />
      </MemoryRouter>,
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    // Open letter avatar preview
    const letterAvatarButton = screen.getByRole('button', { name: /open letter avatar preview/i });
    fireEvent.click(letterAvatarButton);

    expect(screen.getByText('Letter Avatar Preview')).toBeTruthy();

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape' });

    // Enlarged preview should be closed
    expect(screen.queryByText('Letter Avatar Preview')).toBeNull();
    // But Edit Profile modal remains open
    expect(screen.getByText('Edit Profile')).toBeTruthy();
  });

  it('opens avatar preview modal upon clicking avatar button and navigates to edit profile from preview', () => {
    render(
      <MemoryRouter>
        <ProfileCard {...defaultProps} />
      </MemoryRouter>,
    );

    // Click avatar preview button
    const avatarButton = screen.getByRole('button', { name: /view avatar preview/i });
    fireEvent.click(avatarButton);

    expect(screen.getByRole('dialog', { name: /avatar image preview/i })).toBeTruthy();
    expect(screen.getByText('Avatar Photo Preview')).toBeTruthy();

    // Inside preview modal, click "Edit Profile"
    const editFromPreviewButton = screen
      .getAllByRole('button', { name: /edit profile/i })
      .find((btn) => btn.closest('[role="dialog"]'));
    expect(editFromPreviewButton).toBeTruthy();
    fireEvent.click(editFromPreviewButton!);

    // Preview closed, Edit Profile modal opened
    expect(screen.queryByRole('dialog', { name: /avatar image preview/i })).toBeNull();
    expect(screen.getByText('Edit Profile')).toBeTruthy();
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
