import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import supertest from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { avatarRouter } from '../../server/routes/avatarRoutes.ts';

describe('MongoAtlas GridFS Avatar Router', () => {
  let app: express.Application;
  let bucketMock: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/avatar', avatarRouter);

    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      value: 1,
    });
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      value: { collection: vi.fn() },
    });

    bucketMock = {
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      delete: vi.fn().mockResolvedValue(undefined),
      openUploadStream: vi.fn().mockImplementation((_filename: string, _opts: any) => {
        const stream = new EventEmitter() as any;
        stream.id = { toString: () => 'gridfs-avatar-123' };
        stream.end = vi.fn((chunk?: Buffer) => {
          setImmediate(() => stream.emit('finish'));
          return stream;
        });
        return stream;
      }),
    };

    Object.defineProperty(mongoose.mongo, 'GridFSBucket', {
      configurable: true,
      value: function GridFSBucketCtor() {
        return bucketMock;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates presigned upload and public URLs', async () => {
    const res = await supertest(app).post('/api/avatar/presign').send({
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

  it('uploads valid images directly to GridFS without creating a local fallback file', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const payload = Buffer.concat([pngHeader, Buffer.from('fake-png-data')]);
    const localPath = path.join(process.cwd(), 'uploads', 'avatars', 'user_123', 'hash_456.webp');

    await fs.rm(path.dirname(localPath), { recursive: true, force: true }).catch(() => {});

    const res = await supertest(app)
      .put('/api/avatar/upload/user_123/hash_456?ext=webp')
      .set('Content-Type', 'image/webp')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(bucketMock.openUploadStream).toHaveBeenCalled();
    await expect(fs.access(localPath)).rejects.toThrow();
  });

  it('returns 304 Not Modified when ETag matches If-None-Match header', async () => {
    const res = await supertest(app)
      .get('/api/avatar/raw/user_123/hash_456.webp')
      .set('If-None-Match', '"hash_456"');

    expect(res.status).toBe(304);
  });
});
