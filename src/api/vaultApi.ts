import type { AxiosProgressEvent } from 'axios';
import apiClient, { ApiResponse } from './apiClient';

export type MultipartFileCategory = 'photo' | 'video' | 'audio' | 'document' | 'other-files';

export interface VaultFolderRecord {
  id?: string;
  name?: string;
  itemType?: string;
  parentId?: string | null;
  [key: string]: unknown;
}

export interface TogglePinResponseData {
  isPinned?: boolean;
  pinnedAt?: string | number | null;
  updatedAt?: string | number;
  [key: string]: unknown;
}

export interface StartMultipartUploadPayload {
  category: MultipartFileCategory;
  folder?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  resumeUploadId?: string;
}

export interface StartMultipartUploadResponseData {
  uploadId: string;
  partSize: number;
  uploadedParts: number[];
  [key: string]: unknown;
}

export interface UploadMultipartPartResponseData {
  uploadId: string;
  partNumber: number;
  uploadedParts: number;
  [key: string]: unknown;
}

export interface CompleteMultipartUploadPayload {
  fileSha256: string;
  clientUpdatedAt: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

export interface FolderCreatePayload {
  name: string;
  itemType: string;
  parentId?: string;
}

export interface BasicSuccessResponse {
  success: boolean;
  message?: string;
}

export interface VaultIntegrityStatusData {
  activeRootHash?: string;
  algorithm?: string;
  totalLeaves?: number;
  treeDepth?: number;
  lastAuditAt?: number | string | null;
  lastAuditStatus?: 'clean' | 'corrupted' | 'idle';
  [key: string]: unknown;
}

export interface VaultIntegrityVerifyData {
  status: 'clean' | 'corrupted';
  totalChecked: number;
  rootHash?: string;
  auditId?: string;
  corruptedItems?: unknown[];
  [key: string]: unknown;
}

export interface SignedUrlResponseData {
  signedUrl: string;
  expiresIn?: number;
  [key: string]: unknown;
}

const MULTIPART_CATEGORY_SET: ReadonlySet<MultipartFileCategory> = new Set([
  'photo',
  'video',
  'audio',
  'document',
  'other-files',
]);

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

const normalizeRequiredString = (value: string, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
};

const encodePathSegment = (value: string): string => encodeURIComponent(value);

const normalizeMultipartCategory = (value: string): MultipartFileCategory => {
  const normalized = normalizeRequiredString(value, 'category');
  if (!MULTIPART_CATEGORY_SET.has(normalized as MultipartFileCategory)) {
    throw new TypeError(`Unsupported multipart category: "${normalized}".`);
  }
  return normalized as MultipartFileCategory;
};

const normalizePositiveInteger = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer.`);
  }
  return value;
};

const normalizePositiveNumber = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive number.`);
  }
  return value;
};

const normalizeSha256 = (value: string, field: string): string => {
  const normalized = normalizeRequiredString(value, field).toLowerCase();
  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new TypeError(`${field} must be a 64-character SHA-256 hex digest.`);
  }
  return normalized;
};

/**
 * UTF-8 safe Base64 encoder (prevents DOMException on international characters / emoji)
 */
const safeBase64Encode = (str: string): string => {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16)),
      ),
    );
  } catch {
    return btoa(str);
  }
};

export const vaultApi = {
  fetchSnapshot: async (): Promise<ApiResponse<Record<string, unknown>>> => {
    const { data } = await apiClient.get<ApiResponse<Record<string, unknown>>>('/vault');
    return data;
  },

  fetchSync: async (): Promise<ApiResponse<Record<string, unknown>>> => {
    const { data } = await apiClient.get<ApiResponse<Record<string, unknown>>>('/vault/sync');
    return data;
  },

  getItems: async (): Promise<ApiResponse<unknown[]>> => {
    const { data } = await apiClient.get<ApiResponse<unknown[]>>('/vault/items');
    return data;
  },

  upsertItem: async <TResponse = unknown>(
    category: string,
    itemId: string | undefined,
    payload: unknown,
  ): Promise<ApiResponse<TResponse>> => {
    const categorySegment = encodePathSegment(normalizeRequiredString(category, 'category'));
    if (itemId && itemId.trim().length > 0) {
      const itemIdSegment = encodePathSegment(normalizeRequiredString(itemId, 'itemId'));
      const { data } = await apiClient.put<ApiResponse<TResponse>>(
        `/vault/${categorySegment}/${itemIdSegment}`,
        payload,
      );
      return data;
    }

    const { data } = await apiClient.post<ApiResponse<TResponse>>(
      `/vault/${categorySegment}`,
      payload,
    );
    return data;
  },

  deleteItem: async (
    category: string,
    itemId: string,
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    const categorySegment = encodePathSegment(normalizeRequiredString(category, 'category'));
    const itemIdSegment = encodePathSegment(normalizeRequiredString(itemId, 'itemId'));
    const { data } = await apiClient.delete<ApiResponse<Record<string, unknown>>>(
      `/vault/${categorySegment}/${itemIdSegment}`,
    );
    return data;
  },

  togglePin: async (
    itemId: string,
    isPinned: boolean,
  ): Promise<ApiResponse<TogglePinResponseData>> => {
    const itemIdSegment = encodePathSegment(normalizeRequiredString(itemId, 'itemId'));
    const { data } = await apiClient.put<ApiResponse<TogglePinResponseData>>(
      `/vault/items/${itemIdSegment}/pin`,
      { isPinned },
    );
    return data;
  },

  uploadFile: async <TResponse = unknown>(
    category: string,
    formData: FormData,
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<ApiResponse<TResponse>> => {
    const categorySegment = encodePathSegment(normalizeRequiredString(category, 'category'));
    // Do NOT hardcode Content-Type: multipart/form-data without boundary!
    // apiClient request interceptor removes application/json so browser / Axios computes correct boundary.
    const { data } = await apiClient.post<ApiResponse<TResponse>>(
      `/vault/files/${categorySegment}`,
      formData,
      {
        onUploadProgress,
      },
    );
    return data;
  },

  startMultipartUpload: async (
    payload: StartMultipartUploadPayload,
  ): Promise<ApiResponse<StartMultipartUploadResponseData>> => {
    const sanitizedPayload: StartMultipartUploadPayload = {
      category: normalizeMultipartCategory(payload.category),
      fileName: normalizeRequiredString(payload.fileName, 'fileName'),
      mimeType: normalizeRequiredString(payload.mimeType, 'mimeType'),
      fileSize: normalizePositiveNumber(payload.fileSize, 'fileSize'),
    };

    if (typeof payload.folder === 'string') {
      const normalizedFolder = payload.folder.trim();
      sanitizedPayload.folder = normalizedFolder.length > 0 ? normalizedFolder : null;
    } else if (payload.folder === null) {
      sanitizedPayload.folder = null;
    }

    if (typeof payload.resumeUploadId === 'string' && payload.resumeUploadId.trim()) {
      sanitizedPayload.resumeUploadId = payload.resumeUploadId.trim();
    }

    const { data } = await apiClient.post<ApiResponse<StartMultipartUploadResponseData>>(
      '/vault/files/multipart/start',
      sanitizedPayload,
    );
    return data;
  },

  uploadMultipartPart: async (
    uploadId: string,
    partNumber: number,
    chunk: Uint8Array,
    chunkSha256: string,
  ): Promise<ApiResponse<UploadMultipartPartResponseData>> => {
    const uploadIdSegment = encodePathSegment(normalizeRequiredString(uploadId, 'uploadId'));
    const normalizedPartNumber = normalizePositiveInteger(partNumber, 'partNumber');

    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) {
      throw new TypeError('chunk must be a non-empty Uint8Array.');
    }

    const normalizedChunkHash = normalizeSha256(chunkSha256, 'chunkSha256');

    const { data } = await apiClient.put<ApiResponse<UploadMultipartPartResponseData>>(
      `/vault/files/multipart/${uploadIdSegment}/part/${normalizedPartNumber}`,
      chunk,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Part-SHA256': normalizedChunkHash,
        },
      },
    );
    return data;
  },

  completeMultipartUpload: async <TResponse = Record<string, unknown>>(
    uploadId: string,
    payload: CompleteMultipartUploadPayload,
  ): Promise<ApiResponse<TResponse>> => {
    const uploadIdSegment = encodePathSegment(normalizeRequiredString(uploadId, 'uploadId'));

    const sanitizedPayload: CompleteMultipartUploadPayload = {
      fileSha256: normalizeSha256(payload.fileSha256, 'fileSha256'),
      clientUpdatedAt: normalizeRequiredString(payload.clientUpdatedAt, 'clientUpdatedAt'),
    };

    if (typeof payload.deviceId === 'string' && payload.deviceId.trim().length > 0) {
      sanitizedPayload.deviceId = payload.deviceId.trim();
    }

    if (typeof payload.metadata === 'object' && payload.metadata !== null) {
      sanitizedPayload.metadata = payload.metadata;
    }

    const { data } = await apiClient.post<ApiResponse<TResponse>>(
      `/vault/files/multipart/${uploadIdSegment}/complete`,
      sanitizedPayload,
    );
    return data;
  },

  getFolders: async (): Promise<ApiResponse<VaultFolderRecord[]>> => {
    const { data } = await apiClient.get<ApiResponse<VaultFolderRecord[]>>('/vault/folders');
    return data;
  },

  createFolder: async (
    folderData: FolderCreatePayload,
  ): Promise<ApiResponse<VaultFolderRecord>> => {
    const sanitizedFolderData: FolderCreatePayload = {
      name: normalizeRequiredString(folderData.name, 'folderData.name'),
      itemType: normalizeRequiredString(folderData.itemType, 'folderData.itemType'),
    };

    if (typeof folderData.parentId === 'string' && folderData.parentId.trim()) {
      sanitizedFolderData.parentId = folderData.parentId.trim();
    }

    const { data } = await apiClient.post<ApiResponse<VaultFolderRecord>>(
      '/vault/folders',
      sanitizedFolderData,
    );
    return data;
  },

  deleteFolder: async (name: string, itemType: string): Promise<BasicSuccessResponse> => {
    const { data } = await apiClient.delete<BasicSuccessResponse>('/vault/folders', {
      params: {
        name: normalizeRequiredString(name, 'name'),
        itemType: normalizeRequiredString(itemType, 'itemType'),
      },
    });
    return data;
  },

  initializeFolders: async (): Promise<ApiResponse<{ initialized: boolean }>> => {
    const { data } =
      await apiClient.post<ApiResponse<{ initialized: boolean }>>('/vault/folders/init');
    return data;
  },

  // TUS Resumable Upload Protocol
  createTusUpload: async (
    fileSize: number,
    metadata: Record<string, string>,
  ): Promise<{ uploadId: string; location: string }> => {
    const encodedMetadata = Object.entries(metadata)
      .map(([k, v]) => `${k} ${safeBase64Encode(v)}`)
      .join(',');

    const response = await apiClient.post(
      '/vault/files/tus',
      {},
      {
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Length': fileSize.toString(),
          'Upload-Metadata': encodedMetadata,
        },
      },
    );

    const location =
      response.headers['location'] ||
      (typeof response.headers.get === 'function' ? response.headers.get('location') : '') ||
      '';
    const uploadId = location.split('/').pop() || `${Date.now()}`;
    return { uploadId, location };
  },

  getTusOffset: async (uploadId: string): Promise<number> => {
    const response = await apiClient.head(`/vault/files/tus/${encodeURIComponent(uploadId)}`, {
      headers: {
        'Tus-Resumable': '1.0.0',
      },
    });

    const offsetHeader =
      response.headers['upload-offset'] ||
      (typeof response.headers.get === 'function'
        ? response.headers.get('upload-offset')
        : undefined);
    return parseInt(offsetHeader || '0', 10);
  },

  uploadTusChunk: async (uploadId: string, offset: number, chunk: Uint8Array): Promise<number> => {
    const response = await apiClient.patch(
      `/vault/files/tus/${encodeURIComponent(uploadId)}`,
      chunk,
      {
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': offset.toString(),
          'Content-Type': 'application/offset+octet-stream',
        },
      },
    );

    const newOffsetHeader =
      response.headers['upload-offset'] ||
      (typeof response.headers.get === 'function'
        ? response.headers.get('upload-offset')
        : undefined);
    return parseInt(newOffsetHeader || `${offset + chunk.length}`, 10);
  },

  // Signed URL for secure zero-credential direct media streaming
  getSignedUrl: async (itemId: string): Promise<ApiResponse<SignedUrlResponseData>> => {
    const validItemId = normalizeRequiredString(itemId, 'itemId');
    const { data } = await apiClient.get<ApiResponse<SignedUrlResponseData>>(
      `/vault/files/signed-url/${encodePathSegment(validItemId)}`,
    );
    return data;
  },

  // Cryptographic Merkle Vault Integrity
  getIntegrityStatus: async (): Promise<ApiResponse<VaultIntegrityStatusData>> => {
    const { data } =
      await apiClient.get<ApiResponse<VaultIntegrityStatusData>>('/vault/integrity/status');
    return data;
  },

  verifyIntegrity: async (algorithm?: string): Promise<ApiResponse<VaultIntegrityVerifyData>> => {
    const { data } = await apiClient.post<ApiResponse<VaultIntegrityVerifyData>>(
      '/vault/integrity/verify',
      algorithm ? { algorithm } : {},
    );
    return data;
  },

  getItemIntegrityProof: async (
    itemId: string,
    algorithm?: string,
  ): Promise<ApiResponse<unknown>> => {
    const validItemId = normalizeRequiredString(itemId, 'itemId');
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/vault/integrity/proof/${encodePathSegment(validItemId)}`,
      { params: algorithm ? { algorithm } : undefined },
    );
    return data;
  },

  reportTamper: async (report: {
    itemId: string;
    expectedHash: string;
    actualHash: string;
    details?: unknown;
  }): Promise<ApiResponse<{ reported: boolean }>> => {
    const { data } = await apiClient.post<ApiResponse<{ reported: boolean }>>(
      '/vault/integrity/report-tamper',
      report,
    );
    return data;
  },

  // User Activity Audit Logs
  getActivityLogs: async (params?: {
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<unknown[]>> => {
    const { data } = await apiClient.get<ApiResponse<unknown[]>>('/vault/activity', { params });
    return data;
  },

  saveActivityLog: async (
    log: Record<string, unknown>,
  ): Promise<ApiResponse<{ saved: boolean }>> => {
    const { data } = await apiClient.post<ApiResponse<{ saved: boolean }>>('/vault/activity', log);
    return data;
  },
};
