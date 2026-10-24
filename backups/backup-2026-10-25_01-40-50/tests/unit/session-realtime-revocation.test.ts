/* @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sessionRealtimeService } from '../../server/services/sessionRealtimeService.ts';
import { useVaultStore } from '../../src/store/vaultStore.ts';
import {
  triggerSessionTermination,
  stopSessionSecurityWatcher,
  SESSION_REVOKED_EVENT,
} from '../../src/lib/sessionSecurityService.ts';

describe('Real-time Session Revocation & Action Banning', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window === 'undefined') {
      (globalThis as any).window = {
        dispatchEvent: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }
  });

  afterEach(() => {
    sessionRealtimeService.destroy();
    stopSessionSecurityWatcher();
  });

  describe('SessionRealtimeService (SSE)', () => {
    it('registers an SSE stream and dispatches real-time revocation event', () => {
      const mockWrite = vi.fn();
      const mockEnd = vi.fn();
      const mockOn = vi.fn();

      const fakeResponse = {
        writableEnded: false,
        destroyed: false,
        write: mockWrite,
        end: mockEnd,
        on: mockOn,
      } as any;

      sessionRealtimeService.registerSessionStream('user-123', 'session-abc', fakeResponse);

      const notified = sessionRealtimeService.notifySessionRevoked(
        'user-123',
        ['session-abc'],
        'REVOKED_BY_USER',
      );
      expect(notified).toBe(1);
      expect(mockWrite).toHaveBeenCalled();
      const writeCall = mockWrite.mock.calls[0][0];
      expect(writeCall).toContain('event: session_revoked');
      expect(writeCall).toContain('session-abc');
      expect(writeCall).toContain('REVOKED_BY_USER');
      expect(mockEnd).toHaveBeenCalled();
    });

    it('does not notify sessions that were not revoked', () => {
      const mockWrite = vi.fn();
      const mockEnd = vi.fn();
      const mockOn = vi.fn();

      const fakeResponse = {
        writableEnded: false,
        destroyed: false,
        write: mockWrite,
        end: mockEnd,
        on: mockOn,
      } as any;

      sessionRealtimeService.registerSessionStream('user-123', 'session-current', fakeResponse);

      const notified = sessionRealtimeService.notifySessionRevoked(
        'user-123',
        ['session-other'],
        'REVOKED_BY_USER',
      );
      expect(notified).toBe(0);
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockEnd).not.toHaveBeenCalled();
    });
  });

  describe('Client Session Termination & Vault Store Lockdown', () => {
    it('dispatches SESSION_REVOKED_EVENT and initiates lockdown on triggerSessionTermination', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      triggerSessionTermination('REVOKED_BY_ANOTHER_DEVICE', { sessionId: 'test-session' });
      expect(dispatchSpy).toHaveBeenCalled();
      const lastCall = (dispatchSpy.mock.calls as any[]).find(
        ([evt]: any[]) => (evt as any)?.type === SESSION_REVOKED_EVENT,
      );
      expect(lastCall).toBeDefined();
    });

    it('wipes decrypted memory, masterKey, and sets sessionRevokedState on handleSessionRevoked', () => {
      // Setup initial unlocked state
      useVaultStore.setState({
        isUnlocked: true,
        isVaultReady: true,
        masterKey: {} as any,
        items: [
          {
            id: 'item-1',
            title: 'Secret Note',
            content: 'Super secret',
            type: 'note',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        sessionRevokedState: null,
      });

      expect(useVaultStore.getState().isVaultReady).toBe(true);
      expect(useVaultStore.getState().items).toHaveLength(1);

      // Trigger revocation
      useVaultStore.getState().handleSessionRevoked({
        reason: 'REVOKED_BY_ANOTHER_DEVICE',
        sessionId: 'session-target',
      });

      const state = useVaultStore.getState();
      expect(state.isVaultReady).toBe(false);
      expect(state.isUnlocked).toBe(false);
      expect(state.masterKey).toBeNull();
      expect(state.items).toHaveLength(0);
      expect(state.sessionRevokedState?.isRevoked).toBe(true);
      expect(state.sessionRevokedState?.reason).toBe('REVOKED_BY_ANOTHER_DEVICE');
    });

    it('strictly bans addItem when session is revoked', async () => {
      useVaultStore.setState({
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        items: [],
        sessionRevokedState: { isRevoked: true, reason: 'REVOKED_BY_ANOTHER_DEVICE' },
      });

      await expect(
        useVaultStore.getState().addItem({
          title: 'Hacked Item',
          content: 'data',
          type: 'note',
        }),
      ).rejects.toThrow('SESSION_REVOKED');
    });

    it('strictly bans updateItem when session is revoked', async () => {
      useVaultStore.setState({
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        items: [
          {
            id: 'item-1',
            title: 'Note',
            content: 'test',
            type: 'note',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        sessionRevokedState: { isRevoked: true, reason: 'REVOKED_BY_ANOTHER_DEVICE' },
      });

      await expect(
        useVaultStore.getState().updateItem('item-1', { title: 'Updated Title' }),
      ).rejects.toThrow('SESSION_REVOKED');
    });

    it('strictly bans removeItem when session is revoked', async () => {
      useVaultStore.setState({
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        items: [
          {
            id: 'item-1',
            title: 'Note',
            content: 'test',
            type: 'note',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        sessionRevokedState: { isRevoked: true, reason: 'REVOKED_BY_ANOTHER_DEVICE' },
      });

      await expect(useVaultStore.getState().removeItem('item-1')).rejects.toThrow(
        'SESSION_REVOKED',
      );
    });

    it('strictly bans togglePin when session is revoked', async () => {
      useVaultStore.setState({
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        items: [
          {
            id: 'item-1',
            title: 'Note',
            content: 'test',
            type: 'note',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        sessionRevokedState: { isRevoked: true, reason: 'REVOKED_BY_ANOTHER_DEVICE' },
      });

      await expect(useVaultStore.getState().togglePin('item-1')).rejects.toThrow('SESSION_REVOKED');
    });

    it('strictly bans destroyAllData when session is revoked', async () => {
      useVaultStore.setState({
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        items: [],
        sessionRevokedState: { isRevoked: true, reason: 'REVOKED_BY_ANOTHER_DEVICE' },
      });

      await expect(useVaultStore.getState().destroyAllData()).rejects.toThrow('SESSION_REVOKED');
    });
  });
});
