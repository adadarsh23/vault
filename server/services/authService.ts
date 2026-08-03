import { createHash, randomUUID } from 'crypto';
import { User, UserDocument } from '../models/user.ts';
import { RefreshToken } from '../models/RefreshToken.ts';
import {
  createAccessToken,
  createRefreshToken,
  getRefreshCookieMaxAgeMs,
  createMfaToken,
} from '../utils/auth.ts';
import { comparePassword, hashPassword, encryptText, decryptText } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { initializeDefaultUserFolders } from './folderService.ts';
import { createNotification } from './notificationService.ts';

// Helper to hash refresh tokens
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const FALLBACK_DEVICE_ID = 'unknown-device';

const normalizeSessionDeviceId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return FALLBACK_DEVICE_ID;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_DEVICE_ID;
};

export const parseDeviceNameFromUserAgent = (userAgent?: string): string => {
  if (!userAgent || typeof userAgent !== 'string') {
    return 'Web Client';
  }

  const ua = userAgent.trim();
  if (!ua) return 'Web Client';

  // 1. Detect Crawlers, Bots & API Clients
  if (/googlebot/i.test(ua)) return 'Googlebot Crawler';
  if (/bingbot/i.test(ua)) return 'Bingbot Crawler';
  if (/duckduckbot/i.test(ua)) return 'DuckDuckBot Crawler';
  if (/yandexbot/i.test(ua)) return 'YandexBot Crawler';
  if (/postmanruntime/i.test(ua)) return 'Postman API Client';
  if (/insomnia/i.test(ua)) return 'Insomnia API Client';
  if (/curl\//i.test(ua)) return 'Curl Command Line';
  if (/wget\//i.test(ua)) return 'Wget Downloader';
  if (/python-requests/i.test(ua)) return 'Python Script Client';
  if (/axios/i.test(ua)) return 'Axios HTTP Client';

  // 2. Detect In-App Browsers & Desktop Electron Shells
  let inApp = '';
  if (/instagram/i.test(ua)) inApp = 'Instagram App';
  else if (/fb_iab|fbav/i.test(ua)) inApp = 'Facebook App';
  else if (/tiktok/i.test(ua)) inApp = 'TikTok App';
  else if (/linkedinapp/i.test(ua)) inApp = 'LinkedIn App';
  else if (/micromessenger/i.test(ua)) inApp = 'WeChat App';
  else if (/line\//i.test(ua)) inApp = 'Line App';
  else if (/snapchat/i.test(ua)) inApp = 'Snapchat App';
  else if (/electron/i.test(ua)) {
    if (/vscode/i.test(ua)) inApp = 'VS Code Desktop';
    else if (/slack/i.test(ua)) inApp = 'Slack Desktop';
    else if (/discord/i.test(ua)) inApp = 'Discord Desktop';
    else inApp = 'Electron Desktop App';
  }

  // 3. Operating System & Version / Model Extraction
  let os = 'Unknown OS';
  let osVersion = '';

  if (/windows nt 10\.0/i.test(ua)) {
    os = 'Windows 10/11';
    if (/x64|win64/i.test(ua)) os += ' (64-bit)';
    else if (/arm64/i.test(ua)) os += ' (ARM64)';
  } else if (/windows nt 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/windows nt 6\.2/i.test(ua)) {
    os = 'Windows 8';
  } else if (/windows nt 6\.1/i.test(ua)) {
    os = 'Windows 7';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/iphone/i.test(ua)) {
    os = 'iOS (iPhone)';
    const verMatch = ua.match(/os (\d+[_.]\d+)/i);
    if (verMatch) osVersion = `iOS ${verMatch[1].replace('_', '.')}`;
  } else if (/ipad/i.test(ua)) {
    os = 'iPadOS (iPad)';
    const verMatch = ua.match(/os (\d+[_.]\d+)/i);
    if (verMatch) osVersion = `iPadOS ${verMatch[1].replace('_', '.')}`;
  } else if (/mac os x|macintosh/i.test(ua)) {
    os = 'macOS';
    const verMatch = ua.match(/mac os x (\d+[_.]\d+([_.]\d+)?)/i);
    if (verMatch) {
      const ver = verMatch[1].replace(/_/g, '.');
      if (ver.startsWith('14')) os = 'macOS Sonoma';
      else if (ver.startsWith('13')) os = 'macOS Ventura';
      else if (ver.startsWith('12')) os = 'macOS Monterey';
      else if (ver.startsWith('11')) os = 'macOS Big Sur';
      else os = `macOS ${ver}`;
    }
  } else if (/android/i.test(ua)) {
    os = 'Android';
    const verMatch = ua.match(/android (\d+(\.\d+)?)/i);
    if (verMatch) os = `Android ${verMatch[1]}`;

    if (/pixel 8/i.test(ua)) os += ' (Google Pixel 8)';
    else if (/pixel 7/i.test(ua)) os += ' (Google Pixel 7)';
    else if (/pixel 6/i.test(ua)) os += ' (Google Pixel 6)';
    else if (/sm-s918|sm-s928/i.test(ua)) os += ' (Samsung Galaxy S Ultra)';
    else if (/sm-g998|sm-g988/i.test(ua)) os += ' (Samsung Galaxy)';
  } else if (/cros/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/ubuntu/i.test(ua)) {
    os = 'Ubuntu Linux';
  } else if (/fedora/i.test(ua)) {
    os = 'Fedora Linux';
  } else if (/debian/i.test(ua)) {
    os = 'Debian Linux';
  } else if (/arch/i.test(ua)) {
    os = 'Arch Linux';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  } else if (/playstation 5/i.test(ua)) {
    os = 'PlayStation 5';
  } else if (/playstation 4/i.test(ua)) {
    os = 'PlayStation 4';
  } else if (/xbox/i.test(ua)) {
    os = 'Xbox';
  } else if (/nintendo switch/i.test(ua)) {
    os = 'Nintendo Switch';
  }

  // 4. Browser & Major Version Extraction
  let browser = 'Web Browser';

  if (inApp) {
    browser = inApp;
  } else if (/brave/i.test(ua)) {
    const verMatch = ua.match(/brave\/(\d+)/i) || ua.match(/chrome\/(\d+)/i);
    browser = verMatch ? `Brave ${verMatch[1]}` : 'Brave';
  } else if (/edg\//i.test(ua)) {
    const verMatch = ua.match(/edg\/(\d+)/i);
    browser = verMatch ? `Edge ${verMatch[1]}` : 'Microsoft Edge';
  } else if (/edga/i.test(ua)) {
    browser = 'Edge Mobile';
  } else if (/edgios/i.test(ua)) {
    browser = 'Edge iOS';
  } else if (/samsungbrowser/i.test(ua)) {
    const verMatch = ua.match(/samsungbrowser\/(\d+)/i);
    browser = verMatch ? `Samsung Internet ${verMatch[1]}` : 'Samsung Internet';
  } else if (/opr\/|opera/i.test(ua)) {
    const verMatch = ua.match(/opr\/(\d+)/i) || ua.match(/opera\/(\d+)/i);
    browser = verMatch ? `Opera ${verMatch[1]}` : 'Opera';
  } else if (/vivaldi/i.test(ua)) {
    const verMatch = ua.match(/vivaldi\/(\d+)/i);
    browser = verMatch ? `Vivaldi ${verMatch[1]}` : 'Vivaldi';
  } else if (/yabrowser/i.test(ua)) {
    const verMatch = ua.match(/yabrowser\/(\d+)/i);
    browser = verMatch ? `Yandex ${verMatch[1]}` : 'Yandex Browser';
  } else if (/ucbrowser/i.test(ua)) {
    const verMatch = ua.match(/ucbrowser\/(\d+)/i);
    browser = verMatch ? `UC Browser ${verMatch[1]}` : 'UC Browser';
  } else if (/duckduckgo/i.test(ua)) {
    browser = 'DuckDuckGo Browser';
  } else if (/arc\//i.test(ua)) {
    browser = 'Arc Browser';
  } else if (/fxios/i.test(ua)) {
    browser = 'Firefox iOS';
  } else if (/firefox/i.test(ua)) {
    const verMatch = ua.match(/firefox\/(\d+)/i);
    browser = verMatch ? `Firefox ${verMatch[1]}` : 'Mozilla Firefox';
  } else if (/chrome|crios/i.test(ua)) {
    const verMatch = ua.match(/chrome\/(\d+)/i) || ua.match(/crios\/(\d+)/i);
    browser = verMatch ? `Chrome ${verMatch[1]}` : 'Google Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    const verMatch = ua.match(/version\/(\d+(\.\d+)?)/i);
    browser = verMatch ? `Safari ${verMatch[1]}` : 'Apple Safari';
  }

  if (osVersion) {
    os = osVersion;
  }

  if (browser && os) {
    return `${browser} on ${os}`;
  }
  return browser || os || 'Web Client';
};

const buildMetaState = (meta: UserDocument['meta']) => ({
  registeredAt: meta?.registeredAt ?? new Date(),
  lastLoginAt: meta?.lastLoginAt ?? null,
  lastFailedLoginAt: meta?.lastFailedLoginAt ?? null,
  lastFailedLoginIp: meta?.lastFailedLoginIp ?? null,
  lastSyncAt: meta?.lastSyncAt ?? null,
  lastCredentialChangeAt: meta?.lastCredentialChangeAt ?? new Date(),
  activeDevices: meta?.activeDevices ?? [],
  accountStatus: meta?.accountStatus ?? 'active',
  profileVersion: meta?.profileVersion ?? 2,
  masterKey: meta?.masterKey ?? null,
  masterKeyHash: meta?.masterKeyHash ?? null,
});

/**
 * Issues or rotates a user session
 */
export const issueUserSession = (
  user: UserDocument,
  input: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
    existingSessionId?: string;
    familyId?: string;
    deviceName?: string;
  }
): {
  sessionId: string;
  familyId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getRefreshCookieMaxAgeMs());
  const sessionId = input.existingSessionId || randomUUID();
  const familyId = input.familyId || randomUUID();
  const normalizedDeviceId = normalizeSessionDeviceId(input.deviceId);
  const computedDeviceName =
    typeof input.deviceName === 'string' && input.deviceName.trim()
      ? input.deviceName.trim()
      : parseDeviceNameFromUserAgent(input.userAgent);

  const refreshToken = createRefreshToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
    deviceId: normalizedDeviceId,
  });

  const refreshTokenHash = hashRefreshToken(refreshToken);

  const accessToken = createAccessToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
  });

  const sessionData = {
    sessionId,
    familyId,
    deviceId: normalizedDeviceId,
    deviceName: computedDeviceName,
    refreshTokenHash,
    createdAt: now,
    lastUsedAt: now,
    lastRotatedAt: now,
    expiresAt,
    revokedAt: null,
    ipAddress: input.ipAddress ?? 'unknown',
    userAgent: input.userAgent ?? 'unknown',
    loginMethod: input.existingSessionId ? 'refresh' : 'password',
    requestContext: {
      ipAddress: input.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? 'unknown',
    },
  };

  // Ensure sessions array exists
  if (!user.sessions) user.sessions = [] as any;

  const sessionIndex = user.sessions.findIndex((s) => s.sessionId === sessionId);
  if (sessionIndex >= 0) {
    user.sessions[sessionIndex] = sessionData as any;
  } else {
    user.sessions.unshift(sessionData as any);
  }

  // Create RefreshToken document in collection for lineage and breach containment tracking
  RefreshToken.create({
    userId: user._id,
    familyId,
    sessionId,
    tokenHash: refreshTokenHash,
    isRevoked: false,
    ip: input.ipAddress ?? 'unknown',
    userAgent: input.userAgent ?? 'unknown',
    expiresAt,
  }).catch((err) => {
    logger.warn('Failed to save RefreshToken document in DB', { error: err });
  });

  return { sessionId, familyId, accessToken, refreshToken, expiresAt };
};

/**
 * Authenticates user and returns tokens
 */
export const authenticateUser = async (input: {
  username: string;
  password: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const deviceId = normalizeSessionDeviceId(input.deviceId);
  const identifier = (input.username || '').trim().toLowerCase();

  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  })
    .select('+password')
    .exec();

  if (!user) {
    throw AppError.unauthorized('Invalid username or password.', 'INVALID_CREDENTIALS');
  }

  const storedHash = decryptText(user.password as any);
  const isValid = await comparePassword(input.password, storedHash);

  if (!isValid) {
    if (!user.loginHistory) user.loginHistory = [] as any;
    user.loginHistory.unshift({
      loggedInAt: new Date(),
      ipAddress: input.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? 'unknown',
      deviceId,
      status: 'FAILED',
      errorCode: 'INVALID_CREDENTIALS',
      failureReason: 'Invalid username or password.',
      requestContext: {
        ipAddress: input.ipAddress ?? 'unknown',
        userAgent: input.userAgent ?? 'unknown',
      },
    } as any);
    user.meta = {
      ...buildMetaState(user.meta),
      lastFailedLoginAt: new Date(),
      lastFailedLoginIp: input.ipAddress ?? 'unknown',
    };
    await user.save();

    throw AppError.unauthorized('Invalid username or password.', 'INVALID_CREDENTIALS');
  }

  if (user.twoFactorEnabled) {
    const mfaToken = createMfaToken({
      sub: user._id.toString(),
      username: user.username,
    });

    return {
      twoFactorRequired: true,
      userId: user._id,
      username: user.username,
      mfaToken,
    };
  }

  const session = issueUserSession(user, {
    deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  if (!user.loginHistory) user.loginHistory = [] as any;
  user.loginHistory.unshift({
    loggedInAt: new Date(),
    ipAddress: input.ipAddress ?? 'unknown',
    userAgent: input.userAgent ?? 'unknown',
    deviceId,
    sessionId: session.sessionId,
    status: 'SUCCESS',
    errorCode: null,
    failureReason: null,
    requestContext: {
      ipAddress: input.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? 'unknown',
    },
  } as any);

  if (user.loginHistory.length > 50) {
    user.loginHistory = user.loginHistory.slice(0, 50) as any;
  }

  user.meta = {
    ...buildMetaState(user.meta),
    lastLoginAt: new Date(),
  };

  await user.save();

  try {
    const ip = input.ipAddress || 'unknown';
    const deviceName = input.deviceId || 'Web Client';
    await createNotification(
      user._id.toString(),
      'device_login',
      'New Device Login',
      `A new login session was established on device "${deviceName}" from IP: ${ip}`
    );
  } catch (err) {
    logger.warn('Failed to create login notification', { error: err });
  }

  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    familyId: session.familyId,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      meta: user.meta,
    },
  };
};

/**
 * Registers a new user with required vault fields and validation
 */
export const registerUser = async (input: {
  username?: string;
  email?: string;
  password: string;
  fullName?: string;
  profileName?: string;
  masterKey?: string;
  pqcSalt?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  websiteMetadata?: any;
}) => {
  const deviceId = normalizeSessionDeviceId(input.deviceId);
  const rawIdentifier = (input.email || input.username || '').trim().toLowerCase();

  if (!rawIdentifier) {
    throw AppError.badRequest('Username or email is required.', 'AUTH_MISSING_CREDENTIALS');
  }

  if (typeof input.password !== 'string' || input.password.length < 8) {
    throw AppError.badRequest('Password must be at least 8 characters long.', 'AUTH_WEAK_PASSWORD');
  }

  const username = (input.username || rawIdentifier.split('@')[0] || rawIdentifier)
    .trim()
    .toLowerCase();
  const email = input.email
    ? input.email.trim().toLowerCase()
    : rawIdentifier.includes('@')
      ? rawIdentifier
      : undefined;
  const masterKey = (input.masterKey || 'default-vault-master-key-2026').trim();
  const pqcSalt =
    typeof input.pqcSalt === 'string' && input.pqcSalt.trim()
      ? input.pqcSalt.trim()
      : `${username}-vault-pqc-salt`;

  logger.info('Registration attempt started', { username, email });

  const existing = await User.findOne({
    $or: [{ username }, ...(email ? [{ email }] : [])],
  });

  if (existing) {
    logger.warn('Registration rejected - duplicate email/username', { username, email });
    throw AppError.conflict('Email already registered', 'USER_EXISTS');
  }

  const hashedPassword = await hashPassword(input.password);
  const encryptedPassword = encryptText(hashedPassword);
  const encryptedMasterKey = encryptText(masterKey);

  const user = new User({
    username,
    email,
    pqcSalt,
    profileName: input.fullName || input.profileName || 'none',
    password: encryptedPassword,
    masterKey: encryptedMasterKey,
    meta: {
      registeredAt: new Date(),
      lastLoginAt: new Date(),
      lastFailedLoginAt: null,
      lastFailedLoginIp: null,
      lastSyncAt: null,
      lastCredentialChangeAt: new Date(),
      activeDevices: [deviceId],
      accountStatus: 'active',
      profileVersion: 2,
      masterKey: encryptedMasterKey,
      masterKeyHash: encryptText(await hashPassword(masterKey)),
    },
    loginHistory: [
      {
        loggedInAt: new Date(),
        ipAddress: input.ipAddress ?? 'unknown',
        userAgent: input.userAgent ?? 'unknown',
        deviceId,
        status: 'SUCCESS',
        requestContext: {
          ipAddress: input.ipAddress ?? 'unknown',
          userAgent: input.userAgent ?? 'unknown',
        },
      },
    ],
    vault: {
      photos: [],
      videos: [],
      audios: [],
      documents: [],
      otherFiles: [],
      notes: [],
      chats: [],
      todos: [],
      passwords: [],
      secretKeys: [],
      location: [],
      contact: [],
    },
  });

  const session = issueUserSession(user, {
    deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await user.save();
  await initializeDefaultUserFolders(user._id.toString(), user.username);

  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    familyId: session.familyId,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      meta: user.meta,
    },
    created: true,
  };
};
