import { base64ToUint8Array } from './encryption';

export const VAULT_BACKUP_MAGIC = new TextEncoder().encode('VAULT_BACKUP_V1\0');

export const exportEncryptedBackup = async (
  json: string,
  masterKey: string
): Promise<Uint8Array> => {
  const data = new TextEncoder().encode(json);
  
  const keyBuf = base64ToUint8Array(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf as any,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      additionalData: VAULT_BACKUP_MAGIC,
    },
    cryptoKey,
    data
  );

  const bundle = new Uint8Array(VAULT_BACKUP_MAGIC.length + iv.length + ciphertext.byteLength);
  bundle.set(VAULT_BACKUP_MAGIC, 0);
  bundle.set(iv, VAULT_BACKUP_MAGIC.length);
  bundle.set(new Uint8Array(ciphertext), VAULT_BACKUP_MAGIC.length + iv.length);

  return bundle;
};

export const importEncryptedBackup = async (
  bundle: Uint8Array,
  masterKey: string
): Promise<string> => {
  const magicLength = VAULT_BACKUP_MAGIC.length;
  
  if (bundle.length < magicLength + 12) {
    throw new Error('Invalid backup file format.');
  }

  const magic = bundle.slice(0, magicLength);
  for (let i = 0; i < magicLength; i++) {
    if (magic[i] !== VAULT_BACKUP_MAGIC[i]) {
      throw new Error('Invalid backup file signature.');
    }
  }

  const iv = bundle.slice(magicLength, magicLength + 12);
  const ciphertext = bundle.slice(magicLength + 12);

  const keyBuf = base64ToUint8Array(masterKey);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf as any,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
      additionalData: VAULT_BACKUP_MAGIC,
    },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
};


