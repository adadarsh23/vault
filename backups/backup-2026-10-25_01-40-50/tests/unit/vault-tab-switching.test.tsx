/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UnlockedVaultHost } from '../../src/components/app/UnlockedVaultHost';
import { useVaultStore } from '../../src/store/vaultStore';

// Mock feature vault views
vi.mock('../../src/features/vault/Dashboard', () => ({
  default: () => <div data-testid="view-dashboard">Dashboard View Content</div>,
  Dashboard: () => <div data-testid="view-dashboard">Dashboard View Content</div>,
}));

vi.mock('../../src/features/vault/PasswordManager', () => ({
  default: () => <div data-testid="view-passwords">Password Manager Content</div>,
  PasswordManager: () => <div data-testid="view-passwords">Password Manager Content</div>,
}));

vi.mock('../../src/features/vault/NotesVault', () => ({
  default: () => <div data-testid="view-notes">Notes Vault Content</div>,
  NotesVault: () => <div data-testid="view-notes">Notes Vault Content</div>,
}));

vi.mock('../../src/features/vault/MediaVault', () => ({
  default: ({ type }: { type: string }) => (
    <div data-testid={`view-media-${type}`}>Media Vault {type} Content</div>
  ),
  MediaVault: ({ type }: { type: string }) => (
    <div data-testid={`view-media-${type}`}>Media Vault {type} Content</div>
  ),
}));

vi.mock('../../src/features/vault/DocumentsVault', () => ({
  default: () => <div data-testid="view-documents">Documents Vault Content</div>,
  DocumentsVault: () => <div data-testid="view-documents">Documents Vault Content</div>,
}));

vi.mock('../../src/lib/auth-api', () => ({
  getAuthenticatedProfile: vi.fn().mockResolvedValue({ username: 'testuser' }),
  fetchVaultSalt: vi.fn().mockResolvedValue({ salt: 'testsalt' }),
  logoutVaultSession: vi.fn().mockResolvedValue({ success: true }),
  revokeVaultDeviceSession: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Vault Tab Switching via Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
      username: 'testuser',
      preferences: {
        ...useVaultStore.getState().preferences,
        sidebarPosition: 'left',
      },
    });
  });

  it('updates page content immediately when switching tabs via sidebar buttons', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <UnlockedVaultHost shouldReduceMotion={true} />
        </MemoryRouter>,
      );
    });

    // 1. Initial page content should be Dashboard
    await waitFor(() => {
      expect(screen.getByTestId('view-dashboard')).toBeTruthy();
    });

    // 2. Click Passwords in sidebar
    const passwordsBtn = screen.getByTitle('Passwords');
    expect(passwordsBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(passwordsBtn);
    });

    // Verify Passwords content is displayed and Dashboard is no longer visible
    await waitFor(() => {
      expect(screen.getByTestId('view-passwords')).toBeTruthy();
      expect(screen.queryByTestId('view-dashboard')).toBeNull();
    });

    // 3. Click Notes in sidebar
    const notesBtn = screen.getByTitle('Notes');
    expect(notesBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(notesBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('view-notes')).toBeTruthy();
      expect(screen.queryByTestId('view-passwords')).toBeNull();
    });

    // 4. Click Photos in sidebar
    const photosBtn = screen.getByTitle('Photos');
    expect(photosBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(photosBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('view-media-photo')).toBeTruthy();
      expect(screen.queryByTestId('view-notes')).toBeNull();
    });

    // 5. Click Videos in sidebar (tests MediaVault type change)
    const videosBtn = screen.getByTitle('Videos');
    expect(videosBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(videosBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('view-media-video')).toBeTruthy();
      expect(screen.queryByTestId('view-media-photo')).toBeNull();
    });

    // 6. Click Documents in sidebar
    const docsBtn = screen.getByTitle('Documents');
    expect(docsBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(docsBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('view-documents')).toBeTruthy();
      expect(screen.queryByTestId('view-media-video')).toBeNull();
    });
  });
});
