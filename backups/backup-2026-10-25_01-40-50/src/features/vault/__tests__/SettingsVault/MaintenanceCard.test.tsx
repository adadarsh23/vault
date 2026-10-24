/* @vitest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaintenanceCard } from '../../components/SettingsVault/MaintenanceCard';

const defaultProps = {
  isLoading: false,
  syncStatus: 'idle',
  isSessionActionLoading: false,
  isSyncingLogs: false,
  hasPendingSyncRetry: false,
  isMigrating: false,
  syncWithCloud: vi.fn().mockResolvedValue(undefined),
  loadSessionState: vi.fn().mockResolvedValue(undefined),
  syncLogs: vi.fn().mockResolvedValue(undefined),
  retryFailedSync: vi.fn().mockResolvedValue(undefined),
  migrateLocalToCloud: vi.fn().mockResolvedValue(undefined),
  onOpenMaintenance: vi.fn(),
  lock: vi.fn(),
  handleLockAllSessions: vi.fn().mockResolvedValue(undefined),
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  setIsMigrating: vi.fn(),
  cancelSync: vi.fn(),
  cancelActivityLogSync: vi.fn(),
};

describe('MaintenanceCard Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Maintenance card title and action sections', () => {
    render(<MaintenanceCard {...defaultProps} />);

    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Cloud & Synchronization')).toBeTruthy();
    expect(screen.getByText('Export And Import Data')).toBeTruthy();
    expect(screen.getByText('Access & Security')).toBeTruthy();
  });

  it('triggers onOpenMaintenance("export") on clicking "Export vault" button', () => {
    const onOpenMaintenanceMock = vi.fn();

    render(<MaintenanceCard {...defaultProps} onOpenMaintenance={onOpenMaintenanceMock} />);

    const exportButton = screen.getByRole('button', { name: /export vault/i });
    fireEvent.click(exportButton);

    expect(onOpenMaintenanceMock).toHaveBeenCalledWith('export');
  });

  it('triggers onOpenMaintenance("import") on clicking "Import vault" button', () => {
    const onOpenMaintenanceMock = vi.fn();

    render(<MaintenanceCard {...defaultProps} onOpenMaintenance={onOpenMaintenanceMock} />);

    const importButton = screen.getByRole('button', { name: /import vault/i });
    fireEvent.click(importButton);

    expect(onOpenMaintenanceMock).toHaveBeenCalledWith('import');
  });

  it('triggers onOpenMaintenance("changePassword") on clicking "Change password" button', () => {
    const onOpenMaintenanceMock = vi.fn();

    render(<MaintenanceCard {...defaultProps} onOpenMaintenance={onOpenMaintenanceMock} />);

    const changePasswordButton = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changePasswordButton);

    expect(onOpenMaintenanceMock).toHaveBeenCalledWith('changePassword');
  });

  it('triggers onOpenMaintenance("changeKey") on clicking "Change master key" button', () => {
    const onOpenMaintenanceMock = vi.fn();

    render(<MaintenanceCard {...defaultProps} onOpenMaintenance={onOpenMaintenanceMock} />);

    const changeKeyButton = screen.getByRole('button', { name: /change master key/i });
    fireEvent.click(changeKeyButton);

    expect(onOpenMaintenanceMock).toHaveBeenCalledWith('changeKey');
  });

  it('triggers lock() store function immediately on clicking "Lock vault" button', () => {
    const lockMock = vi.fn();

    render(<MaintenanceCard {...defaultProps} lock={lockMock} />);

    const lockButton = screen.getByRole('button', { name: /lock vault/i });
    fireEvent.click(lockButton);

    expect(lockMock).toHaveBeenCalledTimes(1);
  });

  it('triggers handleLockAllSessions on clicking "Lock sessions" or "Logout all sessions" buttons', () => {
    const handleLockAllSessionsMock = vi.fn().mockResolvedValue(undefined);

    render(<MaintenanceCard {...defaultProps} handleLockAllSessions={handleLockAllSessionsMock} />);

    const lockSessionsButton = screen.getByRole('button', { name: /lock sessions/i });
    fireEvent.click(lockSessionsButton);

    expect(handleLockAllSessionsMock).toHaveBeenCalledTimes(1);

    const logoutAllSessionsButton = screen.getByRole('button', { name: /logout all sessions/i });
    fireEvent.click(logoutAllSessionsButton);

    expect(handleLockAllSessionsMock).toHaveBeenCalledTimes(2);
  });

  it('triggers loadSessionState on clicking "Refresh account state" or "Refresh sessions" buttons', () => {
    const loadSessionStateMock = vi.fn().mockResolvedValue(undefined);

    render(<MaintenanceCard {...defaultProps} loadSessionState={loadSessionStateMock} />);

    const refreshAccountButton = screen.getByRole('button', { name: /refresh account state/i });
    fireEvent.click(refreshAccountButton);

    expect(loadSessionStateMock).toHaveBeenCalledTimes(1);

    const refreshSessionsButton = screen.getByRole('button', { name: /refresh sessions/i });
    fireEvent.click(refreshSessionsButton);

    expect(loadSessionStateMock).toHaveBeenCalledTimes(2);
  });

  it('toggles More button to reveal and collapse enhanced maintenance options', () => {
    render(<MaintenanceCard {...defaultProps} />);

    const moreButton = screen.getByRole('button', { name: /toggle more maintenance options/i });
    expect(moreButton).toBeTruthy();
    expect(screen.queryByText('Advanced Maintenance & System Diagnostics')).toBeNull();

    // Click More button to expand
    fireEvent.click(moreButton);
    expect(screen.getByText('Advanced Maintenance & System Diagnostics')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reset device labels/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /verify vault integrity/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /purge temp cache/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /export diagnostics/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /re-index search/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /compact database/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ping sync relay/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /verify key fingerprints/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /scan breached passwords/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /test webauthn \/ passkeys/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /zeroize ram buffers/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /purge orphaned chunks/i })).toBeTruthy();

    // Click Show Less to collapse
    fireEvent.click(moreButton);
    expect(screen.queryByText('Advanced Maintenance & System Diagnostics')).toBeNull();
  });

  it('triggers clearTrustedDeviceLabels callback when Reset device labels button inside More section is clicked', () => {
    const clearTrustedDeviceLabelsMock = vi.fn();
    render(
      <MaintenanceCard {...defaultProps} clearTrustedDeviceLabels={clearTrustedDeviceLabelsMock} />,
    );

    const moreButton = screen.getByRole('button', { name: /toggle more maintenance options/i });
    fireEvent.click(moreButton);

    const resetButton = screen.getByRole('button', { name: /reset device labels/i });
    fireEvent.click(resetButton);

    expect(clearTrustedDeviceLabelsMock).toHaveBeenCalledTimes(1);
  });

  it('triggers handlers without error when other diagnostic buttons inside More section are clicked', () => {
    render(<MaintenanceCard {...defaultProps} />);

    const moreButton = screen.getByRole('button', { name: /toggle more maintenance options/i });
    fireEvent.click(moreButton);

    fireEvent.click(screen.getByRole('button', { name: /verify vault integrity/i }));
    fireEvent.click(screen.getByRole('button', { name: /purge temp cache/i }));
    fireEvent.click(screen.getByRole('button', { name: /export diagnostics/i }));
    fireEvent.click(screen.getByRole('button', { name: /re-index search/i }));
    fireEvent.click(screen.getByRole('button', { name: /compact database/i }));
    fireEvent.click(screen.getByRole('button', { name: /ping sync relay/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify key fingerprints/i }));
    fireEvent.click(screen.getByRole('button', { name: /scan breached passwords/i }));
    fireEvent.click(screen.getByRole('button', { name: /test webauthn \/ passkeys/i }));
    fireEvent.click(screen.getByRole('button', { name: /zeroize ram buffers/i }));
    fireEvent.click(screen.getByRole('button', { name: /purge orphaned chunks/i }));
  });
});
