import { base64ToUint8Array } from './encryption';

const sharedEncoder = new TextEncoder();
const sharedDecoder = new TextDecoder();

export const VAULT_BACKUP_MAGIC = sharedEncoder.encode('VAULT_BACKUP_V1\0');

const toArrayBuffer = (value: Uint8Array): ArrayBuffer =>
  value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;

export const exportEncryptedBackup = async (
  json: string,
  masterKey: string,
): Promise<Uint8Array> => {
  const data = sharedEncoder.encode(json);

  const keyBuf = base64ToUint8Array(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBuf),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
  } finally {
    keyBuf.fill(0);
  }

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(VAULT_BACKUP_MAGIC),
    },
    cryptoKey,
    toArrayBuffer(data),
  );

  const bundle = new Uint8Array(VAULT_BACKUP_MAGIC.length + iv.length + ciphertext.byteLength);
  bundle.set(VAULT_BACKUP_MAGIC, 0);
  bundle.set(iv, VAULT_BACKUP_MAGIC.length);
  bundle.set(new Uint8Array(ciphertext), VAULT_BACKUP_MAGIC.length + iv.length);

  return bundle;
};

export const importEncryptedBackup = async (
  bundle: Uint8Array,
  masterKey: string,
): Promise<string> => {
  const magicLength = VAULT_BACKUP_MAGIC.length;

  if (bundle.length < magicLength + 12) {
    throw new Error('Invalid backup file format.');
  }

  // Verify magic header in-place without copying
  for (let i = 0; i < magicLength; i++) {
    if (bundle[i] !== VAULT_BACKUP_MAGIC[i]) {
      throw new Error('Invalid backup file signature.');
    }
  }

  const iv = bundle.subarray(magicLength, magicLength + 12);
  const ciphertext = bundle.subarray(magicLength + 12);

  const keyBuf = base64ToUint8Array(masterKey);

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBuf),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
  } finally {
    keyBuf.fill(0);
  }

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(VAULT_BACKUP_MAGIC),
    },
    cryptoKey,
    toArrayBuffer(ciphertext),
  );

  return sharedDecoder.decode(decrypted);
};
