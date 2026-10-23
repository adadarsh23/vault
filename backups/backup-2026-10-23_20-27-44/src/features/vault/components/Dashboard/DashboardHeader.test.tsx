/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHeader, healthMetrics } from './DashboardHeader';
import { SECURITY_LAYERS } from '../../../auth/useVaultAuth';

describe('DashboardHeader Component - Security Layer Details', () => {
  const defaultProps = {
    username: 'cryptovault',
    securityScore: 92,
    showHealthDetails: true,
    onToggleHealth: vi.fn(),
    onOpenProfileCard: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header Rendering & Security Score', () => {
    it('renders username and security score correctly', () => {
      render(<DashboardHeader {...defaultProps} />);

      expect(screen.getByText('@cryptovault')).toBeTruthy();
      expect(screen.getByText('92%')).toBeTruthy();
    });

    it('calls onOpenProfileCard when clicking the username', () => {
      render(<DashboardHeader {...defaultProps} />);

      const userBtn = screen.getByText('@cryptovault');
      fireEvent.click(userBtn);
      expect(defaultProps.onOpenProfileCard).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleHealth when clicking the security score button', () => {
      render(<DashboardHeader {...defaultProps} />);

      const toggleBtn = screen.getByRole('button', {
        name: /hide detailed security health metrics/i,
      });
      fireEvent.click(toggleBtn);
      expect(defaultProps.onToggleHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security Layers Architecture Panel', () => {
    it('does not render health metrics when showHealthDetails is false', () => {
      render(<DashboardHeader {...defaultProps} showHealthDetails={false} />);

      expect(screen.queryByText('Security Architecture')).toBeNull();
      expect(screen.queryByText('Argon2id (RFC 9106)')).toBeNull();
    });

    it('renders all 8 security layers from useVaultAuth when showHealthDetails is true', () => {
      render(<DashboardHeader {...defaultProps} />);

      expect(screen.getByText(`${healthMetrics.length} Active Protocols`)).toBeTruthy();

      // Check all 8 layer labels are rendered
      SECURITY_LAYERS.forEach((layer) => {
        if (layer.label) {
          expect(screen.getByText(layer.label)).toBeTruthy();
        }
      });
    });

    it('displays standards, specs, and status badges for layers', () => {
      render(<DashboardHeader {...defaultProps} />);

      expect(screen.getByText('RFC 9106')).toBeTruthy();
      expect(screen.getByText(/NIST FIPS 203/)).toBeTruthy();
      expect(screen.getByText(/SP 800-38D • RFC 8439/)).toBeTruthy();
      expect(screen.getByText('PQC')).toBeTruthy();
    });
  });

  describe('Click-to-Expand Layer Dropdown Details', () => {
    it('expands layer cryptographic specifications when a layer card is clicked', () => {
      render(<DashboardHeader {...defaultProps} />);

      // Find Layer 1 card by label
      const layer1Label = screen.getByText('Layer 1: Key Derivation');
      const layer1Card = layer1Label.closest('[role="button"]');
      expect(layer1Card).toBeTruthy();
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('false');

      // Before click: details are not visible
      expect(
        screen.queryByText(/Memory-hard Argon2id primitive prevents GPU\/ASIC brute-force/i),
      ).toBeNull();

      // Click card to expand
      fireEvent.click(layer1Card!);

      // After click: details and specifications are visible
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('true');
      expect(
        screen.getByText(/Memory-hard Argon2id primitive prevents GPU\/ASIC brute-force/i),
      ).toBeTruthy();
      expect(screen.getAllByText('Cryptographic Specifications').length).toBeGreaterThan(0);

      // Click card again to collapse
      fireEvent.click(layer1Card!);
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('false');
    });

    it('supports keyboard navigation with Enter and Space keys', () => {
      render(<DashboardHeader {...defaultProps} />);

      const layer2Label = screen.getByText('Layer 2: Key Exchange');
      const layer2Card = layer2Label.closest('[role="button"]');
      expect(layer2Card).toBeTruthy();
      expect(layer2Card?.getAttribute('aria-expanded')).toBe('false');

      // Press Enter to expand
      fireEvent.keyDown(layer2Card!, { key: 'Enter' });
      expect(layer2Card?.getAttribute('aria-expanded')).toBe('true');
      expect(
        screen.getByText(/Combines classical X25519 ECDH with NIST Post-Quantum Kyber-768/i),
      ).toBeTruthy();

      // Press Space to collapse
      fireEvent.keyDown(layer2Card!, { key: ' ' });
      expect(layer2Card?.getAttribute('aria-expanded')).toBe('false');
    });

    it('toggles all specifications using the Inspect view / Compact view header button', () => {
      render(<DashboardHeader {...defaultProps} />);

      const inspectBtn = screen.getByRole('button', { name: /inspect view/i });
      expect(inspectBtn).toBeTruthy();

      // Click to inspect all
      fireEvent.click(inspectBtn);

      // Now all cards should be expanded and button becomes "Compact view"
      expect(screen.getByRole('button', { name: /compact view/i })).toBeTruthy();
      expect(
        screen.getByText(/Memory-hard Argon2id primitive prevents GPU\/ASIC brute-force/i),
      ).toBeTruthy();
      expect(
        screen.getByText(/Combines classical X25519 ECDH with NIST Post-Quantum Kyber-768/i),
      ).toBeTruthy();

      // Click to collapse all
      const compactBtn = screen.getByRole('button', { name: /compact view/i });
      fireEvent.click(compactBtn);

      expect(screen.getByRole('button', { name: /inspect view/i })).toBeTruthy();
      const layer1Label = screen.getByText('Layer 1: Key Derivation');
      const layer1Card = layer1Label.closest('[role="button"]');
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
