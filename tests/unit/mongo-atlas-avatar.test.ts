import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import supertest from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { avatarRouter } from '../../server/routes/avatarRoutes.ts';
import { createAccessToken } from '../../server/utils/auth.ts';
import { User } from '../../server/models/user.ts';

describe('MongoAtlas GridFS Avatar Router', () => {
  let app: express.Application;
  let bucketMock: any;
  let accessToken: string;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/avatar', avatarRouter);

    accessToken = createAccessToken({
      sub: 'user_123',
      username: 'test-user',
      sessionId: 'session_123',
    });
    vi.spyOn(User, 'findOne').mockReturnValue({
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          _id: 'user_123',
          username: 'test-user',
          sessions: [{ sessionId: 'session_123', revokedAt: null }],
        }),
      }),
    } as any);

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
        stream.end = vi.fn((_chunk?: Buffer) => {
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
    const res = await supertest(app)
      .post('/api/avatar/presign')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: 'user_123', contentHash: 'hash_456', mimeType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.uploadUrl).toContain('/api/avatar/upload/user_123/hash_456?ext=webp');
    expect(res.body.publicUrl).toContain('/api/avatar/raw/user_123/hash_456.webp');
    expect(typeof res.body.expiresAt).toBe('number');
  });

  it('rejects unauthenticated avatar presigning', async () => {
    const res = await supertest(app).post('/api/avatar/presign').send({
      userId: 'user_123',
      contentHash: 'hash_456',
      mimeType: 'image/webp',
    });

    expect(res.status).toBe(401);
  });

  it('rejects avatar presigning for another user', async () => {
    const res = await supertest(app)
      .post('/api/avatar/presign')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: 'user_456', contentHash: 'hash_456', mimeType: 'image/webp' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('another user');
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

  it('falls back to local disk storage and serves avatar when GridFS is unavailable', async () => {
    // Simulate GridFS unavailable
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      value: 0,
    });

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const payload = Buffer.concat([pngHeader, Buffer.from('local-fallback-data')]);
    const localPath = path.join(
      process.cwd(),
      'uploads',
      'avatars',
      'user_fallback',
      'hash_789.webp',
    );

    await fs.rm(path.dirname(localPath), { recursive: true, force: true }).catch(() => {});

    const uploadRes = await supertest(app)
      .put('/api/avatar/upload/user_fallback/hash_789?ext=webp')
      .set('Content-Type', 'image/webp')
      .send(payload);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);

    // Verify written to local file
    const fileContent = await fs.readFile(localPath);
    expect(fileContent).toEqual(payload);

    // Verify served via GET /raw/
    const getRes = await supertest(app).get('/api/avatar/raw/user_fallback/hash_789.webp');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(payload);

    await fs.rm(path.dirname(localPath), { recursive: true, force: true }).catch(() => {});
  });

  it('returns 304 Not Modified when ETag matches If-None-Match header', async () => {
    const res = await supertest(app)
      .get('/api/avatar/raw/user_123/hash_456.webp')
      .set('If-None-Match', '"hash_456"');

    expect(res.status).toBe(304);
  });
});
