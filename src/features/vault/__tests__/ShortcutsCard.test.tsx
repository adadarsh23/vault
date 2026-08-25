/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShortcutsCard from '../components/SettingsVault/ShortcutsCard';
import ShortcutsPage from '../ShortcutsPage';

describe('ShortcutsCard & ShortcutsPage Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  it('renders Controls & Shortcuts title and section card description', () => {
    render(<ShortcutsPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Controls & Shortcuts/i })).toBeTruthy();
    expect(
      screen.getByText(
        'Keyboard and gesture shortcuts for fast, secure, and efficient vault navigation.',
      ),
    ).toBeTruthy();
  });

  it('renders all category filter buttons', () => {
    render(<ShortcutsCard />);
    expect(screen.getByText('All Controls')).toBeTruthy();
    expect(screen.getByText('Vault Operations')).toBeTruthy();
    expect(screen.getByText('Navigation & Views')).toBeTruthy();
    expect(screen.getByText('Text Editing')).toBeTruthy();
    expect(screen.getByText('Export & Security')).toBeTruthy();
    expect(screen.getByText('Touch & Gestures')).toBeTruthy();
  });

  it('filters shortcuts based on search query', () => {
    render(<ShortcutsCard />);
    const searchInput = screen.getByPlaceholderText(/Search shortcuts by name/i);

    fireEvent.change(searchInput, { target: { value: 'Lock' } });

    expect(screen.getByText('Immediately Lock Vault')).toBeTruthy();
    expect(screen.queryByText('Create New Item')).toBeNull();
  });

  it('switches active platform mode to macOS and updates modifier keys', () => {
    render(<ShortcutsCard />);
    const macButton = screen.getByRole('button', { name: /macOS/i });

    fireEvent.click(macButton);

    expect(screen.getByText('macOS (Apple Keybindings)')).toBeTruthy();
  });

  it('copies summary cheat sheet to clipboard on button click', async () => {
    render(<ShortcutsCard />);
    const copyButton = screen.getByTitle('Copy text summary of all shortcuts');

    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('--- VAULT CONTROLS & SHORTCUTS CHEAT SHEET ---'),
    );
  });

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ShortcutsCard />);

    const printButton = screen.getByTitle('Print reference sheet');
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('triggers window.print when Ctrl+P keyboard shortcut is pressed', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ShortcutsCard />);

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
