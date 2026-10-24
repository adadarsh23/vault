/**
 * Frontend Security Integration
 *
 * Production-ready React components and utilities for:
 * - Deterministic device fingerprinting & signal harvesting
 * - Secure request interception & header injection
 * - MFA verification challenge modals
 * - Trusted device management & remote session revocation
 * - Account security preferences & session timeout controls
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import {
  Shield,
  Smartphone,
  Laptop,
  Monitor,
  Globe,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  LogOut,
  Clock,
  X,
  Loader2,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../api/apiClient';
import { cn } from '../lib/utils';

export type MFAMethod = 'totp' | 'email' | 'fido2';

export type DeviceSignals = {
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

export type ManagedDevice = {
  id: string;
  name: string;
  trustScore: number;
  lastSeen: string | number | Date;
  accessCount: number;
  isVerified: boolean;
  platform?: string | null;
};

export type DeviceListResponse = {
  devices?: ManagedDevice[];
};

export type SecuritySettingsState = {
  mfaEnabled: boolean;
  mfaMethods: MFAMethod[];
  loginAlerts: boolean;
  suspiciousActivityAlerts: boolean;
  twoFactorRequired: boolean;
  sessionTimeout: number;
};

export type SecurityToggleKey =
  'mfaEnabled' | 'loginAlerts' | 'suspiciousActivityAlerts' | 'twoFactorRequired';

export interface MFAChallengeProps {
  onComplete: (code: string) => void;
  method?: MFAMethod;
  onCancel?: () => void;
  className?: string;
}

export interface DeviceManagementProps {
  className?: string;
  onDeviceCountChange?: (count: number) => void;
}

export interface SecuritySettingsProps {
  className?: string;
  onSettingsUpdate?: (settings: SecuritySettingsState) => void;
}

const STORAGE_DEVICE_FINGERPRINT_KEY = 'deviceFingerprint';
const FALLBACK_PLATFORM = 'unknown';
const FALLBACK_TIMEZONE = 'UTC';

export const DEFAULT_SECURITY_SETTINGS: SecuritySettingsState = {
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

export const isBrowserEnvironment = (): boolean =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof document !== 'undefined';

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  const candidate = error as
    | {
        response?: { data?: { message?: string; error?: { message?: string } } };
        message?: string;
        error?: { message?: string };
      }
    | undefined;

  const responseMsg = candidate?.response?.data?.message;
  if (typeof responseMsg === 'string' && responseMsg.trim()) {
    return responseMsg.trim();
  }

  const responseErrorMsg = candidate?.response?.data?.error?.message;
  if (typeof responseErrorMsg === 'string' && responseErrorMsg.trim()) {
    return responseErrorMsg.trim();
  }

  const errorMsg = candidate?.error?.message;
  if (typeof errorMsg === 'string' && errorMsg.trim()) {
    return errorMsg.trim();
  }

  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }

  return fallback;
};

export const safeReadSessionValue = (key: string): string | null => {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeWriteSessionValue = (key: string, value: string): void => {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore write failures (private mode / storage quotas).
  }
};

export const createFallbackFingerprint = (): string => {
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
    // Fallback to Math.random below
  }

  return `fp_${timestamp}_${Math.random().toString(36).slice(2, 16)}`;
};

export const resolveWebGLRenderer = (canvas?: HTMLCanvasElement): string => {
  if (!isBrowserEnvironment()) {
    return 'unknown';
  }

  try {
    const targetCanvas = canvas ?? document.createElement('canvas');
    const context =
      targetCanvas.getContext('webgl') ??
      (targetCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

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
    return typeof renderer === 'string' && renderer.trim() ? renderer.trim() : 'unknown';
  } catch {
    return 'unknown';
  }
};

export const resolveCanvasFingerprint = (): string => {
  if (!isBrowserEnvironment()) {
    return '';
  }

  try {
    const canvas = document.createElement('canvas');
    const context2d = canvas.getContext('2d');
    if (!context2d) {
      return '';
    }

    context2d.textBaseline = 'top';
    context2d.font = '14px "Arial"';
    context2d.textBaseline = 'alphabetic';
    context2d.fillStyle = '#f60';
    context2d.fillRect(125, 1, 62, 20);
    context2d.fillStyle = '#069';
    context2d.fillText('Browser Fingerprint', 2, 15);
    return canvas.toDataURL();
  } catch {
    return '';
  }
};

export const resolvePlatform = (): string => {
  if (!isBrowserEnvironment()) {
    return FALLBACK_PLATFORM;
  }

  try {
    const uaData = (navigator as unknown as { userAgentData?: { platform?: string } })
      ?.userAgentData;
    if (typeof uaData?.platform === 'string' && uaData.platform.trim()) {
      return uaData.platform.trim();
    }
    return navigator.platform || FALLBACK_PLATFORM;
  } catch {
    return FALLBACK_PLATFORM;
  }
};

export const resolveScreenResolution = (): string => {
  if (!isBrowserEnvironment()) {
    return 'unknown';
  }

  try {
    if (
      window.screen &&
      typeof window.screen.width === 'number' &&
      typeof window.screen.height === 'number'
    ) {
      return `${window.screen.width}x${window.screen.height}`;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

export const resolveTimezone = (): string => {
  if (!isBrowserEnvironment()) {
    return FALLBACK_TIMEZONE;
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
};

export const resolveLanguage = (): string => {
  if (!isBrowserEnvironment()) {
    return 'unknown';
  }

  try {
    return (
      navigator.language ||
      (Array.isArray(navigator.languages) && navigator.languages[0]) ||
      'unknown'
    );
  } catch {
    return 'unknown';
  }
};

export const resolveColorDepth = (): number => {
  if (!isBrowserEnvironment()) {
    return 24;
  }

  try {
    return typeof window.screen?.colorDepth === 'number' ? window.screen.colorDepth : 24;
  } catch {
    return 24;
  }
};

export const resolveTimezoneOffset = (): number => {
  try {
    return new Date().getTimezoneOffset();
  } catch {
    return 0;
  }
};

export const resolveHardwareConcurrency = (): number | null => {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return typeof navigator.hardwareConcurrency === 'number' &&
      Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null;
  } catch {
    return null;
  }
};

export const resolveDeviceMemoryGb = (): number | null => {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    const navWithMem = navigator as Navigator & { deviceMemory?: number };
    return typeof navWithMem.deviceMemory === 'number' && Number.isFinite(navWithMem.deviceMemory)
      ? navWithMem.deviceMemory
      : null;
  } catch {
    return null;
  }
};

export const resolveAudioContextAvailable = (): boolean => {
  if (!isBrowserEnvironment()) {
    return false;
  }

  try {
    return 'AudioContext' in window || 'webkitAudioContext' in window;
  } catch {
    return false;
  }
};

export const collectDeviceSignals = (): DeviceSignals => {
  return {
    screenResolution: resolveScreenResolution(),
    timezone: resolveTimezone(),
    platform: resolvePlatform(),
    language: resolveLanguage(),
    webglRenderer: resolveWebGLRenderer(),
    canvasFingerprint: resolveCanvasFingerprint(),
    audioContextAvailable: resolveAudioContextAvailable(),
    colorDepth: resolveColorDepth(),
    timezoneOffset: resolveTimezoneOffset(),
    hardwareConcurrency: resolveHardwareConcurrency(),
    deviceMemoryGb: resolveDeviceMemoryGb(),
  };
};

export const hashSignals = async (signals: DeviceSignals): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') {
    return createFallbackFingerprint();
  }

  try {
    const sortedKeys = (Object.keys(signals) as (keyof DeviceSignals)[]).sort();
    const sortedRecord: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedRecord[key] = signals[key];
    }

    const signalString = JSON.stringify(sortedRecord);
    const buffer = new TextEncoder().encode(signalString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map((value) => value.toString(16).padStart(2, '0')).join('');
  } catch {
    return createFallbackFingerprint();
  }
};

export const clearFingerprintCache = (): void => {
  cachedFingerprint = null;
  pendingFingerprintPromise = null;
  if (isBrowserEnvironment()) {
    try {
      window.sessionStorage.removeItem(STORAGE_DEVICE_FINGERPRINT_KEY);
    } catch {
      // Ignore
    }
  }
};

export const resolveDeviceFingerprint = async (): Promise<string> => {
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

export const buildSecurityHeaders = (fingerprint: string): Record<string, string> => {
  return {
    'X-Fingerprint-Id': fingerprint,
    'X-Screen-Resolution': resolveScreenResolution(),
    'X-Timezone': resolveTimezone(),
    'X-Platform': resolvePlatform(),
  };
};

export const normalizeTrustScore = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

export const formatLastSeen = (value: unknown): string => {
  const parsedDate = new Date(value as string | number | Date);
  return Number.isFinite(parsedDate.getTime()) ? parsedDate.toLocaleString() : 'Unknown';
};

export const normalizeSecuritySettings = (input: unknown): SecuritySettingsState => {
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
 * Hook: Generate and retrieve device fingerprint
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
      const activeFingerprint = fingerprint || (await resolveDeviceFingerprint());
      if (!activeFingerprint) {
        return config;
      }

      return {
        ...config,
        headers: {
          ...(config.headers as RequestHeaderRecord | undefined),
          ...buildSecurityHeaders(activeFingerprint),
        },
      };
    },
    [fingerprint],
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
        if (!config.headers) {
          config.headers = {} as any;
        }

        const securityHeaders = buildSecurityHeaders(fingerprint);
        for (const [key, value] of Object.entries(securityHeaders)) {
          if (typeof (config.headers as any).set === 'function') {
            (config.headers as any).set(key, value);
          } else {
            (config.headers as Record<string, string>)[key] = value;
          }
        }
        return config;
      },
      (interceptorError) => Promise.reject(interceptorError),
    );

    return () => {
      apiClient.interceptors.request.eject(interceptor);
    };
  }, [fingerprint]);
};

/**
 * Component: MFA Challenge Modal
 */
export const MFAChallenge: React.FC<MFAChallengeProps> = ({
  onComplete,
  method = 'totp',
  onCancel,
  className,
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      setCode(pasted);
      setError('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    if (error) {
      setError('');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedCode = code.trim();
    if (trimmedCode.length !== 6) {
      setError('Enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Send both token (expected by server validator) and code/method for backwards compatibility
      await apiClient.post('/security/mfa/verify', {
        token: trimmedCode,
        code: trimmedCode,
        method,
      });
      toast.success('MFA verification successful');
      onComplete(trimmedCode);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const methodLabel =
    method === 'totp' ? 'authenticator app' : method === 'email' ? 'email' : 'FIDO2';

  return (
    <div
      className={cn(
        'mfa-challenge rounded-2xl border border-card-border bg-card-bg/95 p-6 shadow-2xl backdrop-blur-md max-w-md w-full mx-auto space-y-4',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">Two-Factor Authentication</h2>
            <p className="text-xs text-text/70">Secure identity verification required</p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-text/50 hover:bg-text/10 hover:text-text transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-sm text-text/80">Enter your {methodLabel} code:</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="000000"
            value={code}
            onChange={handleChange}
            onPaste={handlePaste}
            maxLength={6}
            disabled={loading}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-label="Verification code"
            className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 rounded-xl border border-card-border bg-bg/50 text-text placeholder:text-text/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 transition-all"
          />
        </div>

        {error && (
          <div className="error flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl border border-card-border bg-text/5 text-text hover:bg-text/10 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading || code.trim().length !== 6}
            className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-semibold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              'Verify'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const getDeviceIcon = (platform?: string | null) => {
  const target = (platform || '').toLowerCase();
  if (target.includes('win') || target.includes('mac') || target.includes('linux')) {
    return <Laptop className="h-4 w-4 text-primary" />;
  }
  if (
    target.includes('iphone') ||
    target.includes('android') ||
    target.includes('mobile') ||
    target.includes('ipad')
  ) {
    return <Smartphone className="h-4 w-4 text-emerald-400" />;
  }
  return <Globe className="h-4 w-4 text-text/60" />;
};

/**
 * Component: Device Management
 */
export const DeviceManagement: React.FC<DeviceManagementProps> = ({
  className,
  onDeviceCountChange,
}) => {
  const { fingerprint: currentFingerprint } = useDeviceFingerprint();
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
      onDeviceCountChange?.(receivedDevices.length);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, 'Failed to fetch trusted devices.'));
    } finally {
      setLoading(false);
    }
  }, [onDeviceCountChange]);

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
      setDevices((currentDevices) => {
        const next = currentDevices.filter((device) => device.id !== deviceId);
        onDeviceCountChange?.(next.length);
        return next;
      });
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

  if (loading) {
    return (
      <div className={cn('p-6 flex items-center justify-center gap-2 text-text/70', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'device-management rounded-2xl border border-card-border bg-card-bg/90 p-6 space-y-4',
          className,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text">
            <Monitor className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Trusted Devices</h2>
          </div>
          <button
            onClick={() => void fetchDevices()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-card-border bg-text/5 hover:bg-text/10 text-text transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
        <p className="error text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'device-management rounded-2xl border border-card-border bg-card-bg/90 p-6 space-y-5',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-card-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2 text-text">
            <Monitor className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Trusted Devices</h2>
          </div>
          <p className="text-xs text-text/70 mt-1">
            Manage devices currently registered with your security profile.
          </p>
        </div>
        <button
          onClick={() => void fetchDevices()}
          title="Refresh device list"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-card-border bg-text/5 hover:bg-text/10 text-text transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="py-8 text-center text-text/60 space-y-2">
          <Globe className="h-8 w-8 mx-auto text-text/40 opacity-70" />
          <p className="text-sm">No trusted devices yet. Log in from a new device to add one.</p>
        </div>
      ) : (
        <div className="device-list space-y-3">
          {devices.map((device) => {
            const isCurrentDevice = currentFingerprint !== null && device.id === currentFingerprint;
            return (
              <div
                key={device.id}
                className="device-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-card-border/80 bg-bg/40 hover:border-card-border transition-all"
              >
                <div className="device-info space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getDeviceIcon(device.platform)}
                    <h3 className="font-semibold text-text text-sm truncate">{device.name}</h3>
                    {isCurrentDevice && (
                      <span className="badge inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
                        Current Device
                      </span>
                    )}
                    {device.isVerified && (
                      <span className="badge verified inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-text/70 pt-1">
                    <p>Trust Score: {normalizeTrustScore(device.trustScore)}%</p>
                    <p>Last Seen: {formatLastSeen(device.lastSeen)}</p>
                    <p>Accesses: {Math.max(0, Math.floor(device.accessCount || 0))}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void handleForgetDevice(device.id)}
                    className="btn-danger inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold transition-colors disabled:opacity-50"
                    disabled={pendingDeviceId === device.id || forgettingAll}
                  >
                    {pendingDeviceId === device.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Forgetting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Forget</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 border-t border-card-border/60">
        <button
          onClick={() => void handleLogoutAllOthers()}
          className="btn-danger btn-block w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-300 text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
          disabled={forgettingAll || pendingDeviceId !== null}
        >
          {forgettingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Logging Out Other Devices...</span>
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4" />
              <span>Logout from All Other Devices</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const TIMEOUT_OPTIONS = [
  { value: 900, label: '15 Minutes' },
  { value: 1800, label: '30 Minutes' },
  { value: 3600, label: '1 Hour' },
  { value: 14400, label: '4 Hours' },
  { value: 86400, label: '24 Hours' },
];

/**
 * Component: Security Settings
 */
export const SecuritySettings: React.FC<SecuritySettingsProps> = ({
  className,
  onSettingsUpdate,
}) => {
  const [settings, setSettings] = useState<SecuritySettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<Partial<SecuritySettingsState>>('/security/settings');
      const normalized = normalizeSecuritySettings(response.data);
      setSettings(normalized);
      onSettingsUpdate?.(normalized);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, 'Failed to fetch settings.'));
    } finally {
      setLoading(false);
    }
  }, [onSettingsUpdate]);

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
        twoFactorRequired: nextSettings.twoFactorRequired,
        sessionTimeout: nextSettings.sessionTimeout,
      });
      toast.success('Security settings updated');
      onSettingsUpdate?.(nextSettings);
    } catch (updateError) {
      setSettings(previousSettings);
      const message = getErrorMessage(updateError, 'Failed to update settings.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTimeoutChange = async (timeoutSeconds: number) => {
    if (!settings || saving || timeoutSeconds === settings.sessionTimeout) {
      return;
    }

    const previousSettings = settings;
    const nextSettings: SecuritySettingsState = {
      ...settings,
      sessionTimeout: timeoutSeconds,
    };

    setSettings(nextSettings);
    setSaving(true);
    setError(null);

    try {
      await apiClient.post('/security/settings', {
        mfaEnabled: nextSettings.mfaEnabled,
        loginAlerts: nextSettings.loginAlerts,
        suspiciousActivityAlerts: nextSettings.suspiciousActivityAlerts,
        twoFactorRequired: nextSettings.twoFactorRequired,
        sessionTimeout: nextSettings.sessionTimeout,
      });
      toast.success('Session timeout updated');
      onSettingsUpdate?.(nextSettings);
    } catch (updateError) {
      setSettings(previousSettings);
      const message = getErrorMessage(updateError, 'Failed to update session timeout.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('p-6 flex items-center justify-center gap-2 text-text/70', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div
        className={cn(
          'security-settings rounded-2xl border border-card-border bg-card-bg/90 p-6 space-y-4',
          className,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Security Settings</h2>
          </div>
          <button
            onClick={() => void fetchSettings()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-card-border bg-text/5 hover:bg-text/10 text-text transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
        <p className="error text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div
        className={cn(
          'security-settings rounded-2xl border border-card-border bg-card-bg/90 p-6 space-y-3',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-text">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Security Settings</h2>
        </div>
        <p className="text-sm text-text/70">Settings are currently unavailable.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'security-settings rounded-2xl border border-card-border bg-card-bg/90 p-6 space-y-5',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-card-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2 text-text">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Security Settings</h2>
          </div>
          <p className="text-xs text-text/70 mt-1">
            Configure automated login security and alert policies.
          </p>
        </div>
        {saving && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium animate-pulse">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <p className="saving">Saving...</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="setting-item flex items-center justify-between gap-4 p-4 rounded-xl border border-card-border/80 bg-bg/40">
          <div className="setting-content space-y-0.5">
            <h3 className="font-semibold text-text text-sm">Two-Factor Authentication</h3>
            <p className="text-xs text-text/70">
              Require additional verification when logging in from new devices
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.mfaEnabled}
            onChange={() => void handleToggle('mfaEnabled')}
            disabled={saving}
            aria-label="Two-Factor Authentication"
            className="h-5 w-5 rounded border-card-border text-primary focus:ring-primary/40 cursor-pointer disabled:opacity-50"
          />
        </div>

        <div className="setting-item flex items-center justify-between gap-4 p-4 rounded-xl border border-card-border/80 bg-bg/40">
          <div className="setting-content space-y-0.5">
            <h3 className="font-semibold text-text text-sm">Login Alerts</h3>
            <p className="text-xs text-text/70">Receive email notifications for new logins</p>
          </div>
          <input
            type="checkbox"
            checked={settings.loginAlerts}
            onChange={() => void handleToggle('loginAlerts')}
            disabled={saving}
            aria-label="Login Alerts"
            className="h-5 w-5 rounded border-card-border text-primary focus:ring-primary/40 cursor-pointer disabled:opacity-50"
          />
        </div>

        <div className="setting-item flex items-center justify-between gap-4 p-4 rounded-xl border border-card-border/80 bg-bg/40">
          <div className="setting-content space-y-0.5">
            <h3 className="font-semibold text-text text-sm">Suspicious Activity Alerts</h3>
            <p className="text-xs text-text/70">Notify me of unusual account activity</p>
          </div>
          <input
            type="checkbox"
            checked={settings.suspiciousActivityAlerts}
            onChange={() => void handleToggle('suspiciousActivityAlerts')}
            disabled={saving}
            aria-label="Suspicious Activity Alerts"
            className="h-5 w-5 rounded border-card-border text-primary focus:ring-primary/40 cursor-pointer disabled:opacity-50"
          />
        </div>

        <div className="setting-item flex items-center justify-between gap-4 p-4 rounded-xl border border-card-border/80 bg-bg/40">
          <div className="setting-content space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-text/60" />
              <h3 className="font-semibold text-text text-sm">Session Timeout</h3>
            </div>
            <p className="text-xs text-text/70">
              Automatically invalidate idle access sessions after inactivity
            </p>
          </div>
          <select
            value={settings.sessionTimeout}
            onChange={(e) => void handleTimeoutChange(Number(e.target.value))}
            disabled={saving}
            aria-label="Session Timeout"
            className="rounded-lg border border-card-border bg-bg/60 text-text text-xs py-1.5 px-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer disabled:opacity-50"
          >
            {TIMEOUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="error text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          {error}
        </p>
      )}
    </div>
  );
};
