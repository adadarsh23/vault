import { handleError } from '../error-handler';
import { encryptData } from '../cryptoPrimitives';
import { createVaultKeyCheckPayload } from '../vaultKeyCheck';
import { logger } from '../logger';
import { API_BASE_URL, fetchWithRetry, getAuthHeaders, MAX_RETRIES } from './core';

/**
 * Syncs encrypted settings to MongoDB via API.
 */
export const uploadSettingsToCloud = async (
  settings: any,
  masterKey: string | CryptoKey,
  options: { force?: boolean } = {}
) => {
  try {
    const encryptedSettings = await encryptData(JSON.stringify(settings), masterKey);

    await fetchWithRetry(
      `${API_BASE_URL}/api/vault/settings/__settings__`,
      {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
          'X-Vault-Category': 'settings',
          'X-Vault-Title': encodeURIComponent('Vault Settings'),
        },
        body: JSON.stringify({
          payload: encryptedSettings,
          category: 'settings',
        }),
      },
      'Settings Cloud Sync',
      MAX_RETRIES,
      options.force ? {} : { silentStatuses: [409] }
    );
  } catch (error) {
    const candidate = error as Error & { status?: number; code?: string };
    const isDuplicate =
      candidate.status === 409 ||
      candidate.code === 'DUPLICATE_RESOURCE' ||
      (error instanceof Error && error.message.toLowerCase().includes('already exists'));

    if (isDuplicate && !options.force) {
      logger.warn('Settings already exist on cloud; skipping initial upload.');
      return;
    }

    handleError(error, 'Settings Cloud Sync');
    throw error;
  }
};

export const uploadKeyCheckToCloud = async (
  masterKey: string | CryptoKey,
  options: { force?: boolean } = {}
) => {
  try {
    const encryptedPayload = await createVaultKeyCheckPayload(masterKey);

    await fetchWithRetry(
      `${API_BASE_URL}/api/vault/system/__keycheck__`,
      {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
          'X-Vault-Category': 'system',
          'X-Vault-Title': encodeURIComponent('master Key Check Sentinel'),
        },
        body: JSON.stringify({
          payload: encryptedPayload,
          category: 'system',
        }),
      },
      'master Key Check Sync',
      MAX_RETRIES,
      options.force ? {} : { silentStatuses: [409] }
    );
  } catch (error) {
    const candidate = error as Error & { status?: number; code?: string };
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const isDuplicateKeyCheck =
      candidate.status === 409 ||
      candidate.code === 'DUPLICATE_RESOURCE' ||
      candidate.code === 'USERNAME_EXISTS' ||
      message.includes('already exists') ||
      message.includes('duplicate key');

    // Older deployments may still have legacy uniqueness/index quirks for the key-check record.
    // If the record already exists, unlock can safely continue.
    if (isDuplicateKeyCheck && !options.force) {
      logger.warn('master Key check already exists; continuing unlock flow.', {
        error,
      });
      return;
    }

    handleError(error, 'master Key Check Sync');
    throw error;
  }
};

/**
 * Syncs user profile (identity) to the cloud under "users" category.
 */
export const uploadProfileToCloud = async (
  username: string,
  masterKey: string | CryptoKey,
  options: { force?: boolean } = {}
) => {
  try {
    const profile = { username, lastLogin: Date.now() };
    const encryptedProfile = await encryptData(JSON.stringify(profile), masterKey);

    await fetchWithRetry(
      `${API_BASE_URL}/api/vault/users/__profile__`,
      {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
          'X-Vault-Category': 'users',
          'X-Vault-Title': encodeURIComponent(`User: ${username}`),
        },
        body: JSON.stringify({
          payload: encryptedProfile,
          category: 'users',
        }),
      },
      'Profile Cloud Sync',
      MAX_RETRIES,
      options.force ? {} : { silentStatuses: [409] }
    );
  } catch (error) {
    const candidate = error as Error & { status?: number; code?: string };
    const isDuplicate =
      candidate.status === 409 ||
      candidate.code === 'DUPLICATE_RESOURCE' ||
      (error instanceof Error && error.message.toLowerCase().includes('already exists'));

    if (isDuplicate && !options.force) {
      logger.warn('Profile already exists on cloud; skipping initial upload.');
      return;
    }

    logger.error('Profile Cloud Sync failed', { error });
  }
};
