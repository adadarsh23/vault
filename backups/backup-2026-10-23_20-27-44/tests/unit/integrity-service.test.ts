import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MerkleTree, computeBufferHash } from '../../server/utils/merkleTree';
import { integrityService } from '../../server/services/integrityService';
import { VaultIntegrity } from '../../server/models/vaultIntegrity';
import * as vaultItemModelModule from '../../server/models/vaultItem';

vi.mock('../../server/models/vaultIntegrity', () => ({
  VaultIntegrity: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock('../../server/services/threatResponseService', () => ({
  threatResponseService: {
    processThreat: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../server/services/notificationService', () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/socket', () => ({
  emitVaultEvent: vi.fn(),
}));

describe('Server Integrity Service & Merkle Tree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Server Merkle Tree Implementation', () => {
    it('constructs deterministic roots matching standard domain separation', async () => {
      const items = [
        { itemId: 'photo-1', hash: 'hash1' },
        { itemId: 'photo-2', hash: 'hash2' },
      ];

      const tree = new MerkleTree('blake3');
      const root = await tree.build(items);

      expect(root).toBeTypeOf('string');
      expect(tree.getLeafCount()).toBe(2);

      const proof = tree.generateProof('photo-1');
      expect(proof).not.toBeNull();
      const valid = await MerkleTree.verifyProof(proof!.leafHash, proof!.proof, root, 'blake3');
      expect(valid).toBe(true);
    });

    it('computes SHA-512 and BLAKE3 buffer hashes', async () => {
      const b3 = await computeBufferHash('test-data', 'blake3');
      const s512 = await computeBufferHash('test-data', 'sha512');

      expect(b3.length).toBe(64);
      expect(s512.length).toBe(128);
    });
  });

  describe('Integrity Service Operations', () => {
    it('builds user Merkle Tree from vault items and updates model', async () => {
      const mockItems = [
        {
          itemId: 'photo-101',
          category: 'photo',
          metadata: { integrity: { hash: 'hash-101' } },
          updatedAt: new Date(),
        },
        {
          itemId: 'photo-102',
          category: 'photo',
          metadata: { sha256: 'hash-102' },
          updatedAt: new Date(),
        },
      ];

      const mockFind = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockItems),
        }),
      });

      vi.spyOn(vaultItemModelModule, 'getVaultItemModel').mockReturnValue({
        find: mockFind,
      } as any);

      (VaultIntegrity.findOneAndUpdate as any).mockResolvedValue({});

      const result = await integrityService.buildUserMerkleTree(
        '507f1f77bcf86cd799439011',
        'testuser',
        'blake3',
      );

      expect(result.rootHash).toBeDefined();
      expect(result.leafItems.length).toBe(2);
      expect(VaultIntegrity.findOneAndUpdate).toHaveBeenCalled();
    });

    it('detects bit-flip corruption during audit and triggers alarm', async () => {
      const mockItems = [
        {
          itemId: 'photo-corrupted',
          title: 'vacation.jpg',
          category: 'photo',
          payload: 'corrupted-payload-content',
          metadata: { integrity: { hash: 'expected-different-hash-12345' } },
        },
      ];

      const mockFind = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockItems),
        }),
      });

      vi.spyOn(vaultItemModelModule, 'getVaultItemModel').mockReturnValue({
        find: mockFind,
      } as any);

      (VaultIntegrity.findOneAndUpdate as any).mockResolvedValue({});

      const auditResult = await integrityService.auditVault(
        '507f1f77bcf86cd799439011',
        'testuser',
        '127.0.0.1',
        'blake3',
      );

      expect(auditResult.status).toBe('corrupted');
      expect(auditResult.alarmTriggered).toBe(true);
      expect(auditResult.corruptedItems.length).toBe(1);
      expect(auditResult.corruptedItems[0].itemId).toBe('photo-corrupted');
    });
  });
});
