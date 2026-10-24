/* @vitest-environment jsdom */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultLoginForm } from './VaultLoginForm';
import type { AuthErrorState } from './useVaultAuth';

// Mock RecaptchaField to keep tests deterministic
vi.mock('../../components/security/RecaptchaField', () => ({
  RecaptchaField: () => <div data-testid="mock-recaptcha" />,
}));

describe('VaultLoginForm Component - Top Error Banner & Validation UI', () => {
  const defaultProps = {
    username: '',
    setUsername: vi.fn(),
    accountPassword: '',
    setAccountPassword: vi.fn(),
    vaultKey: '',
    setVaultKey: vi.fn(),
    onUnlock: vi.fn().mockResolvedValue(true),
    onGoBack: vi.fn(),
    cloudSessionActive: false,
    authMode: 'login' as const,
    onAuthModeChange: vi.fn(),
    clearAuthError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders top error banner when authError is passed from parent', () => {
    const authError: AuthErrorState = {
      title: 'Authentication Failed',
      message: 'The username or account password you entered is incorrect.',
      field: 'accountPassword',
      remainingAttempts: 4,
    };

    render(<VaultLoginForm {...defaultProps} authError={authError} />);

    // Verify error is rendered in top banner
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText('Authentication Failed').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('The username or account password you entered is incorrect.').length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('4 attempts remaining')).toBeTruthy();

    // Verify the top error banner is placed before the Sign In / Sign Up tabs
    const topBanner = alerts[0];
    const signInBtn = screen.getByRole('button', { name: /sign in/i });
    expect(
      topBanner.compareDocumentPosition(signInBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('displays client validation error at the top when username is missing on submit', async () => {
    render(<VaultLoginForm {...defaultProps} username="" />);

    const submitBtn = screen.getByTestId('auth-submit-button');
    const form = submitBtn.closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getAllByText('Account Identifier Required').length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText(
          'Please enter your username so the Master Key can be derived correctly.',
        ).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays validation error at top when password does not meet requirements on register', async () => {
    render(
      <VaultLoginForm
        {...defaultProps}
        authMode="register"
        username="validuser"
        accountPassword="123"
        vaultKey="123"
      />,
    );

    const submitBtn = screen.getByTestId('auth-submit-button');
    const form = submitBtn.closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(
        screen.getAllByText('Account Password Requirements Not Met').length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays switch to sign in button in top banner when username already exists on register', () => {
    const onAuthModeChangeMock = vi.fn();
    const authError: AuthErrorState = {
      title: 'Username Already Exists',
      message: 'This username is already registered. Sign in or choose a different username.',
      code: 'USER_EXISTS',
      field: 'username',
    };

    render(
      <VaultLoginForm
        {...defaultProps}
        authMode="register"
        authError={authError}
        onAuthModeChange={onAuthModeChangeMock}
      />,
    );

    expect(screen.getAllByText('Username Already Exists').length).toBeGreaterThanOrEqual(1);
    const switchBtn = screen.getByRole('button', { name: /switch to sign in/i });
    expect(switchBtn).toBeTruthy();

    fireEvent.click(switchBtn);
    expect(onAuthModeChangeMock).toHaveBeenCalledWith('login');
  });

  it('allows dismissing the top error banner via the close button', () => {
    const clearAuthErrorMock = vi.fn();
    const authError: AuthErrorState = {
      title: 'Master Key Decryption Failed',
      message: 'The Master Key you entered is incorrect.',
      field: 'vaultKey',
    };

    render(
      <VaultLoginForm
        {...defaultProps}
        authError={authError}
        clearAuthError={clearAuthErrorMock}
      />,
    );

    const dismissBtn = screen.getByRole('button', { name: /dismiss error/i });
    expect(dismissBtn).toBeTruthy();

    fireEvent.click(dismissBtn);
    expect(clearAuthErrorMock).toHaveBeenCalled();
  });
});
