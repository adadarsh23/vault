/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest';
import { hashDecoyPin, verifyDecoyPin } from '../../src/lib/cryptoPrimitives';
import { useVaultStore } from '../../src/store/vaultStore';

describe('Decoy Vault Cryptographic Primitives', () => {
  it('enforces numeric-only PIN policy in hashDecoyPin', async () => {
    // Non-numeric should throw
    await expect(hashDecoyPin('SecureDecoyPin99!')).rejects.toThrow(/only numbers/i);
    await expect(hashDecoyPin('abc123')).rejects.toThrow(/only numbers/i);
    await expect(hashDecoyPin('123')).rejects.toThrow(/between 4 and 12/i);

    // Valid numeric PIN succeeds
    const result = await hashDecoyPin('987654');
    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('salt');
    expect(result.hash.startsWith('pbkdf2:100000:')).toBe(true);
    expect(result.salt.length).toBeGreaterThanOrEqual(16);
  });

  it('successfully verifies a valid numeric PIN against PBKDF2 hash', async () => {
    const pin = '20261984';
    const { hash } = await hashDecoyPin(pin);

    const isValid = await verifyDecoyPin(pin, hash);
    expect(isValid).toBe(true);
  });

  it('rejects an invalid PIN against PBKDF2 hash', async () => {
    const correctPin = '123456';
    const wrongPin = '654321';
    const { hash } = await hashDecoyPin(correctPin);

    const isValid = await verifyDecoyPin(wrongPin, hash);
    expect(isValid).toBe(false);
  });

  it('supports backwards-compatible verification of legacy SHA-256 hashes', async () => {
    const pin = '987654';
    const enc = new TextEncoder().encode(`vault-decoy-salt:${pin}`);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const legacyHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const isValid = await verifyDecoyPin(pin, legacyHash);
    expect(isValid).toBe(true);

    const isWrongValid = await verifyDecoyPin('112233', legacyHash);
    expect(isWrongValid).toBe(false);
  });

  it('rejects empty inputs safely without throwing', async () => {
    expect(await verifyDecoyPin('', 'some-hash')).toBe(false);
    expect(await verifyDecoyPin('1234', '')).toBe(false);
  });

  it('matches raw plaintext PINs and JSON-quoted hashes for maximum recovery', async () => {
    expect(await verifyDecoyPin('1234', '1234')).toBe(true);
    expect(await verifyDecoyPin('1234', ' "1234" ')).toBe(true);
    expect(await verifyDecoyPin('  9876  ', '9876')).toBe(true);
  });

  it('allows encryptData and decryptData to handle null/undefined keys gracefully (decoy mode)', async () => {
    const { encryptData, decryptData } = await import('../../src/lib/cryptoPrimitives');
    const plaintext = 'Decoy Mock Content 12345';

    // Encrypt with null key (decoy mode)
    const encrypted = await encryptData(plaintext, null);
    expect(encrypted).toBe(plaintext);

    // Decrypt with null key
    const decrypted = await decryptData(encrypted, null);
    expect(decrypted).toBe(plaintext);
  });

  it('falls back to plaintext safely if decryptData encounters unencrypted strings', async () => {
    const { decryptData } = await import('../../src/lib/cryptoPrimitives');
    const mockNote = '# Grocery List\n- Apples\n- Milk';

    // Even if an unexpected key or null is passed to plaintext note, it returns plaintext
    const decrypted = await decryptData(mockNote, null);
    expect(decrypted).toBe(mockNote);
  });
});

describe('Decoy Vault Store CRUD & State Isolation', () => {
  beforeEach(() => {
    useVaultStore.getState().lock();
  });

  it('unlocks decoy vault with isolated state and realistic mock items', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    const state = useVaultStore.getState();
    expect(state.isUnlocked).toBe(true);
    expect(state.isVaultReady).toBe(true);
    expect(state.isDecoyMode).toBe(true);
    expect(state.masterKey).toBeNull();
    expect(state.items.length).toBeGreaterThanOrEqual(3);

    const types = state.items.map((i) => i.type);
    expect(types).toContain('photo');
    expect(types).toContain('note');
    expect(types).toContain('wifi');
    expect(types).toContain('document');
  });

  it('allows seamless adding of items in decoy mode without master key', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    const initialCount = useVaultStore.getState().items.length;

    const newItem = await store.addItem({
      type: 'note',
      title: 'Secret Meeting Notes',
      content: 'Discussing project roadmap...',
    });

    expect(newItem).toBeDefined();
    expect(newItem.title).toBe('Secret Meeting Notes');
    expect(newItem.id.startsWith('decoy-')).toBe(true);

    const updatedState = useVaultStore.getState();
    expect(updatedState.items.length).toBe(initialCount + 1);
    expect(updatedState.items.find((i) => i.id === newItem.id)).toBeDefined();
  });

  it('allows seamless updating of items in decoy mode', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    const firstItem = useVaultStore.getState().items[0];
    await store.updateItem(firstItem.id, { title: 'Updated Decoy Title' });

    const updatedFirst = useVaultStore.getState().items.find((i) => i.id === firstItem.id);
    expect(updatedFirst?.title).toBe('Updated Decoy Title');
  });

  it('allows seamless removing of items in decoy mode', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    const initialCount = useVaultStore.getState().items.length;
    const itemToRemove = useVaultStore.getState().items[0];

    await store.removeItem(itemToRemove.id);

    const stateAfter = useVaultStore.getState();
    expect(stateAfter.items.length).toBe(initialCount - 1);
    expect(stateAfter.items.find((i) => i.id === itemToRemove.id)).toBeUndefined();
  });

  it('allows toggling pin on items in decoy mode', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    const item = useVaultStore.getState().items[0];
    const initialPinned = Boolean(item.isPinned);

    await store.togglePin(item.id);

    const updated = useVaultStore.getState().items.find((i) => i.id === item.id);
    expect(updated?.isPinned).toBe(!initialPinned);
  });

  it('purges only decoy in-memory data on destroyAllData during decoy mode', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    await store.destroyAllData();

    const state = useVaultStore.getState();
    expect(state.items).toEqual([]);
    expect(state.isUnlocked).toBe(false);
    expect(state.isDecoyMode).toBe(false);
  });

  it('provides well-formed JSON content for dummy Wi-Fi items with passwordKey', async () => {
    const store = useVaultStore.getState();
    await store.unlockDecoyVault('decoy_alice');

    const wifiItem = useVaultStore.getState().items.find((i) => i.type === 'wifi');
    expect(wifiItem).toBeDefined();
    expect(wifiItem?.title).toBe('Home Fiber Wi-Fi');

    const parsed = JSON.parse(wifiItem?.content as string);
    expect(parsed.ssid).toBe('Home_5G_Network');
    expect(parsed.passwordKey).toBe('HomeNetworkSecure2026');
  });
});
