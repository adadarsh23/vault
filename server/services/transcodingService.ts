import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.ts';
import { decryptBuffer } from '../utils/crypto.ts';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { mediaService } from './mediaService.ts';
import { drmPackagingService } from './drmPackagingService.ts';
import { AppError } from '../utils/appError.ts';
import os from 'os';

export const processHlsAdaptive = async (
  itemId: string,
  userId: string,
  username: string,
  inputPath: string,
  outputDir: string,
): Promise<void> => {
  await fs.mkdir(outputDir, { recursive: true });

  // 1. Decrypt source to temporary file if encrypted at-rest
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await DynamicVaultModel.findOne({ userId, itemId });
  let sourcePath = inputPath;
  let tempSource = '';

  if (item && item.file && item.file.encryptionIv && item.file.encryptionTag) {
    logger.info(`Source is encrypted at rest. Decrypting for transcoding: ${itemId}`);
    const encrypted = await fs.readFile(inputPath);
    const decrypted = decryptBuffer({
      encryptedData: encrypted.toString('hex'),
      iv: item.file.encryptionIv,
      tag: item.file.encryptionTag,
    });
    tempSource = path.join(os.tmpdir(), `${itemId}-raw.mp4`);
    await fs.writeFile(tempSource, decrypted);
    sourcePath = tempSource;
  }

  // 2. Attempt Professional DRM Packaging (CENC / Widevine / FairPlay)
  try {
    await drmPackagingService.packageWithDrm(itemId, userId, sourcePath, outputDir);
    // If successful, we can skip standard AES-128 as the DRM manifests are ready
    // Note: We currently keep AES-128 as a fallback for legacy browsers
  } catch (err) {
    logger.error('DRM Packaging failed, continuing with legacy AES-128', { err });
  }

  // 3. Prepare HLS Encryption (AES-128) - Fallback / Legacy
  const streamingKey = await mediaService.getStreamingKey(userId, itemId);
  const keyFilePath = path.join(outputDir, 'video.key');
  await fs.writeFile(keyFilePath, streamingKey);

  const keyUrl = mediaService.getStreamingKeyUrl(itemId, 'TOKEN_PLACEHOLDER');
  const keyInfoPath = path.join(outputDir, 'key_info.txt');
  await fs.writeFile(keyInfoPath, `${keyUrl}\n${keyFilePath}`);

  const ffmpegCmd = 'ffmpeg';

  const args = [
    '-i',
    sourcePath,
    '-hls_key_info_file',
    keyInfoPath,
    // 144p
    '-s',
    '256x144',
    '-c:v',
    'libx264',
    '-b:v',
    '180k',
    '-g',
    '48',
    '-hls_time',
    '10',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '144p_%03d.ts'),
    path.join(outputDir, '144p.m3u8'),
    // 240p
    '-s',
    '426x240',
    '-c:v',
    'libx264',
    '-b:v',
    '400k',
    '-g',
    '48',
    '-hls_time',
    '10',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '240p_%03d.ts'),
    path.join(outputDir, '240p.m3u8'),
    // 360p
    '-s',
    '640x360',
    '-c:v',
    'libx264',
    '-b:v',
    '800k',
    '-g',
    '48',
    '-hls_time',
    '10',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '360p_%03d.ts'),
    path.join(outputDir, '360p.m3u8'),
    // 480p
    '-s',
    '854x480',
    '-c:v',
    'libx264',
    '-b:v',
    '1400k',
    '-g',
    '48',
    '-hls_time',
    '10',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '480p_%03d.ts'),
    path.join(outputDir, '480p.m3u8'),
    // 720p
    '-s',
    '1280x720',
    '-c:v',
    'libx264',
    '-b:v',
    '2800k',
    '-g',
    '48',
    '-hls_time',
    '10',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '720p_%03d.ts'),
    path.join(outputDir, '720p.m3u8'),
    // 1080p
    '-s',
    '1920x1080',
    '-c:v',
    'libx264',
    '-b:v',
    '5000k',
    '-g',
    '48',
    '-hls_time',
    '10',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(outputDir, '1080p_%03d.ts'),
    path.join(outputDir, '1080p.m3u8'),
  ];

  logger.info(`Starting ABR transcoding: ${itemId}`, { userId });

  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpegCmd, args);
    let settled = false;

    const cleanup = async () => {
      // Cleanup
      if (tempSource) {
        await fs.unlink(tempSource).catch((error) => {
          logger.warn('Failed to remove temporary decrypted source file', {
            itemId,
            tempSource,
            error,
          });
        });
      }
      await fs.unlink(keyInfoPath).catch((error) => {
        logger.warn('Failed to remove HLS key info file', {
          itemId,
          keyInfoPath,
          error,
        });
      });
    };

    ffmpegProcess.on('error', async (error) => {
      logger.error('Failed to spawn FFmpeg for HLS transcoding', {
        itemId,
        userId,
        username,
        inputPath: sourcePath,
        outputDir,
        command: ffmpegCmd,
        args,
        error,
      });
      if (!settled) {
        settled = true;
        await cleanup();
        const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
        const statusCode = isEnoent ? 503 : 500;
        const appError = new AppError(
          statusCode,
          isEnoent ? 'FFMPEG_UNAVAILABLE' : 'TRANSCODING_PROCESS_ERROR',
          isEnoent
            ? 'Transcoding service unavailable: ffmpeg binary is not installed on the server.'
            : `FFmpeg process error: ${error.message}`,
        );
        reject(appError);
      }
    });

    ffmpegProcess.on('close', async (code) => {
      if (settled) return;
      settled = true;
      await cleanup();

      if (code === 0) {
        logger.info(`ABR transcoding complete with AES-128: ${itemId}`);
        resolve();
      } else {
        logger.error('FFmpeg failed during HLS transcoding', { itemId, userId, code, outputDir });
        reject(
          new AppError(
            500,
            'TRANSCODING_FAILED',
            `FFmpeg transcoding process failed with code ${code}`,
          ),
        );
      }
    });
  });
};
