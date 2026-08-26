/* @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { UniversalSyncWidget } from '../../src/components/vault/UniversalSyncWidget';
import { useVaultStore } from '../../src/store/vaultStore';

describe('UniversalSyncWidget', () => {
  const originalFetch = global.fetch;

  const renderWidget = async () => {
    let result: any;
    await act(async () => {
      result = render(<UniversalSyncWidget />);
    });
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'connected', database: { name: 'vault_prod' } }),
    });

    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
      syncStatus: 'idle',
      lastSyncAttemptAt: Date.now(),
      lastSyncError: null,
      items: [
        {
          id: '1',
          title: 'Gmail',
          type: 'password',
          encryptedData: 'xyz',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: '2',
          title: 'Work Note',
          type: 'note',
          encryptedData: 'xyz',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: '3',
          title: 'Doc',
          type: 'document',
          encryptedData: 'xyz',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: '4',
          title: 'Photo 1',
          type: 'photo',
          encryptedData: 'xyz',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: '5',
          title: 'Contact Mom',
          type: 'contact',
          encryptedData: 'xyz',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      fetchItems: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not render when user is not signed in / vault is locked', async () => {
    useVaultStore.setState({ isUnlocked: false, isVaultReady: false });
    const { container } = await renderWidget();

    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('does not render when isVaultReady is false', async () => {
    useVaultStore.setState({ isUnlocked: true, isVaultReady: false });
    const { container } = await renderWidget();

    expect(container.firstChild).toBeNull();
  });

  it('renders the floating universal sync trigger capsule', async () => {
    await renderWidget();

    const button = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    expect(button).toBeInTheDocument();
  });

  it('opens the sync center popover when clicked', async () => {
    await renderWidget();

    const button = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      screen.getByRole('dialog', { name: /universal cloud sync center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Universal Sync Center/i)).toBeInTheDocument();
    expect(screen.getByText(/5 Total/i)).toBeInTheDocument();
  });

  it('displays correct per-vault collection breakdown', async () => {
    await renderWidget();

    const button = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Passwords')).toBeInTheDocument();
    expect(screen.getByText('Notes & Todos')).toBeInTheDocument();
    expect(screen.getByText('Media Files')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Contacts & IDs')).toBeInTheDocument();
  });

  it('correctly maps all item types including chat, location, files, and custom types', async () => {
    useVaultStore.setState({
      items: [
        { id: '1', title: 'P1', type: 'password', encryptedData: 'x', createdAt: 1, updatedAt: 1 },
        { id: '2', title: 'N1', type: 'note', encryptedData: 'x', createdAt: 1, updatedAt: 1 },
        { id: '3', title: 'T1', type: 'todo', encryptedData: 'x', createdAt: 1, updatedAt: 1 },
        { id: '4', title: 'C1', type: 'chat', encryptedData: 'x', createdAt: 1, updatedAt: 1 },
        { id: '5', title: 'L1', type: 'location', encryptedData: 'x', createdAt: 1, updatedAt: 1 },
        { id: '6', title: 'F1', type: 'file', encryptedData: 'x', createdAt: 1, updatedAt: 1 },
        {
          id: '7',
          title: 'X1',
          type: 'custom_type' as any,
          encryptedData: 'x',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await renderWidget();

    const button = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText(/7 Total/i)).toBeInTheDocument();
    expect(screen.getByText('Other Items')).toBeInTheDocument();
  });

  it('closes popover when pressing Escape key', async () => {
    await renderWidget();

    const button = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes popover when clicking close button', async () => {
    await renderWidget();

    const button = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(button);
    });

    const closeBtn = screen.getByLabelText(/close sync center/i);
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('triggers manual synchronization when clicking Sync All Vaults Now', async () => {
    const fetchItemsMock = vi.fn().mockResolvedValue(undefined);
    useVaultStore.setState({ fetchItems: fetchItemsMock });

    await renderWidget();

    const triggerBtn = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    const syncActionBtn = screen.getByRole('button', { name: /sync all vaults now/i });
    await act(async () => {
      fireEvent.click(syncActionBtn);
    });

    await waitFor(() => {
      expect(fetchItemsMock).toHaveBeenCalledWith('manual');
    });
  });

  it('reacts dynamically to custom cloud health events', async () => {
    await renderWidget();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('vault-cloud-health-status', {
          detail: { status: 'connected', dbName: 'atlas_custom_cluster' },
        }),
      );
    });

    const triggerBtn = screen.getByRole('button', {
      name: /universal cloud sync|cloud is synchronizing|cloud connection error/i,
    });
    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/MongoDB Atlas \(atlas_custom_cluster\)/i)).toBeInTheDocument();
    });
  });

  it('displays syncing state when syncStatus is syncing', async () => {
    useVaultStore.setState({ syncStatus: 'syncing' });
    await renderWidget();

    const button = screen.getByRole('button', { name: /cloud is synchronizing/i });
    expect(button).toBeInTheDocument();
  });

  it('displays error state when syncStatus is error', async () => {
    useVaultStore.setState({ syncStatus: 'error', lastSyncError: 'Connection refused' });
    await renderWidget();

    const button = screen.getByRole('button', { name: /cloud connection error/i });
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });
});
