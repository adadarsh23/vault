const generateDeviceId = (): string => {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  }

  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

/**
 * Generates a stable device fingerprint for token binding.
 * Combined factors: User-Agent, Screen Resolution, Platform, and a persistent Random ID.
 */
export const getDeviceFingerprint = (): string => {
  if (typeof window === 'undefined') return 'unknown';

  let deviceId: string | null = null;
  try {
    deviceId = localStorage.getItem('vault_device_id');
  } catch {
    deviceId = null;
  }

  if (!deviceId) {
    deviceId = generateDeviceId();
    try {
      localStorage.setItem('vault_device_id', deviceId);
    } catch {
      // Ignore storage write failures (private mode / storage restrictions).
    }
  }

  const factors = [
    navigator.userAgent,
    `${window.screen.width}x${window.screen.height}`,
    navigator.platform,
    deviceId
  ];

  return factors.join('|');
};

/**
 * Basic hash function to shorten the fingerprint for URL transmission
 */
export const hashFingerprint = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};
