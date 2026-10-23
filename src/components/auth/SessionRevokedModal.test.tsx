/* @vitest-environment jsdom */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { SessionRevokedModal } from './SessionRevokedModal';

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

const mockVaultStore = {
  sessionRevokedState: null as {
    isRevoked: boolean;
    reason: string;
    sessionId?: string;
    timestamp?: number;
  } | null,
  dismissSessionRevoked: vi.fn(),
};

vi.mock('../../store/vaultStore', () => ({
  useVaultStore: (selector: (state: typeof mockVaultStore) => unknown) => selector(mockVaultStore),
}));

vi.mock('../../hooks/useScrollLock', () => ({
  useScrollLock: vi.fn(),
}));

describe('SessionRevokedModal', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVaultStore.sessionRevokedState = null;

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: {
        href: 'http://localhost/',
        pathname: '/',
        origin: 'http://localhost',
        search: '',
        hash: '',
        replace: vi.fn(),
        reload: vi.fn(),
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders nothing when session is not revoked', () => {
    const { container } = render(<SessionRevokedModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when session is revoked', () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'REVOKED_BY_ANOTHER_DEVICE',
      sessionId: 'sess-abc-123456789',
      timestamp: Date.now(),
    };

    render(<SessionRevokedModal />);

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Session Revoked')).toBeTruthy();
    expect(screen.getByText('Terminated from Another Device')).toBeTruthy();
    expect(screen.getByText(/Return to Sign In/i)).toBeTruthy();
  });

  it('handles invalid or malformed timestamps without crashing', () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'REVOKED_BY_SERVER',
      sessionId: 'sess-xyz',
      timestamp: NaN,
    };

    render(<SessionRevokedModal />);
    expect(screen.getByText('Just now')).toBeTruthy();
    expect(screen.getByText('Revoked by Security Service')).toBeTruthy();
  });

  it('masks long session IDs cleanly and provides copy functionality', async () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'ADMIN_REVOKED',
      sessionId: 'session_long_identifier_9999',
      timestamp: 1714000000000,
    };

    render(<SessionRevokedModal />);

    expect(screen.getByText('sessio...9999')).toBeTruthy();
    const copyButton = screen.getByLabelText(/Copy Session ID/i);
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('session_long_identifier_9999');
    await waitFor(() => {
      expect(screen.getByLabelText(/Session ID copied/i)).toBeTruthy();
    });
  });

  it('handles Return to Sign In button click and triggers dismiss & redirect', () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'REVOKED_BY_ANOTHER_DEVICE',
    };

    render(<SessionRevokedModal />);

    const returnBtn = screen.getByRole('button', { name: /Return to Sign In/i });
    fireEvent.click(returnBtn);

    expect(mockVaultStore.dismissSessionRevoked).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('handles Enter keyboard shortcut to trigger sign in', () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'REVOKED_BY_ANOTHER_DEVICE',
    };

    render(<SessionRevokedModal />);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(mockVaultStore.dismissSessionRevoked).toHaveBeenCalledTimes(1);
  });

  it('handles Escape keyboard shortcut safely without leaving revoked state', () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'REVOKED_BY_ANOTHER_DEVICE',
    };

    render(<SessionRevokedModal />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockVaultStore.dismissSessionRevoked).toHaveBeenCalledTimes(1);
  });

  it('handles custom onBeforeRedirect and redirectUrl with sanitization', () => {
    const onBeforeRedirect = vi.fn();
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'SECURITY_POLICY_VIOLATION',
    };

    render(<SessionRevokedModal redirectUrl="/login" onBeforeRedirect={onBeforeRedirect} />);

    const returnBtn = screen.getByRole('button', { name: /Return to Sign In/i });
    fireEvent.click(returnBtn);

    expect(onBeforeRedirect).toHaveBeenCalledTimes(1);
    expect(mockVaultStore.dismissSessionRevoked).toHaveBeenCalledTimes(1);
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('sanitizes external/protocol-relative URLs to prevent open-redirect vulnerabilities', () => {
    mockVaultStore.sessionRevokedState = {
      isRevoked: true,
      reason: 'SECURITY_POLICY_VIOLATION',
    };

    render(<SessionRevokedModal redirectUrl="//evil.com/phish" />);

    const returnBtn = screen.getByRole('button', { name: /Return to Sign In/i });
    fireEvent.click(returnBtn);

    expect(mockVaultStore.dismissSessionRevoked).toHaveBeenCalledTimes(1);
    // Should fallback to '/' instead of open redirecting to //evil.com/phish
    expect(window.location.reload).toHaveBeenCalled();
  });
});
