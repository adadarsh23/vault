/* @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProfileCard } from '../../components/SettingsVault/ProfileCard';

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
      </MemoryRouter>
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
      </MemoryRouter>
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
      </MemoryRouter>
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
      </MemoryRouter>
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const displayNameInput = screen.getByPlaceholderText('Enter display name');
    fireEvent.change(displayNameInput, { target: { value: 'Jane Doe' } });

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveButton);

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
      </MemoryRouter>
    );

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveButton);

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
      </MemoryRouter>
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
      </MemoryRouter>
    );

    expect(screen.getByText('Media & File Breakdown')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
    expect(screen.getByText('Videos')).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByText('All Other')).toBeTruthy();
  });
});
