/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { TodoVault } from './TodoVault';

const mockAddItem = vi.fn();
const mockUpdateItem = vi.fn();
const mockRemoveItem = vi.fn();
const mockTogglePin = vi.fn();
const mockEncryptData = vi.fn();
const mockDecryptData = vi.fn();

let mockVaultState: any;

const flushAsyncUpdates = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

vi.mock('../../store/vaultStore', () => ({
  useVaultStore: (selector: (state: any) => unknown) => selector(mockVaultState),
}));

vi.mock('../../hooks/useVaultFolders', () => ({
  useVaultFolders: () => ({
    folders: [],
    currentFolder: null,
    setCurrentFolder: vi.fn(),
    isAddingFolder: false,
    setIsAddingFolder: vi.fn(),
    newFolderName: '',
    setNewFolderName: vi.fn(),
    editingFolder: null,
    setEditingFolder: vi.fn(),
    editingFolderName: '',
    setEditingFolderName: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleRenameFolder: vi.fn(),
    handleDeleteFolder: vi.fn(),
    handleMoveToFolder: vi.fn(),
  }),
}));

vi.mock('../../components/vault/FolderSidebar', () => ({
  FolderSidebar: () => null,
}));

vi.mock('../../components/vault/MobileFolderMenu', () => ({
  MobileFolderMenu: () => null,
}));

vi.mock('../../lib/cryptoPrimitives', () => ({
  encryptData: (...args: unknown[]) => mockEncryptData(...args),
  decryptData: (...args: unknown[]) => mockDecryptData(...args),
}));

vi.mock('../../lib/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../../lib/vaultDragDrop', () => ({
  setDraggedVaultItem: vi.fn(),
  clearDraggedVaultItem: vi.fn(),
  getDraggedVaultItem: vi.fn(),
  getDraggedVaultItems: vi.fn(),
  setDraggedVaultItems: vi.fn(),
  useVaultDragState: () => ({ isDragging: false, itemIds: [], count: 0 }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TodoVault security write path', () => {
  beforeEach(() => {
    mockAddItem.mockReset();
    mockUpdateItem.mockReset();
    mockRemoveItem.mockReset();
    mockTogglePin.mockReset();
    mockEncryptData.mockReset();
    mockDecryptData.mockReset();

    mockEncryptData.mockResolvedValue('encrypted-payload');
    mockDecryptData.mockResolvedValue(null);
    mockAddItem.mockResolvedValue(undefined);
    mockUpdateItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);
    mockTogglePin.mockResolvedValue(undefined);

    mockVaultState = {
      items: [],
      addItem: mockAddItem,
      updateItem: mockUpdateItem,
      removeItem: mockRemoveItem,
      masterKey: 'test-master-key',
      togglePin: mockTogglePin,
      pinningItemIds: [],
    };
  });

  it('stores a sanitized title instead of plaintext todo task', async () => {
    const sensitiveTask = 'Pay rent on Friday';

    render(<TodoVault />);

    fireEvent.click(screen.getByRole('button', { name: /add todo/i }));
    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: sensitiveTask },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save todo/i }));
      await flushAsyncUpdates();
    });

    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledTimes(1);
    });

    const addCallArg = mockAddItem.mock.calls[0][0];
    expect(addCallArg).toMatchObject({
      type: 'todo',
      title: 'Encrypted Todo',
      content: 'encrypted-payload',
    });
    expect(String(addCallArg.title)).not.toContain(sensitiveTask);

    const encryptedPayload = JSON.parse(mockEncryptData.mock.calls[0][0]);
    expect(encryptedPayload).toEqual({
      task: sensitiveTask,
      completed: false,
      dueDate: '',
      priority: 'medium',
    });
    expect(encryptedPayload).not.toHaveProperty('notes');
  });

  it('does not expose a notes input when creating todos', async () => {
    render(<TodoVault />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add todo/i }));
      await flushAsyncUpdates();
    });

    expect(screen.queryByPlaceholderText(/notes/i)).not.toBeInTheDocument();
  });

  it('keeps the edit form open and reports update failures', async () => {
    mockVaultState.items = [
      {
        id: 'todo-1',
        type: 'todo',
        title: 'Encrypted Todo',
        content: 'encrypted-record',
        updatedAt: '2026-05-30T00:00:00.000Z',
      },
    ];
    mockDecryptData.mockResolvedValue(
      JSON.stringify({
        task: 'Existing task',
        notes: 'legacy note',
        completed: false,
        dueDate: '',
        priority: 'medium',
      }),
    );
    mockUpdateItem.mockRejectedValueOnce(new Error('update failed'));

    render(<TodoVault />);

    expect(await screen.findByText('Existing task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit todo/i }));
    fireEvent.change(screen.getByDisplayValue('Existing task'), {
      target: { value: 'Updated task' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save todo changes/i }));
      await flushAsyncUpdates();
    });

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledTimes(1);
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to update todo');
    expect(screen.getByDisplayValue('Updated task')).toBeInTheDocument();
  });
});
