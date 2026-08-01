import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { User } from "../models/user.ts";
import { encryptText, decryptText, comparePassword, hashPassword } from "../utils/crypto.ts";
import { AppError } from "../utils/appError.ts";
import { logger } from "../utils/logger.ts";
import crypto from "crypto";

const logTwoFactorEvent = (userId: string, action: string, details?: Record<string, unknown>) => {
  logger.info(`2FA event: ${action}`, { userId, ...details });
};

export const generate2FASecret = async (username: string) => {
  const secret = speakeasy.generateSecret({
    name: `Vault (${username})`,
    issuer: "Vault",
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || "");
  
  return {
    secret: secret.base32,
    qrCodeUrl,
  };
};

export const verifyOTP = (secret: string, token: string): boolean => {
  const sanitizedSecret = secret.trim();
  const sanitizedToken = token.trim().replace(/\s/g, ""); // Remove any potential spaces
  
  return speakeasy.totp.verify({
    secret: sanitizedSecret,
    encoding: "base32",
    token: sanitizedToken,
    window: 2, // Allow 2 steps before/after (30s window * 5 = 150s total window) to accommodate clock drift
  });
};

export const generateBackupCodes = async (): Promise<{ plain: string[]; hashed: string[] }> => {
  const codes: string[] = [];
  const hashedCodes: string[] = [];
  
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString("hex"); // 8 chars
    codes.push(code);
    hashedCodes.push(await hashPassword(code));
  }
  
  return { plain: codes, hashed: hashedCodes };
};

export const encryptSecret = (secret: string) => {
  return encryptText(secret);
};

export const decryptSecret = (encryptedPayload: any) => {
  return decryptText(encryptedPayload);
};

export const setup2FA = async (userId: string, username: string) => {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound("User not found");

  const { secret, qrCodeUrl } = await generate2FASecret(username);
  
  // Store as temp secret
  user.twoFactorTempSecret = encryptSecret(secret) as any;
  await user.save();

  logTwoFactorEvent(userId, "2FA_SETUP_INITIATED", {
    username,
  });

  return { qrCodeUrl, secret }; // Secret is base32
}

export const verifyAndEnable2FA = async (userId: string, token: string) => {
  const user = await User.findById(userId).select("+twoFactorTempSecret");
  if (!user || !user.twoFactorTempSecret) {
    throw AppError.badRequest("2FA setup not initiated", "2FA_NOT_INITIATED");
  }

  const secret = decryptSecret(user.twoFactorTempSecret);
  const isValid = verifyOTP(secret, token);

  if (!isValid) {
    logger.warn("2FA Setup Verification failed", {
      userId,
      serverTime: new Date().toISOString(),
      tokenReceived: token.length === 6 ? "******" : "invalid-length",
    });
    throw AppError.unauthorized("Invalid OTP", "INVALID_OTP");
  }

  const { plain: backupCodes, hashed: hashedBackupCodes } = await generateBackupCodes();

  user.twoFactorSecret = user.twoFactorTempSecret;
  user.twoFactorTempSecret = null as any;
  user.twoFactorEnabled = true;
  user.twoFactorBackupCodes = hashedBackupCodes;
  
  await user.save();

  logTwoFactorEvent(userId, "2FA_ENABLED", {
    method: "TOTP",
    backupCodesGenerated: 10
  });

  return { backupCodes };
}

export const disable2FA = async (userId: string, token: string) => {
  const user = await User.findById(userId).select("+twoFactorSecret +twoFactorBackupCodes");
  if (!user || !user.twoFactorEnabled) {
    throw AppError.badRequest("2FA is not enabled", "2FA_NOT_ENABLED");
  }

  const secret = decryptSecret(user.twoFactorSecret);
  let isValid = verifyOTP(secret, token);

  if (!isValid) {
    // Check backup codes
    for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
      const hashedCode = user.twoFactorBackupCodes[i];
      if (await comparePassword(token, hashedCode)) {
        // Used a backup code, remove it (though we're disabling 2FA anyway)
        user.twoFactorBackupCodes.splice(i, 1);
        isValid = true;
        break;
      }
    }
  }

  if (!isValid) {
    throw AppError.unauthorized("Invalid OTP or backup code", "INVALID_OTP");
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = null as any;
  user.twoFactorBackupCodes = [];
  
  await user.save();

  logTwoFactorEvent(userId, "2FA_DISABLED", {
    method: "TOTP"
  });

  return { disabled: true };
}

export const verifyLoginOTP = async (userId: string, token: string) => {
  const user = await User.findById(userId).select("+twoFactorSecret +twoFactorBackupCodes");
  if (!user || !user.twoFactorEnabled) {
    throw AppError.badRequest("2FA is not enabled", "2FA_NOT_ENABLED");
  }

  const secret = decryptSecret(user.twoFactorSecret);
  const isValid = verifyOTP(secret, token);

  if (isValid) {
    logTwoFactorEvent(userId, "2FA_VERIFIED", { method: "TOTP" });
    return true;
  }

  // Check backup codes
  for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
    const hashedCode = user.twoFactorBackupCodes[i];
    if (await comparePassword(token, hashedCode)) {
      // Used a backup code, remove it
      user.twoFactorBackupCodes.splice(i, 1);
      await user.save();
      logTwoFactorEvent(userId, "2FA_VERIFIED", { 
        method: "BACKUP_CODE",
        remainingCodes: user.twoFactorBackupCodes.length 
      });
      return true;
    }
  }

  return false;
};
