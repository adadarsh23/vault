/**
 * Frontend Security Integration
 *
 * React components for:
 * - Device fingerprinting
 * - MFA challenges
 * - Security settings
 * - Device management
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import apiClient from '../api/apiClient';

type MFAMethod = 'totp' | 'email' | 'fido2';

type DeviceSignals = {
  screenResolution: string;
  timezone: string;
  platform: string;
  language: string;
  webglRenderer: string;
  canvasFingerprint: string;
  audioContextAvailable: boolean;
  colorDepth: number;
  timezoneOffset: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
};

type ManagedDevice = {
  id: string;
  name: string;
  trustScore: number;
  lastSeen: string | number | Date;
  accessCount: number;
  isVerified: boolean;
  platform?: string | null;
};

type DeviceListResponse = {
  devices?: ManagedDevice[];
};

type SecuritySettingsState = {
  mfaEnabled: boolean;
  mfaMethods: MFAMethod[];
  loginAlerts: boolean;
  suspiciousActivityAlerts: boolean;
  twoFactorRequired: boolean;
  sessionTimeout: number;
};

type SecurityToggleKey = 'mfaEnabled' | 'loginAlerts' | 'suspiciousActivityAlerts';

const STORAGE_DEVICE_FINGERPRINT_KEY = 'deviceFingerprint';
const FALLBACK_PLATFORM = 'unknown';
const FALLBACK_TIMEZONE = 'UTC';
const DEFAULT_SECURITY_SETTINGS: SecuritySettingsState = {
  mfaEnabled: false,
  mfaMethods: ['totp', 'email'],
  loginAlerts: true,
  suspiciousActivityAlerts: true,
  twoFactorRequired: false,
  sessionTimeout: 3600,
};

type RequestHeaderValue = string | number | boolean | null;
type RequestHeaderRecord = Record<string, RequestHeaderValue>;

let cachedFingerprint: string | null = null;
let pendingFingerprintPromise: Promise<string> | null = null;

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof document !== 'undefined';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const candidate = error as { message?: string; error?: { message?: string } } | undefined;
  if (typeof candidate?.error?.message === 'string' && candidate.error.message.trim()) {
    return candidate.error.message;
  }

  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  return fallback;
};

const safeReadSessionValue = (key: string): string | null => {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeWriteSessionValue = (key: string, value: string): void => {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore write failures (private mode / storage restrictions).
  }
};

const createFallbackFingerprint = () => {
  const timestamp = Date.now().toString(36);

  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const randomHex = Array.from(bytes)
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      return `fp_${timestamp}_${randomHex}`;
    }
  } catch {
    // Ignore and fallback to Math.random below.
  }

  return `fp_${timestamp}_${Math.random().toString(36).slice(2, 16)}`;
};

const resolveWebGLRenderer = (canvas: HTMLCanvasElement): string => {
  try {
    const context =
      canvas.getContext('webgl') ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!context) {
      return 'unknown';
    }

    const debugInfo = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
    } | null;

    if (!debugInfo) {
      return 'unknown';
    }

    const renderer = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' && renderer.trim() ? renderer : 'unknown';
  } catch {
    return 'unknown';
  }
};

const collectDeviceSignals = (): DeviceSignals => {
  const canvas = document.createElement('canvas');
  const context2d = canvas.getContext('2d');
  let canvasFingerprint = '';

  if (context2d) {
    context2d.textBaseline = 'top';
    context2d.font = '14px "Arial"';
    context2d.textBaseline = 'alphabetic';
    context2d.fillStyle = '#f60';
    context2d.fillRect(125, 1, 62, 20);
    context2d.fillStyle = '#069';
    context2d.fillText('Browser Fingerprint', 2, 15);
    canvasFingerprint = canvas.toDataURL();
  }

  const webglRenderer = resolveWebGLRenderer(canvas);
  const navigatorWithDeviceMemory = navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE,
    platform: navigator.platform || FALLBACK_PLATFORM,
    language: navigator.language || 'unknown',
    webglRenderer,
    canvasFingerprint,
    audioContextAvailable: 'AudioContext' in window || 'webkitAudioContext' in window,
    colorDepth: window.screen.colorDepth,
    timezoneOffset: new Date().getTimezoneOffset(),
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    deviceMemoryGb:
      typeof navigatorWithDeviceMemory.deviceMemory === 'number'
        ? navigatorWithDeviceMemory.deviceMemory
        : null,
  };
};

const hashSignals = async (signals: DeviceSignals): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') {
    return createFallbackFingerprint();
  }

  const signalString = JSON.stringify(signals);
  const buffer = new TextEncoder().encode(signalString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((value) => value.toString(16).padStart(2, '0')).join('');
};

const resolveDeviceFingerprint = async (): Promise<string> => {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  const stored = safeReadSessionValue(STORAGE_DEVICE_FINGERPRINT_KEY);
  if (stored) {
    cachedFingerprint = stored;
    return stored;
  }

  if (!isBrowserEnvironment()) {
    cachedFingerprint = createFallbackFingerprint();
    return cachedFingerprint;
  }

  if (!pendingFingerprintPromise) {
    pendingFingerprintPromise = (async () => {
      try {
        const signals = collectDeviceSignals();
        const fingerprint = await hashSignals(signals);
        cachedFingerprint = fingerprint;
        safeWriteSessionValue(STORAGE_DEVICE_FINGERPRINT_KEY, fingerprint);
        return fingerprint;
      } catch (error) {
        console.error('[FINGERPRINT] Generation failed', error);
        const fallbackFingerprint = createFallbackFingerprint();
        cachedFingerprint = fallbackFingerprint;
        safeWriteSessionValue(STORAGE_DEVICE_FINGERPRINT_KEY, fallbackFingerprint);
        return fallbackFingerprint;
      }
    })().finally(() => {
      pendingFingerprintPromise = null;
    });
  }

  return pendingFingerprintPromise;
};

const buildSecurityHeaders = (fingerprint: string): Record<string, string> => {
  const screenResolution = isBrowserEnvironment()
    ? `${window.screen.width}x${window.screen.height}`
    : 'unknown';
  const timezone = isBrowserEnvironment()
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE
    : FALLBACK_TIMEZONE;
  const platform = isBrowserEnvironment()
    ? navigator.platform || FALLBACK_PLATFORM
    : FALLBACK_PLATFORM;

  return {
    'X-Fingerprint-Id': fingerprint,
    'X-Screen-Resolution': screenResolution,
    'X-Timezone': timezone,
    'X-Platform': platform,
  };
};

const normalizeTrustScore = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

const formatLastSeen = (value: unknown): string => {
  const parsedDate = new Date(value as string | number | Date);
  return Number.isFinite(parsedDate.getTime()) ? parsedDate.toLocaleString() : 'Unknown';
};

const normalizeSecuritySettings = (input: unknown): SecuritySettingsState => {
  const candidate = (input ?? {}) as Partial<SecuritySettingsState>;
  const methodCandidates = Array.isArray(candidate.mfaMethods)
    ? candidate.mfaMethods
    : DEFAULT_SECURITY_SETTINGS.mfaMethods;
  const validMethods = methodCandidates.filter(
    (method): method is MFAMethod => method === 'totp' || method === 'email' || method === 'fido2',
  );

  return {
    mfaEnabled:
      typeof candidate.mfaEnabled === 'boolean'
        ? candidate.mfaEnabled
        : DEFAULT_SECURITY_SETTINGS.mfaEnabled,
    mfaMethods: validMethods.length > 0 ? validMethods : DEFAULT_SECURITY_SETTINGS.mfaMethods,
    loginAlerts:
      typeof candidate.loginAlerts === 'boolean'
        ? candidate.loginAlerts
        : DEFAULT_SECURITY_SETTINGS.loginAlerts,
    suspiciousActivityAlerts:
      typeof candidate.suspiciousActivityAlerts === 'boolean'
        ? candidate.suspiciousActivityAlerts
        : DEFAULT_SECURITY_SETTINGS.suspiciousActivityAlerts,
    twoFactorRequired:
      typeof candidate.twoFactorRequired === 'boolean'
        ? candidate.twoFactorRequired
        : DEFAULT_SECURITY_SETTINGS.twoFactorRequired,
    sessionTimeout:
      typeof candidate.sessionTimeout === 'number' &&
      Number.isFinite(candidate.sessionTimeout) &&
      candidate.sessionTimeout > 0
        ? Math.round(candidate.sessionTimeout)
        : DEFAULT_SECURITY_SETTINGS.sessionTimeout,
  };
};

/**
 * Hook: Generate device fingerprint
 * Collects hardware/browser signals and generates unique ID
 */
export const useDeviceFingerprint = () => {
  const [fingerprint, setFingerprint] = useState<string | null>(() => {
    if (cachedFingerprint) {
      return cachedFingerprint;
    }

    return safeReadSessionValue(STORAGE_DEVICE_FINGERPRINT_KEY);
  });
  const [loading, setLoading] = useState(() => fingerprint === null);

  useEffect(() => {
    let isMounted = true;

    const generateFingerprint = async () => {
      try {
        const value = await resolveDeviceFingerprint();
        if (!isMounted) {
          return;
        }

        setFingerprint(value);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void generateFingerprint();

    return () => {
      isMounted = false;
    };
  }, []);

  return { fingerprint, loading };
};

/**
 * Hook: Build request config with security headers
 */
export const useSecureRequest = () => {
  const { fingerprint } = useDeviceFingerprint();

  return useCallback(
    async (config: AxiosRequestConfig = {}): Promise<AxiosRequestConfig> => {
      if (!fingerprint) {
        return config;
      }

      return {
        ...config,
        headers: {
          ...(config.headers as RequestHeaderRecord | undefined),
          ...buildSecurityHeaders(fingerprint),
        },
      };
    },
    [fingerprint],
  );
};

/**
 * Component: MFA Challenge Modal
 */
export const MFAChallenge: React.FC<{
  onComplete: (code: string) => void;
  method: MFAMethod;
}> = ({ onComplete, method }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (code.length !== 6) {
      setError('Enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiClient.post('/security/mfa/verify', { code, method });
      onComplete(code);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mfa-challenge">
      <h2>Two-Factor Authentication</h2>
      <p>Enter your {method === 'totp' ? 'authenticator app' : method} code:</p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
          disabled={loading}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
        />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading || code.length !== 6}>
          {loading ? 'Verifying...' : 'Verify'}
        </button>
      </form>
    </div>
  );
};

/**
 * Component: Device Management
 */
export const DeviceManagement: React.FC = () => {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [forgettingAll, setForgettingAll] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<DeviceListResponse>('/security/devices');
      const receivedDevices = Array.isArray(response.data?.devices) ? response.data.devices : [];
      setDevices(receivedDevices);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, 'Failed to fetch trusted devices.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  const handleForgetDevice = async (deviceId: string) => {
    if (pendingDeviceId || forgettingAll) {
      return;
    }

    if (!window.confirm('Forget this device? You will need to verify again on next login.')) {
      return;
    }

    setPendingDeviceId(deviceId);
    try {
      await apiClient.delete(`/security/devices/${encodeURIComponent(deviceId)}`);
      setDevices((currentDevices) => currentDevices.filter((device) => device.id !== deviceId));
      toast.success('Device forgotten');
    } catch (forgetError) {
      toast.error(getErrorMessage(forgetError, 'Failed to forget device.'));
    } finally {
      setPendingDeviceId(null);
    }
  };

  const handleLogoutAllOthers = async () => {
    if (pendingDeviceId || forgettingAll) {
      return;
    }

    if (!window.confirm('Logout from all other devices?')) {
      return;
    }

    setForgettingAll(true);
    try {
      await apiClient.post('/security/devices/forget-all');
      toast.success('Logged out from other devices');
      await fetchDevices();
    } catch (forgetAllError) {
      toast.error(getErrorMessage(forgetAllError, 'Failed to logout from other devices.'));
    } finally {
      setForgettingAll(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  if (error) {
    return (
      <div className="device-management">
        <h2>Trusted Devices</h2>
        <p className="error">{error}</p>
        <button onClick={() => void fetchDevices()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="device-management">
      <h2>Trusted Devices</h2>

      {devices.length === 0 ? (
        <p>No trusted devices yet. Log in from a new device to add one.</p>
      ) : (
        <div className="device-list">
          {devices.map((device) => (
            <div key={device.id} className="device-card">
              <div className="device-info">
                <h3>{device.name}</h3>
                <p>Trust Score: {normalizeTrustScore(device.trustScore)}%</p>
                <p>Last Seen: {formatLastSeen(device.lastSeen)}</p>
                <p>Accesses: {Math.max(0, Math.floor(device.accessCount || 0))}</p>
                {device.isVerified && <span className="badge verified">Verified</span>}
              </div>
              <button
                onClick={() => void handleForgetDevice(device.id)}
                className="btn-danger"
                disabled={pendingDeviceId === device.id || forgettingAll}
              >
                {pendingDeviceId === device.id ? 'Forgetting...' : 'Forget'}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => void handleLogoutAllOthers()}
        className="btn-danger btn-block"
        disabled={forgettingAll || pendingDeviceId !== null}
      >
        {forgettingAll ? 'Logging Out Other Devices...' : 'Logout from All Other Devices'}
      </button>
    </div>
  );
};

/**
 * Component: Security Settings
 */
export const SecuritySettings: React.FC = () => {
  const [settings, setSettings] = useState<SecuritySettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<Partial<SecuritySettingsState>>('/security/settings');
      setSettings(normalizeSecuritySettings(response.data));
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, 'Failed to fetch settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async (key: SecurityToggleKey) => {
    if (!settings || saving) {
      return;
    }

    const previousSettings = settings;
    const nextSettings: SecuritySettingsState = {
      ...settings,
      [key]: !settings[key],
    };

    setSettings(nextSettings);
    setSaving(true);
    setError(null);

    try {
      await apiClient.post('/security/settings', {
        mfaEnabled: nextSettings.mfaEnabled,
        loginAlerts: nextSettings.loginAlerts,
        suspiciousActivityAlerts: nextSettings.suspiciousActivityAlerts,
        sessionTimeout: nextSettings.sessionTimeout,
      });
      toast.success('Security settings updated');
    } catch (updateError) {
      setSettings(previousSettings);
      const message = getErrorMessage(updateError, 'Failed to update settings.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  if (error && !settings) {
    return (
      <div className="security-settings">
        <h2>Security Settings</h2>
        <p className="error">{error}</p>
        <button onClick={() => void fetchSettings()}>Retry</button>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="security-settings">
        <h2>Security Settings</h2>
        <p>Settings are currently unavailable.</p>
      </div>
    );
  }

  return (
    <div className="security-settings">
      <h2>Security Settings</h2>

      <div className="setting-item">
        <div className="setting-content">
          <h3>Two-Factor Authentication</h3>
          <p>Require additional verification when logging in from new devices</p>
        </div>
        <input
          type="checkbox"
          checked={settings.mfaEnabled}
          onChange={() => void handleToggle('mfaEnabled')}
          disabled={saving}
        />
      </div>

      <div className="setting-item">
        <div className="setting-content">
          <h3>Login Alerts</h3>
          <p>Receive email notifications for new logins</p>
        </div>
        <input
          type="checkbox"
          checked={settings.loginAlerts}
          onChange={() => void handleToggle('loginAlerts')}
          disabled={saving}
        />
      </div>

      <div className="setting-item">
        <div className="setting-content">
          <h3>Suspicious Activity Alerts</h3>
          <p>Notify me of unusual account activity</p>
        </div>
        <input
          type="checkbox"
          checked={settings.suspiciousActivityAlerts}
          onChange={() => void handleToggle('suspiciousActivityAlerts')}
          disabled={saving}
        />
      </div>

      {saving && <p className="saving">Saving...</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
};

/**
 * Hook: Setup API interceptor for automatic fingerprinting
 */
export const useSecurityInterceptor = () => {
  const { fingerprint } = useDeviceFingerprint();

  useEffect(() => {
    if (!fingerprint) {
      return;
    }

    const interceptor = apiClient.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const headers = config.headers as RequestHeaderRecord;
        Object.assign(headers, buildSecurityHeaders(fingerprint));
        return config;
      },
      (interceptorError) => Promise.reject(interceptorError),
    );

    return () => {
      apiClient.interceptors.request.eject(interceptor);
    };
  }, [fingerprint]);
};
