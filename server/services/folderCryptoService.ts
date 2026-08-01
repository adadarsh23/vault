import crypto from 'crypto';
import { decryptText, encryptText, EncryptedPayload } from '../utils/crypto.ts';

const normalizeFolderName = (name: string): string => name.trim();

export const hashFolderName = (name: string): string =>
  crypto.createHash('sha256').update(normalizeFolderName(name).toLowerCase()).digest('hex');

export const encryptFolderName = (name: string): EncryptedPayload =>
  encryptText(normalizeFolderName(name));

export const decryptFolderName = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'cipherText' in value &&
    'iv' in value &&
    'authTag' in value
  ) {
    return decryptText(value as EncryptedPayload);
  }

  return '';
};
