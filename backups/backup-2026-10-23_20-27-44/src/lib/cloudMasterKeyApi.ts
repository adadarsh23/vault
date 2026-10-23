import { resolveApiBaseUrl } from './apiBaseUrl';
import { getAuthToken, getDeviceId } from './auth-session';
import { getCsrfTokenForApiRequest } from './csrf';

const REQUEST_TIMEOUT_MS = 20_000;

const getApiBaseUrl = (): string => resolveApiBaseUrl().replace(/\/+$/, '');

const safeParseJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const authenticatedFetch = async (
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<Response> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const url = `${getApiBaseUrl()}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (method === 'POST' || method === 'DELETE') {
    const csrfToken = await getCsrfTokenForApiRequest(url, method);
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error as { name?: string })?.name === 'AbortError'
    ) {
      throw new Error(`Cloud request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Client API for Master Key Cloud Storage
 * Communicates with backend master key endpoints
 */

export interface SaveMasterKeyResponse {
  success: boolean;
  data?: {
    saved: boolean;
    userId: string;
    deviceId: string;
    timestamp: string;
    message: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface RetrieveMasterKeyResponse {
  success: boolean;
  data?: {
    encryptedMasterKey: {
      cipherText: string;
      iv: string;
      authTag: string;
      salt: string;
      algorithm: string;
      keyVersion: string;
    };
    userId: string;
    timestamp: string;
    message: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface VerifyMasterKeyResponse {
  success: boolean;
  data?: {
    isValid: boolean;
    userId: string;
    timestamp: string;
    message: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface DeleteMasterKeyResponse {
  success: boolean;
  data?: {
    deleted: boolean;
    userId: string;
    timestamp: string;
    message: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface GetMetadataResponse {
  success: boolean;
  data?: {
    metadata: {
      derivationAlgorithm: string;
      derivationParams: {
        memory: number;
        iterations: number;
        parallelism: number;
      };
      createdAt: string;
      updatedAt: string;
      lastAccessedAt: string;
      deviceId: string;
    };
    audit: {
      accessCount: number;
      lastAccessedByDeviceId: string;
      failedDecryptionAttempts: number;
      lastFailedAttempt: string | null;
    };
    userId: string;
    timestamp: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Save encrypted master key to cloud
 */
export const saveMasterKeyToCloud = async (payload: {
  encryptedMasterKey: {
    cipherText: string;
    iv: string;
    authTag: string;
    salt: string;
    algorithm: string;
    keyVersion: string;
  };
  masterKeyHash: string;
  masterKey?: string;
  password?: string;
  deviceId: string;
  recoveryPhrasesEncrypted?: string;
  metadata?: {
    derivationAlgorithm: string;
    derivationParams: {
      memory: number;
      iterations: number;
      parallelism: number;
    };
  };
}): Promise<SaveMasterKeyResponse> => {
  try {
    const response = await authenticatedFetch('/api/master-key/save', 'POST', payload);
    const data = await safeParseJson<SaveMasterKeyResponse>(response);

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error?.message || `Failed to save master key to cloud (${response.status})`,
      );
    }

    return data;
  } catch (error) {
    console.error('Error saving master key to cloud:', error);
    throw error;
  }
};

/**
 * Retrieve encrypted master key from cloud
 */
export const retrieveMasterKeyFromCloud = async (): Promise<RetrieveMasterKeyResponse> => {
  try {
    const deviceId = getDeviceId();
    const response = await authenticatedFetch(
      `/api/master-key/retrieve?deviceId=${encodeURIComponent(deviceId)}`,
      'GET',
    );
    const data = await safeParseJson<RetrieveMasterKeyResponse>(response);

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error?.message || `Failed to retrieve master key from cloud (${response.status})`,
      );
    }

    return data;
  } catch (error) {
    console.error('Error retrieving master key from cloud:', error);
    throw error;
  }
};

/**
 * Verify master key hash with cloud
 */
export const verifyMasterKeyHash = async (
  masterKeyHash: string,
): Promise<VerifyMasterKeyResponse> => {
  try {
    const response = await authenticatedFetch('/api/master-key/verify', 'POST', { masterKeyHash });
    const data = await safeParseJson<VerifyMasterKeyResponse>(response);

    if (!response.ok || !data?.success) {
      throw new Error(data?.error?.message || `Failed to verify master key (${response.status})`);
    }

    return data;
  } catch (error) {
    console.error('Error verifying master key:', error);
    throw error;
  }
};

/**
 * Delete master key from cloud
 */
export const deleteMasterKeyFromCloud = async (): Promise<DeleteMasterKeyResponse> => {
  try {
    const response = await authenticatedFetch('/api/master-key', 'DELETE');
    const data = await safeParseJson<DeleteMasterKeyResponse>(response);

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error?.message || `Failed to delete master key from cloud (${response.status})`,
      );
    }

    return data;
  } catch (error) {
    console.error('Error deleting master key from cloud:', error);
    throw error;
  }
};

/**
 * Get master key metadata from cloud
 */
export const getMasterKeyMetadata = async (): Promise<GetMetadataResponse> => {
  try {
    const response = await authenticatedFetch('/api/master-key/metadata', 'GET');
    const data = await safeParseJson<GetMetadataResponse>(response);

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error?.message || `Failed to get master key metadata (${response.status})`,
      );
    }

    return data;
  } catch (error) {
    console.error('Error getting master key metadata:', error);
    throw error;
  }
};

export default {
  saveMasterKeyToCloud,
  retrieveMasterKeyFromCloud,
  verifyMasterKeyHash,
  deleteMasterKeyFromCloud,
  getMasterKeyMetadata,
};
