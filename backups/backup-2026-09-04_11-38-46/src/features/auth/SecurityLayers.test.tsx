/* @vitest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SecurityLayers,
  type SecurityLayer,
  MAX_PROGRESS_BEFORE_COMPLETION,
  SYNC_MODE_PROGRESS,
  COMPLETED_PROGRESS,
  ZERO_PROGRESS,
  BLUR_BG_SCALE_DURATION,
  BLUR_BG_DRIFT_LEFT_DURATION,
  BLUR_BG_DRIFT_RIGHT_DURATION,
  ACTIVE_LAYER_PULSE_DURATION,
  calculateProgressWidth,
} from './SecurityLayers';

const mockLayers: SecurityLayer[] = [
  {
    id: 'layer-1',
    label: 'Layer 1: Key Derivation',
    name: 'Argon2id',
    description: 'Hardening password via memory-hard hashing',
  },
  {
    id: 'layer-2',
    label: 'Layer 2: Key Exchange',
    name: 'X25519 + Kyber768',
    description: 'Post-Quantum Hybrid cryptographic bridge',
  },
  {
    id: 'layer-3',
    label: 'Layer 3: Encryption',
    name: 'AES-256-GCM',
    description: 'Authenticated symmetric cipher suite',
  },
  {
    id: 'layer-4',
    label: 'Layer 4: Transport',
    name: 'TLS 1.3 Tunnel',
    description: 'Establishing perfect forward secrecy',
  },
];

describe('SecurityLayers Component - Multi-Device Responsiveness and States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fallback & Empty State', () => {
    it('renders empty fallback when layers array is empty and no status is active', () => {
      render(<SecurityLayers layers={[]} />);
      expect(screen.getByText('Security layers are not available.')).toBeTruthy();
    });
  });

  describe('Responsive Layout & Breakpoint Classes', () => {
    it('applies fluid multi-device padding and sizing on outer container and card', () => {
      const { container } = render(<SecurityLayers layers={mockLayers} currentLayer={1} />);

      // Outer container responsive padding & min-height
      const outerWrapper = container.querySelector(
        '.min-h-\\[60vh\\].sm\\:min-h-\\[70vh\\].md\\:min-h-\\[80vh\\]',
      );
      expect(outerWrapper).toBeTruthy();
      expect(outerWrapper?.className).toContain('px-1 sm:px-2 md:px-0');
      expect(outerWrapper?.className).toContain('py-2 sm:py-4 md:py-6');

      // Card container responsive radius & padding
      const cardContainer = container.querySelector(
        '.rounded-2xl.sm\\:rounded-3xl.md\\:rounded-\\[2rem\\]',
      );
      expect(cardContainer).toBeTruthy();
      expect(cardContainer?.className).toContain('p-4 sm:p-6 md:p-8');

      // Grid responsive layout (single-column on mobile, two-column on tablet/desktop)
      const layerGrid = container.querySelector('.grid-cols-1.md\\:grid-cols-2');
      expect(layerGrid).toBeTruthy();

      // Stats grid responsiveness (full width on mobile, auto width on tablet/desktop)
      const statsGrid = container.querySelector('.grid.w-full.grid-cols-2');
      expect(statsGrid).toBeTruthy();
      expect(statsGrid?.className).toContain('sm:w-auto');
    });

    it('renders responsive badges and text containers without overflow risk', () => {
      render(<SecurityLayers layers={mockLayers} currentLayer={1} />);

      // Layer 1 is completed -> Done badge
      const doneBadge = screen.getByText('Done');
      expect(doneBadge).toBeTruthy();
      expect(doneBadge.className).toContain('shrink-0');

      // Layer 2 is active -> Active badge
      const activeBadge = screen.getByText('Active');
      expect(activeBadge).toBeTruthy();
      expect(activeBadge.className).toContain('shrink-0');

      // Layer names render correctly
      expect(screen.getByText('Argon2id')).toBeTruthy();
      expect(screen.getByText('X25519 + Kyber768')).toBeTruthy();
    });

    it('renders responsive title scaling from mobile up to desktop', () => {
      const customTitle = 'Custom Secure Channel Verification';
      render(<SecurityLayers layers={mockLayers} currentLayer={0} title={customTitle} />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading.textContent).toBe(customTitle);
      expect(heading.className).toContain('text-xl sm:text-2xl md:text-3xl lg:text-4xl');
      expect(heading.className).toContain('break-words');
    });

    it('applies mobile touch-target sizing and overflow containment', () => {
      const { container } = render(<SecurityLayers layers={mockLayers} currentLayer={0} />);

      // Layer cards have min-h for touch targets and min-w-0 for flex/grid containment
      const cards = container.querySelectorAll('.min-h-\\[64px\\].sm\\:min-h-\\[72px\\]');
      expect(cards.length).toBe(mockLayers.length);

      cards.forEach((card) => {
        expect(card.className).toContain('min-w-0');
        expect(card.className).toContain('touch-manipulation');
        expect(card.className).toContain('rounded-xl sm:rounded-2xl md:rounded-[1.5rem]');
      });
    });
  });

  describe('Sync Mode', () => {
    it('renders synchronization badge, title, and progress', () => {
      render(
        <SecurityLayers
          layers={mockLayers}
          mode="sync"
          title="Syncing Secure Vault"
          description="Cloud sync is in progress."
        />,
      );

      expect(screen.getByText('Vault Synchronization')).toBeTruthy();
      expect(screen.getByText('Syncing Secure Vault')).toBeTruthy();
      expect(screen.getByText('Cloud sync is in progress.')).toBeTruthy();
      expect(screen.getByText('Synchronizing')).toBeTruthy();
    });
  });

  describe('Error State', () => {
    it('renders responsive error screen with retry button', () => {
      const onRetryMock = vi.fn();
      const { container } = render(
        <SecurityLayers
          layers={mockLayers}
          status="error"
          error="Network handshake timeout"
          errorTitle="Connection Failed"
          onRetry={onRetryMock}
        />,
      );

      expect(screen.getByText('Connection Failed')).toBeTruthy();
      expect(screen.getByText('Network handshake timeout')).toBeTruthy();

      // Responsive icon container sizing
      const iconWrapper = container.querySelector(
        '.h-20.w-20.sm\\:h-28.sm\\:w-28.md\\:h-32.md\\:w-32',
      );
      expect(iconWrapper).toBeTruthy();

      const retryBtn = screen.getByRole('button', { name: /retry verification/i });
      expect(retryBtn).toBeTruthy();
      expect(retryBtn.className).toContain('min-h-[40px] sm:min-h-[44px]');
      expect(retryBtn.className).toContain('w-full sm:w-auto');

      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Success State', () => {
    it('renders responsive success screen with verified details', () => {
      const { container } = render(
        <SecurityLayers
          layers={mockLayers}
          status="success"
          successTitle="Vault Unlocked"
          successMessage="Zero-knowledge keys derived and loaded."
        />,
      );

      expect(screen.getByText('Vault Unlocked')).toBeTruthy();
      expect(screen.getByText('Zero-knowledge keys derived and loaded.')).toBeTruthy();

      // Responsive icon wrapper
      const iconWrapper = container.querySelector(
        '.h-20.w-20.sm\\:h-28.sm\\:w-28.md\\:h-32.md\\:w-32',
      );
      expect(iconWrapper).toBeTruthy();
    });
  });

  describe('Accessibility & Screen Readers', () => {
    it('includes polite live region and progressbar attributes', () => {
      render(
        <SecurityLayers layers={mockLayers} currentLayer={2} title="Verifying Security Protocol" />,
      );

      // Progress bar ARIA attributes
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeTruthy();
      expect(progressBar.getAttribute('aria-valuemin')).toBe('0');
      expect(progressBar.getAttribute('aria-valuemax')).toBe('100');
      expect(progressBar.getAttribute('aria-valuenow')).toBeTruthy();

      // Active layer aria-current="step"
      const activeCard = screen.getByText('AES-256-GCM').closest('[aria-current="step"]');
      expect(activeCard).toBeTruthy();
    });
  });

  describe('Enhanced Project Security Layers & Cryptographic Inspection', () => {
    const richLayers: SecurityLayer[] = [
      {
        id: 'layer-kdf',
        label: 'Layer 1: Key Derivation',
        name: 'Argon2id',
        description: 'Memory-hard password hashing with per-user cryptographic salt',
        standard: 'RFC 9106',
        category: 'Key Derivation',
        specs: '64 MB RAM • 3 Iterations • 4 Parallel Lanes • 256-bit Key',
        quantumSafe: false,
        details: [
          'Memory-hard Argon2id primitive prevents GPU/ASIC brute-force acceleration',
          'Web Worker thread offloading prevents main UI thread blocking',
        ],
      },
      {
        id: 'layer-exchange',
        label: 'Layer 2: Key Exchange',
        name: 'X25519 + Kyber768 (ML-KEM)',
        description: 'Post-Quantum hybrid cryptographic key exchange bridge',
        standard: 'NIST FIPS 203 • RFC 7748',
        category: 'PQC Key Exchange',
        specs: 'Curve25519 ECDH + Kyber-768 Lattice KEM • SHA-256 KDF',
        quantumSafe: true,
        details: [
          'Combines classical X25519 ECDH with NIST Post-Quantum Kyber-768 (ML-KEM)',
          'Protects against Harvest-Now-Decrypt-Later (HNDL) quantum threats',
        ],
      },
      {
        id: 'layer-encryption',
        label: 'Layer 3: Payload Encryption',
        name: 'Dual Cascade (AES-256-GCM + ChaCha20-Poly1305)',
        description: 'Multi-cipher authenticated cascade envelope encryption suite',
        standard: 'NIST SP 800-38D • RFC 8439',
        category: 'Authenticated Encryption',
        specs: 'Dual 256-bit DEK • VCAS01 Multi-Cipher Cascade • AAD Bound',
        quantumSafe: false,
        details: [
          'Dual-engine cascade cipher combining AES-256-GCM and ChaCha20-Poly1305',
          'VCAS01 envelope structure with 64-byte dual DEKs',
        ],
      },
    ];

    it('renders standards, categories, specs, and quantum-safe badges accurately', () => {
      render(<SecurityLayers layers={richLayers} currentLayer={1} />);

      // Standards rendered
      expect(screen.getByText('RFC 9106')).toBeTruthy();
      expect(screen.getByText('NIST FIPS 203 • RFC 7748')).toBeTruthy();
      expect(screen.getByText('NIST SP 800-38D • RFC 8439')).toBeTruthy();

      // Categories rendered
      expect(screen.getByText('Key Derivation')).toBeTruthy();
      expect(screen.getByText('PQC Key Exchange')).toBeTruthy();
      expect(screen.getByText('Authenticated Encryption')).toBeTruthy();

      // Specs rendered
      expect(
        screen.getByText('64 MB RAM • 3 Iterations • 4 Parallel Lanes • 256-bit Key'),
      ).toBeTruthy();

      // Quantum-Safe badge only on layer 2
      const quantumSafeBadges = screen.getAllByText(/Quantum-Safe/i);
      expect(quantumSafeBadges.length).toBe(1);
    });

    it('expands layer technical details when clicked', () => {
      render(<SecurityLayers layers={richLayers} currentLayer={0} />);

      // Initially, details are not expanded and aria-expanded is false
      const layer1Card = screen.getByText('Argon2id').closest('[role="button"]');
      expect(layer1Card).toBeTruthy();
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('false');
      expect(
        screen.queryByText(/Memory-hard Argon2id primitive prevents GPU\/ASIC brute-force/i),
      ).toBeNull();

      // Click on Layer 1 card to expand
      fireEvent.click(layer1Card!);

      // Details should now be visible and aria-expanded is true
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('true');
      expect(
        screen.getByText(/Memory-hard Argon2id primitive prevents GPU\/ASIC brute-force/i),
      ).toBeTruthy();
      expect(screen.getByText('Cryptographic Specifications')).toBeTruthy();

      // Click again to toggle collapse
      fireEvent.click(layer1Card!);
      expect(layer1Card?.getAttribute('aria-expanded')).toBe('false');
    });

    it('toggles all specifications with header inspection button', () => {
      render(<SecurityLayers layers={richLayers} currentLayer={0} />);

      const inspectBtn = screen.getByRole('button', { name: /inspect specifications/i });
      expect(inspectBtn).toBeTruthy();

      // Toggle all on
      fireEvent.click(inspectBtn);
      expect(screen.getByRole('button', { name: /compact view/i })).toBeTruthy();
      expect(
        screen.getByText(/Combines classical X25519 ECDH with NIST Post-Quantum Kyber-768/i),
      ).toBeTruthy();

      // Toggle all off
      const compactBtn = screen.getByRole('button', { name: /compact view/i });
      fireEvent.click(compactBtn);
      expect(screen.getByRole('button', { name: /inspect specifications/i })).toBeTruthy();
    });

    it('renders verified security summary list on success state', () => {
      render(
        <SecurityLayers
          layers={richLayers}
          status="success"
          successTitle="Vault Unlocked"
          successMessage="Zero-knowledge keys derived and loaded."
        />,
      );

      expect(screen.getByText('3/3 Security Layers Verified')).toBeTruthy();
      expect(screen.getByText('Argon2id')).toBeTruthy();
      expect(screen.getByText('X25519 + Kyber768 (ML-KEM)')).toBeTruthy();
      expect(screen.getByText('Dual Cascade (AES-256-GCM + ChaCha20-Poly1305)')).toBeTruthy();
    });
  });

  describe('Animation Constants & Progress Calculation', () => {
    it('verifies exact animation duration and progress thresholds', () => {
      expect(MAX_PROGRESS_BEFORE_COMPLETION).toBe(90);
      expect(SYNC_MODE_PROGRESS).toBe(95);
      expect(COMPLETED_PROGRESS).toBe(100);
      expect(ZERO_PROGRESS).toBe(0);

      expect(BLUR_BG_SCALE_DURATION).toBe(5);
      expect(BLUR_BG_DRIFT_LEFT_DURATION).toBe(7);
      expect(BLUR_BG_DRIFT_RIGHT_DURATION).toBe(6);
      expect(ACTIVE_LAYER_PULSE_DURATION).toBe(1.6);
    });

    it('calculates progress correctly across all lifecycle boundaries', () => {
      // Empty layers -> 0
      expect(calculateProgressWidth(0, 0, false, false)).toBe(0);

      // Not started (negative index) -> 0
      expect(calculateProgressWidth(-1, 8, false, false)).toBe(0);

      // Success -> 100
      expect(calculateProgressWidth(3, 8, true, false)).toBe(100);

      // Sync mode -> 95
      expect(calculateProgressWidth(2, 8, false, true)).toBe(95);

      // All layers finished -> 100
      expect(calculateProgressWidth(8, 8, false, false)).toBe(100);

      // First layer (index 0 of 8) -> (1 / 8) * 90 = 11.25
      expect(calculateProgressWidth(0, 8, false, false)).toBe(11.25);

      // Fourth layer (index 3 of 8) -> (4 / 8) * 90 = 45
      expect(calculateProgressWidth(3, 8, false, false)).toBe(45);

      // Final active layer (index 7 of 8) -> (8 / 8) * 90 = 90
      expect(calculateProgressWidth(7, 8, false, false)).toBe(90);
    });
  });
});
