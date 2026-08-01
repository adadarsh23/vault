import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  completeMultipartUpload,
  startMultipartUpload,
  uploadMultipartPart,
} from '../../server/controllers/vaultController.ts';
import { errorHandler } from '../../server/middleware/errorHandler.ts';

vi.mock('../../server/services/vaultService.ts', () => ({
  saveFileToVault: vi.fn(async () => ({
    itemId: 'mock-item-id',
    category: 'photo',
    filePath: 'cloud://mock-item-id',
  })),
}));

const withAuth =
  () =>
  (req: express.Request & { user?: any }, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: String(req.get('x-user-id') || 'user-1'),
      username: String(req.get('x-username') || 'alice'),
      sessionId: 'sess-test',
    };
    next();
  };

describe('multipart security', () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { requestId?: string }).requestId = randomUUID();
    next();
  });
  app.use(express.json());
  app.post('/start', withAuth(), startMultipartUpload);
  app.put(
    '/part/:uploadId/:partNumber',
    withAuth(),
    express.raw({ type: 'application/octet-stream', limit: '5mb' }),
    uploadMultipartPart
  );
  app.post('/complete/:uploadId', withAuth(), completeMultipartUpload);
  app.use(errorHandler);

  it('blocks cross-user uploadId part submission', async () => {
    const ownerUserId = `owner-user-${randomUUID()}`;
    const attackerUserId = `attacker-user-${randomUUID()}`;

    const startResponse = await request(app)
      .post('/start')
      .set('x-user-id', ownerUserId)
      .set('x-username', 'owner')
      .send({
        category: 'photo',
        folder: null,
        fileName: 'pic.jpg',
        mimeType: 'image/jpeg',
        fileSize: 7,
      });

    expect(startResponse.status).toBe(200);
    const uploadId = startResponse.body?.data?.uploadId as string;
    const part = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);
    const hash = '7f61d43a19733c0f0c1e9aecf20840a921b8f222ba750391e64f41d0a9fe80d8';

    const attackResponse = await request(app)
      .put(`/part/${uploadId}/1`)
      .set('x-user-id', attackerUserId)
      .set('x-username', 'attacker')
      .set('x-part-sha256', hash)
      .set('content-type', 'application/octet-stream')
      .send(part);

    expect(attackResponse.status).toBe(404);
    expect(attackResponse.body?.error?.code).toBe('UPLOAD_SESSION_NOT_FOUND');
  });
});
