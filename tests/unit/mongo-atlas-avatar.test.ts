import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import supertest from 'supertest';
import { avatarRouter } from '../../server/routes/avatarRoutes.ts';

describe('MongoAtlas GridFS Avatar Router', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/avatar', avatarRouter);
  });

  it('generates presigned upload and public URLs', async () => {
    const res = await supertest(app)
      .post('/api/avatar/presign')
      .send({
        userId: 'user_123',
        contentHash: 'hash_456',
        mimeType: 'image/webp',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.uploadUrl).toContain('/api/avatar/upload/user_123/hash_456?ext=webp');
    expect(res.body.publicUrl).toContain('/api/avatar/raw/user_123/hash_456.webp');
    expect(typeof res.body.expiresAt).toBe('number');
  });

  it('returns storage status health check information', async () => {
    const res = await supertest(app).get('/api/avatar/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('storageMode');
    expect(res.body).toHaveProperty('mongoReady');
  });

  it('rejects uploads with invalid magic bytes / non-image payloads', async () => {
    const fakeBuffer = Buffer.from('This is a plain text file, not an image!');
    const res = await supertest(app)
      .put('/api/avatar/upload/user_123/hash_456?ext=webp')
      .set('Content-Type', 'image/webp')
      .send(fakeBuffer);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Invalid image format');
  });

  it('returns 304 Not Modified when ETag matches If-None-Match header', async () => {
    const res = await supertest(app)
      .get('/api/avatar/raw/user_123/hash_456.webp')
      .set('If-None-Match', '"hash_456"');

    expect(res.status).toBe(304);
  });
});
