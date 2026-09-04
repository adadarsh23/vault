// import { useActivityStore, ActivityActionType, ActivityStatus } from '../store/activityStore.ts';
// import { isActivityLoggingEnabled, triggerActivitySync } from './activity-sync.ts';

// const SESSION_KEY = 'personal-vault-session-id';
// const SESSION_NAME_KEY = 'personal-vault-session-name';

// export const getSessionIdentifier = (): string => {
//   if (typeof window === 'undefined') {
//     return 'server-session';
//   }

//   let sessionId = sessionStorage.getItem(SESSION_KEY);
//   if (!sessionId) {
//     sessionId = crypto.randomUUID();
//     sessionStorage.setItem(SESSION_KEY, sessionId);
//   }

//   return sessionId;
// };

// export const setSessionName = (name: string) => {
//   if (typeof window === 'undefined') return;
//   const trimmed = name.trim();
//   if (trimmed) {
//     sessionStorage.setItem(SESSION_NAME_KEY, trimmed);
//   } else {
//     sessionStorage.removeItem(SESSION_NAME_KEY);
//   }
// };

// export const getSessionName = (): string => {
//   if (typeof window === 'undefined') {
//     return 'Server Session';
//   }

//   let sessionName = sessionStorage.getItem(SESSION_NAME_KEY);
//   if (!sessionName) {
//     // Basic local identifier using browser/UA
//     const ua = navigator.userAgent;
//     let label = 'Browser session';
//     if (ua.includes('Chrome')) label = 'Chrome session';
//     else if (ua.includes('Firefox')) label = 'Firefox session';
//     else if (ua.includes('Safari')) label = 'Safari session';
//     else if (ua.includes('Edg')) label = 'Edge session';

//     sessionName = `${label} - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
//     sessionStorage.setItem(SESSION_NAME_KEY, sessionName);
//   }

//   return sessionName;
// };

// interface LogParams {
//   actionType: ActivityActionType;
//   itemName: string;
//   description: string;
//   status: ActivityStatus;
//   userOrSessionId?: string;
//   sessionName?: string;
// }

// export const logActivity = ({
//   actionType,
//   itemName,
//   description,
//   status,
//   userOrSessionId,
//   sessionName,
// }: LogParams) => {
//   if (!isActivityLoggingEnabled()) {
//     return;
//   }

//   useActivityStore.getState().logActivity({
//     actionType,
//     itemName,
//     description,
//     status,
//     userOrSessionId: userOrSessionId || getSessionIdentifier(),
//     sessionName: sessionName || getSessionName(),
//   });

//   triggerActivitySync();
// };

import { useActivityStore, ActivityActionType, ActivityStatus } from '../store/activityStore';
import { isActivityLoggingEnabled, triggerActivitySync } from './activity-sync';
import { logger } from './logger';

// ---------- Constants ----------
const SESSION_KEY = 'personal-vault-session-id';
const SESSION_NAME_KEY = 'personal-vault-session-name';

// ---------- Safe Environment Checks ----------
const isBrowser = (): boolean => typeof window !== 'undefined' && typeof navigator !== 'undefined';

// ---------- Safe Storage ----------
const safeSessionStorage = {
  get: (key: string): string | null => {
    try {
      return isBrowser() ? sessionStorage.getItem(key) : null;
    } catch (error) {
      logger.warn('Unable to read sessionStorage key', { key, error });
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      if (isBrowser()) sessionStorage.setItem(key, value);
    } catch (error) {
      logger.warn('Unable to write sessionStorage key', { key, error });
    }
  },
  remove: (key: string) => {
    try {
      if (isBrowser()) sessionStorage.removeItem(key);
    } catch (error) {
      logger.warn('Unable to remove sessionStorage key', { key, error });
    }
  },
};

// ---------- Helpers ----------
const getUA = (): string => (isBrowser() ? navigator.userAgent || '' : '');

const getOS = (ua: string): string => {
  if (/windows nt/i.test(ua)) return 'Windows';
  if (/mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) return 'macOS';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Unknown OS';
};

const getBrowser = (ua: string): string => {
  const isBrave = isBrowser() && typeof (navigator as any).brave !== 'undefined';

  if (/edg/i.test(ua)) return 'Edge';
  if (/opr|opera/i.test(ua)) return 'Opera';
  if (/vivaldi/i.test(ua)) return 'Vivaldi';
  if (isBrave) return 'Brave';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome|crios|edg/i.test(ua)) return 'Safari';
  if (/chrome|crios/i.test(ua)) return 'Chrome';

  return 'Browser';
};

const getDeviceType = (ua: string): string => {
  if (/mobile/i.test(ua)) return 'Mobile';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  return 'Desktop';
};

const getFormattedTime = (): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch (error) {
    logger.warn('Failed to format time with Intl.DateTimeFormat', { error });
    return new Date().toLocaleTimeString();
  }
};

const generateId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (error) {
    logger.warn('crypto.randomUUID failed, using fallback id generator', { error });
  }

  // fallback for old devices
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

// ---------- Session Core ----------
export const getSessionIdentifier = (): string => {
  if (!isBrowser()) return 'server-session';

  let sessionId = safeSessionStorage.get(SESSION_KEY);

  if (!sessionId) {
    sessionId = generateId();
    safeSessionStorage.set(SESSION_KEY, sessionId);
  }

  return sessionId;
};

export const setSessionName = (name: string) => {
  if (!isBrowser()) return;

  const trimmed = name.trim();

  if (trimmed) {
    safeSessionStorage.set(SESSION_NAME_KEY, trimmed);
  } else {
    safeSessionStorage.remove(SESSION_NAME_KEY);
  }
};

export const getSessionName = (): string => {
  if (!isBrowser()) return 'Server Session';

  let sessionName = safeSessionStorage.get(SESSION_NAME_KEY);

  if (!sessionName) {
    const ua = getUA();

    const label = `${getBrowser(ua)} on ${getOS(ua)} (${getDeviceType(ua)})`;
    sessionName = `${label} - ${getFormattedTime()}`;

    safeSessionStorage.set(SESSION_NAME_KEY, sessionName);
  }

  return sessionName;
};

// ---------- Activity Logging ----------
interface LogParams {
  actionType: ActivityActionType;
  itemName: string;
  description: string;
  status: ActivityStatus;
  userOrSessionId?: string;
  sessionName?: string;
}

export const logActivity = ({
  actionType,
  itemName,
  description,
  status,
  userOrSessionId,
  sessionName,
}: LogParams) => {
  if (!isActivityLoggingEnabled()) return;

  try {
    useActivityStore.getState().logActivity({
      actionType,
      itemName,
      description,
      status,
      userOrSessionId: userOrSessionId || getSessionIdentifier(),
      sessionName: sessionName || getSessionName(),
      timestamp: Date.now(),
    });

    triggerActivitySync();
  } catch (error) {
    logger.error('Activity logging failed', { error });
  }
};
