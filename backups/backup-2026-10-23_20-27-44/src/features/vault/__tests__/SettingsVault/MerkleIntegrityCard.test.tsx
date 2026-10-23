/* @vitest-environment jsdom */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MerkleIntegrityCard } from '../../components/SettingsVault/MerkleIntegrityCard';

const mockIntegrityStore = {
  rootHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  algorithm: 'blake3',
  totalLeaves: 4,
  treeDepth: 3,
  lastAuditAt: 1714000000000,
  lastAuditStatus: 'clean' as 'clean' | 'corrupted' | 'idle',
  isAuditing: false,
  corruptedItems: [] as any[],
  fetchIntegrityStatus: vi.fn().mockResolvedValue(undefined),
  rebuildLocalMerkleTree: vi
    .fn()
    .mockResolvedValue('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
  auditIntegrity: vi.fn().mockResolvedValue(true),
  simulateBitFlipAttack: vi.fn().mockResolvedValue(undefined),
};

const mockVaultStore = {
  items: [
    { id: '1', title: 'photo1.jpg', type: 'photo', updatedAt: 1000 },
    { id: '2', title: 'photo2.jpg', type: 'photo', updatedAt: 1000 },
    { id: '3', title: 'photo3.jpg', type: 'photo', updatedAt: 1000 },
    { id: '4', title: 'photo4.jpg', type: 'photo', updatedAt: 1000 },
  ],
};

vi.mock('../../../../store/integrityStore', () => ({
  useIntegrityStore: (selector: (state: typeof mockIntegrityStore) => unknown) =>
    selector(mockIntegrityStore),
}));

vi.mock('../../../../store/vaultStore', () => ({
  useVaultStore: (selector: (state: typeof mockVaultStore) => unknown) => selector(mockVaultStore),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('MerkleIntegrityCard Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntegrityStore.rootHash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    mockIntegrityStore.algorithm = 'blake3';
    mockIntegrityStore.totalLeaves = 4;
    mockIntegrityStore.treeDepth = 3;
    mockIntegrityStore.lastAuditAt = 1714000000000;
    mockIntegrityStore.lastAuditStatus = 'clean';
    mockIntegrityStore.isAuditing = false;
    mockIntegrityStore.corruptedItems = [];
    mockVaultStore.items = [
      { id: '1', title: 'photo1.jpg', type: 'photo', updatedAt: 1000 },
      { id: '2', title: 'photo2.jpg', type: 'photo', updatedAt: 1000 },
      { id: '3', title: 'photo3.jpg', type: 'photo', updatedAt: 1000 },
      { id: '4', title: 'photo4.jpg', type: 'photo', updatedAt: 1000 },
    ];
  });

  it('renders cryptographic Merkle Root information and metrics', () => {
    render(<MerkleIntegrityCard />);

    expect(screen.getByText('Merkle Tree Cryptographic Integrity')).toBeTruthy();
    expect(screen.getByText('Active Cryptographic Merkle Root')).toBeTruthy();
    expect(screen.getByText('RFC 6962 Domain-Separated Commitment')).toBeTruthy();
    expect(screen.getByText(/0x1234567890abcdef/i)).toBeTruthy();
    expect(screen.getByText('4 items')).toBeTruthy();
    expect(screen.getByText('3 Levels')).toBeTruthy();
    expect(screen.getByText('🛡️ Verified Clean')).toBeTruthy();
  });

  it('calls fetchIntegrityStatus on mount and rebuilds local Merkle tree', () => {
    render(<MerkleIntegrityCard />);

    expect(mockIntegrityStore.fetchIntegrityStatus).toHaveBeenCalled();
    expect(mockIntegrityStore.rebuildLocalMerkleTree).toHaveBeenCalledWith(mockVaultStore.items);
  });

  it('copies Merkle Root to clipboard and shows copied feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    render(<MerkleIntegrityCard />);

    const copyButton = screen.getByRole('button', { name: /copy merkle root hash/i });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith(mockIntegrityStore.rootHash);
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('triggers auditIntegrity on clicking "Audit Vault Integrity" button', async () => {
    render(<MerkleIntegrityCard />);

    const auditButton = screen.getByRole('button', { name: /audit vault integrity/i });
    await act(async () => {
      fireEvent.click(auditButton);
    });

    expect(mockIntegrityStore.auditIntegrity).toHaveBeenCalledTimes(1);
  });

  it('triggers simulateBitFlipAttack on clicking "Simulate 1-Bit Flip" button', async () => {
    render(<MerkleIntegrityCard />);

    const simulateButton = screen.getByRole('button', { name: /simulate 1-bit flip/i });
    await act(async () => {
      fireEvent.click(simulateButton);
    });

    expect(mockIntegrityStore.simulateBitFlipAttack).toHaveBeenCalledTimes(1);
  });

  it('displays corrupted items warning banner when lastAuditStatus is corrupted and items are affected', () => {
    mockIntegrityStore.lastAuditStatus = 'corrupted';
    mockIntegrityStore.corruptedItems = [
      {
        itemId: 'item-101',
        title: 'sensitive_photo.jpg',
        category: 'photo',
        expectedHash: '0xabc1',
        actualHash: '0xabc2',
        reason: 'Bit-flip discrepancy detected',
      },
    ];

    render(<MerkleIntegrityCard />);

    expect(screen.getByText(/Cryptographic Discrepancy Detected/i)).toBeTruthy();
    expect(screen.getByText('sensitive_photo.jpg')).toBeTruthy();
    expect(screen.getByText('🚨 Corrupted')).toBeTruthy();
  });

  it('toggles collapsible cryptographic specifications drawer', () => {
    render(<MerkleIntegrityCard />);

    const toggleButton = screen.getByRole('button', {
      name: /cryptographic engine specifications/i,
    });
    expect(screen.queryByText('Domain Separation (RFC 6962)')).toBeNull();

    fireEvent.click(toggleButton);
    expect(screen.getByText('Domain Separation (RFC 6962)')).toBeTruthy();
    expect(screen.getByText('Hardware Acceleration')).toBeTruthy();

    fireEvent.click(toggleButton);
    expect(screen.queryByText('Domain Separation (RFC 6962)')).toBeNull();
  });

  it('handles empty vault state gracefully with 0 bound assets and 0 tree depth', () => {
    mockVaultStore.items = [];
    mockIntegrityStore.totalLeaves = 0;
    mockIntegrityStore.treeDepth = 0;
    mockIntegrityStore.rootHash = '';

    render(<MerkleIntegrityCard />);

    expect(screen.getByText('0 items')).toBeTruthy();
    expect(screen.getByText('0 Levels')).toBeTruthy();
  });
});
