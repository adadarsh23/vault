import { describe, it, expect } from 'vitest';
import {
  computeBufferHash,
  computeLeafHash,
  computeNodeHash,
  MerkleTree,
  detectBitFlipCorruption,
  simulateBitFlip,
  MerkleLeafItem,
} from '../../src/lib/merkleTree';

describe('Merkle Tree Cryptographic Integrity Engine', () => {
  describe('Cryptographic Hashing (BLAKE3 & SHA-512)', () => {
    it('computes consistent BLAKE3 hash for string and buffer data', async () => {
      const data = 'vault-encrypted-photo-payload';
      const hash1 = await computeBufferHash(data, 'blake3');
      const hash2 = await computeBufferHash(new TextEncoder().encode(data), 'blake3');

      expect(hash1).toBeTypeOf('string');
      expect(hash1.length).toBe(64); // 256-bit hex
      expect(hash1).toBe(hash2);
    });

    it('computes consistent SHA-512 hash', async () => {
      const data = 'vault-sample-image-data';
      const hash = await computeBufferHash(data, 'sha512');

      expect(hash).toBeTypeOf('string');
      expect(hash.length).toBe(128); // 512-bit hex
    });

    it('handles empty buffer correctly', async () => {
      const hashBlake3 = await computeBufferHash(new Uint8Array(0), 'blake3');
      const hashSha512 = await computeBufferHash(new Uint8Array(0), 'sha512');

      expect(hashBlake3).toBeDefined();
      expect(hashSha512).toBeDefined();
    });
  });

  describe('Merkle Tree Construction & Determinism', () => {
    it('produces deterministic Merkle Root regardless of input insertion order', async () => {
      const itemsOrder1: MerkleLeafItem[] = [
        { itemId: 'photo-001', category: 'photo', hash: 'aaaa1111', size: 1024 },
        { itemId: 'photo-002', category: 'photo', hash: 'bbbb2222', size: 2048 },
        { itemId: 'photo-003', category: 'photo', hash: 'cccc3333', size: 4096 },
      ];

      const itemsOrder2: MerkleLeafItem[] = [
        { itemId: 'photo-003', category: 'photo', hash: 'cccc3333', size: 4096 },
        { itemId: 'photo-001', category: 'photo', hash: 'aaaa1111', size: 1024 },
        { itemId: 'photo-002', category: 'photo', hash: 'bbbb2222', size: 2048 },
      ];

      const tree1 = new MerkleTree('blake3');
      const root1 = await tree1.build(itemsOrder1);

      const tree2 = new MerkleTree('blake3');
      const root2 = await tree2.build(itemsOrder2);

      expect(root1).toBe(root2);
      expect(tree1.getLeafCount()).toBe(3);
    });

    it('handles even and odd leaf counts properly', async () => {
      const evenItems: MerkleLeafItem[] = [
        { itemId: 'p1', hash: 'h1' },
        { itemId: 'p2', hash: 'h2' },
        { itemId: 'p3', hash: 'h3' },
        { itemId: 'p4', hash: 'h4' },
      ];

      const treeEven = new MerkleTree('blake3');
      const rootEven = await treeEven.build(evenItems);
      expect(rootEven).toBeDefined();
      expect(treeEven.getDepth()).toBe(3); // Leaf layer, intermediate layer, root layer

      const oddItems: MerkleLeafItem[] = [
        { itemId: 'p1', hash: 'h1' },
        { itemId: 'p2', hash: 'h2' },
        { itemId: 'p3', hash: 'h3' },
      ];

      const treeOdd = new MerkleTree('blake3');
      const rootOdd = await treeOdd.build(oddItems);
      expect(rootOdd).toBeDefined();
    });

    it('handles empty leaf array', async () => {
      const tree = new MerkleTree('blake3');
      const root = await tree.build([]);
      expect(root).toBeDefined();
      expect(tree.getLeafCount()).toBe(0);
    });
  });

  describe('Merkle Proof Generation and Verification', () => {
    it('generates a valid inclusion proof for an item and verifies against root', async () => {
      const items: MerkleLeafItem[] = [
        { itemId: 'item-alpha', category: 'photo', hash: 'hash-alpha', size: 100 },
        { itemId: 'item-beta', category: 'photo', hash: 'hash-beta', size: 200 },
        { itemId: 'item-gamma', category: 'photo', hash: 'hash-gamma', size: 300 },
        { itemId: 'item-delta', category: 'photo', hash: 'hash-delta', size: 400 },
      ];

      const tree = new MerkleTree('blake3');
      const root = await tree.build(items);

      const proof = tree.generateProof('item-gamma');
      expect(proof).not.toBeNull();
      expect(proof?.itemId).toBe('item-gamma');
      expect(proof?.rootHash).toBe(root);
      expect(proof?.proof.length).toBeGreaterThan(0);

      // Verify the proof
      const isValid = await MerkleTree.verifyProof(proof!.leafHash, proof!.proof, root, 'blake3');
      expect(isValid).toBe(true);
    });

    it('fails verification if proof is evaluated against an incorrect root', async () => {
      const items: MerkleLeafItem[] = [
        { itemId: 'item-1', hash: 'hash-1' },
        { itemId: 'item-2', hash: 'hash-2' },
      ];

      const tree = new MerkleTree('blake3');
      await tree.build(items);
      const proof = tree.generateProof('item-1');

      const isInvalid = await MerkleTree.verifyProof(
        proof!.leafHash,
        proof!.proof,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'blake3',
      );
      expect(isInvalid).toBe(false);
    });

    it('returns null for non-existent itemId', async () => {
      const tree = new MerkleTree('blake3');
      await tree.build([{ itemId: 'item-1', hash: 'hash-1' }]);
      const proof = tree.generateProof('unknown-item');
      expect(proof).toBeNull();
    });
  });

  describe('Bit-Flip Attack Detection & Simulation', () => {
    it('detects a single bit mutation in binary image data', async () => {
      const originalBinary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
      const expectedHash = await computeBufferHash(originalBinary, 'blake3');

      // 1-Bit flip in byte 0
      const tamperedBinary = simulateBitFlip(originalBinary, 0, 0);

      const check = await detectBitFlipCorruption(tamperedBinary, expectedHash, 'blake3');
      expect(check.isCorrupted).toBe(true);
      expect(check.match).toBe(false);
      expect(check.actualHash).not.toBe(expectedHash);
    });

    it('proves that a 1-bit flip breaks the entire Merkle Tree root', async () => {
      const fileA = new Uint8Array([10, 20, 30, 40]);
      const fileB = new Uint8Array([50, 60, 70, 80]);

      const hashA = await computeBufferHash(fileA, 'blake3');
      const hashB = await computeBufferHash(fileB, 'blake3');

      const originalItems: MerkleLeafItem[] = [
        { itemId: 'photo-A', hash: hashA },
        { itemId: 'photo-B', hash: hashB },
      ];

      const originalTree = new MerkleTree('blake3');
      const originalRoot = await originalTree.build(originalItems);

      // Now simulate a 1-bit flip in cloud storage for photo-A
      const tamperedFileA = simulateBitFlip(fileA, 2, 3);
      const tamperedHashA = await computeBufferHash(tamperedFileA, 'blake3');

      const tamperedItems: MerkleLeafItem[] = [
        { itemId: 'photo-A', hash: tamperedHashA },
        { itemId: 'photo-B', hash: hashB },
      ];

      const tamperedTree = new MerkleTree('blake3');
      const tamperedRoot = await tamperedTree.build(tamperedItems);

      // The Merkle root MUST change completely (avalanche effect)
      expect(tamperedRoot).not.toBe(originalRoot);

      // Generating proof from tampered leaf will fail against original root
      const proofFromTampered = tamperedTree.generateProof('photo-A');
      const verified = await MerkleTree.verifyProof(
        proofFromTampered!.leafHash,
        proofFromTampered!.proof,
        originalRoot,
        'blake3',
      );
      expect(verified).toBe(false);
    });
  });
});
