import { describe, expect, it } from 'vitest';
import {
  deriveKey,
  encryptData,
  encryptFile,
  decryptFileEnvelope,
  isEnvelopeBundle,
  uint8ArrayToBase64,
} from '../../src/lib/cryptoPrimitives.ts';
import { reencryptVaultItemContent } from '../../src/lib/vaultKeyRotation.ts';

describe('vaultKeyRotation', () => {
  it('rotates encrypted string content to the new key', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('secret note', oldKey);

    const rotated = await reencryptVaultItemContent(
      { title: 'Note', content: encrypted },
      oldKey,
      newKey,
    );

    expect(typeof rotated).toBe('string');
    expect(rotated).not.toBe(encrypted);
  });

  it('preserves non-base64 plaintext string content', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const plaintext = 'Bring milk and eggs';

    const rotated = await reencryptVaultItemContent(
      { title: 'Todo', content: plaintext },
      oldKey,
      newKey,
    );

    expect(rotated).toBe(plaintext);
  });

  it('preserves server reference string content', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');
    const serverRef = '/api/vault/files/abc123';

    const rotated = await reencryptVaultItemContent(
      { title: 'Video', content: serverRef },
      oldKey,
      newKey,
    );

    expect(rotated).toBe(serverRef);
  });

  it('preserves cloud:// and gridfs:// server reference strings', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const cloudRef = 'cloud://item-gridfs-doc-001';
    const gridFsRef = 'gridfs://vault-chunk-doc-002';

    const rotatedCloud = await reencryptVaultItemContent(
      { title: 'BCS-062 june 2025.pdf', content: cloudRef },
      oldKey,
      newKey,
    );
    const rotatedGridFs = await reencryptVaultItemContent(
      { title: 'BCS-062 june 2025.pdf', content: gridFsRef },
      oldKey,
      newKey,
    );

    expect(rotatedCloud).toBe(cloudRef);
    expect(rotatedGridFs).toBe(gridFsRef);
  });

  it('rotates envelope-encrypted PDF documents without integrity errors', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const pdfRawContent = new TextEncoder().encode('%PDF-1.7 mock document body content');
    const pdfFile = new File([pdfRawContent], 'BCS-062 june 2025.pdf', {
      type: 'application/pdf',
    });
    const encryptedPdf = await encryptFile(pdfFile, oldKey);

    expect(isEnvelopeBundle(encryptedPdf)).toBe(true);

    const rotated = await reencryptVaultItemContent(
      { title: 'BCS-062 june 2025.pdf', content: encryptedPdf },
      oldKey,
      newKey,
    );

    expect(rotated).toBeInstanceOf(Uint8Array);
    expect(isEnvelopeBundle(rotated as Uint8Array)).toBe(true);

    // Old key can no longer decrypt rotated bundle
    await expect(decryptFileEnvelope(rotated as Uint8Array, oldKey)).rejects.toThrow();

    // New key decrypts rotated bundle back to identical original PDF content
    const decryptedWithNewKey = await decryptFileEnvelope(rotated as Uint8Array, newKey);
    expect(new Uint8Array(decryptedWithNewKey)).toEqual(pdfRawContent);
  });

  it('rotates unencrypted raw PDF bytes without throwing integrity check error', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const rawPdfBytes = new TextEncoder().encode(
      '%PDF-1.7 unencrypted legacy document stored in vault without wrapper',
    );

    const rotated = await reencryptVaultItemContent(
      { title: 'BCS-062 june 2025.pdf', content: rawPdfBytes },
      oldKey,
      newKey,
    );

    expect(rotated).toBeInstanceOf(Uint8Array);

    // Should now be safely encrypted and decryptable with newKey
    const decrypted = await decryptFileEnvelope(rotated as Uint8Array, newKey);
    expect(new Uint8Array(decrypted)).toEqual(rawPdfBytes);
  });

  it('rotates base64-encoded envelope bundle string content', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const payload = new TextEncoder().encode('%PDF-1.5 Base64 encoded document');
    const file = new File([payload], 'report.pdf', { type: 'application/pdf' });
    const encrypted = await encryptFile(file, oldKey);
    const base64Encrypted = uint8ArrayToBase64(encrypted);

    const rotated = await reencryptVaultItemContent(
      { title: 'report.pdf', content: base64Encrypted },
      oldKey,
      newKey,
    );

    expect(typeof rotated).toBe('string');
    expect(rotated).not.toBe(base64Encrypted);

    // Decrypt rotated base64 with newKey
    const { base64ToUint8Array } = await import('../../src/lib/cryptoPrimitives.ts');
    const decrypted = await decryptFileEnvelope(base64ToUint8Array(rotated as string), newKey);
    expect(new Uint8Array(decrypted)).toEqual(payload);
  });

  it('throws integrity error when decrypting envelope with wrong old key', async () => {
    const correctOldKey = await deriveKey('CorrectPassword123!', 'alice-vault-pqc-salt');
    const wrongOldKey = await deriveKey('WrongPassword123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewPassword123!', 'alice-vault-pqc-salt');

    const file = new File([new TextEncoder().encode('Sensitive')], 'secret.pdf');
    const encrypted = await encryptFile(file, correctOldKey);

    await expect(
      reencryptVaultItemContent({ title: 'secret.pdf', content: encrypted }, wrongOldKey, newKey),
    ).rejects.toMatchObject({
      code: 'INTEGRITY_CHECK_FAILED',
    });
  });

  it('returns original content when both keys are identical', async () => {
    const key = await deriveKey('SameVault123!', 'alice-vault-pqc-salt');
    const file = new File([new Uint8Array([1, 2, 3])], 'demo.bin');
    const encryptedBytes = await encryptFile(file, key);

    const rotated = await reencryptVaultItemContent(
      { title: 'Binary', content: encryptedBytes },
      key,
      key,
    );

    expect(rotated).toBe(encryptedBytes);
  });

  it('throws a typed key-material error when key is invalid', async () => {
    const validOldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const encrypted = await encryptData('secret', validOldKey);

    await expect(
      reencryptVaultItemContent(
        { title: 'Note', content: encrypted },
        'not-a-valid-derived-key',
        'still-not-valid',
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_KEY_MATERIAL',
    });
  });

  it('rotates unencrypted raw plain text documents without error', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const textBytes = new TextEncoder().encode(JSON.stringify({ config: true, items: [1, 2, 3] }));

    const rotated = await reencryptVaultItemContent(
      { title: 'config.json', content: textBytes },
      oldKey,
      newKey,
    );

    expect(rotated).toBeInstanceOf(Uint8Array);
    const decrypted = await decryptFileEnvelope(rotated as Uint8Array, newKey);
    expect(new Uint8Array(decrypted)).toEqual(textBytes);
  });

  it('rotates unencrypted raw ZIP archive bytes without error', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    // PK\x03\x04 signature + mock payload (>= 28 bytes)
    const zipBytes = new Uint8Array(32);
    zipBytes.set([0x50, 0x4b, 0x03, 0x04], 0);
    zipBytes.fill(0xaa, 4);

    const rotated = await reencryptVaultItemContent(
      { title: 'archive.zip', content: zipBytes },
      oldKey,
      newKey,
    );

    expect(rotated).toBeInstanceOf(Uint8Array);
    const decrypted = await decryptFileEnvelope(rotated as Uint8Array, newKey);
    expect(new Uint8Array(decrypted)).toEqual(zipBytes);
  });

  it('handles items without titles gracefully', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const encrypted = await encryptData('untitled content', oldKey);

    const rotated = await reencryptVaultItemContent(
      { title: '', content: encrypted },
      oldKey,
      newKey,
    );

    expect(typeof rotated).toBe('string');
    expect(rotated).not.toBe(encrypted);
  });

  it('handles items with null or undefined content safely without crashing', async () => {
    const oldKey = await deriveKey('OldVault123!', 'alice-vault-pqc-salt');
    const newKey = await deriveKey('NewVault123!', 'alice-vault-pqc-salt');

    const rotatedNull = await reencryptVaultItemContent(
      { title: 'Empty Item', content: null as any },
      oldKey,
      newKey,
    );

    const rotatedUndefined = await reencryptVaultItemContent(
      { title: 'Empty Item', content: undefined as any },
      oldKey,
      newKey,
    );

    expect(rotatedNull).toBe('');
    expect(rotatedUndefined).toBe('');
  });
});
