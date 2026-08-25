import { decryptData, encryptData } from './cryptoPrimitives.ts';

export const VAULT_KEY_CHECK_ITEM_ID = '__keycheck__';
const VAULT_KEY_CHECK_VERSION = 1;
const VAULT_KEY_CHECK_PURPOSE = 'vault-key-check';
const MAX_KEY_CHECK_PAYLOAD_LENGTH = 32 * 1024;
const MAX_CREATED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MIN_CREATED_AT_EPOCH_MS = Date.UTC(2000, 0, 1);

interface VaultKeyCheckRecord {
  purpose: string;
  version: number;
  createdAt: string;
}

type VaultKeyCheckErrorCode = 'INVALID_MASTER_KEY' | 'INVALID_CREATED_AT';

type VaultKeyCheckError = Error & {
  code?: VaultKeyCheckErrorCode;
};

const createVaultKeyCheckError = (
  message: string,
  code: VaultKeyCheckErrorCode,
): VaultKeyCheckError => {
  const error = new Error(message) as VaultKeyCheckError;
  error.code = code;
  return error;
};

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const isValidCreatedAt = (value: string): boolean => {
  if (!value || value.length > 64) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  if (timestamp < MIN_CREATED_AT_EPOCH_MS) {
    return false;
  }

  if (timestamp > Date.now() + MAX_CREATED_AT_FUTURE_SKEW_MS) {
    return false;
  }

  return true;
};

const isVaultKeyCheckRecord = (value: unknown): value is VaultKeyCheckRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VaultKeyCheckRecord>;
  return (
    candidate.purpose === VAULT_KEY_CHECK_PURPOSE &&
    candidate.version === VAULT_KEY_CHECK_VERSION &&
    typeof candidate.createdAt === 'string' &&
    isValidCreatedAt(candidate.createdAt)
  );
};

export const createVaultKeyCheckPayload = async (
  masterKey: string | CryptoKey,
  createdAt = new Date(),
): Promise<string> => {
  const keyToUse = typeof masterKey === 'string' ? masterKey.trim() : masterKey;

  if (!keyToUse) {
    throw createVaultKeyCheckError(
      'Master key is required for vault key check payload creation.',
      'INVALID_MASTER_KEY',
    );
  }

  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw createVaultKeyCheckError(
      'createdAt must be a valid Date instance.',
      'INVALID_CREATED_AT',
    );
  }

  return encryptData(
    JSON.stringify({
      purpose: VAULT_KEY_CHECK_PURPOSE,
      version: VAULT_KEY_CHECK_VERSION,
      createdAt: createdAt.toISOString(),
    }),
    keyToUse,
  );
};

export const validateVaultKeyCheckPayload = async (
  encryptedPayload: string,
  masterKey: string | CryptoKey,
): Promise<boolean> => {
  const normalizedPayload = encryptedPayload.trim();

  if (!normalizedPayload || !masterKey) {
    return false;
  }

  if (normalizedPayload.length > MAX_KEY_CHECK_PAYLOAD_LENGTH) {
    return false;
  }

  const keyToUse = typeof masterKey === 'string' ? masterKey.trim() : masterKey;

  const decrypted = await decryptData(normalizedPayload, keyToUse);
  if (!decrypted) {
    return false;
  }

  const parsed = parseJsonObject(decrypted);
  if (!parsed) {
    return false;
  }

  return isVaultKeyCheckRecord(parsed);
};
