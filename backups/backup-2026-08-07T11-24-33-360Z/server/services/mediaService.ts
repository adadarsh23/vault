import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.ts';
import { AppError } from '../utils/appError.ts';

/**
 * Service to handle media processing (HLS streaming, encryption, chunking)
 */
export const mediaService = {
  /**
   * Generates or retrieves an encryption key for HLS chunks
   * Native HLS AES-128 or ClearKey requires a 16-byte key
   */
  async getStreamingKey(userId: string, itemId: string): Promise<Buffer> {
    const keySource =
      process.env.VAULT_ENCRYPTION_KEY ||
      (process.env.NODE_ENV === 'production'
        ? (() => {
            throw new Error(
              'VAULT_ENCRYPTION_KEY must be configured for production media key derivation.'
            );
          })()
        : 'dev-only-streaming-secret-change-me');
    return crypto
      .createHmac('sha256', keySource)
      .update(`${userId}:${itemId}:hls:clearkey`)
      .digest()
      .slice(0, 16);
  },

  /**
   * Generates a rotation-friendly key URL for the M3U8 playlist
   */
  getStreamingKeyUrl(itemId: string, sessionToken: string): string {
    const baseUrl = process.env.PUBLIC_URL || '';
    return `${baseUrl}/api/vault/media/key/${itemId}?token=${sessionToken}`;
  },

  /**
   * Generates a Master Playlist for Adaptive Bitrate (ABR)
   */
  async generateMasterPlaylist(itemId: string, queryString: string): Promise<string> {
    const baseUrl = process.env.PUBLIC_URL || '';
    const query = queryString ? `?${queryString}` : '';

    return [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-STREAM-INF:BANDWIDTH=180000,RESOLUTION=256x144',
      `${baseUrl}/api/vault/media/${itemId}/hls/144p/playlist.m3u8${query}`,
      '#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240',
      `${baseUrl}/api/vault/media/${itemId}/hls/240p/playlist.m3u8${query}`,
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
      `${baseUrl}/api/vault/media/${itemId}/hls/360p/playlist.m3u8${query}`,
      '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480',
      `${baseUrl}/api/vault/media/${itemId}/hls/480p/playlist.m3u8${query}`,
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720',
      `${baseUrl}/api/vault/media/${itemId}/hls/720p/playlist.m3u8${query}`,
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
      `${baseUrl}/api/vault/media/${itemId}/hls/1080p/playlist.m3u8${query}`,
    ].join('\n');
  },

  /**
   * Generates a standard HLS M3U8 playlist with encryption tags (DRM)
   */
  async generatePlaylist(
    itemId: string,
    sessionToken: string,
    variant: string,
    segmentCount: number,
    duration: number
  ): Promise<string> {
    const keyUrl = this.getStreamingKeyUrl(itemId, sessionToken);

    // ClearKey DRM format: #EXT-X-KEY:METHOD=AES-128,URI="key_url",IV=0x...
    let playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXT-X-KEY:METHOD=AES-128,URI="${keyUrl}",IV=0x${crypto.randomBytes(16).toString('hex')}`,
    ];

    for (let i = 0; i < segmentCount; i++) {
      playlist.push(`#EXTINF:${duration.toFixed(2)},`);
      playlist.push(`segment/${variant}/${i}.ts?token=${sessionToken}`);
    }

    playlist.push('#EXT-X-ENDLIST');
    return playlist.join('\n');
  },
};
