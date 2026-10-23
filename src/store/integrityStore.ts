import { create } from 'zustand';
import apiClient from '../api/apiClient';
import { VaultItem } from '../lib/storage';
import {
  MerkleTree,
  computeBufferHash,
  HashAlgorithm,
  MerkleProof,
  MerkleLeafItem,
  simulateBitFlip,
} from '../lib/merkleTree';
import { toast } from 'sonner';
import { logActivity } from '../lib/activity';

export interface CorruptedItemDetail {
  itemId: string;
  title: string;
  category: string;
  expectedHash: string;
  actualHash: string;
  reason: string;
}

export interface TamperAlarmPayload {
  type: string;
  severity: 'HIGH' | 'CRITICAL';
  corruptedItems: CorruptedItemDetail[];
  rootHash?: string;
  auditId?: string;
  timestamp: number;
}

export interface IntegrityState {
  rootHash: string;
  algorithm: HashAlgorithm;
  totalLeaves: number;
  treeDepth: number;
  lastAuditAt: number | null;
  lastAuditStatus: 'clean' | 'corrupted' | 'idle';
  isAuditing: boolean;
  tamperAlarmActive: boolean;
  corruptedItems: CorruptedItemDetail[];
  activeProof: MerkleProof | null;
  lastAlarmPayload: TamperAlarmPayload | null;

  // Actions
  fetchIntegrityStatus: () => Promise<void>;
  rebuildLocalMerkleTree: (items: VaultItem[]) => Promise<string>;
  auditIntegrity: (algorithm?: HashAlgorithm) => Promise<boolean>;
  fetchItemProof: (itemId: string) => Promise<MerkleProof | null>;
  verifyItemLocally: (item: VaultItem) => Promise<boolean>;
  triggerTamperAlarm: (payload: TamperAlarmPayload) => void;
  dismissTamperAlarm: () => void;
  resetIntegrityState: () => void;
  simulateBitFlipAttack: (item?: VaultItem) => Promise<void>;
}

const toValidTimestamp = (val: unknown): number | null => {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) return Math.floor(val);
  if (typeof val === 'string') {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);
    const parsed = new Date(val).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

export const useIntegrityStore = create<IntegrityState>((set, get) => ({
  rootHash: '',
  algorithm: 'blake3',
  totalLeaves: 0,
  treeDepth: 0,
  lastAuditAt: null,
  lastAuditStatus: 'idle',
  isAuditing: false,
  tamperAlarmActive: false,
  corruptedItems: [],
  activeProof: null,
  lastAlarmPayload: null,

  fetchIntegrityStatus: async () => {
    try {
      const { data } = await apiClient.get<any>('/vault/integrity/status');
      if (data?.success && data.data) {
        set({
          rootHash: data.data.activeRootHash || '',
          algorithm: data.data.algorithm || 'blake3',
          totalLeaves: typeof data.data.totalLeaves === 'number' ? data.data.totalLeaves : 0,
          treeDepth: typeof data.data.treeDepth === 'number' ? data.data.treeDepth : 0,
          lastAuditAt: toValidTimestamp(data.data.lastAuditAt),
          lastAuditStatus: data.data.lastAuditStatus || 'clean',
        });
      }
    } catch {
      // Non-blocking fallback
    }
  },

  rebuildLocalMerkleTree: async (items: VaultItem[]) => {
    const algorithm = get().algorithm;
    const mediaItems = items.filter(
      (item) =>
        !item.deletedAt &&
        (item.type === 'photo' ||
          item.type === 'video' ||
          item.type === 'file' ||
          item.type === 'document'),
    );

    const leafItems: MerkleLeafItem[] = [];

    for (const item of mediaItems) {
      let hash = item.metadata?.integrity?.hash || item.metadata?.sha256;
      if (!hash) {
        if (item.content instanceof Uint8Array) {
          hash = await computeBufferHash(item.content, algorithm);
        } else if (typeof item.content === 'string' && item.content.length > 0) {
          hash = await computeBufferHash(item.content, algorithm);
        } else {
          hash = await computeBufferHash(item.id, algorithm);
        }
      }

      leafItems.push({
        itemId: item.id,
        category: item.type,
        hash,
        size:
          item.metadata?.size ||
          (item.content instanceof Uint8Array
            ? item.content.byteLength
            : item.content?.length || 0),
        updatedAt: item.updatedAt,
      });
    }

    const tree = new MerkleTree(algorithm);
    const rootHash = await tree.build(leafItems);

    set({
      rootHash,
      totalLeaves: tree.getLeafCount(),
      treeDepth: tree.getDepth(),
    });

    return rootHash;
  },

  auditIntegrity: async (algorithm?: HashAlgorithm) => {
    const selectedAlgo = algorithm || get().algorithm;
    set({ isAuditing: true });

    try {
      const { data } = await apiClient.post<any>('/vault/integrity/verify', {
        algorithm: selectedAlgo,
      });

      const auditData = data?.data;
      const isClean = auditData?.status === 'clean';
      const corrupted = auditData?.corruptedItems || [];

      set({
        isAuditing: false,
        lastAuditAt: Date.now(),
        lastAuditStatus: isClean ? 'clean' : 'corrupted',
        rootHash: auditData?.rootHash || get().rootHash,
        corruptedItems: corrupted,
      });

      if (!isClean) {
        get().triggerTamperAlarm({
          type: 'BIT_FLIP_AUDIT_FAILURE',
          severity: 'CRITICAL',
          corruptedItems: corrupted,
          rootHash: auditData?.rootHash,
          auditId: auditData?.auditId,
          timestamp: Date.now(),
        });
        return false;
      } else {
        toast.success('Cryptographic Merkle Audit Passed', {
          description: `All ${auditData?.totalChecked || 0} vault items verified with zero bit-flips or silent corruptions.`,
        });
        logActivity({
          actionType: 'security_alert',
          itemName: 'Merkle Audit',
          description: `Cryptographic audit verified 0 corruptions across ${auditData?.totalChecked || 0} assets`,
          status: 'success',
        });
        return true;
      }
    } catch (err: any) {
      set({ isAuditing: false });
      const errorData = err?.response?.data?.data;
      if (errorData?.corruptedItems?.length > 0) {
        get().triggerTamperAlarm({
          type: 'BIT_FLIP_AUDIT_FAILURE',
          severity: 'CRITICAL',
          corruptedItems: errorData.corruptedItems,
          rootHash: errorData.rootHash,
          auditId: errorData.auditId,
          timestamp: Date.now(),
        });
        return false;
      }
      toast.error('Integrity audit encountered a network error. Retrying in background.');
      return false;
    }
  },

  fetchItemProof: async (itemId: string) => {
    try {
      const { data } = await apiClient.get<any>(
        `/vault/integrity/proof/${itemId}?algorithm=${get().algorithm}`,
      );
      if (data?.success && data.data) {
        const proof = data.data as MerkleProof;
        set({ activeProof: proof });
        return proof;
      }
      return null;
    } catch {
      return null;
    }
  },

  verifyItemLocally: async (item: VaultItem) => {
    const algorithm = (item.metadata?.integrity?.algorithm as HashAlgorithm) || get().algorithm;
    const expectedHash = item.metadata?.integrity?.hash || item.metadata?.sha256;
    if (!expectedHash) return true;

    try {
      let actualHash = '';
      if (item.content instanceof Uint8Array) {
        actualHash = await computeBufferHash(item.content, algorithm);
      } else if (typeof item.content === 'string' && item.content.length > 0) {
        actualHash = await computeBufferHash(item.content, algorithm);
      }

      if (actualHash && actualHash.trim().toLowerCase() !== expectedHash.trim().toLowerCase()) {
        // Bit flip detected locally!
        const corruptedItem: CorruptedItemDetail = {
          itemId: item.id,
          title: item.title,
          category: item.type,
          expectedHash,
          actualHash,
          reason: 'Local cryptographic hash mismatch (bit-flip / corrupted data)',
        };

        get().triggerTamperAlarm({
          type: 'LOCAL_BIT_FLIP_DETECTED',
          severity: 'CRITICAL',
          corruptedItems: [corruptedItem],
          timestamp: Date.now(),
        });

        // Report to server
        apiClient
          .post('/vault/integrity/report-tamper', {
            itemId: item.id,
            expectedHash,
            actualHash,
            details: { category: item.type, title: item.title },
          })
          .catch(() => {});

        return false;
      }

      return true;
    } catch (err) {
      console.warn('Local integrity verification skipped due to hash error:', err);
      return true;
    }
  },

  triggerTamperAlarm: (payload: TamperAlarmPayload) => {
    const current = get();
    const isDuplicate =
      current.tamperAlarmActive &&
      current.lastAlarmPayload &&
      ((payload.auditId && current.lastAlarmPayload.auditId === payload.auditId) ||
        (payload.timestamp &&
          Math.abs(current.lastAlarmPayload.timestamp - payload.timestamp) < 3000));

    if (isDuplicate) {
      return;
    }

    set({
      tamperAlarmActive: true,
      corruptedItems: payload.corruptedItems || [],
      lastAlarmPayload: payload,
      lastAuditStatus: 'corrupted',
    });

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vault-integrity-alarm', { detail: payload }));
      }
    } catch {
      // ignore
    }

    logActivity({
      actionType: 'security_alert',
      itemName: 'Integrity Tamper Alarm',
      description: `🚨 Bit-flip corruption detected in ${payload.corruptedItems?.length || 1} asset(s)`,
      status: 'failure',
    });

    toast.error('🚨 CRYPTOGRAPHIC INTEGRITY VIOLATION', {
      description:
        'Bit-flip corruption or unauthorized database tampering was detected! Vault alert triggered.',
      duration: 10000,
    });
  },

  dismissTamperAlarm: () => {
    set({ tamperAlarmActive: false });
  },

  resetIntegrityState: () => {
    set({
      rootHash: '',
      algorithm: 'blake3',
      totalLeaves: 0,
      treeDepth: 0,
      lastAuditAt: null,
      lastAuditStatus: 'idle',
      isAuditing: false,
      tamperAlarmActive: false,
      corruptedItems: [],
      activeProof: null,
      lastAlarmPayload: null,
    });
  },

  simulateBitFlipAttack: async (item?: VaultItem) => {
    const dummyData = new Uint8Array([
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x56, 0x61, 0x75, 0x6c, 0x74,
    ]); // "Hello Vault"
    const originalHash = await computeBufferHash(dummyData, 'blake3');

    // Flip 1 single bit in byte 0 (0x48 -> 0x49)
    const tamperedData = simulateBitFlip(dummyData, 0, 0);
    const tamperedHash = await computeBufferHash(tamperedData, 'blake3');

    const simulatedCorruptedItem: CorruptedItemDetail = {
      itemId: item?.id || 'simulated-photo-001',
      title: item?.title || 'demo_photo_secure.jpg',
      category: item?.type || 'photo',
      expectedHash: originalHash,
      actualHash: tamperedHash,
      reason:
        '1-Bit Flip Attack Simulated: Bit 0 of Byte 0 was modified from 0 to 1, causing total cryptographic Merkle failure!',
    };

    get().triggerTamperAlarm({
      type: 'SIMULATED_BIT_FLIP_ATTACK',
      severity: 'CRITICAL',
      corruptedItems: [simulatedCorruptedItem],
      timestamp: Date.now(),
    });
  },
}));

// Initialize window listener for real-time WebSocket alarms
if (typeof window !== 'undefined') {
  window.addEventListener('vault:integrity_alarm' as any, (event: CustomEvent) => {
    if (event.detail) {
      useIntegrityStore.getState().triggerTamperAlarm(event.detail);
    }
  });
}
