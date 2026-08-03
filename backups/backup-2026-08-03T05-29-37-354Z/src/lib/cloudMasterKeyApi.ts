import { resolveApiBaseUrl } from './apiBaseUrl';
import { getAuthToken, getDeviceId } from './auth-session';

const API_BASE_URL = resolveApiBaseUrl();

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
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/master-key/save`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as SaveMasterKeyResponse;

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to save master key to cloud');
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
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const deviceId = getDeviceId();
    const response = await fetch(
      `${API_BASE_URL}/api/master-key/retrieve?deviceId=${encodeURIComponent(deviceId)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = (await response.json()) as RetrieveMasterKeyResponse;

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to retrieve master key from cloud');
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
  masterKeyHash: string
): Promise<VerifyMasterKeyResponse> => {
  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/master-key/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ masterKeyHash }),
    });

    const data = (await response.json()) as VerifyMasterKeyResponse;

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to verify master key');
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
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/master-key`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await response.json()) as DeleteMasterKeyResponse;

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to delete master key from cloud');
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
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/master-key/metadata`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await response.json()) as GetMetadataResponse;

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to get master key metadata');
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
