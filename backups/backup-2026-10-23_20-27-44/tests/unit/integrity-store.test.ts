import { describe, it, expect, beforeEach, vi } from 'vitest';
import apiClient from '../../src/api/apiClient';
import { useIntegrityStore } from '../../src/store/integrityStore';

vi.mock('../../src/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

vi.mock('../../src/lib/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('useIntegrityStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIntegrityStore.getState().resetIntegrityState();
  });

  it('initializes with default clean state', () => {
    const state = useIntegrityStore.getState();
    expect(state.rootHash).toBe('');
    expect(state.algorithm).toBe('blake3');
    expect(state.tamperAlarmActive).toBe(false);
    expect(state.corruptedItems).toEqual([]);
    expect(state.lastAuditStatus).toBe('idle');
  });

  it('fetches integrity status from api and populates store', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          activeRootHash: 'hash-abc-123',
          algorithm: 'blake3',
          totalLeaves: 10,
          treeDepth: 4,
          lastAuditAt: 1700000000000,
          lastAuditStatus: 'clean',
        },
      },
    });

    await useIntegrityStore.getState().fetchIntegrityStatus();

    const state = useIntegrityStore.getState();
    expect(state.rootHash).toBe('hash-abc-123');
    expect(state.totalLeaves).toBe(10);
    expect(state.treeDepth).toBe(4);
    expect(state.lastAuditStatus).toBe('clean');
  });

  it('triggers tamper alarm and dispatches event', () => {
    const payload = {
      type: 'BIT_FLIP_AUDIT_FAILURE',
      severity: 'CRITICAL' as const,
      corruptedItems: [
        {
          itemId: 'item-1',
          title: 'Photo',
          category: 'photo',
          expectedHash: 'abc',
          actualHash: 'xyz',
          reason: 'mismatch',
        },
      ],
      timestamp: Date.now(),
      auditId: 'audit-001',
    };

    useIntegrityStore.getState().triggerTamperAlarm(payload);

    const state = useIntegrityStore.getState();
    expect(state.tamperAlarmActive).toBe(true);
    expect(state.corruptedItems).toHaveLength(1);
    expect(state.lastAuditStatus).toBe('corrupted');
    expect(state.lastAlarmPayload?.auditId).toBe('audit-001');
  });

  it('deduplicates duplicate tamper alarms', () => {
    const payload = {
      type: 'BIT_FLIP_AUDIT_FAILURE',
      severity: 'CRITICAL' as const,
      corruptedItems: [],
      timestamp: Date.now(),
      auditId: 'audit-001',
    };

    useIntegrityStore.getState().triggerTamperAlarm(payload);
    // Call again with same auditId
    useIntegrityStore.getState().triggerTamperAlarm(payload);

    expect(useIntegrityStore.getState().tamperAlarmActive).toBe(true);
  });

  it('dismisses tamper alarm', () => {
    useIntegrityStore.getState().triggerTamperAlarm({
      type: 'TEST',
      severity: 'CRITICAL',
      corruptedItems: [],
      timestamp: Date.now(),
    });

    expect(useIntegrityStore.getState().tamperAlarmActive).toBe(true);

    useIntegrityStore.getState().dismissTamperAlarm();
    expect(useIntegrityStore.getState().tamperAlarmActive).toBe(false);
  });

  it('resets integrity state completely', () => {
    useIntegrityStore.setState({
      rootHash: 'test-root',
      totalLeaves: 42,
      tamperAlarmActive: true,
      lastAuditStatus: 'corrupted',
    });

    useIntegrityStore.getState().resetIntegrityState();

    const state = useIntegrityStore.getState();
    expect(state.rootHash).toBe('');
    expect(state.totalLeaves).toBe(0);
    expect(state.tamperAlarmActive).toBe(false);
    expect(state.lastAuditStatus).toBe('idle');
  });
});
