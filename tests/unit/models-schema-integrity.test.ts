import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  User,
  RefreshToken,
  TotalUser,
  Contact,
  ContactStatus,
  ContactPriority,
  ContactSubject,
  VaultIntegrity,
  getVaultItemModel,
  getFolderModel,
  getMasterKeyModel,
  getActivityLogModel,
  getTelemetryModel,
  getNotificationModel,
} from '../../server/models/index.ts';

describe('Production Backend Models Schema Integrity & Security Audit', () => {
  describe('1. User Model', () => {
    it('enforces lowercase, trimming, and regex validation on username', async () => {
      const user = new User({
        username: '  Alice_123  ',
        password: { hash: 'secret' },
        masterKey: { cipherText: 'enc', iv: 'iv', authTag: 'tag' },
      });

      expect(user.username).toBe('alice_123');

      const invalidUser = new User({
        username: 'alice with spaces!',
        password: { hash: 'secret' },
        masterKey: { cipherText: 'enc', iv: 'iv', authTag: 'tag' },
      });
      let err: any = null;
      try {
        await invalidUser.validate();
      } catch (e) {
        err = e;
      }
      expect(err?.errors?.['username']).toBeDefined();
    });

    it('sanitizes and strips sensitive security secrets in toJSON', () => {
      const user = new User({
        username: 'bob_secure',
        password: 'hashed-password-value',
        masterKey: { cipherText: 'mk-cipher', iv: 'mk-iv', authTag: 'mk-tag' },
        twoFactorSecret: { cipherText: '2fa-cipher', iv: 'iv', authTag: 'tag' },
        twoFactorTempSecret: { cipherText: 'temp-cipher', iv: 'iv', authTag: 'tag' },
        twoFactorBackupCodes: ['code-1', 'code-2'],
        sessions: [
          {
            sessionId: 'sess-1',
            deviceId: 'dev-1',
            refreshTokenHash: 'super-sensitive-hash',
            expiresAt: new Date(Date.now() + 60000),
          },
        ],
        history: {
          password: [{ hash: 'old-pass', changedAt: new Date() }],
        },
      });

      const json = user.toJSON();

      expect(json.password).toBeUndefined();
      expect(json.masterKey).toBeUndefined();
      expect(json.twoFactorSecret).toBeUndefined();
      expect(json.twoFactorTempSecret).toBeUndefined();
      expect(json.twoFactorBackupCodes).toBeUndefined();
      expect(json.history).toBeUndefined();
      expect(json.sessions[0].refreshTokenHash).toBeUndefined();
      expect(json.sessions[0].sessionId).toBe('sess-1');
    });

    it('enforces in-place array bounding on save to prevent 16MB document cap', async () => {
      const user = new User({
        username: 'charlie_audit',
        password: 'hash',
        masterKey: { cipherText: 'c', iv: 'i', authTag: 't' },
      });

      // Populate 110 login history items
      for (let i = 0; i < 110; i++) {
        user.loginHistory.push({
          loggedInAt: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'test',
          deviceId: `dev-${i}`,
          status: 'SUCCESS',
        } as any);
      }

      // Populate 110 activity log items
      for (let i = 0; i < 110; i++) {
        user.activityLog.push({
          action: 'LOGIN',
          category: 'auth',
          deviceId: `dev-${i}`,
          createdAt: new Date(),
          details: {},
        } as any);
      }

      // Trigger pre-save hook
      const saveHooks = (user.schema as any).s?.hooks?._pres?.get('save') || [];
      for (const hook of saveHooks) {
        await hook.fn.call(user);
      }

      expect(user.loginHistory.length).toBe(100);
      expect(user.activityLog.length).toBe(100);
    });
  });

  describe('2. RefreshToken Model', () => {
    it('validates required fields and defaults isRevoked to false', async () => {
      const token = new RefreshToken({
        userId: new mongoose.Types.ObjectId(),
        familyId: 'fam-1',
        sessionId: 'sess-1',
        tokenHash: 'hash-abc',
        expiresAt: new Date(Date.now() + 3600000),
      });

      await token.validate();
      expect(token.isRevoked).toBe(false);
      expect(token.ip).toBe('unknown');
      expect(token.userAgent).toBe('unknown');
    });

    it('verifies TTL index configuration on expiresAt', () => {
      const schema = RefreshToken.schema;
      const expiresAtIndex = schema.path('expiresAt');
      expect((expiresAtIndex as any).options.expires).toBe(0);
    });

    it('correctly evaluates isValid() based on revocation and expiry', () => {
      const validToken = new RefreshToken({
        userId: new mongoose.Types.ObjectId(),
        familyId: 'fam-1',
        sessionId: 'sess-1',
        tokenHash: 'hash-abc',
        expiresAt: new Date(Date.now() + 100000),
        isRevoked: false,
      });
      expect(validToken.isValid()).toBe(true);

      const revokedToken = new RefreshToken({
        userId: new mongoose.Types.ObjectId(),
        familyId: 'fam-1',
        sessionId: 'sess-1',
        tokenHash: 'hash-abc',
        expiresAt: new Date(Date.now() + 100000),
        isRevoked: true,
      });
      expect(revokedToken.isValid()).toBe(false);

      const expiredToken = new RefreshToken({
        userId: new mongoose.Types.ObjectId(),
        familyId: 'fam-1',
        sessionId: 'sess-1',
        tokenHash: 'hash-abc',
        expiresAt: new Date(Date.now() - 100000),
        isRevoked: false,
      });
      expect(expiredToken.isValid()).toBe(false);
    });
  });

  describe('3. Contact Model', () => {
    it('auto-generates high-entropy referenceId and assigns priority based on subject', () => {
      const securityContact = new Contact({
        name: 'Reporter',
        email: 'security@example.com',
        username: 'reporter1',
        subject: ContactSubject.SECURITY,
        message: 'Discovered an issue in authentication flow.',
      });

      // Trigger pre-save hook
      const saveHooks = (securityContact.schema as any).s?.hooks?._pres?.get('save') || [];
      for (const hook of saveHooks) {
        hook.fn.call(securityContact);
      }

      expect(securityContact.referenceId).toMatch(/^VLT-[A-F0-9]{12}$/);
      expect(securityContact.priority).toBe(ContactPriority.HIGH);
      expect(securityContact.status).toBe(ContactStatus.UNREAD);

      const techContact = new Contact({
        name: 'User',
        email: 'user@example.com',
        username: 'user1',
        subject: ContactSubject.TECH,
        message: 'Need help with sync settings.',
      });
      for (const hook of saveHooks) {
        hook.fn.call(techContact);
      }
      expect(techContact.priority).toBe(ContactPriority.MEDIUM);

      const generalContact = new Contact({
        name: 'Inquirer',
        email: 'info@example.com',
        username: 'inq1',
        subject: ContactSubject.GENERAL,
        message: 'Question about upcoming releases.',
      });
      for (const hook of saveHooks) {
        hook.fn.call(generalContact);
      }
      expect(generalContact.priority).toBe(ContactPriority.LOW);
    });

    it('rejects invalid email formats', async () => {
      const contact = new Contact({
        name: 'Bad Email',
        email: 'not-an-email',
        username: 'user',
        subject: ContactSubject.OTHER,
        message: 'This is a test message of sufficient length.',
      });

      let err: any = null;
      try {
        await contact.validate();
      } catch (e) {
        err = e;
      }
      expect(err?.errors?.['email']).toBeDefined();
    });
  });

  describe('4. VaultItem Model & Dynamic Partitioning', () => {
    it('partitions collection name safely by normalized username', () => {
      const model = getVaultItemModel('Alice.Admin@Corp');
      expect(model.collection.name).toBe('alice_admin_corp.alice_admin_corp_vault_items');
    });

    it('validates category enum restrictions', async () => {
      const VaultItem = getVaultItemModel('testuser');
      const item = new VaultItem({
        userId: new mongoose.Types.ObjectId(),
        itemId: 'item-1',
        category: 'invalid_category_xyz' as any,
      });

      let err: any = null;
      try {
        await item.validate();
      } catch (e) {
        err = e;
      }
      expect(err?.errors?.['category']).toBeDefined();
    });

    it('performs soft delete and restore', async () => {
      const VaultItem = getVaultItemModel('testuser');
      const item = new VaultItem({
        userId: new mongoose.Types.ObjectId(),
        itemId: 'item-1',
        category: 'photo',
      });

      // Mock save to test instance logic in memory
      item.save = async function () {
        return this;
      };

      expect(item.isDeleted).toBe(false);
      expect(item.deletedAt).toBeNull();

      await (item as any).softDelete();
      expect(item.isDeleted).toBe(true);
      expect(item.deletedAt).toBeInstanceOf(Date);

      await (item as any).restore();
      expect(item.isDeleted).toBe(false);
      expect(item.deletedAt).toBeNull();
    });
  });

  describe('5. Folder Model', () => {
    it('partitions collection name by normalized username and validates non-empty name', async () => {
      const FolderModel = getFolderModel('Bob-User');
      expect(FolderModel.collection.name).toBe('bob-user.bob-user_folders');

      const folder = new FolderModel({
        userId: 'u-1',
        username: 'bob-user',
        name: 'Personal Documents',
        itemType: 'document',
      });
      await folder.validate();

      const invalidFolder = new FolderModel({
        userId: 'u-1',
        username: 'bob-user',
        name: '   ',
        itemType: 'document',
      });
      let err: any = null;
      try {
        await invalidFolder.validate();
      } catch (e) {
        err = e;
      }
      expect(err?.errors?.['name']).toBeDefined();
    });
  });

  describe('6. MasterKey Model', () => {
    it('partitions collection and caps masterKeyHashHistory to 50', async () => {
      const MasterKeyModel = getMasterKeyModel('SecureUser');
      expect(MasterKeyModel.collection.name).toBe('secureuser.secureuser_master_keys');

      const doc = new MasterKeyModel({
        userId: 'u-1',
        encryptedMasterKey: { cipherText: 'c', iv: 'i', authTag: 'tag' },
        masterKeyHash: { cipherText: 'hc', iv: 'hi', authTag: 'htag' },
      });

      for (let i = 0; i < 60; i++) {
        doc.masterKeyHashHistory.push({
          hash: { cipherText: `c${i}`, iv: 'i', authTag: 't' },
          changedAt: new Date(),
        });
      }

      const saveHooks = (doc.schema as any).s?.hooks?._pres?.get('save') || [];
      for (const hook of saveHooks) {
        hook.fn.call(doc);
      }

      expect(doc.masterKeyHashHistory.length).toBe(50);
    });
  });

  describe('7. VaultIntegrity Model', () => {
    it('records audit and increments tamper incident count when corrupted', async () => {
      const integrity = new VaultIntegrity({
        userId: new mongoose.Types.ObjectId(),
        username: 'alice',
      });

      expect(integrity.tamperIncidentCount).toBe(0);

      const auditRecord = {
        auditId: 'audit-1',
        timestamp: new Date(),
        status: 'corrupted' as const,
        itemCount: 5,
        rootHash: 'root-hash-abc',
        algorithm: 'blake3' as const,
        corruptedItemIds: ['item-corrupted-1'],
      };

      integrity.save = async function () {
        return this;
      };

      await integrity.recordAudit(auditRecord);

      expect(integrity.tamperIncidentCount).toBe(1);
      expect(integrity.lastAuditStatus).toBe('corrupted');
      expect(integrity.activeRootHash).toBe('root-hash-abc');
      expect(integrity.auditHistory.length).toBe(1);
    });
  });

  describe('8. ActivityLog & Telemetry TTL Retention', () => {
    it('verifies 90-day TTL index on ActivityLog and Telemetry models', () => {
      const LogModel = getActivityLogModel('testuser');
      const logCreatedIndex = LogModel.schema.path('createdAt');
      expect((logCreatedIndex as any).options.expires).toBe(7776000);

      const TelemetryModel = getTelemetryModel('testuser');
      const telemetryTimestampIndex = TelemetryModel.schema.path('timestamp');
      expect((telemetryTimestampIndex as any).options.expires).toBe(7776000);
    });
  });

  describe('9. TotalUser & Notification Models', () => {
    it('enforces trimmed and lowercase username on TotalUser', () => {
      const totalUser = new TotalUser({
        username: '  JOHN_DOE  ',
        exists: true,
        exactMatch: true,
      });

      expect(totalUser.username).toBe('john_doe');
    });

    it('defaults notification isRead to false', () => {
      const NotificationModel = getNotificationModel('testuser');
      const notif = new NotificationModel({
        userId: new mongoose.Types.ObjectId(),
        type: 'security_alert',
        title: 'New Device',
        message: 'Login from new IP address',
      });

      expect(notif.isRead).toBe(false);
    });
  });
});
