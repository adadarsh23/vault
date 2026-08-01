import type { AxiosProgressEvent } from 'axios';
import apiClient, { ApiResponse } from './apiClient';

export type MultipartFileCategory =
  | 'photo'
  | 'video'
  | 'audio'
  | 'document'
  | 'other-files';

export interface VaultFolderRecord {
  name?: string;
  itemType?: string;
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

const encodePathSegment = (value: string): string =>
  encodeURIComponent(value);

const normalizeMultipartCategory = (
  value: string,
): MultipartFileCategory => {
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

export const vaultApi = {
  fetchSnapshot: async (): Promise<ApiResponse<Record<string, unknown>>> => {
    const { data } = await apiClient.get<ApiResponse<Record<string, unknown>>>(
      '/vault',
    );
    return data;
  },

  upsertItem: async <TResponse = unknown>(
    category: string,
    itemId: string | undefined,
    payload: unknown,
  ): Promise<ApiResponse<TResponse>> => {
    const categorySegment = encodePathSegment(
      normalizeRequiredString(category, 'category'),
    );
    if (itemId && itemId.trim().length > 0) {
      const itemIdSegment = encodePathSegment(
        normalizeRequiredString(itemId, 'itemId'),
      );
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
    const categorySegment = encodePathSegment(
      normalizeRequiredString(category, 'category'),
    );
    const itemIdSegment = encodePathSegment(
      normalizeRequiredString(itemId, 'itemId'),
    );
    const { data } = await apiClient.delete<ApiResponse<Record<string, unknown>>>(
      `/vault/${categorySegment}/${itemIdSegment}`,
    );
    return data;
  },

  togglePin: async (
    itemId: string,
    isPinned: boolean,
  ): Promise<ApiResponse<TogglePinResponseData>> => {
    const itemIdSegment = encodePathSegment(
      normalizeRequiredString(itemId, 'itemId'),
    );
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
    const categorySegment = encodePathSegment(
      normalizeRequiredString(category, 'category'),
    );
    const { data } = await apiClient.post<ApiResponse<TResponse>>(
      `/vault/files/${categorySegment}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
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

    const { data } = await apiClient.post<
      ApiResponse<StartMultipartUploadResponseData>
    >('/vault/files/multipart/start', sanitizedPayload);
    return data;
  },

  uploadMultipartPart: async (
    uploadId: string,
    partNumber: number,
    chunk: Uint8Array,
    chunkSha256: string,
  ): Promise<ApiResponse<UploadMultipartPartResponseData>> => {
    const uploadIdSegment = encodePathSegment(
      normalizeRequiredString(uploadId, 'uploadId'),
    );
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
    const uploadIdSegment = encodePathSegment(
      normalizeRequiredString(uploadId, 'uploadId'),
    );

    const sanitizedPayload: CompleteMultipartUploadPayload = {
      fileSha256: normalizeSha256(payload.fileSha256, 'fileSha256'),
      clientUpdatedAt: normalizeRequiredString(
        payload.clientUpdatedAt,
        'clientUpdatedAt',
      ),
    };

    if (typeof payload.deviceId === 'string' && payload.deviceId.trim().length > 0) {
      sanitizedPayload.deviceId = payload.deviceId.trim();
    }

    const { data } = await apiClient.post<ApiResponse<TResponse>>(
      `/vault/files/multipart/${uploadIdSegment}/complete`,
      sanitizedPayload,
    );
    return data;
  },

  getFolders: async (): Promise<ApiResponse<VaultFolderRecord[]>> => {
    const { data } = await apiClient.get<ApiResponse<VaultFolderRecord[]>>(
      '/vault/folders',
    );
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

  deleteFolder: async (
    name: string,
    itemType: string,
  ): Promise<BasicSuccessResponse> => {
    const { data } = await apiClient.delete<BasicSuccessResponse>(
      '/vault/folders',
      {
        params: {
          name: normalizeRequiredString(name, 'name'),
          itemType: normalizeRequiredString(itemType, 'itemType'),
        },
      },
    );
    return data;
  },
};
