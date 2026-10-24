import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { User } from '../models/user.ts';
import { encryptText, decryptText, comparePassword, hashPassword } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import crypto from 'crypto';

const logTwoFactorEvent = (userId: string, action: string, details?: Record<string, unknown>) => {
  logger.info(`2FA event: ${action}`, { userId, ...details });
};

export const generate2FASecret = async (username: string) => {
  const secret = speakeasy.generateSecret({
    name: `Vault (${username})`,
    issuer: 'Vault',
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

  return {
    secret: secret.base32,
    qrCodeUrl,
  };
};

export const verifyOTP = (secret: string, token: string): boolean => {
  const sanitizedSecret = secret.trim();
  const sanitizedToken = token.trim().replace(/\s/g, ''); // Remove any potential spaces

  return speakeasy.totp.verify({
    secret: sanitizedSecret,
    encoding: 'base32',
    token: sanitizedToken,
    window: 1, // Strictly bounded to ±1 time step (30s * 3 = 90s total window)
  });
};

export const verifyOTPWithReplayDefense = (
  secret: string,
  token: string,
  lastUsedTimestamp = 0,
): { isValid: boolean; matchedTimeStep?: number } => {
  const sanitizedSecret = secret.trim();
  const sanitizedToken = token.trim().replace(/\s/g, '');

  const delta = speakeasy.totp.verifyDelta({
    secret: sanitizedSecret,
    encoding: 'base32',
    token: sanitizedToken,
    window: 1,
  });

  if (delta === null || delta === undefined) {
    return { isValid: false };
  }

  const currentTimeStep = Math.floor(Date.now() / 1000 / 30);
  const matchedTimeStep = currentTimeStep + delta.delta;

  if (lastUsedTimestamp && matchedTimeStep <= lastUsedTimestamp) {
    return { isValid: false };
  }

  return { isValid: true, matchedTimeStep };
};

export const generateBackupCodes = async (): Promise<{ plain: string[]; hashed: string[] }> => {
  const codeSet = new Set<string>();

  while (codeSet.size < 10) {
    // 4 bytes = 8 hex characters
    const code = crypto.randomBytes(4).toString('hex').toLowerCase();
    codeSet.add(code);
  }

  const plain = Array.from(codeSet);
  const hashed = await Promise.all(plain.map((c) => hashPassword(c)));

  return { plain, hashed };
};

export const encryptSecret = (secret: string) => {
  return encryptText(secret);
};

export const decryptSecret = (encryptedPayload: any) => {
  return decryptText(encryptedPayload);
};

export const setup2FA = async (userId: string, username: string) => {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const { secret, qrCodeUrl } = await generate2FASecret(username);

  // Store as temp secret
  user.twoFactorTempSecret = encryptSecret(secret) as any;
  await user.save();

  logTwoFactorEvent(userId, '2FA_SETUP_INITIATED', {
    username,
  });

  return { qrCodeUrl, secret }; // Secret is base32
};

export const verifyAndEnable2FA = async (userId: string, token: string) => {
  const user = await User.findById(userId).select('+twoFactorTempSecret');
  if (!user || !user.twoFactorTempSecret) {
    throw AppError.badRequest('2FA setup not initiated', '2FA_NOT_INITIATED');
  }

  const secret = decryptSecret(user.twoFactorTempSecret);
  const { isValid, matchedTimeStep } = verifyOTPWithReplayDefense(secret, token, 0);

  if (!isValid) {
    logger.warn('2FA Setup Verification failed', {
      userId,
      serverTime: new Date().toISOString(),
      tokenReceived: token.length === 6 ? '******' : 'invalid-length',
    });
    throw AppError.unauthorized('Invalid OTP', 'INVALID_OTP');
  }

  const { plain: backupCodes, hashed: hashedBackupCodes } = await generateBackupCodes();

  user.twoFactorSecret = user.twoFactorTempSecret;
  user.twoFactorTempSecret = null as any;
  user.twoFactorEnabled = true;
  user.twoFactorBackupCodes = hashedBackupCodes;
  user.twoFactorLastUsedTimestamp = matchedTimeStep || Math.floor(Date.now() / 1000 / 30);

  await user.save();

  logTwoFactorEvent(userId, '2FA_ENABLED', {
    method: 'TOTP',
    backupCodesGenerated: 10,
  });

  return { backupCodes };
};

export const consumeBackupCodeAtomic = async (
  userId: string,
  candidateCode: string,
): Promise<boolean> => {
  if (!candidateCode || typeof candidateCode !== 'string') {
    return false;
  }

  const cleanCode = candidateCode.trim().replace(/[\s-]/g, '');

  // Fast-path guard: backup codes are strictly 8 alphanumeric characters (or 32 for legacy support)
  if (!/^[a-zA-Z0-9]{8}$|^[a-zA-Z0-9]{32}$/.test(cleanCode)) {
    return false;
  }

  const user = await User.findById(userId).select('+twoFactorBackupCodes').exec();
  if (
    !user ||
    !Array.isArray(user.twoFactorBackupCodes) ||
    user.twoFactorBackupCodes.length === 0
  ) {
    return false;
  }

  const candidatesToTest = new Set<string>();
  candidatesToTest.add(cleanCode.toLowerCase());
  candidatesToTest.add(cleanCode.toUpperCase());
  candidatesToTest.add(cleanCode);

  // Support 4-4 hyphenated variant if 8 chars (e.g., XXXX-XXXX)
  if (cleanCode.length === 8) {
    const hyphenated = `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}`;
    candidatesToTest.add(hyphenated);
    candidatesToTest.add(hyphenated.toLowerCase());
    candidatesToTest.add(hyphenated.toUpperCase());
  }

  // Support legacy 32-char formatted candidate
  if (cleanCode.length === 32) {
    const legacyFormatted = cleanCode.match(/.{1,4}/g)!.join('-');
    candidatesToTest.add(legacyFormatted);
    candidatesToTest.add(legacyFormatted.toUpperCase());
  }

  const candidatesList = Array.from(candidatesToTest);

  let matchedHash: string | null = null;
  for (const storedHash of user.twoFactorBackupCodes) {
    let isMatch = false;
    for (const candidate of candidatesList) {
      if (await comparePassword(candidate, storedHash)) {
        isMatch = true;
        break;
      }
    }
    if (isMatch) {
      matchedHash = storedHash;
      break;
    }
  }

  if (!matchedHash) {
    return false;
  }

  // Atomic database consumption to prevent double-spending race conditions
  const result = await User.updateOne(
    {
      _id: userId,
      twoFactorBackupCodes: matchedHash,
    },
    {
      $pull: { twoFactorBackupCodes: matchedHash },
    },
  );

  return result.modifiedCount === 1;
};

export const disable2FA = async (userId: string, token: string, password?: string) => {
  const user = await User.findById(userId).select(
    '+password +twoFactorSecret +twoFactorBackupCodes +twoFactorLastUsedTimestamp',
  );
  if (!user || !user.twoFactorEnabled) {
    throw AppError.badRequest('2FA is not enabled', '2FA_NOT_ENABLED');
  }

  if (!password || typeof password !== 'string' || !password.trim()) {
    throw AppError.badRequest('Current password is required to disable 2FA.');
  }

  {
    let currentHash = '';
    if (typeof user.password === 'string') {
      currentHash = user.password;
    } else if (
      user.password &&
      typeof user.password === 'object' &&
      'cipherText' in (user.password as any)
    ) {
      try {
        currentHash = decryptText(user.password as any);
      } catch (err) {
        logger.warn('Failed to decrypt password hash in disable2FA', { error: err });
      }
    }
    const isPasswordValid = currentHash
      ? await comparePassword(password.trim(), currentHash)
      : false;
    if (!isPasswordValid) {
      throw AppError.unauthorized('Current password is incorrect.', 'INVALID_CREDENTIALS');
    }
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const { isValid: isTotpValid } = verifyOTPWithReplayDefense(
    secret,
    token,
    user.twoFactorLastUsedTimestamp || 0,
  );

  let isValid = isTotpValid;

  if (!isValid) {
    isValid = await consumeBackupCodeAtomic(userId, token);
  }

  if (!isValid) {
    throw AppError.unauthorized('Invalid OTP or backup code', 'INVALID_OTP');
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = null as any;
  user.twoFactorBackupCodes = [];
  user.twoFactorLastUsedTimestamp = 0;

  await user.save();

  logTwoFactorEvent(userId, '2FA_DISABLED', {
    method: isTotpValid ? 'TOTP' : 'BACKUP_CODE',
  });

  return { disabled: true };
};

export const verifyLoginOTP = async (userId: string, token: string) => {
  const user = await User.findById(userId).select(
    '+twoFactorSecret +twoFactorBackupCodes +twoFactorLastUsedTimestamp',
  );
  if (!user || !user.twoFactorEnabled) {
    throw AppError.badRequest('2FA is not enabled', '2FA_NOT_ENABLED');
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const { isValid, matchedTimeStep } = verifyOTPWithReplayDefense(
    secret,
    token,
    user.twoFactorLastUsedTimestamp || 0,
  );

  if (isValid && matchedTimeStep) {
    user.twoFactorLastUsedTimestamp = matchedTimeStep;
    await user.save();
    logTwoFactorEvent(userId, '2FA_VERIFIED', { method: 'TOTP' });
    return true;
  }

  // Atomic backup code consumption
  const isBackupValid = await consumeBackupCodeAtomic(userId, token);
  if (isBackupValid) {
    logTwoFactorEvent(userId, '2FA_VERIFIED', {
      method: 'BACKUP_CODE',
    });
    return true;
  }

  return false;
};
