import { getAuthToken } from '../auth-session';
import { getDeviceFingerprint, hashFingerprint } from '../deviceFingerprint';
import {
  API_BASE_URL,
  fetchWithRetry,
  getAuthHeaders,
  resolveRuntimeOrigin,
  resolveSignedUrl,
} from './core';

/**
 * PRODUCTION: Generates a temporary signed URL for a file stored on the server.
 */
export const getSignedUrl = async (
  itemId: string,
  action: 'view' | 'download' | 'stream' = 'view'
): Promise<string> => {
  if (itemId.startsWith('decoy-')) {
    try {
      const { useVaultStore } = await import('../../store/vaultStore');
      const item = useVaultStore.getState().items.find((i) => i.id === itemId);
      if (item && typeof item.content === 'string') {
        return item.content;
      }
    } catch {
      // Fallback
    }
    return `data:text/plain;charset=utf-8,Decoy%20Item%20(${encodeURIComponent(itemId)})`;
  }

  const deviceHash = hashFingerprint(getDeviceFingerprint());
  const query = new URLSearchParams({
    action,
    dev: deviceHash,
  });
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/vault/files/signed-url/${encodeURIComponent(itemId)}?${query.toString()}`,
    { method: 'GET', headers: getAuthHeaders() },
    'Getting Signed URL'
  );
  const data = await response.json();
  const baseSignedUrl = typeof data?.data?.url === 'string' ? data.data.url.trim() : '';

  if (!baseSignedUrl) {
    const err = new Error(
      'The server did not return a preview URL. This item may be encrypted-only (not a server file).'
    );
    (err as Error & { code?: string }).code = 'SIGNED_URL_EMPTY';
    throw err;
  }

  const signedUrl = resolveSignedUrl(baseSignedUrl, 'Getting Signed URL', 'SIGNED_URL_INVALID');

  // Append JWT for requireAuth middleware on non-header requests (like <img> tags)
  const jwt = getAuthToken();
  if (jwt && !signedUrl.searchParams.has('auth_token')) {
    signedUrl.searchParams.set('auth_token', jwt);
  }

  return signedUrl.toString();
};

/**
 * PRODUCTION: Returns the HLS playlist URL for a video item.
 */
export const getHlsPlaylistUrl = async (itemId: string): Promise<string> => {
  const deviceHash = hashFingerprint(getDeviceFingerprint());
  const query = new URLSearchParams({
    action: 'stream',
    dev: deviceHash,
  });

  // Since action=stream is short-lived (2m), we fetch a true signed URL
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/vault/files/signed-url/${encodeURIComponent(itemId)}?${query.toString()}`,
    { method: 'GET', headers: getAuthHeaders() },
    'Getting HLS Signed URL'
  );
  const data = await response.json();
  const baseSignedUrl = typeof data?.data?.url === 'string' ? data.data.url.trim() : '';
  if (!baseSignedUrl) {
    const err = new Error(
      'Could not start streaming: the server did not return a valid media URL.'
    );
    (err as Error & { code?: string }).code = 'HLS_SIGNED_URL_EMPTY';
    throw err;
  }

  // Extract signature parameters from the signed access URL
  const signedUrlObj = resolveSignedUrl(
    baseSignedUrl,
    'Getting HLS Signed URL',
    'HLS_SIGNED_URL_INVALID'
  );

  // Create the final HLS URL based on our API_BASE_URL
  const finalUrl = new URL(
    `/api/vault/media/${encodeURIComponent(itemId)}/hls`,
    API_BASE_URL || resolveRuntimeOrigin()
  );

  // Copy all params (token, expires, sid, dev, etc.)
  signedUrlObj.searchParams.forEach((value, key) => {
    finalUrl.searchParams.set(key, value);
  });

  // Inject JWT for requireAuth middleware
  const jwt = getAuthToken();
  if (jwt && !finalUrl.searchParams.has('auth_token')) {
    finalUrl.searchParams.set('auth_token', jwt);
  }

  return finalUrl.toString();
};

/**
 * PRODUCTION: Aggregates playback telemetry for the dashboard.
 */
export const getPlaybackInsights = async (): Promise<{
  bufferStats: any[];
  resolutionStats: any[];
  errorStats: any[];
}> => {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/vault/media/insights`,
    { method: 'GET', headers: getAuthHeaders() },
    'Getting Playback Insights'
  );
  const data = await response.json();
  return data.data;
};
