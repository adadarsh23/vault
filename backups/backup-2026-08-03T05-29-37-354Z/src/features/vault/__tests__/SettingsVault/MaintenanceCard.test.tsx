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
});
