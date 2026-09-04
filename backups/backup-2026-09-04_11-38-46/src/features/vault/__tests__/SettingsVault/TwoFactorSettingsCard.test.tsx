/* @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwoFactorSettingsCard } from '../../components/SettingsVault/TwoFactorSettingsCard';
import * as authApi from '../../../../lib/auth-api';

vi.mock('../../../../lib/auth-api', () => ({
  setup2FA: vi.fn(),
  verify2FASetup: vi.fn(),
  disable2FA: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TwoFactorSettingsCard Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: vi.fn().mockReturnValue('blob:http://localhost/fake-blob'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    });
  });

  it('renders initial 2FA status accurately when disabled', () => {
    render(<TwoFactorSettingsCard twoFactorEnabled={false} onUpdate={vi.fn()} />);

    expect(screen.getByText('2FA')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeTruthy();
  });

  it('requests TOTP secret and QR code on clicking "Enable 2FA" button', async () => {
    vi.mocked(authApi.setup2FA).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeUrl: 'data:image/png;base64,fakeqrcode',
    });

    render(<TwoFactorSettingsCard twoFactorEnabled={false} onUpdate={vi.fn()} />);

    const enableButton = screen.getByRole('button', { name: /enable 2fa/i });
    fireEvent.click(enableButton);

    expect(authApi.setup2FA).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('Setup 2FA Authenticator')).toBeTruthy();
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    });
  });

  it('asserts "Verify" button disabled state until 6 digits entered, then verifies and calls onUpdate', async () => {
    const onUpdateMock = vi.fn();
    vi.mocked(authApi.setup2FA).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeUrl: 'data:image/png;base64,fakeqrcode',
    });
    vi.mocked(authApi.verify2FASetup).mockResolvedValue({
      backupCodes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5'],
    });

    render(<TwoFactorSettingsCard twoFactorEnabled={false} onUpdate={onUpdateMock} />);

    fireEvent.click(screen.getByRole('button', { name: /enable 2fa/i }));

    await waitFor(() => {
      expect(screen.getByText('Setup 2FA Authenticator')).toBeTruthy();
    });

    const verifyButton = screen.getByRole('button', { name: /verify/i }) as HTMLButtonElement;
    expect(verifyButton.disabled).toBe(true);

    const otpInput = screen.getByPlaceholderText('000 000');
    fireEvent.change(otpInput, { target: { value: '123456' } });

    expect(verifyButton.disabled).toBe(false);
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456');
      expect(onUpdateMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('2FA successfully activated')).toBeTruthy();
      expect(screen.getByText('CODE1')).toBeTruthy();
    });
  });

  it('triggers backup code download on clicking "Download Codes" button', async () => {
    vi.mocked(authApi.setup2FA).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeUrl: 'data:image/png;base64,fakeqrcode',
    });
    vi.mocked(authApi.verify2FASetup).mockResolvedValue({
      backupCodes: ['CODE1', 'CODE2', 'CODE3'],
    });

    render(<TwoFactorSettingsCard twoFactorEnabled={false} onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /enable 2fa/i }));
    await waitFor(() => expect(screen.getByPlaceholderText('000 000')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('000 000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => expect(screen.getByText('CODE1')).toBeTruthy());

    const downloadButton = screen.getByRole('button', { name: /download codes/i });
    fireEvent.click(downloadButton);

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('disables 2FA upon entering OTP and clicking "Confirm Disable"', async () => {
    const onUpdateMock = vi.fn();
    vi.mocked(authApi.disable2FA).mockResolvedValue(undefined as any);

    render(<TwoFactorSettingsCard twoFactorEnabled={true} onUpdate={onUpdateMock} />);

    const disableButton = screen.getByRole('button', { name: /disable 2fa/i });
    fireEvent.click(disableButton);

    await waitFor(() => {
      expect(screen.getByText('Deactivate 2FA protection')).toBeTruthy();
    });

    const confirmDisableButton = screen.getByRole('button', {
      name: /confirm disable/i,
    }) as HTMLButtonElement;
    expect(confirmDisableButton.disabled).toBe(true);

    const otpInput = screen.getByPlaceholderText('Enter Code');
    fireEvent.change(otpInput, { target: { value: '654321' } });

    expect(confirmDisableButton.disabled).toBe(false);
    fireEvent.click(confirmDisableButton);

    await waitFor(() => {
      expect(authApi.disable2FA).toHaveBeenCalledWith('654321');
      expect(onUpdateMock).toHaveBeenCalledTimes(1);
    });
  });

  it('disables 2FA upon entering an 8-character backup code', async () => {
    const onUpdateMock = vi.fn();
    vi.mocked(authApi.disable2FA).mockResolvedValue(undefined as any);

    render(<TwoFactorSettingsCard twoFactorEnabled={true} onUpdate={onUpdateMock} />);

    const disableButton = screen.getByRole('button', { name: /disable 2fa/i });
    fireEvent.click(disableButton);

    await waitFor(() => {
      expect(screen.getByText('Deactivate 2FA protection')).toBeTruthy();
    });

    const confirmDisableButton = screen.getByRole('button', {
      name: /confirm disable/i,
    }) as HTMLButtonElement;
    expect(confirmDisableButton.disabled).toBe(true);

    const otpInput = screen.getByPlaceholderText('Enter Code');
    // Test invalid length first (5 chars) -> button should remain disabled
    fireEvent.change(otpInput, { target: { value: '4f92a' } });
    expect(confirmDisableButton.disabled).toBe(true);

    // Test valid 8-character backup code
    fireEvent.change(otpInput, { target: { value: '4f92a10b' } });
    expect(confirmDisableButton.disabled).toBe(false);

    fireEvent.click(confirmDisableButton);

    await waitFor(() => {
      expect(authApi.disable2FA).toHaveBeenCalledWith('4f92a10b');
      expect(onUpdateMock).toHaveBeenCalledTimes(1);
    });
  });
});
