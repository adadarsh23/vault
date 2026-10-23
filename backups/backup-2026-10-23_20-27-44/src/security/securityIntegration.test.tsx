/* @vitest-environment jsdom */

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeviceManagement,
  MFAChallenge,
  SecuritySettings,
  buildSecurityHeaders,
  clearFingerprintCache,
  collectDeviceSignals,
  createFallbackFingerprint,
  getErrorMessage,
  hashSignals,
  normalizeSecuritySettings,
  normalizeTrustScore,
  resolveDeviceFingerprint,
  useDeviceFingerprint,
  useSecureRequest,
  useSecurityInterceptor,
} from './securityIntegration';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
const mockInterceptorUse = vi.fn((_onFulfilled?: unknown, _onRejected?: unknown) => 1);
const mockInterceptorEject = vi.fn((_id?: unknown) => undefined);

vi.mock('../api/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => (mockGet as any)(...args),
    post: (...args: unknown[]) => (mockPost as any)(...args),
    delete: (...args: unknown[]) => (mockDelete as any)(...args),
    interceptors: {
      request: {
        use: (onFulfilled?: unknown, onRejected?: unknown) =>
          mockInterceptorUse(onFulfilled, onRejected),
        eject: (id?: unknown) => mockInterceptorEject(id),
      },
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('securityIntegration', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockInterceptorUse.mockClear();
    mockInterceptorEject.mockClear();
    clearFingerprintCache();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  describe('MFAChallenge', () => {
    it('submits MFA verification to the security endpoint with token, code, and method', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const onComplete = vi.fn();

      render(<MFAChallenge method="totp" onComplete={onComplete} />);

      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '123456' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/security/mfa/verify', {
          token: '123456',
          code: '123456',
          method: 'totp',
        });
      });
      expect(onComplete).toHaveBeenCalledWith('123456');
    });

    it('rejects codes shorter than 6 digits without submitting to the server', async () => {
      const onComplete = vi.fn();
      render(<MFAChallenge method="totp" onComplete={onComplete} />);

      const input = screen.getByPlaceholderText('000000');
      fireEvent.change(input, { target: { value: '123' } });

      const form = input.closest('form');
      expect(form).not.toBeNull();
      fireEvent.submit(form!);

      expect(mockPost).not.toHaveBeenCalled();
      expect(screen.getByText('Enter a valid 6-digit code.')).toBeInTheDocument();
    });

    it('filters non-digits and allows pasting full 6 digits', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const onComplete = vi.fn();
      render(<MFAChallenge method="totp" onComplete={onComplete} />);

      const input = screen.getByPlaceholderText('000000') as HTMLInputElement;

      // Filter non-digits
      fireEvent.change(input, { target: { value: '12abc34xyz' } });
      expect(input.value).toBe('1234');

      // Paste event
      fireEvent.paste(input, {
        clipboardData: {
          getData: () => '987 654',
        },
      });
      expect(input.value).toBe('987654');
    });

    it('displays error message when verification endpoint fails', async () => {
      mockPost.mockRejectedValue({
        response: { data: { message: 'Invalid 2FA code provided.' } },
      });
      const onComplete = vi.fn();

      render(<MFAChallenge method="totp" onComplete={onComplete} />);

      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '654321' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid 2FA code provided.')).toBeInTheDocument();
      });
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('invokes onCancel callback when cancel button is clicked', () => {
      const onCancel = vi.fn();
      render(<MFAChallenge method="totp" onComplete={vi.fn()} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /^cancel$/i });
      fireEvent.click(cancelButton);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('DeviceManagement', () => {
    it('forgets a selected trusted device', async () => {
      mockGet.mockResolvedValue({
        data: {
          devices: [
            {
              id: 'device/1',
              name: 'Office Laptop',
              trustScore: 89,
              lastSeen: Date.now(),
              accessCount: 7,
              isVerified: true,
              platform: 'Windows NT',
            },
          ],
        },
      });
      mockDelete.mockResolvedValue({ data: { success: true } });

      render(<DeviceManagement />);

      await screen.findByText('Office Laptop');
      fireEvent.click(screen.getByRole('button', { name: /^forget$/i }));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('/security/devices/device%2F1');
      });
      expect(screen.queryByText('Office Laptop')).not.toBeInTheDocument();
    });

    it('logs out all other devices on user request', async () => {
      mockGet.mockResolvedValue({
        data: {
          devices: [
            {
              id: 'device/1',
              name: 'Office Laptop',
              trustScore: 90,
              lastSeen: Date.now(),
              accessCount: 5,
              isVerified: true,
            },
          ],
        },
      });
      mockPost.mockResolvedValue({
        data: { success: true, message: 'Logged out from other devices' },
      });

      render(<DeviceManagement />);

      await screen.findByText('Office Laptop');
      const logoutAllBtn = screen.getByRole('button', { name: /logout from all other devices/i });
      fireEvent.click(logoutAllBtn);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/security/devices/forget-all');
      });
    });

    it('renders empty state when no devices are registered', async () => {
      mockGet.mockResolvedValue({ data: { devices: [] } });

      render(<DeviceManagement />);

      await screen.findByText(/no trusted devices yet/i);
    });

    it('handles device fetch errors and provides retry capability', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      render(<DeviceManagement />);

      await screen.findByText(/network error/i);
      const retryBtn = screen.getByRole('button', { name: /retry/i });

      mockGet.mockResolvedValueOnce({
        data: {
          devices: [
            {
              id: 'device/2',
              name: 'Home Desktop',
              trustScore: 95,
              lastSeen: Date.now(),
              accessCount: 12,
              isVerified: true,
            },
          ],
        },
      });

      fireEvent.click(retryBtn);
      await screen.findByText('Home Desktop');
    });
  });

  describe('SecuritySettings', () => {
    it('updates login alerts in security settings', async () => {
      mockGet.mockResolvedValue({
        data: {
          mfaEnabled: true,
          mfaMethods: ['totp', 'email'],
          loginAlerts: true,
          suspiciousActivityAlerts: true,
          twoFactorRequired: true,
          sessionTimeout: 3600,
        },
      });
      mockPost.mockResolvedValue({ data: { success: true } });

      render(<SecuritySettings />);

      await waitFor(() => {
        expect(screen.getByText('Security Settings')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/security/settings',
          expect.objectContaining({
            loginAlerts: false,
          }),
        );
      });
    });

    it('updates session timeout when select option changes', async () => {
      mockGet.mockResolvedValue({
        data: {
          mfaEnabled: false,
          mfaMethods: ['totp'],
          loginAlerts: true,
          suspiciousActivityAlerts: true,
          twoFactorRequired: false,
          sessionTimeout: 3600,
        },
      });
      mockPost.mockResolvedValue({ data: { success: true } });

      render(<SecuritySettings />);

      await waitFor(() => {
        expect(screen.getByLabelText(/session timeout/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/session timeout/i);
      fireEvent.change(select, { target: { value: '1800' } });

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/security/settings',
          expect.objectContaining({
            sessionTimeout: 1800,
          }),
        );
      });
    });

    it('reverts state and displays error if updating settings fails', async () => {
      mockGet.mockResolvedValue({
        data: {
          mfaEnabled: true,
          mfaMethods: ['totp'],
          loginAlerts: true,
          suspiciousActivityAlerts: true,
          twoFactorRequired: false,
          sessionTimeout: 3600,
        },
      });
      mockPost.mockRejectedValue(new Error('Server unavailable'));

      render(<SecuritySettings />);

      await waitFor(() => {
        expect(screen.getByText('Security Settings')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);

      fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        expect(screen.getByText('Server unavailable')).toBeInTheDocument();
      });

      // Assert rollback
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    });
  });

  describe('Fingerprinting and Utilities', () => {
    it('creates a non-empty fallback fingerprint with fp_ prefix', () => {
      const fp = createFallbackFingerprint();
      expect(fp).toMatch(/^fp_[a-z0-9]+_[a-z0-9]+$/i);
    });

    it('normalizes trust score bounds between 0 and 100', () => {
      expect(normalizeTrustScore(-10)).toBe(0);
      expect(normalizeTrustScore(150)).toBe(100);
      expect(normalizeTrustScore(85.6)).toBe(86);
      expect(normalizeTrustScore('invalid')).toBe(0);
    });

    it('normalizes security settings correctly with fallback defaults', () => {
      const normalized = normalizeSecuritySettings(null);
      expect(normalized.mfaEnabled).toBe(false);
      expect(normalized.sessionTimeout).toBe(3600);
      expect(normalized.loginAlerts).toBe(true);
    });

    it('collects device signals without throwing exceptions', () => {
      const signals = collectDeviceSignals();
      expect(signals).toBeDefined();
      expect(typeof signals.platform).toBe('string');
      expect(typeof signals.timezone).toBe('string');
      expect(typeof signals.colorDepth).toBe('number');
    });

    it('produces deterministic hash string for device signals', async () => {
      const signals = collectDeviceSignals();
      const hash1 = await hashSignals(signals);
      const hash2 = await hashSignals(signals);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBeGreaterThan(10);
    });

    it('builds expected security headers record', () => {
      const headers = buildSecurityHeaders('test-fingerprint-123');
      expect(headers['X-Fingerprint-Id']).toBe('test-fingerprint-123');
      expect(headers['X-Screen-Resolution']).toBeDefined();
      expect(headers['X-Timezone']).toBeDefined();
      expect(headers['X-Platform']).toBeDefined();
    });

    it('resolves and caches device fingerprint in sessionStorage', async () => {
      clearFingerprintCache();
      const fp1 = await resolveDeviceFingerprint();
      expect(fp1).toBeDefined();

      const stored = window.sessionStorage.getItem('deviceFingerprint');
      expect(stored).toBe(fp1);

      const fp2 = await resolveDeviceFingerprint();
      expect(fp2).toBe(fp1);
    });

    it('extracts error messages from various response formats', () => {
      expect(getErrorMessage('Simple error string', 'fallback')).toBe('Simple error string');
      expect(getErrorMessage(new Error('Standard Error'), 'fallback')).toBe('Standard Error');
      expect(
        getErrorMessage({ response: { data: { message: 'Nested response error' } } }, 'fallback'),
      ).toBe('Nested response error');
      expect(getErrorMessage(null, 'Custom Fallback')).toBe('Custom Fallback');
    });
  });

  describe('Hooks', () => {
    it('useDeviceFingerprint provides fingerprint and loading state', async () => {
      const { result } = renderHook(() => useDeviceFingerprint());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(typeof result.current.fingerprint).toBe('string');
    });

    it('useSecureRequest injects security headers into axios request config', async () => {
      const { result } = renderHook(() => useSecureRequest());

      const baseConfig = { headers: { 'Content-Type': 'application/json' } };
      let enrichedConfig: any;
      await act(async () => {
        enrichedConfig = await result.current(baseConfig);
      });

      expect(enrichedConfig.headers).toHaveProperty('X-Fingerprint-Id');
      expect(enrichedConfig.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('useSecurityInterceptor mounts and ejects request interceptor', async () => {
      const { unmount } = renderHook(() => useSecurityInterceptor());

      await waitFor(() => {
        expect(mockInterceptorUse).toHaveBeenCalled();
      });
      unmount();
      expect(mockInterceptorEject).toHaveBeenCalled();
    });
  });
});
