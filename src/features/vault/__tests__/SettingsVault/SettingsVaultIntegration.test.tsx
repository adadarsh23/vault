/* @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SettingsVault } from '../../SettingsVault';
import * as authApi from '../../../../lib/auth-api';

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

const mockVaultStoreState = {
  syncWithCloud: vi.fn().mockResolvedValue(undefined),
  retryFailedSync: vi.fn().mockResolvedValue(undefined),
  syncLogs: vi.fn().mockResolvedValue(undefined),
  isSyncingLogs: false,
  destroyAllData: vi.fn().mockResolvedValue(undefined),
  isLoading: false,
  items: [],
  username: 'johndoe',
  lock: vi.fn(),
  fullLogout: vi.fn(),
  migrateLocalToCloud: vi.fn().mockResolvedValue(undefined),
  syncStatus: 'idle',
  cancelSync: vi.fn(),
  cancelActivityLogSync: vi.fn(),
  lastSuccessfulSyncAt: Date.now(),
  lastSyncAttemptAt: Date.now(),
  lastSyncError: null,
  syncConflictCount: 0,
  hasPendingSyncRetry: false,
};

vi.mock('../../../../store/vaultStore', () => ({
  useVaultStore: (selector: (state: typeof mockVaultStoreState) => unknown) =>
    selector(mockVaultStoreState),
}));

vi.mock('../../../../hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    install: vi.fn().mockResolvedValue(undefined),
    canInstall: true,
    isInstalled: false,
    isStandalone: false,
    needsManualInstall: false,
  }),
}));

vi.mock('../../../../lib/auth-api', () => ({
  getAuthenticatedProfile: vi.fn().mockResolvedValue({
    id: 'u_123',
    username: 'johndoe',
    profileName: 'John Doe',
    profilePhoto: 'https://example.com/avatar.jpg',
    twoFactorEnabled: false,
    sessions: [{ id: 's1' }, { id: 's2' }],
  }),
  updateAuthenticatedProfile: vi.fn().mockResolvedValue({ success: true }),
  revokeVaultDeviceSession: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../../lib/activity', () => ({
  logActivity: vi.fn(),
}));

describe('SettingsVault Integrated Page Test Suite', () => {
  const onOpenMaintenanceMock = vi.fn();
  const onNavigateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
    globalThis.confirm = vi.fn().mockReturnValue(true);
    if (typeof globalThis.Worker === 'undefined') {
      class DummyWorker {
        postMessage = vi.fn();
        terminate = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      }
      globalThis.Worker = DummyWorker as any;
    }
  });

  it('renders Settings Vault page title and main sections', async () => {
    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    expect(screen.getByRole('heading', { name: /^settings$/i })).toBeTruthy();
    expect(screen.getByText('Vault Navigation')).toBeTruthy();
    expect(screen.getByText('Sync and Storage')).toBeTruthy();
    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Emergency Destruction')).toBeTruthy();
  });

  it('navigates to ecosystem when "Open Ecosystem" button is clicked', async () => {
    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    const openEcosystemButton = screen.getByRole('button', { name: /open ecosystem/i });
    fireEvent.click(openEcosystemButton);

    expect(onNavigateMock).toHaveBeenCalledWith('ecosystem');
  });

  it('navigates to devicesessions when "Open Sessions" button is clicked', async () => {
    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    const openSessionsButton = screen.getByRole('button', { name: /open sessions/i });
    fireEvent.click(openSessionsButton);

    expect(onNavigateMock).toHaveBeenCalledWith('devicesessions');
  });

  it('navigates to systemlogs when "Open Logs" button is clicked', async () => {
    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    const openLogsButton = screen.getByRole('button', { name: /open logs/i });
    fireEvent.click(openLogsButton);

    expect(onNavigateMock).toHaveBeenCalledWith('systemlogs');
  });

  it('handles profile save, updateAuthenticatedProfile call, event dispatch, and modal close', async () => {
    const eventListener = vi.fn();
    window.addEventListener('vault:profile-updated', eventListener);

    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const displayNameInput = screen.getByPlaceholderText('Enter display name');
    fireEvent.change(displayNameInput, { target: { value: 'Johnny Doe' } });

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(authApi.updateAuthenticatedProfile).toHaveBeenCalledWith({
      profileName: 'Johnny Doe',
      profilePhoto: 'https://example.com/avatar.jpg',
    });

    await waitFor(() => {
      expect(eventListener).toHaveBeenCalled();
      expect(screen.queryByText('Edit Profile')).toBeNull();
    });

    window.removeEventListener('vault:profile-updated', eventListener);
  });

  it('handles offline fallback (SAVED_LOCALLY) gracefully with soft info toast', async () => {
    vi.mocked(authApi.updateAuthenticatedProfile).mockRejectedValueOnce({
      code: 'SAVED_LOCALLY',
    });

    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    const profileCardButton = screen.getByRole('button', { name: /open profile editor/i });
    fireEvent.click(profileCardButton);

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.queryByText('Edit Profile')).toBeNull();
    });
  });

  it('executes full emergency destruction workflow (Stage 1 -> Stage 2 -> Stage 3 -> Purge)', async () => {
    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    // Stage 1
    const stage1Button = screen.getByRole('button', { name: /destroy vault data/i });
    fireEvent.click(stage1Button);

    // Stage 2
    const stage2Button = await screen.findByRole('button', { name: /confirm: initial step/i });
    await waitFor(() => expect(screen.getByText('Phase 1: Readiness check.')).toBeTruthy());
    fireEvent.click(stage2Button);

    // Stage 3
    const stage3Button = await screen.findByRole('button', {
      name: /final confirm: purge everything/i,
    });
    await waitFor(() =>
      expect(screen.getByText('Phase 2: Final destruction override.')).toBeTruthy()
    );
    await act(async () => {
      fireEvent.click(stage3Button);
    });

    await waitFor(() => {
      expect(mockVaultStoreState.destroyAllData).toHaveBeenCalled();
    });
  });

  it('handles revoke all sessions when user confirms window prompt', async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    globalThis.confirm = vi.fn().mockReturnValue(true);

    render(
      <MemoryRouter>
        <SettingsVault onOpenMaintenance={onOpenMaintenanceMock} onNavigate={onNavigateMock} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0));

    const lockSessionsButton = screen.getByRole('button', { name: /lock sessions/i });
    await act(async () => {
      fireEvent.click(lockSessionsButton);
    });

    await waitFor(() => {
      expect(authApi.revokeVaultDeviceSession).toHaveBeenCalledWith({
        revokeAllOther: true,
        revokeCurrent: true,
      });
      expect(mockVaultStoreState.fullLogout).toHaveBeenCalledTimes(1);
    });
  });
});
