import { describe, expect, it } from 'vitest';
// @ts-ignore
import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Vault Manifest Schema (Draft 2020-12)', () => {
  const rootDir = process.cwd();
  const schemaPath = path.join(rootDir, 'schemas', 'vault-manifest.schema.json');
  const metadataPath = path.join(rootDir, 'metadata.json');

  const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const metadataContent = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(schemaContent);

  it('compiles the schema successfully', () => {
    expect(typeof validate).toBe('function');
    expect(schemaContent.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schemaContent.type).toBe('object');
    expect(schemaContent.additionalProperties).toBe(false);
  });

  it('validates production metadata.json successfully without errors', () => {
    const valid = validate(metadataContent);
    if (!valid) {
      console.error('Validation errors on metadata.json:', validate.errors);
    }
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('validates backup metadata files if present', () => {
    const backupDirs = [
      path.join(rootDir, 'backups', 'backup-2026-08-30_04-42-50', 'metadata.json'),
      path.join(rootDir, 'backups', 'backup-2026-08-31_23-49-06', 'metadata.json'),
      path.join(rootDir, 'backups', 'backup-2026-09-04_11-38-46', 'metadata.json'),
    ];

    for (const backupFile of backupDirs) {
      if (fs.existsSync(backupFile)) {
        const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
        const valid = validate(backupData);
        expect(valid).toBe(true);
      }
    }
  });

  describe('Project-relative architecture and module validations', () => {
    it('validates all project-relative directory paths', () => {
      expect(metadataContent.paths).toBeDefined();
      expect(metadataContent.paths.schemas).toBe('./schemas');
      expect(metadataContent.paths.uploads).toBe('./uploads');
      expect(metadataContent.paths.backups).toBe('./backups');
      expect(metadataContent.paths.logs).toBe('./logs');
      expect(metadataContent.paths.src).toBe('./src');
      expect(metadataContent.paths.server).toBe('./server');
      expect(metadataContent.paths.tests).toBe('./tests');
      expect(metadataContent.paths.doc).toBe('./doc');

      const valid = validate(metadataContent);
      expect(valid).toBe(true);
    });

    it('validates all 20 active vault categories', () => {
      const allCategories = [
        'photo',
        'video',
        'audio',
        'document',
        'note',
        'chat',
        'todo',
        'password',
        'secret',
        'contact',
        'location',
        'file',
        'other-files',
        'other',
        'settings',
        'system',
        'users',
        'card',
        'identity',
        'wifi',
      ];

      expect(metadataContent.storage.categories).toEqual(expect.arrayContaining(allCategories));
      expect(metadataContent.modules.activeVaults).toEqual(expect.arrayContaining(allCategories));
      const valid = validate(metadataContent);
      expect(valid).toBe(true);
    });

    it('validates VCAS01 dual cascade and envelope encryption specifications', () => {
      expect(metadataContent.security.cryptography.contentEncryption.cascade.magicHeader).toBe(
        'VCAS01',
      );
      expect(metadataContent.security.cryptography.envelope.dekLengthBytes).toBe(64);
      expect(metadataContent.security.cryptography.postQuantum.algorithm).toBe('ML-KEM-768');
      const valid = validate(metadataContent);
      expect(valid).toBe(true);
    });

    it('validates MongoDB multi-cluster and GridFS configuration', () => {
      expect(metadataContent.database.multiCluster.enabled).toBe(true);
      expect(metadataContent.database.multiCluster.standbyCluster).toBe(true);
      expect(metadataContent.database.gridfs.bucketName).toBe('vault_encrypted_blobs');
      const valid = validate(metadataContent);
      expect(valid).toBe(true);
    });
  });

  describe('Negative validations and strict enforcement', () => {
    it('rejects manifest missing required core properties', () => {
      const invalidManifest = { ...metadataContent };
      delete (invalidManifest as Record<string, unknown>).security;

      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(
        validate.errors?.some(
          (e: any) =>
            e.params &&
            'missingProperty' in e.params &&
            (e.params as { missingProperty: string }).missingProperty === 'security',
        ),
      ).toBe(true);
    });

    it('rejects manifest with non-semver version strings', () => {
      const invalidManifest = { ...metadataContent, version: '1.0' };
      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(validate.errors?.some((e: any) => e.instancePath === '/version')).toBe(true);
    });

    it('rejects manifest with uppercase or invalid characters in name', () => {
      const invalidManifest = { ...metadataContent, name: 'Vault_App' };
      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(validate.errors?.some((e: any) => e.instancePath === '/name')).toBe(true);
    });

    it('rejects manifest with unrecognized additional properties at root', () => {
      const invalidManifest = { ...metadataContent, unauthorizedProperty: 'injected' };
      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(validate.errors?.some((e: any) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects manifest with unrecognized additional properties in nested objects', () => {
      const invalidManifest = JSON.parse(JSON.stringify(metadataContent));
      invalidManifest.security.model.unexpectedFlag = true;

      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(validate.errors?.some((e: any) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects crypto keyDerivation iterations below minimum threshold (< 100,000)', () => {
      const invalidManifest = JSON.parse(JSON.stringify(metadataContent));
      invalidManifest.security.cryptography.keyDerivation.iterations = 50000;

      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(
        validate.errors?.some(
          (e: any) => e.instancePath === '/security/cryptography/keyDerivation/iterations',
        ),
      ).toBe(true);
    });

    it('rejects invalid branding hex colors', () => {
      const invalidManifest = JSON.parse(JSON.stringify(metadataContent));
      invalidManifest.branding.primary = 'not-a-color';

      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(validate.errors?.some((e: any) => e.instancePath === '/branding/primary')).toBe(true);
    });

    it('rejects invalid enum values in runtime environment', () => {
      const invalidManifest = JSON.parse(JSON.stringify(metadataContent));
      invalidManifest.runtime.environment = 'unsupported-environment';

      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(validate.errors?.some((e: any) => e.instancePath === '/runtime/environment')).toBe(
        true,
      );
    });

    it('rejects invalid session cookie sameSite configuration', () => {
      const invalidManifest = JSON.parse(JSON.stringify(metadataContent));
      invalidManifest.security.sessionSecurity.sameSite = 'invalid-samesite';

      const valid = validate(invalidManifest);
      expect(valid).toBe(false);
      expect(
        validate.errors?.some((e: any) => e.instancePath === '/security/sessionSecurity/sameSite'),
      ).toBe(true);
    });
  });
});
