/* @vitest-environment jsdom */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultIntegrityAlarmModal } from '../VaultIntegrityAlarmModal';
import { VaultIntegrityAlarmBanner } from '../VaultIntegrityAlarmBanner';

const mockIntegrityStore = {
  tamperAlarmActive: true,
  corruptedItems: [
    {
      itemId: 'photo-1',
      title: 'encrypted_document.pdf',
      category: 'document',
      expectedHash: '0x11112222333344445555666677778888',
      actualHash: '0xaaaabbbbccccddddeeeeffff00001111',
      reason: '1-Bit flip tampering detected in byte 0',
    },
  ],
  dismissTamperAlarm: vi.fn(),
  auditIntegrity: vi.fn().mockResolvedValue(true),
  isAuditing: false,
  triggerTamperAlarm: vi.fn(),
  lastAlarmPayload: {
    type: 'SIMULATED_BIT_FLIP_ATTACK',
    severity: 'CRITICAL',
    corruptedItems: [],
    timestamp: 1714000000000,
  },
};

const mockVaultStore = {
  lock: vi.fn(),
};

vi.mock('../../../store/integrityStore', () => ({
  useIntegrityStore: (selector: (state: typeof mockIntegrityStore) => unknown) =>
    selector(mockIntegrityStore),
}));

vi.mock('../../../store/vaultStore', () => ({
  useVaultStore: (selector: (state: typeof mockVaultStore) => unknown) => selector(mockVaultStore),
}));

describe('VaultIntegrityAlarm Components (Modal & Banner)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntegrityStore.tamperAlarmActive = true;
    mockIntegrityStore.isAuditing = false;
  });

  describe('VaultIntegrityAlarmModal', () => {
    it('renders modal with alarm details and affected items when active', () => {
      render(<VaultIntegrityAlarmModal />);

      expect(screen.getByText(/Cryptographic Tamper Alarm/i)).toBeTruthy();
      expect(screen.getByText('encrypted_document.pdf')).toBeTruthy();
      expect(screen.getByText('document')).toBeTruthy();
      expect(screen.getByText(/1-Bit flip tampering/i)).toBeTruthy();
      expect(screen.getByText('0x11112222333344445555666677778888')).toBeTruthy();
      expect(screen.getByText('0xaaaabbbbccccddddeeeeffff00001111')).toBeTruthy();
    });

    it('dismisses modal on clicking dismiss or close X button', () => {
      render(<VaultIntegrityAlarmModal />);

      const closeButton = screen.getByRole('button', { name: /close alarm/i });
      fireEvent.click(closeButton);
      expect(mockIntegrityStore.dismissTamperAlarm).toHaveBeenCalledTimes(1);

      const dismissButton = screen.getByRole('button', { name: /^dismiss alarm$/i });
      fireEvent.click(dismissButton);
      expect(mockIntegrityStore.dismissTamperAlarm).toHaveBeenCalledTimes(2);
    });

    it('dismisses modal on pressing Escape key', () => {
      render(<VaultIntegrityAlarmModal />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockIntegrityStore.dismissTamperAlarm).toHaveBeenCalledTimes(1);
    });

    it('triggers auditIntegrity on clicking "Re-Scan Merkle Tree"', () => {
      render(<VaultIntegrityAlarmModal />);

      const rescanButton = screen.getByRole('button', { name: /re-scan merkle tree/i });
      fireEvent.click(rescanButton);
      expect(mockIntegrityStore.auditIntegrity).toHaveBeenCalledTimes(1);
    });

    it('locks vault and dismisses alarm on clicking "Lockdown Vault"', () => {
      render(<VaultIntegrityAlarmModal />);

      const lockdownButton = screen.getByRole('button', { name: /lockdown vault/i });
      fireEvent.click(lockdownButton);

      expect(mockVaultStore.lock).toHaveBeenCalledTimes(1);
      expect(mockIntegrityStore.dismissTamperAlarm).toHaveBeenCalledTimes(1);
    });

    it('returns null when tamperAlarmActive is false', () => {
      mockIntegrityStore.tamperAlarmActive = false;
      const { container } = render(<VaultIntegrityAlarmModal />);
      expect(container.firstChild).toBeNull();
    });

    it('renders empty items fallback message when corruptedItems is empty', () => {
      mockIntegrityStore.corruptedItems = [];
      render(<VaultIntegrityAlarmModal />);

      expect(screen.getByText(/Root Tree Inconsistency Detected/i)).toBeTruthy();
    });

    it('copies expected and actual hashes when copy buttons are clicked', async () => {
      mockIntegrityStore.corruptedItems = [
        {
          itemId: 'item-copy-test',
          title: 'secret.txt',
          category: 'note',
          expectedHash: '0x123expected',
          actualHash: '0x456actual',
          reason: 'Test hash copy',
        },
      ];

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<VaultIntegrityAlarmModal />);

      const copyExpectedBtn = screen.getByRole('button', { name: /copy expected hash/i });
      await act(async () => {
        fireEvent.click(copyExpectedBtn);
      });

      expect(writeTextMock).toHaveBeenCalledWith('0x123expected');
    });
  });

  describe('VaultIntegrityAlarmBanner', () => {
    it('renders banner and triggers triggerTamperAlarm on clicking "View Alarm Details"', () => {
      mockIntegrityStore.tamperAlarmActive = true;
      render(<VaultIntegrityAlarmBanner />);

      expect(screen.getByText(/CRITICAL TAMPER ALARM:/i)).toBeTruthy();

      const detailsButton = screen.getByRole('button', { name: /view alarm details/i });
      fireEvent.click(detailsButton);

      expect(mockIntegrityStore.triggerTamperAlarm).toHaveBeenCalledWith(
        mockIntegrityStore.lastAlarmPayload,
      );
    });

    it('handles fallback payload when lastAlarmPayload is null', () => {
      mockIntegrityStore.tamperAlarmActive = true;
      (mockIntegrityStore as any).lastAlarmPayload = null;
      mockIntegrityStore.corruptedItems = [];

      render(<VaultIntegrityAlarmBanner />);

      const detailsButton = screen.getByRole('button', { name: /view alarm details/i });
      fireEvent.click(detailsButton);

      expect(mockIntegrityStore.triggerTamperAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CRYPTOGRAPHIC_TAMPER_DETECTED',
          severity: 'CRITICAL',
        }),
      );
    });

    it('returns null when tamperAlarmActive is false', () => {
      mockIntegrityStore.tamperAlarmActive = false;
      const { container } = render(<VaultIntegrityAlarmBanner />);
      expect(container.firstChild).toBeNull();
    });
  });
});
