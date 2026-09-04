/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionRevokedModal } from '../../src/components/auth/SessionRevokedModal';
import { useVaultStore } from '../../src/store/vaultStore';

describe('SessionRevokedModal', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      sessionRevokedState: null,
    });

    // Mock window.location
    delete (window as any).location;
    window.location = { ...originalLocation, href: '' } as any;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
    document.body.style.overflow = '';
  });

  it('renders nothing when session is not revoked', () => {
    const { container } = render(<SessionRevokedModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when sessionRevokedState.isRevoked is false', () => {
    useVaultStore.setState({
      sessionRevokedState: {
        isRevoked: false,
        reason: 'NONE',
      },
    });
    const { container } = render(<SessionRevokedModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders responsive modal dialog with accessibility and device-friendly layout when revoked', () => {
    useVaultStore.setState({
      sessionRevokedState: {
        isRevoked: true,
        reason: 'REVOKED_BY_ANOTHER_DEVICE',
        timestamp: 1700000000000,
        sessionId: 'session-device-revoked-abc123456789xyz',
      },
    });

    render(<SessionRevokedModal />);

    // Check alertdialog role and accessibility
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'session-revoked-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'session-revoked-desc');

    // Check responsive container classes for mobile, landscape, and touch support
    expect(dialog.className).toContain('overflow-y-auto');
    expect(dialog.className).toContain('scroll-smooth-mobile');
    expect(dialog.className).toContain('touch-pan-y');

    // Check text elements
    expect(screen.getByText('Session Revoked')).toBeInTheDocument();
    expect(screen.getByText('Session Access Terminated')).toBeInTheDocument();
    expect(screen.getByText('Operations Banned')).toBeInTheDocument();
    expect(screen.getByText(/Session ID/i)).toBeInTheDocument();

    // Check button touch responsiveness
    const returnButton = screen.getByRole('button', { name: /return to sign in/i });
    expect(returnButton).toBeInTheDocument();
    expect(returnButton.className).toContain('min-h-[44px]');
    expect(returnButton.className).toContain('touch-manipulation');
  });

  it('calls dismissSessionRevoked and redirects to home on button click', () => {
    const dismissSpy = vi.fn();
    useVaultStore.setState({
      sessionRevokedState: {
        isRevoked: true,
        reason: 'REVOKED_BY_ANOTHER_DEVICE',
      },
      dismissSessionRevoked: dismissSpy,
    });

    render(<SessionRevokedModal />);

    const returnButton = screen.getByRole('button', { name: /return to sign in/i });
    fireEvent.click(returnButton);

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/');
  });

  it('triggers return to sign in on Enter key press', () => {
    const dismissSpy = vi.fn();
    useVaultStore.setState({
      sessionRevokedState: {
        isRevoked: true,
        reason: 'REVOKED_BY_ANOTHER_DEVICE',
      },
      dismissSessionRevoked: dismissSpy,
    });

    render(<SessionRevokedModal />);

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/');
  });
});
