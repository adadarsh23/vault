import { VaultItem } from '../storage';
import { handleError } from '../error-handler';
import { validateVaultKeyCheckPayload, VAULT_KEY_CHECK_ITEM_ID } from '../vaultKeyCheck';
import { logger } from '../logger';
import { API_BASE_URL, fetchWithRetry, getAuthHeaders } from './core';
import { downloadAllFromResponseItems, parseJsonObject } from './itemCodec';

/**
 * Downloads and decrypts settings from MongoDB.
 */
export const downloadSettingsFromCloud = async (
  masterKey: string | CryptoKey,
): Promise<any | null> => {
  try {
    const snapshot = await downloadVaultSnapshotFromCloud(masterKey);
    return snapshot.settings;
  } catch (error) {
    logger.error('downloadSettingsFromCloud failed', { error });
    return null;
  }
};

/**
 * Deletes an item from MongoDB via API.
 */
export const deleteItemFromCloud = async (itemId: string, _masterKey: string | CryptoKey) => {
  try {
    await fetchWithRetry(
      `${API_BASE_URL}/api/vault/items/${itemId}`,
      { method: 'DELETE', headers: getAuthHeaders() },
      'Cloud Delete Conflict',
    );
  } catch (error: any) {
    handleError(error, 'Cloud Delete Conflict');
    throw error;
  }
};

/**
 * Pulls all items from MongoDB via API and decrypts them.
 */
export const downloadAllFromCloud = async (masterKey: string | CryptoKey): Promise<VaultItem[]> => {
  try {
    const snapshot = await downloadVaultSnapshotFromCloud(masterKey);
    return snapshot.items;
  } catch (error) {
    handleError(error, 'Cloud Pulse Sync');
    throw error;
  }
};

const CONTROL_ITEM_ID_SET = new Set([
  '__settings__',
  '__logs__',
  '__profile__',
  VAULT_KEY_CHECK_ITEM_ID,
] as const);

export const downloadVaultSnapshotFromCloud = async (
  masterKey: string | CryptoKey,
): Promise<{
  items: VaultItem[];
  settings: Record<string, unknown> | null;
  logs: any[] | null;
  hasKeyCheck: boolean;
}> => {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/vault/items`,
    { method: 'GET', headers: getAuthHeaders() },
    'Cloud Pulse Sync',
  );

  const responseBody = await response.json();

  // Handle various response shapes from production server
  let docs: any[] = [];
  if (Array.isArray(responseBody)) {
    docs = responseBody;
  } else if (Array.isArray(responseBody?.data)) {
    // Standard sendSuccess(res, snapshot) where snapshot is an array
    docs = responseBody.data;
  } else if (responseBody?.data?.items && Array.isArray(responseBody.data.items)) {
    // Nested sendSuccess(res, { items: [...] })
    docs = responseBody.data.items;
  } else if (Array.isArray(responseBody?.items)) {
    // Legacy style responseBody: { items: [...] }
    docs = responseBody.items;
  } else if (
    responseBody?.data &&
    typeof responseBody.data === 'object' &&
    !Array.isArray(responseBody.data)
  ) {
    // Sometimes the server might return the snapshot directly in 'data'
    // Let's check if 'data' has item-like fields or if it's meant to be an array
    logger.warn('[Sync] Response data is an object, attempting to find items', {
      data: responseBody.data,
    });
    docs = [];
  }

  if (!Array.isArray(docs)) {
    logger.error('[Sync] Fatal: Could not extract document array from response', {
      responseBody,
    });
    throw new Error('Invalid response from cloud: expected document array');
  }

  const keyCheckDoc = docs.find(
    (doc) =>
      (doc?.itemId === VAULT_KEY_CHECK_ITEM_ID ||
        doc?._id === VAULT_KEY_CHECK_ITEM_ID ||
        doc?.id === VAULT_KEY_CHECK_ITEM_ID) &&
      typeof doc?.payload === 'string',
  );
  const hasKeyCheck = Boolean(keyCheckDoc);
  const hasValidKeyCheck = keyCheckDoc
    ? await validateVaultKeyCheckPayload(keyCheckDoc.payload, masterKey)
    : false;

  if (hasKeyCheck && !hasValidKeyCheck) {
    // Production hardening: once a key-check sentinel exists, it is the
    // source of truth for vault key validity. Never auto-repair with the
    // provided key because that can accidentally permit stale/old keys after
    // master-key rotation if any legacy item still decrypts.
    throw new Error('Master key is incorrect or the vault data could not be decrypted.');
  }

  let decryptedItems: VaultItem[] = [];
  try {
    decryptedItems = await downloadAllFromResponseItems(docs, masterKey);
  } catch (error: any) {
    const isMismatchError =
      error instanceof Error && error.message.includes('This cloud vault does not match');

    if (isMismatchError) {
      logger.warn(
        '[Sync] Key check verified master key, but corrupted item(s) exist. Recovering valid items.',
      );
      const recovered: VaultItem[] = [];
      for (const doc of docs) {
        try {
          const itemArr = await downloadAllFromResponseItems([doc], masterKey);
          if (itemArr[0]) recovered.push(itemArr[0]);
        } catch {
          // Skip corrupted item safely
        }
      }
      if (recovered.length === 0) {
        throw error;
      }
      decryptedItems = recovered;
    } else {
      throw error;
    }
  }

  const controlItemIds = docs
    .map((doc) => doc?.itemId || doc?.id || doc?._id)
    .filter(
      (
        itemId,
      ): itemId is '__settings__' | '__logs__' | '__profile__' | typeof VAULT_KEY_CHECK_ITEM_ID =>
        typeof itemId === 'string' &&
        CONTROL_ITEM_ID_SET.has(
          itemId as '__settings__' | '__logs__' | '__profile__' | typeof VAULT_KEY_CHECK_ITEM_ID,
        ),
    );
  const decryptedControlIds = new Set(
    decryptedItems
      .map((item) => item.id)
      .filter(
        (
          itemId,
        ): itemId is '__settings__' | '__logs__' | '__profile__' | typeof VAULT_KEY_CHECK_ITEM_ID =>
          CONTROL_ITEM_ID_SET.has(
            itemId as '__settings__' | '__logs__' | '__profile__' | typeof VAULT_KEY_CHECK_ITEM_ID,
          ),
      ),
  );

  if (
    !hasKeyCheck &&
    decryptedItems.length === 0 &&
    controlItemIds.length > 0 &&
    controlItemIds.some((itemId) => !decryptedControlIds.has(itemId))
  ) {
    throw new Error('Master key is incorrect or the vault data could not be decrypted.');
  }

  let settings: Record<string, unknown> | null = null;
  let logs: any[] | null = null;

  for (const item of decryptedItems) {
    if (item.id === '__settings__' && typeof item.content === 'string') {
      settings = parseJsonObject(item.content);
      continue;
    }

    if (item.id === '__logs__' && typeof item.content === 'string') {
      try {
        const parsed = JSON.parse(item.content);
        logs = Array.isArray(parsed) ? parsed : null;
      } catch {
        logs = null;
      }
    }
  }

  return {
    items: decryptedItems.filter(
      (item) =>
        item.id !== '__settings__' &&
        item.id !== '__logs__' &&
        item.id !== '__profile__' &&
        item.id !== VAULT_KEY_CHECK_ITEM_ID,
    ),
    settings,
    logs,
    hasKeyCheck,
  };
};

export const downloadLegacyVaultSnapshot = async (
  masterKey: string | CryptoKey,
  vaultId: string,
): Promise<VaultItem[]> => {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/vault/legacy/${vaultId}/items`,
    { method: 'GET', headers: getAuthHeaders() },
    'Legacy Vault Migration',
  );

  const responseBody = await response.json();
  const items = Array.isArray(responseBody)
    ? responseBody
    : responseBody?.data || responseBody?.items || [];
  if (!Array.isArray(items)) {
    return [];
  }

  return downloadAllFromResponseItems(items, masterKey);
};
