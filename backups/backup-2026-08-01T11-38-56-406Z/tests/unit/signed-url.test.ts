import { describe, expect, it, vi } from 'vitest';
import { storageService } from '../../server/services/storageService.ts';

describe('Signed URL Security Service', () => {
  const userId = 'user_123';
  const itemId = 'item_abc';
  const fileName = 'secret.mp4';
  const sessionId = 'session_xyz';
  const deviceHash = 'fingerprint_123';

  it('generates a valid HMAC-signed URL', () => {
    const signedUrl = storageService.generateSignedUrl(userId, itemId, fileName, {
      action: 'stream',
      sessionId,
      deviceHash
    });

    const url = new URL(signedUrl);
    expect(url.searchParams.has('token')).toBe(true);
    expect(url.searchParams.get('action')).toBe('stream');
    expect(url.searchParams.get('sid')).toBe(sessionId);
  });

  it('successfully verifies a valid signature', () => {
    const signedUrl = storageService.generateSignedUrl(userId, itemId, fileName, {
      action: 'view',
      sessionId,
      deviceHash,
      ipAddress: '1.1.1.1'
    });

    const url = new URL(signedUrl);
    const isValid = storageService.verifySignedUrl(userId, itemId, {
      token: url.searchParams.get('token')!,
      expires: parseInt(url.searchParams.get('expires')!),
      action: 'view',
      clientIp: '1.1.1.1',
      originalIp: '1.1.1.1',
      sessionId,
      deviceHash
    });

    expect(isValid).toBe(true);
  });

  it('fails verification if the signature is tampered with', () => {
    const signedUrl = storageService.generateSignedUrl(userId, itemId, fileName, { action: 'view' });
    const url = new URL(signedUrl);
    
    const isValid = storageService.verifySignedUrl(userId, itemId, {
      token: 'tampered_token',
      expires: parseInt(url.searchParams.get('expires')!),
      action: 'view',
      clientIp: '127.0.0.1'
    });

    expect(isValid).toBe(false);
  });

  it('fails verification if the URL has expired', () => {
    // Mock Date.now to many years in the past for generation
    const past = Date.now() - (1000 * 60 * 60); // 1 hour ago
    vi.spyOn(Date, 'now').mockReturnValue(past);
    
    const signedUrl = storageService.generateSignedUrl(userId, itemId, fileName, { expiresInMinutes: 5 });
    const url = new URL(signedUrl);

    // Reset Date.now to real time for verification
    vi.restoreAllMocks();

    const isValid = storageService.verifySignedUrl(userId, itemId, {
      token: url.searchParams.get('token')!,
      expires: parseInt(url.searchParams.get('expires')!),
      action: url.searchParams.get('action') || 'view',
      clientIp: '127.0.0.1'
    });

    expect(isValid).toBe(false);
  });

  it('handles IP drift within allowed boundaries (soft validation)', () => {
    const signedUrl = storageService.generateSignedUrl(userId, itemId, fileName, {
      ipAddress: '192.168.1.1'
    });

    const url = new URL(signedUrl);
    // User switches to cell data or minor range change
    const isValid = storageService.verifySignedUrl(userId, itemId, {
      token: url.searchParams.get('token')!,
      expires: parseInt(url.searchParams.get('expires')!),
      clientIp: '192.168.1.5', // Drifted IP
      originalIp: '192.168.1.1',
      action: 'view'
    });

    expect(isValid).toBe(true);
  });
});
