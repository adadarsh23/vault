import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  objectIdSchema,
  safeIdSchema,
  deviceIdSchema,
  captchaTokenSchema,
  paginationQuerySchema,
  hasPrototypePollutionKey,
  hasNoSqlOperatorKey,
  createSafeStringSchema,
  createBase64Schema,
  sha256HexSchema,
  loginSchema,
  registerSchema,
  changePasswordSchema,
  updateProfileSchema,
  contactSchema,
  CONTACT_SUBJECTS,
  login2FASchema,
  twoFactorTokenSchema,
  otpTokenSchema,
  createFolderSchema,
  deleteFolderQuerySchema,
  verifyIntegritySchema,
  reportTamperSchema,
  signedUrlQuerySchema,
  saveMasterKeySchema,
  retrieveMasterKeyQuerySchema,
  verifyMasterKeySchema,
  deleteMasterKeySchema,
  markNotificationReadSchema,
  notificationParamSchema,
  deleteNotificationBodySchema,
  elevatedLoginVerifySchema,
  deviceVerifyBodySchema,
  anomalyStatusUpdateSchema,
  lockAccountSchema,
  usernameQueryValidation,
  revokeSessionsValidation,
  deviceSessionRenameValidation,
  vaultCategoryRouteParamsValidation,
  vaultItemRouteParamsValidation,
  multipartRouteParamsValidation,
  multipartStartBodyValidation,
  multipartCompleteBodyValidation,
  activityLogQueryValidation,
  activityLogBodyValidation,
} from '../../server/validators/index.ts';
import { validate } from '../../server/middleware/validate.ts';
import { validateRequest } from '../../server/middleware/expressValidate.ts';
import { errorHandler } from '../../server/middleware/errorHandler.ts';

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const VALID_CAPTCHA = 'test-captcha-token-abcdefghijklmnopqrstuvwxyz';

describe('Production Validators Suite', () => {
  describe('1. Common Validators & Security Guards', () => {
    it('validates MongoDB ObjectIds and rejects malformed values', () => {
      expect(objectIdSchema.safeParse(VALID_OBJECT_ID).success).toBe(true);
      expect(objectIdSchema.safeParse('not-an-object-id').success).toBe(false);
      expect(objectIdSchema.safeParse('507f1f77bcf86cd79943901g').success).toBe(false);
      expect(objectIdSchema.safeParse('507f1f77bcf86cd79943901').success).toBe(false); // 23 chars
      expect(objectIdSchema.safeParse('').success).toBe(false);
      expect(objectIdSchema.safeParse(12345).success).toBe(false);
      expect(objectIdSchema.safeParse({ $gt: '' }).success).toBe(false);
    });

    it('validates safe identifiers and rejects injection / special characters', () => {
      expect(safeIdSchema.safeParse('valid-id_123:test').success).toBe(true);
      expect(safeIdSchema.safeParse('invalid id with spaces').success).toBe(false);
      expect(safeIdSchema.safeParse('id/with/slashes').success).toBe(false);
      expect(safeIdSchema.safeParse('<script>').success).toBe(false);
      expect(safeIdSchema.safeParse('a'.repeat(257)).success).toBe(false);
    });

    it('validates device identifiers', () => {
      expect(deviceIdSchema.safeParse('device-desktop.win:01').success).toBe(true);
      expect(deviceIdSchema.safeParse('   ').success).toBe(false);
      expect(deviceIdSchema.safeParse('a'.repeat(129)).success).toBe(false);
      expect(deviceIdSchema.safeParse('device@invalid#symbol').success).toBe(false);
    });

    it('validates CAPTCHA tokens with length bounds', () => {
      expect(captchaTokenSchema.safeParse(VALID_CAPTCHA).success).toBe(true);
      expect(captchaTokenSchema.safeParse('short-token').success).toBe(false);
      expect(captchaTokenSchema.safeParse('a'.repeat(4097)).success).toBe(false);
    });

    it('detects prototype pollution keys recursively', () => {
      expect(hasPrototypePollutionKey({ normal: 123 })).toBe(false);
      expect(hasPrototypePollutionKey({ __proto__: { evil: true } })).toBe(true);
      expect(hasPrototypePollutionKey({ nested: { constructor: 'hack' } })).toBe(true);
      expect(hasPrototypePollutionKey({ nested: { deeper: { prototype: 'bad' } } })).toBe(true);
      expect(hasPrototypePollutionKey([{ arrayItem: 1 }, { __proto__: {} }])).toBe(true);
    });

    it('detects MongoDB NoSQL query operator keys', () => {
      expect(hasNoSqlOperatorKey({ field: 'value' })).toBe(false);
      expect(hasNoSqlOperatorKey({ $gt: '' })).toBe(true);
      expect(hasNoSqlOperatorKey({ nested: { $regex: '.*' } })).toBe(true);
      expect(hasNoSqlOperatorKey([{ safe: true }, { $where: '1==1' }])).toBe(true);
    });

    it('validates pagination queries with default coercion and limits', () => {
      const parsedDefault = paginationQuerySchema.parse({});
      expect(parsedDefault.limit).toBe(50);
      expect(parsedDefault.skip).toBe(0);

      const parsedExplicit = paginationQuerySchema.parse({ limit: '25', skip: '100' });
      expect(parsedExplicit.limit).toBe(25);
      expect(parsedExplicit.skip).toBe(100);

      expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(paginationQuerySchema.safeParse({ limit: 1001 }).success).toBe(false);
      expect(paginationQuerySchema.safeParse({ skip: -1 }).success).toBe(false);
      expect(paginationQuerySchema.safeParse({ skip: 2000000 }).success).toBe(false);
    });

    it('validates safe strings rejecting control characters and null bytes', () => {
      const safeStr = createSafeStringSchema(2, 20, 'Name');
      expect(safeStr.safeParse('Valid String').success).toBe(true);
      expect(safeStr.safeParse('A\u0000B').success).toBe(false);
      expect(safeStr.safeParse('A\u001fB').success).toBe(false);
      expect(safeStr.safeParse('X').success).toBe(false); // min 2
    });

    it('validates base64 strings and SHA-256 hex checksums', () => {
      const b64 = createBase64Schema(100);
      expect(b64.safeParse('SGVsbG8gV29ybGQ=').success).toBe(true);
      expect(b64.safeParse('not base64!').success).toBe(false);

      expect(
        sha256HexSchema.safeParse(
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        ).success,
      ).toBe(true);
      expect(sha256HexSchema.safeParse('short-hex').success).toBe(false);
      expect(sha256HexSchema.safeParse('z'.repeat(64)).success).toBe(false);
    });
  });

  describe('2. Auth Validator', () => {
    it('accepts valid login and rejects unexpected extra fields', () => {
      const valid = loginSchema.safeParse({
        username: 'alice',
        password: 'ValidPassword123!',
        captchaToken: VALID_CAPTCHA,
      });
      expect(valid.success).toBe(true);

      const withExtra = loginSchema.safeParse({
        username: 'alice',
        password: 'ValidPassword123!',
        captchaToken: VALID_CAPTCHA,
        isAdmin: true,
      });
      expect(withExtra.success).toBe(false);
    });

    it('rejects prototype pollution attempts in login', () => {
      const result = loginSchema.safeParse({
        username: 'alice',
        password: 'ValidPassword123!',
        captchaToken: VALID_CAPTCHA,
        __proto__: { injected: true },
      });
      expect(result.success).toBe(false);
    });

    it('accepts registration passwords up to 128 characters', () => {
      const longPass = 'StrongPass123!_' + 'x'.repeat(80) + 'Y9!';
      const result = registerSchema.safeParse({
        username: 'alice',
        password: longPass,
        masterKey: 'MasterKeyPass123!_',
        captchaToken: VALID_CAPTCHA,
      });
      expect(result.success).toBe(true);
    });

    it('rejects registration when password exceeds 128 characters', () => {
      const tooLongPass = 'StrongPass123!_' + 'x'.repeat(120) + 'Y9!';
      const result = registerSchema.safeParse({
        username: 'alice',
        password: tooLongPass,
        masterKey: 'MasterKeyPass123!_',
        captchaToken: VALID_CAPTCHA,
      });
      expect(result.success).toBe(false);
    });

    it('validates changePasswordSchema and rejects identical passwords', () => {
      const valid = changePasswordSchema.safeParse({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!_Extra',
        captchaToken: VALID_CAPTCHA,
      });
      expect(valid.success).toBe(true);

      const identical = changePasswordSchema.safeParse({
        currentPassword: 'SamePassword123!_',
        newPassword: 'SamePassword123!_',
        captchaToken: VALID_CAPTCHA,
      });
      expect(identical.success).toBe(false);
    });

    it('validates updateProfileSchema and rejects null bytes in profileName', () => {
      const result = updateProfileSchema.safeParse({
        profileName: 'Alice\u0000Evil',
      });
      expect(result.success).toBe(false);
    });

    it('rejects path traversal in updateProfile photo', () => {
      const result = updateProfileSchema.safeParse({
        profilePhoto: '/api/avatar/raw/../../etc/passwd',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('3. Contact Validator', () => {
    it('accepts valid contact submission across all subjects', () => {
      for (const subject of CONTACT_SUBJECTS) {
        const result = contactSchema.safeParse({
          name: 'Jane Doe',
          email: 'jane@example.com',
          username: 'janedoe',
          subject,
          message: 'Hello, this is a legitimate contact request message.',
          captchaToken: VALID_CAPTCHA,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid email and invalid query subject', () => {
      const badEmail = contactSchema.safeParse({
        name: 'Jane Doe',
        email: 'invalid-email',
        username: 'janedoe',
        subject: 'General Inquiry',
        message: 'Hello, this is a legitimate contact request message.',
        captchaToken: VALID_CAPTCHA,
      });
      expect(badEmail.success).toBe(false);

      const badSubject = contactSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@example.com',
        username: 'janedoe',
        subject: 'Hacking Request',
        message: 'Hello, this is a legitimate contact request message.',
        captchaToken: VALID_CAPTCHA,
      });
      expect(badSubject.success).toBe(false);
    });

    it('rejects control characters in name and null bytes in message', () => {
      const badName = contactSchema.safeParse({
        name: 'Jane\u0007Doe',
        email: 'jane@example.com',
        username: 'janedoe',
        subject: 'General Inquiry',
        message: 'Hello, this is a legitimate contact request message.',
        captchaToken: VALID_CAPTCHA,
      });
      expect(badName.success).toBe(false);

      const badMessage = contactSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@example.com',
        username: 'janedoe',
        subject: 'General Inquiry',
        message: 'Hello, this is a legitimate\u0000 contact request message.',
        captchaToken: VALID_CAPTCHA,
      });
      expect(badMessage.success).toBe(false);
    });

    it('rejects extra fields via strict mode', () => {
      const extra = contactSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@example.com',
        username: 'janedoe',
        subject: 'General Inquiry',
        message: 'Hello, this is a legitimate contact request message.',
        captchaToken: VALID_CAPTCHA,
        extraField: 'not-allowed',
      });
      expect(extra.success).toBe(false);
    });
  });

  describe('4. Two-Factor Validator', () => {
    it('validates 6-digit TOTP and 8-char backup codes', () => {
      expect(otpTokenSchema.safeParse('123456').success).toBe(true);
      expect(otpTokenSchema.safeParse('A1B2C3D4').success).toBe(true);
      expect(otpTokenSchema.safeParse('12345').success).toBe(false); // 5 digits
      expect(otpTokenSchema.safeParse('1234567').success).toBe(false); // 7 digits
      expect(otpTokenSchema.safeParse('12345!').success).toBe(false); // symbols
    });

    it('validates login2FASchema and enforces ObjectId for userId', () => {
      const valid = login2FASchema.safeParse({
        userId: VALID_OBJECT_ID,
        token: '123456',
        mfaToken: 'valid-mfa-jwt-token',
        deviceId: 'device-1',
      });
      expect(valid.success).toBe(true);

      const invalidId = login2FASchema.safeParse({
        userId: 'invalid-not-hex-id',
        token: '123456',
        mfaToken: 'valid-mfa-jwt-token',
      });
      expect(invalidId.success).toBe(false);
    });

    it('rejects unexpected fields on twoFactorTokenSchema', () => {
      expect(twoFactorTokenSchema.safeParse({ token: '123456' }).success).toBe(true);
      expect(twoFactorTokenSchema.safeParse({ token: '123456', bypassMfa: true }).success).toBe(
        false,
      );
    });
  });

  describe('5. Vault Validator', () => {
    it('validates folder creation payload and rejects control chars', () => {
      const valid = createFolderSchema.safeParse({
        name: 'Work Documents',
        itemType: 'document',
        parentId: null,
      });
      expect(valid.success).toBe(true);

      const controlChar = createFolderSchema.safeParse({
        name: 'Work\u0000Docs',
        itemType: 'document',
      });
      expect(controlChar.success).toBe(false);

      const emptyName = createFolderSchema.safeParse({
        name: '   ',
        itemType: 'document',
      });
      expect(emptyName.success).toBe(false);
    });

    it('validates delete folder query parameters', () => {
      const valid = deleteFolderQuerySchema.safeParse({
        name: 'Old Folder',
        itemType: 'note',
      });
      expect(valid.success).toBe(true);

      const missingType = deleteFolderQuerySchema.safeParse({
        name: 'Old Folder',
      });
      expect(missingType.success).toBe(false);
    });

    it('validates integrity audit algorithm selection and defaults', () => {
      expect(verifyIntegritySchema.parse({}).algorithm).toBe('blake3');
      expect(verifyIntegritySchema.parse({ algorithm: 'sha256' }).algorithm).toBe('sha256');
      expect(verifyIntegritySchema.safeParse({ algorithm: 'md5' }).success).toBe(false);
    });

    it('validates tamper reports and rejects malformed hashes', () => {
      const valid = reportTamperSchema.safeParse({
        itemId: 'item-123',
        expectedHash: 'a'.repeat(64),
        actualHash: 'b'.repeat(64),
        details: { reason: 'Checksum mismatch' },
      });
      expect(valid.success).toBe(true);

      const badHash = reportTamperSchema.safeParse({
        itemId: 'item-123',
        expectedHash: 'not-hex',
        actualHash: 'b'.repeat(64),
      });
      expect(badHash.success).toBe(false);
    });

    it('validates signed URL queries and bounds expiresIn', () => {
      const valid = signedUrlQuerySchema.parse({
        expiresIn: '300',
        download: 'true',
      });
      expect(valid.expiresIn).toBe(300);
      expect(valid.download).toBe(true);

      expect(signedUrlQuerySchema.safeParse({ expiresIn: 0 }).success).toBe(false);
      expect(signedUrlQuerySchema.safeParse({ expiresIn: 86401 }).success).toBe(false);
    });
  });

  describe('6. Master Key Validator', () => {
    it('validates saveMasterKeySchema with derivation parameters', () => {
      const valid = saveMasterKeySchema.safeParse({
        encryptedMasterKey: {
          cipherText: 'SGVsbG8=',
          iv: 'AQIDBA==',
          authTag: 'BQYHCA==',
          salt: 'CQoLDA==',
          algorithm: 'AES-GCM-256',
        },
        masterKeyHash: 'a'.repeat(64),
        deviceId: 'device-test-01',
        metadata: {
          derivationAlgorithm: 'Argon2id',
          derivationParams: {
            memory: 65536,
            iterations: 3,
            parallelism: 4,
          },
        },
      });
      expect(valid.success).toBe(true);
    });

    it('rejects derivation parameters outside bounds', () => {
      const invalidMem = saveMasterKeySchema.safeParse({
        encryptedMasterKey: {
          cipherText: 'SGVsbG8=',
          iv: 'AQIDBA==',
          authTag: 'BQYHCA==',
          salt: 'CQoLDA==',
        },
        masterKeyHash: 'a'.repeat(64),
        deviceId: 'device-test-01',
        metadata: {
          derivationParams: {
            memory: 100, // min 8192
          },
        },
      });
      expect(invalidMem.success).toBe(false);
    });

    it('validates retrieve and verify master key schemas', () => {
      expect(retrieveMasterKeyQuerySchema.safeParse({ deviceId: 'dev-1' }).success).toBe(true);
      expect(retrieveMasterKeyQuerySchema.safeParse({}).success).toBe(false);

      expect(verifyMasterKeySchema.safeParse({ masterKeyHash: 'h'.repeat(32) }).success).toBe(true);
      expect(verifyMasterKeySchema.safeParse({ masterKeyHash: 'short' }).success).toBe(false);

      expect(deleteMasterKeySchema.safeParse({ deviceId: 'dev-1' }).success).toBe(true);
      expect(deleteMasterKeySchema.safeParse({}).success).toBe(true);
    });
  });

  describe('7. Notification & Security Validators', () => {
    it('validates notification schemas', () => {
      expect(markNotificationReadSchema.safeParse({}).success).toBe(true);
      expect(markNotificationReadSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(markNotificationReadSchema.safeParse({ id: 'bad-id' }).success).toBe(false);

      expect(notificationParamSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(notificationParamSchema.safeParse({ id: 'bad-id' }).success).toBe(false);

      expect(deleteNotificationBodySchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(deleteNotificationBodySchema.safeParse({ id: 'bad-id' }).success).toBe(false);
    });

    it('validates security elevated login and device verify', () => {
      expect(elevatedLoginVerifySchema.safeParse({ password: 'Password123!' }).success).toBe(true);
      expect(elevatedLoginVerifySchema.safeParse({ password: '' }).success).toBe(false);

      expect(deviceVerifyBodySchema.safeParse({ token: '123456' }).success).toBe(true);
      expect(deviceVerifyBodySchema.safeParse({ token: 'invalid' }).success).toBe(false);
    });

    it('validates anomaly status update and lock account schemas', () => {
      expect(
        anomalyStatusUpdateSchema.safeParse({
          status: 'investigating',
          notes: 'Reviewing access log',
        }).success,
      ).toBe(true);
      expect(anomalyStatusUpdateSchema.safeParse({ status: 'unknown_status' }).success).toBe(false);

      expect(
        lockAccountSchema.safeParse({
          userId: VALID_OBJECT_ID,
          reason: 'Suspicious credential stuffing detected',
        }).success,
      ).toBe(true);
      expect(lockAccountSchema.safeParse({ userId: 'bad', reason: 'test' }).success).toBe(false);
    });
  });

  describe('8. Express-Validator Chains (requestChainValidator)', () => {
    it('validates username query chain via validateRequest', async () => {
      const app = express();
      app.get('/test-username', validateRequest(usernameQueryValidation), (req, res) =>
        res.json({ username: req.query.username }),
      );
      app.use(errorHandler);

      const validRes = await request(app).get('/test-username?username=alice_01');
      expect(validRes.status).toBe(200);
      expect(validRes.body.username).toBe('alice_01');

      const invalidRes = await request(app).get('/test-username?username=al');
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates session revocation chain and blocks unexpected fields', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test-revoke', validateRequest(revokeSessionsValidation), (_req, res) =>
        res.json({ ok: true }),
      );
      app.use(errorHandler);

      const validRes = await request(app).post('/test-revoke').send({ sessionId: 'session-123' });
      expect(validRes.status).toBe(200);

      const unexpectedRes = await request(app)
        .post('/test-revoke')
        .send({ sessionId: 'session-123', adminRole: 'superadmin' });
      expect(unexpectedRes.status).toBe(400);
      expect(unexpectedRes.body.error.code).toBe('VALIDATION_ERROR');

      const invalidPairRes = await request(app)
        .post('/test-revoke')
        .send({ revokeCurrent: true, revokeAllOther: false });
      expect(invalidPairRes.status).toBe(400);
    });

    it('validates deviceSessionRenameValidation and rejects control characters', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test-rename', validateRequest(deviceSessionRenameValidation), (_req, res) =>
        res.json({ ok: true }),
      );
      app.use(errorHandler);

      const validRes = await request(app)
        .post('/test-rename')
        .send({ deviceId: 'dev-1', deviceName: 'My Laptop' });
      expect(validRes.status).toBe(200);

      const invalidName = await request(app)
        .post('/test-rename')
        .send({ deviceId: 'dev-1', deviceName: 'My\u0000Laptop' });
      expect(invalidName.status).toBe(400);
    });

    it('validates vaultCategoryRouteParamsValidation and vaultItemRouteParamsValidation', async () => {
      const app = express();
      app.get(
        '/vault/:category/:itemId',
        validateRequest([...vaultCategoryRouteParamsValidation, ...vaultItemRouteParamsValidation]),
        (req, res) => res.json({ category: req.params.category, itemId: req.params.itemId }),
      );
      app.use(errorHandler);

      const validRes = await request(app).get('/vault/photo/item-123_abc');
      expect(validRes.status).toBe(200);

      const invalidItemRes = await request(app).get('/vault/photo/item%20with%20spaces');
      expect(invalidItemRes.status).toBe(400);
    });

    it('validates multipartRouteParamsValidation and activityLogQueryValidation', async () => {
      const app = express();
      app.get(
        '/multipart/:uploadId/part/:partNumber',
        validateRequest(multipartRouteParamsValidation),
        (req, res) => res.json({ uploadId: req.params.uploadId }),
      );
      app.get('/activity-query', validateRequest(activityLogQueryValidation), (req, res) =>
        res.json({ limit: req.query.limit, skip: req.query.skip }),
      );
      app.use(errorHandler);

      const validMultipart = await request(app).get(`/multipart/${VALID_OBJECT_ID}/part/1`);
      expect(validMultipart.status).toBe(200);

      const invalidMultipart = await request(app).get('/multipart/not-hex/part/1');
      expect(invalidMultipart.status).toBe(400);

      const validActivity = await request(app).get('/activity-query?limit=10&skip=20');
      expect(validActivity.status).toBe(200);
      expect(Number(validActivity.body.limit)).toBe(10);
      expect(Number(validActivity.body.skip)).toBe(20);

      const invalidActivity = await request(app).get('/activity-query?limit=5000');
      expect(invalidActivity.status).toBe(400);
    });

    it('validates multipartStartBodyValidation and rejects path traversal', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test-multipart', validateRequest(multipartStartBodyValidation), (_req, res) =>
        res.json({ ok: true }),
      );
      app.use(errorHandler);

      const validRes = await request(app).post('/test-multipart').send({
        category: 'photo',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
      });
      expect(validRes.status).toBe(200);

      const traversalRes = await request(app).post('/test-multipart').send({
        category: 'photo',
        fileName: '../../evil.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
      });
      expect(traversalRes.status).toBe(400);
    });

    it('validates multipartCompleteBodyValidation and blocks prototype pollution in metadata', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test-complete', validateRequest(multipartCompleteBodyValidation), (_req, res) =>
        res.json({ ok: true }),
      );
      app.use(errorHandler);

      const validRes = await request(app)
        .post('/test-complete')
        .send({
          fileSha256: 'a'.repeat(64),
          metadata: { camera: 'Sony A7IV' },
        });
      expect(validRes.status).toBe(200);

      const pollutedRes = await request(app)
        .post('/test-complete')
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            fileSha256: 'a'.repeat(64),
            metadata: JSON.parse('{"__proto__":{"isAdmin":true}}'),
          }),
        );
      expect(pollutedRes.status).toBe(400);
    });

    it('validates activityLogBodyValidation and limits payload size', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test-activity', validateRequest(activityLogBodyValidation), (_req, res) =>
        res.json({ ok: true }),
      );
      app.use(errorHandler);

      const validRes = await request(app).post('/test-activity').send({
        action: 'EXPORT',
        category: 'photo',
        status: 'SUCCESS',
      });
      expect(validRes.status).toBe(200);

      const oversizedDetails = await request(app)
        .post('/test-activity')
        .send({
          action: 'EXPORT',
          details: { data: 'x'.repeat(12000) },
        });
      expect(oversizedDetails.status).toBe(400);
    });
  });

  describe('9. Middleware Validation Integration & Error Sanitization', () => {
    it('validate middleware formats Zod errors without leaking secrets', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test-login', validate(loginSchema), (_req, res) => res.json({ ok: true }));
      app.use(errorHandler);

      const res = await request(app).post('/test-login').send({
        username: 'alice',
        password: '',
        captchaToken: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);

      // Verify no passwords or tokens are printed in the error response
      const responseString = JSON.stringify(res.body);
      expect(responseString).not.toContain('ValidPassword');
      expect(responseString).not.toContain('Bearer');
    });
  });
});
