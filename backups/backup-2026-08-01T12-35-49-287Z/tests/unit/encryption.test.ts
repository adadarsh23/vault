import { describe, expect, it } from 'vitest'
import {
  base64ToUint8Array,
  decryptData,
  deriveKey,
  encryptData,
  encryptFile,
  uint8ArrayToBase64,
} from '../../src/lib/encryption.ts'

// ---------------------------------------------------------------------------
// AES-256-GCM – string encryption / decryption
// ---------------------------------------------------------------------------

describe('AES-256-GCM vault crypto', () => {
  it('encrypts and decrypts plaintext with the same derived key', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const plaintext = 'top secret vault entry'

    const encrypted = await encryptData(plaintext, key)
    const decrypted = await decryptData(encrypted, key)

    expect(encrypted).not.toBe(plaintext)
    expect(typeof encrypted).toBe('string')
    expect(decrypted).toBe(plaintext)
  })

  it('returns null when decrypting with the wrong key', async () => {
    const correctKey = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const wrongKey = await deriveKey('WrongKey123!', 'alice-vault-pqc-salt')
    const encrypted = await encryptData('vault payload', correctKey)

    expect(await decryptData(encrypted, wrongKey)).toBeNull()
  })

  it('produces different ciphertext for the same plaintext because IVs are random', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')

    const encryptedA = await encryptData('same content', key)
    const encryptedB = await encryptData('same content', key)

    expect(encryptedA).not.toBe(encryptedB)
    await expect(decryptData(encryptedA, key)).resolves.toBe('same content')
    await expect(decryptData(encryptedB, key)).resolves.toBe('same content')
  })

  it('handles empty string plaintext', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')

    const encrypted = await encryptData('', key)
    const decrypted = await decryptData(encrypted, key)

    expect(decrypted).toBe('')
  })

  it('handles unicode / multi-byte plaintext', async () => {
    const key = await deriveKey('VaultKey123!', 'unicode-salt-padded')
    const plaintext = '🔐 Vault – top secret: привет мир'

    const encrypted = await encryptData(plaintext, key)
    const decrypted = await decryptData(encrypted, key)

    expect(decrypted).toBe(plaintext)
  })

  it('handles large plaintext (100 KB)', async () => {
    const key = await deriveKey('VaultKey123!', 'large-content-salt-')
    const plaintext = 'x'.repeat(100_000)

    const encrypted = await encryptData(plaintext, key)
    const decrypted = await decryptData(encrypted, key)

    expect(decrypted).toBe(plaintext)
  })

  it('decryptData returns null for an empty encryptedBundle', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    expect(await decryptData('', key)).toBeNull()
  })

  it('decryptData returns null for a truncated / malformed bundle', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    // A base64 string that decodes to fewer than 13 bytes (IV + 1 ciphertext byte)
    const tooShort = uint8ArrayToBase64(new Uint8Array(5))
    expect(await decryptData(tooShort, key)).toBeNull()
  })

  it('decryptData returns null when an empty key is supplied', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const encrypted = await encryptData('data', key)
    expect(await decryptData(encrypted, '')).toBeNull()
  })

  it('encryptData throws on an invalid (wrong-length) key', async () => {
    const badKey = uint8ArrayToBase64(new Uint8Array(16)) // 16 bytes ≠ 32
    await expect(encryptData('data', badKey)).rejects.toThrow(/Invalid key length/)
  })
})

// ---------------------------------------------------------------------------
// File encryption – encryptFile
// ---------------------------------------------------------------------------

describe('encryptFile', () => {
  it('encrypts binary file bytes and produces a different Uint8Array', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const raw = new Uint8Array([10, 20, 30, 40, 50])
    const file = new File([raw], 'sample.bin', { type: 'application/octet-stream' })

    const encrypted = await encryptFile(file, key)

    expect(encrypted).toBeInstanceOf(Uint8Array)
    // IV (12 bytes) + GCM tag (16 bytes) + plaintext (5 bytes) = 33 bytes
    expect(encrypted.length).toBeGreaterThan(raw.length)
    expect(encrypted).not.toEqual(raw)
  })

  it('produces different encrypted output on each call', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const file = new File([new Uint8Array([1, 2, 3])], 'a.bin')

    const enc1 = await encryptFile(file, key)
    const enc2 = await encryptFile(file, key)

    expect(enc1).not.toEqual(enc2)
  })

  it('encrypts a text file and its bytes differ from the utf-8 encoding', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const content = 'hello vault'
    const file = new File([content], 'note.txt', { type: 'text/plain' })

    const encrypted = await encryptFile(file, key)
    const rawBytes = new TextEncoder().encode(content)

    expect(encrypted).not.toEqual(rawBytes)
  })
})

// ---------------------------------------------------------------------------
// Key derivation – deriveKey
// ---------------------------------------------------------------------------

describe('deriveKey', () => {
  it('produces a 32-byte (256-bit) base64-encoded key', async () => {
    const key = await deriveKey('VaultKey123!', 'alice-vault-pqc-salt')
    const raw = base64ToUint8Array(key)

    expect(raw.length).toBe(32)
  })

  it('produces different keys for different passwords', async () => {
    const salt = 'shared-salt-padded'
    const keyA = await deriveKey('PasswordA123!', salt)
    const keyB = await deriveKey('PasswordB123!', salt)

    expect(keyA).not.toBe(keyB)
  })

  it('produces different keys for different salts', async () => {
    const password = 'SamePassword123!'
    const keyA = await deriveKey(password, 'salt-for-alice-vau')
    const keyB = await deriveKey(password, 'salt-for-bob-vault')

    expect(keyA).not.toBe(keyB)
  })

  it('is deterministic – same password + salt always gives the same key', async () => {
    const key1 = await deriveKey('Stable123!', 'stable-salt-value-')
    const key2 = await deriveKey('Stable123!', 'stable-salt-value-')

    expect(key1).toBe(key2)
  })

  it('throws when an empty password is supplied', async () => {
    await expect(deriveKey('')).rejects.toThrow(/Password required/)
  })
})

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

describe('uint8ArrayToBase64 / base64ToUint8Array', () => {
  it('round-trips arbitrary bytes correctly', () => {
    const original = new Uint8Array([0, 127, 128, 255, 42])
    const b64 = uint8ArrayToBase64(original)
    const restored = base64ToUint8Array(b64)

    expect(restored).toEqual(original)
  })

  it('base64ToUint8Array returns an empty array for an empty string', () => {
    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0))
  })

  it('handles a single zero byte', () => {
    const original = new Uint8Array([0])
    expect(base64ToUint8Array(uint8ArrayToBase64(original))).toEqual(original)
  })
})
