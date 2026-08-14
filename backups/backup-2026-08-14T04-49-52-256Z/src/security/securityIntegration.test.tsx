/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceManagement, MFAChallenge, SecuritySettings } from './securityIntegration';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('../api/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    interceptors: {
      request: {
        use: vi.fn(() => 1),
        eject: vi.fn(),
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('submits MFA verification to the security endpoint', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const onComplete = vi.fn();

    render(<MFAChallenge method="totp" onComplete={onComplete} />);

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/security/mfa/verify', {
        code: '123456',
        method: 'totp',
      });
    });
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

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
        })
      );
    });
  });
});
