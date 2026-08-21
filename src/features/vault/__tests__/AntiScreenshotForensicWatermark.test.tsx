/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { useVaultStore } from '../../../store/vaultStore';
import { ForensicWatermark } from '../../../components/security/ForensicWatermark';
import { useAntiScreenshotAndShield } from '../../../hooks/useAntiScreenshotAndShield';
import { toast } from 'sonner';

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock activity session info
vi.mock('../../../lib/activity', () => ({
  getSessionName: vi.fn(() => 'Test Browser on Windows (Desktop) - 05:30 PM'),
  getSessionIdentifier: vi.fn(() => 'test-session-12345678'),
}));

vi.mock('../../../lib/auth-session', () => ({
  getDeviceId: vi.fn(() => 'test-device-87654321'),
}));

describe('Anti-Screenshot, Print Blocking & Dynamic Forensic Watermarking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
      preferences: {
        ...useVaultStore.getState().preferences,
        isPrintBlockingEnabled: true,
        isTabSwitchShieldEnabled: true,
        isForensicWatermarkEnabled: true,
      },
    });
  });

  describe('🔹 1. Security Preferences in VaultStore', () => {
    it('initializes with anti-screenshot, tab-switch shield, and forensic watermark enabled by default', () => {
      const prefs = useVaultStore.getState().preferences;
      expect(prefs.isPrintBlockingEnabled).toBe(true);
      expect(prefs.isTabSwitchShieldEnabled).toBe(true);
      expect(prefs.isForensicWatermarkEnabled).toBe(true);
    });

    it('allows toggling print blocking, tab-switch shield, and forensic watermark', () => {
      act(() => {
        useVaultStore.getState().updatePreferences({
          isPrintBlockingEnabled: false,
          isTabSwitchShieldEnabled: false,
          isForensicWatermarkEnabled: false,
        });
      });

      let prefs = useVaultStore.getState().preferences;
      expect(prefs.isPrintBlockingEnabled).toBe(false);
      expect(prefs.isTabSwitchShieldEnabled).toBe(false);
      expect(prefs.isForensicWatermarkEnabled).toBe(false);

      act(() => {
        useVaultStore.getState().updatePreferences({
          isPrintBlockingEnabled: true,
          isTabSwitchShieldEnabled: true,
          isForensicWatermarkEnabled: true,
        });
      });

      prefs = useVaultStore.getState().preferences;
      expect(prefs.isPrintBlockingEnabled).toBe(true);
      expect(prefs.isTabSwitchShieldEnabled).toBe(true);
      expect(prefs.isForensicWatermarkEnabled).toBe(true);
    });
  });

  describe('🔹 2. Dynamic Forensic Watermarking (Anti-Leak Stamping)', () => {
    it('renders SVG patterned watermark overlay with device and session identifiers', () => {
      const { container } = render(
        <ForensicWatermark
          userId="user@vault.internal"
          classification="CONFIDENTIAL CLASSIFIED"
          opacity={0.15}
        />
      );

      const watermark = screen.getByTestId('forensic-watermark');
      expect(watermark).toBeDefined();
      expect(watermark.style.opacity).toBe('0.15');

      // Check SVG pattern rendering
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();

      const pattern = container.querySelector('pattern');
      expect(pattern).toBeDefined();

      const textElements = container.querySelectorAll('text');
      expect(textElements.length).toBeGreaterThanOrEqual(2);
      expect(textElements[0].textContent).toContain('USER: user@vault.internal');

      // Perimeter stamps
      expect(container.textContent).toContain('LEAK-TRACE:');
    });

    it('renders custom text and timestamp when provided', () => {
      const { container } = render(<ForensicWatermark customText="CUSTOM SECURITY STAMP" />);

      const textElements = container.querySelectorAll('text');
      expect(textElements[0].textContent).toContain('CUSTOM SECURITY STAMP');
    });
  });

  describe('🔹 3. useAntiScreenshotAndShield Hook', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('activates shield when tab visibility changes to hidden', () => {
      const { result } = renderHook(() =>
        useAntiScreenshotAndShield({
          isTabSwitchShieldEnabled: true,
          isPrintBlockingEnabled: true,
          isViewingSensitiveMedia: true,
        })
      );

      expect(result.current.isShieldActive).toBe(false);

      // Simulate tab switch / app backgrounding
      act(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(result.current.isShieldActive).toBe(true);
      expect(result.current.shieldReason).toBe('tab-hidden');

      // Simulate user returning to tab
      act(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(result.current.isShieldActive).toBe(false);
    });

    it('activates shield on window blur and deactivates on window focus', () => {
      const { result } = renderHook(() =>
        useAntiScreenshotAndShield({
          isTabSwitchShieldEnabled: true,
          isPrintBlockingEnabled: true,
          isViewingSensitiveMedia: true,
        })
      );

      expect(result.current.isShieldActive).toBe(false);

      // Window blur (e.g. OS Alt-Tab, task switcher)
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });

      expect(result.current.isShieldActive).toBe(true);
      expect(result.current.shieldReason).toBe('window-blurred');

      // Window focus
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(result.current.isShieldActive).toBe(false);
    });

    it('intercepts Ctrl+P / Cmd+P, stops default print, and shows security warning', () => {
      const { result } = renderHook(() =>
        useAntiScreenshotAndShield({
          isTabSwitchShieldEnabled: true,
          isPrintBlockingEnabled: true,
          isViewingSensitiveMedia: true,
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'p',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Printing and PDF export are blocked'),
        expect.any(Object)
      );
      expect(result.current.isShieldActive).toBe(true);
    });

    it('intercepts PrintScreen key and activates security shield', () => {
      const { result } = renderHook(() =>
        useAntiScreenshotAndShield({
          isTabSwitchShieldEnabled: true,
          isPrintBlockingEnabled: true,
          isViewingSensitiveMedia: true,
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'PrintScreen',
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining('Security Shield activated against screen capture'),
        expect.any(Object)
      );
      expect(result.current.isShieldActive).toBe(true);
    });

    it('does not trigger shield when disabled in preferences', () => {
      const { result } = renderHook(() =>
        useAntiScreenshotAndShield({
          isTabSwitchShieldEnabled: false,
          isPrintBlockingEnabled: false,
          isViewingSensitiveMedia: true,
        })
      );

      // Simulate blur
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });

      expect(result.current.isShieldActive).toBe(false);

      // Simulate Ctrl+P
      const event = new KeyboardEvent('keydown', {
        key: 'p',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(result.current.isShieldActive).toBe(false);
    });
  });
});
