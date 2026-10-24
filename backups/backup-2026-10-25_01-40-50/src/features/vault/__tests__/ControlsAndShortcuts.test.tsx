/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsPage } from '../ShortcutsPage';
import { ShortcutsCard } from '../components/SettingsVault/ShortcutsCard';
import { matchesShortcut, formatKeyForPlatform, detectDevice } from '../../../lib/platform';

describe('Controls & Shortcuts Integration Test Suite', () => {
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

  describe('Platform Helper Functions', () => {
    it('detects device properties correctly', () => {
      const device = detectDevice();
      expect(device).toHaveProperty('os');
      expect(device).toHaveProperty('isTouch');
      expect(device).toHaveProperty('platformName');
    });

    it('formats keys natively for macOS', () => {
      expect(formatKeyForPlatform('ctrl', 'mac')).toBe('⌘');
      expect(formatKeyForPlatform('alt', 'mac')).toBe('⌥');
      expect(formatKeyForPlatform('shift', 'mac')).toBe('⇧');
      expect(formatKeyForPlatform('delete', 'mac')).toBe('⌫');
    });

    it('formats keys natively for Windows', () => {
      expect(formatKeyForPlatform('mod', 'windows')).toBe('Ctrl');
      expect(formatKeyForPlatform('opt', 'windows')).toBe('Alt');
      expect(formatKeyForPlatform('del', 'windows')).toBe('Delete');
    });

    it('matches keyboard shortcuts correctly', () => {
      const eventCtrlK = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
      expect(matchesShortcut(eventCtrlK, ['Ctrl', 'K'])).toBe(true);

      const eventAltArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true });
      expect(matchesShortcut(eventAltArrow, ['Alt', '← / →'])).toBe(true);
    });
  });

  describe('Controls & Shortcuts UI & Performance', () => {
    it('renders Controls & Shortcuts standalone single page', () => {
      render(<ShortcutsPage />);

      const heading = screen.getByRole('heading', { level: 1, name: /Controls & Shortcuts/i });
      expect(heading).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Back/i })).toBeNull();
    });

    it('filters shortcuts grid when category tabs are clicked', async () => {
      render(<ShortcutsCard />);

      const gestureTab = screen.getByRole('button', { name: /Touch & Gestures/i });
      fireEvent.click(gestureTab);

      expect(screen.getByText('Drag & Drop File Upload')).toBeTruthy();
      expect(screen.queryByText('Create New Item')).toBeNull();
    });

    it('handles search input and clear button', () => {
      render(<ShortcutsCard />);

      const searchInput = screen.getByPlaceholderText(
        /Search shortcuts by name/i,
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'password' } });

      expect(searchInput.value).toBe('password');
      expect(screen.getByText('Quick Copy Password')).toBeTruthy();

      const clearBtn = screen.getByRole('button', { name: /Clear/i });
      fireEvent.click(clearBtn);

      expect(searchInput.value).toBe('');
    });

    it('triggers window.print when Ctrl+P is pressed', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      render(<ShortcutsCard />);

      fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

      expect(printSpy).toHaveBeenCalled();
      printSpy.mockRestore();
    });

    it('renders all shortcuts cards with page-break-inside avoid for multi-page print support', () => {
      const { container } = render(<ShortcutsCard />);
      const cardItems = container.querySelectorAll('.shortcut-card-item');

      expect(cardItems.length).toBeGreaterThan(15);
      cardItems.forEach((item: any) => {
        expect(item.className).toContain('print:break-inside-avoid');
      });
    });
  });
});
