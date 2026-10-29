import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { getHealthStatus, getReadinessStatus } from '../../server/controllers/healthController.ts';
import {
  verifyMasterKeyCaptcha,
  verifyCloudUnlockCaptcha,
} from '../../server/controllers/captchaController.ts';
import { submitContactForm } from '../../server/controllers/contactController.ts';
import {
  createFolderController,
  deleteFolderController,
  getFoldersController,
} from '../../server/controllers/folderController.ts';
import {
  getIntegrityStatusController,
  verifyVaultIntegrityController,
  getMerkleProofController,
  reportTamperController,
} from '../../server/controllers/integrityController.ts';
import {
  handleSaveMasterKey,
  handleRetrieveMasterKey,
  handleVerifyMasterKey,
  handleDeleteMasterKey,
} from '../../server/controllers/masterKeyController.ts';
import {
  createTusUploadController,
  getTusOffsetController,
  uploadTusChunkController,
  optionsTusController,
} from '../../server/controllers/tusController.ts';
import { AppError } from '../../server/utils/appError.ts';

const controllerMocks = vi.hoisted(() => ({
  ensureMongoReady: vi.fn().mockResolvedValue(true),
  integrityGetStatus: vi.fn().mockResolvedValue({
    activeRootHash: 'root-hash',
    algorithm: 'blake3',
    totalLeaves: 0,
    treeDepth: 0,
    lastAuditAt: null,
    lastAuditStatus: 'clean',
    tamperIncidentCount: 0,
  }),
}));

vi.mock('../../server/mongo.ts', () => ({
  ensureMongoReady: controllerMocks.ensureMongoReady,
}));

vi.mock('../../server/models/folder.ts', () => ({
  getFolderModel: vi.fn(() => ({
    findOneAndUpdate: vi.fn().mockResolvedValue({
      _id: { toString: () => 'folder-id' },
    }),
    find: vi.fn(() => ({
      lean: () => ({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'folder-id',
            name: 'Notes',
            itemType: 'notes',
            parentId: 'root',
          },
        ]),
      }),
    })),
  })),
}));

vi.mock('../../server/services/integrityService.ts', () => ({
  integrityService: {
    getStatus: controllerMocks.integrityGetStatus,
  },
}));

const createMockResponse = () => {
  const res: Partial<Response> & {
    _status?: number;
    _json?: any;
    _headers: Record<string, string>;
    _sentData?: any;
  } = {
    _headers: {},
    status: vi.fn(function (this: any, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: any) {
      this._json = data;
      return this;
    }),
    send: vi.fn(function (this: any, data: any) {
      this._sentData = data;
      return this;
    }),
    setHeader: vi.fn(function (this: any, name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
      return this;
    }),
    end: vi.fn(function (this: any) {
      return this;
    }),
  };
  return res as Response & typeof res;
};

describe('Production Controller Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('captchaController', () => {
    it('verifyMasterKeyCaptcha sets no-cache headers and returns verified: true', async () => {
      const req = {} as Request;
      const res = createMockResponse();

      await verifyMasterKeyCaptcha(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res._json?.success).toBe(true);
      expect(res._json?.data?.verified).toBe(true);
    });

    it('verifyCloudUnlockCaptcha sets no-cache headers and returns verified: true', async () => {
      const req = {} as Request;
      const res = createMockResponse();

      await verifyCloudUnlockCaptcha(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res._json?.success).toBe(true);
      expect(res._json?.data?.verified).toBe(true);
    });
  });

  describe('healthController', () => {
    it('getHealthStatus writes no-cache headers and returns health response', async () => {
      const req = {} as Request;
      const res = createMockResponse();

      await getHealthStatus(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(res._status).toBe(200);
      expect(res._json).toHaveProperty('status');
      expect(res._json).toHaveProperty('database');
    });

    it('getReadinessStatus writes no-cache headers and reports check flags', async () => {
      const req = {} as Request;
      const res = createMockResponse();

      await getReadinessStatus(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(res._status === 200 || res._status === 503).toBe(true);
      expect(res._json).toHaveProperty('checks');
    });
  });

  describe('contactController', () => {
    it('rejects contact submission when required fields are missing', async () => {
      const req = { body: { name: 'Alice' } } as Request;
      const res = createMockResponse();

      await expect(submitContactForm(req, res)).rejects.toThrow(AppError);
    });

    it('rejects contact submission with invalid email', async () => {
      const req = {
        body: {
          name: 'Alice',
          email: 'not-an-email',
          username: 'alice',
          subject: 'General Inquiry',
          message: 'Hello world! This is a long enough message.',
        },
      } as Request;
      const res = createMockResponse();

      await expect(submitContactForm(req, res)).rejects.toThrow(AppError);
    });

    it('rejects contact submission with message that is too short', async () => {
      const req = {
        body: {
          name: 'Alice',
          email: 'alice@example.com',
          username: 'alice',
          subject: 'General Inquiry',
          message: 'Hi',
        },
      } as Request;
      const res = createMockResponse();

      await expect(submitContactForm(req, res)).rejects.toThrow(AppError);
    });
  });

  describe('folderController', () => {
    it('createFolderController rejects empty name', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        body: { name: '', itemType: 'note' },
      } as any;
      const res = createMockResponse();

      await expect(createFolderController(req, res)).rejects.toThrow(AppError);
    });

    it('createFolderController rejects protected folder names', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        body: { name: 'Saved', itemType: 'note' },
      } as any;
      const res = createMockResponse();

      await expect(createFolderController(req, res)).rejects.toThrow(AppError);
    });

    it('deleteFolderController rejects empty name or itemType', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        query: { name: '' },
      } as any;
      const res = createMockResponse();

      await expect(deleteFolderController(req, res)).rejects.toThrow(AppError);
    });

    it('getFoldersController fetches hydrated folders', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
      } as any;
      const res = createMockResponse();

      await getFoldersController(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res._json?.success).toBe(true);
      expect(res._json?.data).toEqual([
        {
          _id: 'folder-id',
          name: 'Notes',
          itemType: 'note',
          parentId: 'root',
        },
      ]);
    });
  });

  describe('integrityController', () => {
    it('getIntegrityStatusController returns integrity status', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
      } as any;
      const res = createMockResponse();

      await getIntegrityStatusController(req, res);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res._json?.success).toBe(true);
      expect(res._json?.data).toEqual({
        activeRootHash: 'root-hash',
        algorithm: 'blake3',
        totalLeaves: 0,
        treeDepth: 0,
        lastAuditAt: null,
        lastAuditStatus: 'clean',
        tamperIncidentCount: 0,
      });
    });

    it('verifyVaultIntegrityController rejects invalid hash algorithm', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        body: { algorithm: 'md5' },
      } as any;
      const res = createMockResponse();

      await expect(verifyVaultIntegrityController(req, res)).rejects.toThrow(AppError);
    });

    it('getMerkleProofController rejects invalid itemId', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        params: { itemId: '../../malicious' },
        query: { algorithm: 'blake3' },
      } as any;
      const res = createMockResponse();

      await expect(getMerkleProofController(req, res)).rejects.toThrow(AppError);
    });

    it('reportTamperController rejects non-hex expectedHash', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        body: {
          itemId: 'item_1',
          expectedHash: 'not-a-hex-hash',
          actualHash: 'a'.repeat(64),
        },
      } as any;
      const res = createMockResponse();

      await expect(reportTamperController(req, res)).rejects.toThrow(AppError);
    });
  });

  describe('masterKeyController', () => {
    it('handleSaveMasterKey rejects unauthenticated request', async () => {
      const req = { body: {} } as Request;
      const res = createMockResponse();

      await expect(handleSaveMasterKey(req as any, res)).rejects.toThrow(AppError);
    });

    it('handleSaveMasterKey rejects missing required fields', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        body: {},
      } as any;
      const res = createMockResponse();

      await expect(handleSaveMasterKey(req, res)).rejects.toThrow(AppError);
    });

    it('handleRetrieveMasterKey rejects missing deviceId', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        query: {},
      } as any;
      const res = createMockResponse();

      await expect(handleRetrieveMasterKey(req, res)).rejects.toThrow(AppError);
    });

    it('handleVerifyMasterKey rejects invalid masterKeyHash format', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        body: { masterKeyHash: 'invalid@@@characters' },
      } as any;
      const res = createMockResponse();

      await expect(handleVerifyMasterKey(req, res)).rejects.toThrow(AppError);
    });

    it('handleDeleteMasterKey rejects unauthenticated call', async () => {
      const req = {} as Request;
      const res = createMockResponse();

      await expect(handleDeleteMasterKey(req, res)).rejects.toThrow(AppError);
    });
  });

  describe('tusController', () => {
    it('optionsTusController sets TUS 1.0.0 headers', async () => {
      const req = {} as Request;
      const res = createMockResponse();

      await optionsTusController(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Tus-Resumable', '1.0.0');
      expect(res.setHeader).toHaveBeenCalledWith('Tus-Version', '1.0.0');
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('createTusUploadController rejects invalid upload-length', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        headers: { 'upload-length': '-5' },
      } as any;
      const res = createMockResponse();

      await expect(createTusUploadController(req, res)).rejects.toThrow(AppError);
    });

    it('getTusOffsetController rejects path traversal in uploadId', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        params: { uploadId: '../../../traversal' },
      } as any;
      const res = createMockResponse();

      await expect(getTusOffsetController(req, res)).rejects.toThrow(AppError);
    });

    it('uploadTusChunkController rejects invalid upload-offset header', async () => {
      const req = {
        user: { userId: '507f1f77bcf86cd799439011', username: 'alice' },
        params: { uploadId: 'tus_valid_id_123' },
        headers: { 'upload-offset': 'invalid' },
      } as any;
      const res = createMockResponse();

      await expect(uploadTusChunkController(req, res)).rejects.toThrow(AppError);
    });
  });
});
