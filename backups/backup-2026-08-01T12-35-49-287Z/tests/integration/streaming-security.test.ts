import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { getMediaPlaylist, getMediaKey } from '../../server/controllers/mediaController.ts';
import { errorHandler } from '../../server/middleware/errorHandler.ts';
import { storageService } from '../../server/services/storageService.ts';

const vaultItemModelMock = vi.hoisted(() => ({
  findOne: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
}));

const mediaServiceMock = vi.hoisted(() => ({
  generateMasterPlaylist: vi.fn(() => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nvariant.m3u8'),
  getStreamingKey: vi.fn(() => Buffer.from('mock_key_16_bytes')),
  getStreamingKeyUrl: vi.fn((itemId: string, token: string) => `http://localhost:5173/api/vault/media/key/${itemId}?token=${token}`),
  generatePlaylist: vi.fn(() => '#EXTM3U\nvariant.m3u8'),
}))

// Mock models and services
vi.mock('../../server/models/vaultItem.ts', () => ({
  getVaultItemModel: vi.fn(() => vaultItemModelMock),
}));
vi.mock('../../server/services/mediaService.ts', () => ({
  mediaService: mediaServiceMock,
}));

describe('Media Streaming Security Integration', () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { requestId?: string }).requestId = randomUUID();
    next();
  });
  
  // Mock auth middleware
  const mockAuth = (req: any, res: any, next: any) => {
    req.user = { userId: 'user_1', sessionId: 'sess_1', username: 'alice' };
    next();
  };

  app.get('/api/vault/media/:itemId/hls', mockAuth, getMediaPlaylist);
  app.get('/api/vault/media/key/:itemId', mockAuth, getMediaKey);
  app.use(errorHandler);

  it('rejects HLS playlist requests without a valid HMAC signature', async () => {
    vaultItemModelMock.findOne.mockResolvedValue({ id: 'item_1', file: { filePath: '/tmp/test.mp4' } });

    const response = await request(app).get('/api/vault/media/item_1/hls'); // No query params
    
    expect(response.status).toBe(403);
    expect(response.body.message).toContain('token or expiration missing');
    expect(response.body.error.code).toBe('MISSING_SIGNATURE');
  });

  it('serves HLS playlist when a valid signature is provided', async () => {
    const userId = 'user_1';
    const itemId = 'item_1';
    vaultItemModelMock.findOne.mockResolvedValue({ id: itemId, file: { filePath: '/tmp/test.mp4' } });
    
    const signedUrl = storageService.generateSignedUrl(userId, itemId, 'video.mp4', {
      action: 'stream',
      sessionId: 'sess_1'
    });
    
    const query = new URL(signedUrl).search;

    const response = await request(app).get(`/api/vault/media/${itemId}/hls${query}`);
    
    expect(response.status).toBe(200);
    expect(response.text).toContain('#EXTM3U');
  });

  it('prevents key access for the wrong session', async () => {
    const itemId = 'item_1';
    
    // Generate signature for session A
    const signedUrl = storageService.generateSignedUrl('user_1', itemId, 'video.mp4', {
      action: 'stream',
      sessionId: 'sess_A'
    });
    
    const query = new URL(signedUrl).search;

    // Attempt to access key with session B (mockAuth provides sess_1)
    const response = await request(app).get(`/api/vault/media/key/${itemId}${query}`);
    
    expect(response.status).toBe(403);
  });
});
