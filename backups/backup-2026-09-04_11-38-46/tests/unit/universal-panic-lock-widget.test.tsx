/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UniversalPanicLockWidget } from '../../src/components/vault/UniversalPanicLockWidget';
import { useVaultStore } from '../../src/store/vaultStore';

describe('UniversalPanicLockWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
    });
  });

  it('does not render when vault is locked (isUnlocked is false)', async () => {
    useVaultStore.setState({ isUnlocked: false, isVaultReady: true });
    let containerResult: any;
    await act(async () => {
      const { container } = render(<UniversalPanicLockWidget />);
      containerResult = container;
    });

    expect(containerResult.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: /instant panic lock/i })).not.toBeInTheDocument();
  });

  it('does not render when isVaultReady is false', async () => {
    useVaultStore.setState({ isUnlocked: true, isVaultReady: false });
    let containerResult: any;
    await act(async () => {
      const { container } = render(<UniversalPanicLockWidget />);
      containerResult = container;
    });

    expect(containerResult.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: /instant panic lock/i })).not.toBeInTheDocument();
  });

  it('renders floating panic lock button when unlocked and ready', async () => {
    await act(async () => {
      render(<UniversalPanicLockWidget />);
    });

    const panicButton = screen.getByRole('button', {
      name: /instant panic lock/i,
    });
    expect(panicButton).toBeInTheDocument();
    expect(panicButton).toHaveAttribute(
      'title',
      'Instant Panic Lock (Press Esc 3× or click to lock instantly)',
    );
  });

  it('triggers panicLock and locks the vault when clicked', async () => {
    const panicLockSpy = vi.fn(() => {
      useVaultStore.setState({ isUnlocked: false, isVaultReady: false });
    });
    useVaultStore.setState({ panicLock: panicLockSpy });

    await act(async () => {
      render(<UniversalPanicLockWidget />);
    });

    const panicButton = screen.getByRole('button', {
      name: /instant panic lock/i,
    });

    await act(async () => {
      fireEvent.click(panicButton);
    });

    expect(panicLockSpy).toHaveBeenCalledTimes(1);
    expect(useVaultStore.getState().isUnlocked).toBe(false);
  });

  it('safely handles errors without crashing if panicLock throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingPanicSpy = vi.fn(() => {
      throw new Error('Test Panic Lock Error');
    });
    useVaultStore.setState({ panicLock: throwingPanicSpy });

    await act(async () => {
      render(<UniversalPanicLockWidget />);
    });

    const panicButton = screen.getByRole('button', {
      name: /instant panic lock/i,
    });

    await act(async () => {
      expect(() => fireEvent.click(panicButton)).not.toThrow();
    });

    expect(throwingPanicSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
