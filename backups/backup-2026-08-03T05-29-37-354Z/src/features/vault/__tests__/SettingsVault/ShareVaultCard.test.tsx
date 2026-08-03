/* @vitest-environment jsdom */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareVaultCard } from '../../components/SettingsVault/ShareVaultCard';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ShareVaultCard Component Test Suite', () => {
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

  it('renders Share Vault title and description', () => {
    render(<ShareVaultCard />);

    expect(screen.getByText('Share Vault')).toBeTruthy();
    expect(
      screen.getByText(
        /Help others secure their digital identity by sharing Vault with your network/i
      )
    ).toBeTruthy();
  });

  it('copies share URL to clipboard on clicking copy link button and displays success toast', () => {
    render(<ShareVaultCard />);

    const copyButton = screen.getByRole('button', { name: /copy direct link to clipboard/i });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.origin);
  });

  it('opens full size QR code preview modal on clicking QR code container', () => {
    render(<ShareVaultCard />);

    const qrButton = screen.getByRole('button', { name: /open full size qr code/i });
    fireEvent.click(qrButton);

    expect(screen.getByRole('dialog', { name: /full size qr code/i })).toBeTruthy();
    expect(screen.getByText('Scan this QR code to open Vault on another device.')).toBeTruthy();
  });

  it('closes full size QR code preview modal on clicking close button', async () => {
    render(<ShareVaultCard />);

    const qrButton = screen.getByRole('button', { name: /open full size qr code/i });
    fireEvent.click(qrButton);

    const closeButton = screen.getByRole('button', { name: /close qr code preview/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /full size qr code/i })).toBeNull();
    });
  });

  it('renders social share platform links with proper aria-labels and hrefs', () => {
    render(<ShareVaultCard />);

    expect(screen.getByRole('link', { name: /share on x \(twitter\)/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /share on whatsapp/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /share on email/i })).toBeTruthy();
  });
});
