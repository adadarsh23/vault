/* @vitest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncStorageCard } from '../../components/SettingsVault/SyncStorageCard';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const defaultProps = {
  storageUsedBytes: 1048576,
  usagePercentage: 0.1,
  itemCount: 15,
  syncStatus: 'idle' as const,
  syncHealthLabel: 'Healthy',
  lastSuccessfulSyncAt: Date.now(),
  lastSyncAttemptAt: Date.now(),
  hasPendingSyncRetry: false,
  syncConflictCount: 0,
  lastSyncError: null,
  isLoading: false,
  isMigrating: false,
  isSyncingLogs: false,
  syncWithCloud: vi.fn().mockResolvedValue(undefined),
  retryFailedSync: vi.fn().mockResolvedValue(undefined),
  migrateLocalToCloud: vi.fn().mockResolvedValue(undefined),
  syncLogs: vi.fn().mockResolvedValue(undefined),
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  cancelSync: vi.fn(),
  cancelActivityLogSync: vi.fn(),
};

describe('SyncStorageCard Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sync health and storage usage details', () => {
    render(<SyncStorageCard {...defaultProps} />);

    expect(screen.getByText('Sync and Storage')).toBeTruthy();
    expect(screen.getByText('Healthy')).toBeTruthy();
    expect(screen.getByText('15 items')).toBeTruthy();
  });

  it('triggers syncWithCloud on clicking "Sync cloud" button', () => {
    const syncWithCloudMock = vi.fn().mockResolvedValue(undefined);

    render(<SyncStorageCard {...defaultProps} syncWithCloud={syncWithCloudMock} />);

    const syncButton = screen.getByRole('button', { name: /sync cloud/i });
    fireEvent.click(syncButton);

    expect(syncWithCloudMock).toHaveBeenCalledTimes(1);
  });

  it('asserts "Retry failed" button disabled state when no retry is pending and triggers retryFailedSync when available', () => {
    const retryFailedSyncMock = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <SyncStorageCard {...defaultProps} retryFailedSync={retryFailedSyncMock} />
    );

    const retryDisabledButton = screen.getByRole('button', { name: /retry failed/i });
    expect(retryDisabledButton.hasAttribute('disabled')).toBe(true);

    rerender(
      <SyncStorageCard
        {...defaultProps}
        hasPendingSyncRetry={true}
        syncWithCloud={defaultProps.syncWithCloud}
        retryFailedSync={retryFailedSyncMock}
      />
    );

    const retryEnabledButton = screen.getByRole('button', { name: /retry failed/i });
    expect(retryEnabledButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(retryEnabledButton);
    expect(retryFailedSyncMock).toHaveBeenCalledTimes(1);
  });

  it('triggers cancelSync on clicking "Cancel sync" button when sync is active', () => {
    const cancelSyncMock = vi.fn();

    render(<SyncStorageCard {...defaultProps} syncStatus="syncing" cancelSync={cancelSyncMock} />);

    const moreButton = screen.getByRole('button', { name: /toggle more sync options/i });
    fireEvent.click(moreButton);

    const cancelButton = screen.getByRole('button', { name: /^cancel sync$/i });
    expect(cancelButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(cancelButton);
    expect(cancelSyncMock).toHaveBeenCalledTimes(1);
  });

  it('triggers migrateLocalToCloud on clicking "Migrate" button and asserts loading disabled state', () => {
    const migrateLocalToCloudMock = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <SyncStorageCard {...defaultProps} migrateLocalToCloud={migrateLocalToCloudMock} />
    );

    const moreButton = screen.getByRole('button', { name: /toggle more sync options/i });
    fireEvent.click(moreButton);

    const migrateButton = screen.getByRole('button', { name: /^migrate$/i });
    fireEvent.click(migrateButton);

    expect(migrateLocalToCloudMock).toHaveBeenCalledTimes(1);

    rerender(
      <SyncStorageCard
        {...defaultProps}
        isMigrating={true}
        migrateLocalToCloud={migrateLocalToCloudMock}
      />
    );

    const moreButtonRerender = screen.getByRole('button', { name: /toggle more sync options/i });
    fireEvent.click(moreButtonRerender);

    const loadingMigrateButton = screen.getByRole('button', { name: /^migrate$/i });
    expect(loadingMigrateButton.hasAttribute('disabled')).toBe(true);
  });

  it('triggers syncLogs on clicking "Sync logs" button and asserts isSyncingLogs loading state', () => {
    const syncLogsMock = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(<SyncStorageCard {...defaultProps} syncLogs={syncLogsMock} />);

    const moreButton = screen.getByRole('button', { name: /toggle more sync options/i });
    fireEvent.click(moreButton);

    const syncLogsButton = screen.getByRole('button', { name: /^sync logs$/i });
    fireEvent.click(syncLogsButton);

    expect(syncLogsMock).toHaveBeenCalledTimes(1);

    rerender(<SyncStorageCard {...defaultProps} isSyncingLogs={true} syncLogs={syncLogsMock} />);

    const moreButtonRerender = screen.getByRole('button', { name: /toggle more sync options/i });
    fireEvent.click(moreButtonRerender);

    const loadingSyncLogsButton = screen.getByRole('button', { name: /^sync logs$/i });
    expect(loadingSyncLogsButton.hasAttribute('disabled')).toBe(true);
  });

  it('triggers cancelActivityLogSync on clicking "Cancel logs sync" button when log sync is active', () => {
    const cancelActivityLogSyncMock = vi.fn();

    render(
      <SyncStorageCard
        {...defaultProps}
        isSyncingLogs={true}
        cancelActivityLogSync={cancelActivityLogSyncMock}
      />
    );

    const moreButton = screen.getByRole('button', { name: /toggle more sync options/i });
    fireEvent.click(moreButton);

    const cancelLogsButton = screen.getByRole('button', { name: /cancel logs sync/i });
    expect(cancelLogsButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(cancelLogsButton);
    expect(cancelActivityLogSyncMock).toHaveBeenCalledTimes(1);
  });
});
