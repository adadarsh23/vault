import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useThemeStore } from '../../store/themeStore';
import type { RecaptchaStatus } from '../../hooks/useRecaptchaChallenge';

export interface RecaptchaFieldProps {
  id: string;
  token: string | null;
  status: RecaptchaStatus;
  message?: string | null;
  resetNonce?: number;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
  onChange: (token: string | null) => void;
  onExpired: () => void;
  onError: () => void;
}

const RECAPTCHA_MISSING_SITE_KEY_MESSAGE =
  'Security challenge is unavailable. Configure VITE_RECAPTCHA_SITE_KEY with a valid reCAPTCHA v2 Checkbox site key.';
const RECAPTCHA_LOADING_MESSAGE = 'Loading security challenge...';
const RECAPTCHA_PENDING_MESSAGE = 'Complete CAPTCHA before submitting form.';
const RECAPTCHA_LOAD_ERROR_MESSAGE =
  'Security challenge failed to load. Please check your network connection, ad-blocker, or CSP settings.';
const RECAPTCHA_OFFLINE_MESSAGE =
  'Network is offline. Reconnect to complete the security challenge.';

const RECAPTCHA_WIDTH = 304;
const RECAPTCHA_HEIGHT = 78;
const RECAPTCHA_MIN_SCALE = 0.6;
const RECAPTCHA_SCRIPT_TIMEOUT_MS = 12_000;

type RecaptchaWidgetState = 'loading' | 'ready' | 'error';

export const RecaptchaField = memo(function RecaptchaField({
  id,
  token,
  status,
  message,
  resetNonce = 0,
  disabled = false,
  className,
  'data-testid': testId,
  onChange,
  onExpired,
  onError,
}: RecaptchaFieldProps) {
  const reactGeneratedId = useId();
  const safeId = useMemo(
    () => (id?.trim() ? id.replace(/[^a-zA-Z0-9_-]/g, '_') : `recaptcha-${reactGeneratedId}`),
    [id, reactGeneratedId],
  );

  const selectedTheme = useThemeStore((state) => state.theme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (selectedTheme === 'dark') return 'dark';
    if (selectedTheme === 'light') return 'light';
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  });
  const [widgetScale, setWidgetScale] = useState(1);
  const [widgetState, setWidgetState] = useState<RecaptchaWidgetState>(() => {
    if (typeof window !== 'undefined') {
      const g = (window as unknown as { grecaptcha?: { render?: unknown } }).grecaptcha;
      if (g && typeof g.render === 'function') {
        return 'ready';
      }
    }
    return 'loading';
  });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true,
  );
  const [retryCount, setRetryCount] = useState(0);

  const recaptchaRef = useRef<ReCAPTCHA | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const siteKey = useMemo(() => {
    const rawKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    return typeof rawKey === 'string' ? rawKey.trim() : '';
  }, []);

  // Track mounted status to avoid state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Network online/offline listener for auto-recovery
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      if (!isMountedRef.current) return;
      setIsOnline(true);
      // Auto-retry when coming back online if in error state
      setWidgetState((current) => {
        if (current === 'error') {
          return 'loading';
        }
        return current;
      });
    };

    const handleOffline = () => {
      if (!isMountedRef.current) return;
      setIsOnline(false);
      setWidgetState('error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const blurRecaptchaFocus = useCallback(() => {
    if (typeof document === 'undefined') return;
    try {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        const isRecaptchaElement =
          wrapperRef.current?.contains(activeElement) ||
          activeElement.tagName === 'IFRAME' ||
          activeElement.closest?.('iframe[title*="recaptcha" i], iframe[src*="recaptcha" i]') !==
            null;
        if (isRecaptchaElement) {
          activeElement.blur();
        }
      }
    } catch {
      // Guard against potential cross-origin access exceptions
    }
  }, []);

  // Handle external resetNonce change
  useEffect(() => {
    blurRecaptchaFocus();
    try {
      recaptchaRef.current?.reset();
    } catch {
      // Guard against internal reCAPTCHA reset failures when unmounted
    }
  }, [blurRecaptchaFocus, resetNonce]);

  // Clean blur on unmount
  useEffect(() => {
    return () => {
      blurRecaptchaFocus();
    };
  }, [blurRecaptchaFocus]);

  // Proactively blur focus when field becomes disabled
  useEffect(() => {
    if (disabled) {
      blurRecaptchaFocus();
    }
  }, [disabled, blurRecaptchaFocus]);

  // Check for rendered reCAPTCHA iframe and promote to ready
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof MutationObserver === 'undefined') return;

    const checkIframe = () => {
      if (!isMountedRef.current) return;
      if (wrapper.querySelector('iframe')) {
        setWidgetState('ready');
      }
    };

    checkIframe();
    const observer = new MutationObserver(checkIframe);
    observer.observe(wrapper, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [resolvedTheme, retryCount]);

  // Hook into grecaptcha.ready if available on window
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const g = (
      window as unknown as { grecaptcha?: { ready?: (cb: () => void) => void; render?: unknown } }
    ).grecaptcha;
    if (g && typeof g.ready === 'function') {
      g.ready(() => {
        if (isMountedRef.current) {
          setWidgetState('ready');
        }
      });
    }
  }, [retryCount]);

  // Timeout guard for reCAPTCHA script loading
  useEffect(() => {
    if (!siteKey) {
      return;
    }

    if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
      setWidgetState('error');
      return;
    }

    // If grecaptcha or iframe is already available, do not reset to loading
    const g =
      typeof window !== 'undefined'
        ? (window as unknown as { grecaptcha?: { render?: unknown } }).grecaptcha
        : null;
    const hasIframe = Boolean(wrapperRef.current?.querySelector('iframe'));
    if (g?.render || hasIframe) {
      setWidgetState('ready');
      return;
    }

    setWidgetState('loading');
    const timeoutId = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      const finalG =
        typeof window !== 'undefined'
          ? (window as unknown as { grecaptcha?: { render?: unknown } }).grecaptcha
          : null;
      const finalHasIframe = Boolean(wrapperRef.current?.querySelector('iframe'));
      if (finalG?.render || finalHasIframe) {
        setWidgetState('ready');
      } else {
        setWidgetState((current) => (current === 'ready' ? current : 'error'));
      }
    }, RECAPTCHA_SCRIPT_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [siteKey, resolvedTheme, retryCount]);

  // Responsive scale observer with requestAnimationFrame debouncing
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateScale = () => {
      if (!wrapper || !isMountedRef.current) return;
      const availableWidth = wrapper.clientWidth;
      if (availableWidth <= 0) {
        return;
      }

      // Allow 4px margin room on small screens to prevent clipping
      const effectiveWidth = Math.max(0, availableWidth - 4);
      const targetScale = Math.min(
        1,
        Math.max(RECAPTCHA_MIN_SCALE, effectiveWidth / RECAPTCHA_WIDTH),
      );
      const roundedScale = Math.round(targetScale * 100) / 100;

      setWidgetScale((current) =>
        Math.abs(current - roundedScale) < 0.01 ? current : roundedScale,
      );
    };

    const handleResize = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(updateScale);
    };

    updateScale();
    const observer = new ResizeObserver(handleResize);
    observer.observe(wrapper);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      observer.disconnect();
    };
  }, []);

  // Theme resolution with cross-browser matchMedia compatibility
  useEffect(() => {
    if (selectedTheme === 'dark') {
      setResolvedTheme('dark');
      return undefined;
    }

    if (selectedTheme === 'light') {
      setResolvedTheme('light');
      return undefined;
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setResolvedTheme('light');
      return undefined;
    }

    try {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => {
        if (isMountedRef.current) {
          setResolvedTheme(media.matches ? 'dark' : 'light');
        }
      };
      apply();

      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
      } else if ('addListener' in media) {
        // Fallback for older Safari / WebView
        (media as unknown as { addListener: (cb: () => void) => void }).addListener(apply);
        return () =>
          (media as unknown as { removeListener: (cb: () => void) => void }).removeListener(apply);
      }
      return undefined;
    } catch {
      setResolvedTheme('light');
      return undefined;
    }
  }, [selectedTheme]);

  const isCompleted = Boolean(token);
  const hasErrorState = status === 'error' || widgetState === 'error';
  const isLoadingState = widgetState === 'loading' && !isCompleted;

  const statusText = useMemo(() => {
    if (message) {
      return message;
    }

    if (!isOnline) {
      return RECAPTCHA_OFFLINE_MESSAGE;
    }

    if (isCompleted || status === 'verified') {
      return 'CAPTCHA completed.';
    }

    if (status === 'expired') {
      return 'CAPTCHA expired. Please complete it again.';
    }

    if (hasErrorState) {
      return RECAPTCHA_LOAD_ERROR_MESSAGE;
    }

    if (isLoadingState) {
      return RECAPTCHA_LOADING_MESSAGE;
    }

    return RECAPTCHA_PENDING_MESSAGE;
  }, [hasErrorState, isCompleted, isLoadingState, isOnline, message, status]);

  const handleChange = useCallback(
    (nextToken: string | null) => {
      if (!isMountedRef.current) return;
      setWidgetState('ready');
      onChange(nextToken);
    },
    [onChange],
  );

  const handleScriptLoad = useCallback(() => {
    if (!isMountedRef.current) return;
    setWidgetState('ready');
  }, []);

  const handleWidgetError = useCallback(() => {
    if (!isMountedRef.current) return;
    setWidgetState('error');
    try {
      onError();
    } catch (err) {
      console.warn('RecaptchaField: onError handler threw', err);
    }
  }, [onError]);

  const handleRetry = useCallback(() => {
    setWidgetState('loading');
    setRetryCount((c) => c + 1);
    blurRecaptchaFocus();
    try {
      recaptchaRef.current?.reset();
    } catch {
      // Guard against reset failure
    }
  }, [blurRecaptchaFocus]);

  if (!siteKey) {
    return (
      <div
        data-testid={testId || `${safeId}-missing-key`}
        className={cn(
          'rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs sm:text-sm text-red-200 shadow-sm',
          className,
        )}
        role="alert"
        aria-live="assertive"
      >
        <p className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="leading-relaxed">{RECAPTCHA_MISSING_SITE_KEY_MESSAGE}</span>
        </p>
      </div>
    );
  }

  const containerHeight = Math.ceil(RECAPTCHA_HEIGHT * widgetScale);

  return (
    <div
      data-testid={testId || `${safeId}-container`}
      className={cn('space-y-2 select-none', className)}
      role="group"
      aria-labelledby={`${safeId}-label`}
      aria-describedby={`${safeId}-status`}
      aria-busy={isLoadingState}
    >
      <div className="flex items-center justify-between">
        <p
          id={`${safeId}-label`}
          className="text-[10px] font-black uppercase tracking-[0.2em] text-text/45 flex items-center gap-1.5"
        >
          <ShieldCheck className="h-3 w-3 text-emerald-400/80" />
          <span>Prove you are human</span>
        </p>
        {widgetState === 'error' && (
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:underline transition-colors focus:outline-none focus:ring-1 focus:ring-amber-400/50 rounded px-1"
            title="Retry loading challenge"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        )}
      </div>

      <div
        className={cn(
          'transition-opacity duration-200 relative',
          disabled ? 'opacity-60 pointer-events-none cursor-not-allowed' : '',
        )}
        inert={disabled ? true : undefined}
      >
        <div ref={wrapperRef} className="relative w-full flex flex-col items-center">
          {isLoadingState && (
            <div
              className="flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-zinc-900/40 text-xs text-text/60 animate-pulse w-full max-w-[304px]"
              style={{ height: `${containerHeight}px` }}
              role="status"
              aria-label="Loading verification widget"
            >
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span>Verifying secure connection...</span>
            </div>
          )}

          <div
            className={cn(
              'w-full flex justify-center items-start transition-opacity duration-300',
              isLoadingState ? 'absolute opacity-0 pointer-events-none' : 'opacity-100',
            )}
            style={{
              height: `${containerHeight}px`,
              minHeight: `${containerHeight}px`,
            }}
          >
            <div
              style={{
                width: `${RECAPTCHA_WIDTH}px`,
                height: `${RECAPTCHA_HEIGHT}px`,
                transform: `scale(${widgetScale})`,
                transformOrigin: 'top center',
              }}
            >
              <ReCAPTCHA
                key={`${resolvedTheme}-${retryCount}`}
                ref={recaptchaRef}
                sitekey={siteKey}
                theme={resolvedTheme}
                onChange={handleChange}
                onExpired={onExpired}
                onErrored={handleWidgetError}
                asyncScriptOnLoad={handleScriptLoad}
              />
            </div>
          </div>
        </div>
      </div>

      {statusText && (
        <div
          id={`${safeId}-status`}
          className={cn(
            'text-xs flex items-center justify-between gap-2 min-h-[1.25rem] transition-colors',
            isCompleted || status === 'verified'
              ? 'text-emerald-400'
              : hasErrorState || status === 'expired'
                ? 'text-red-400'
                : 'text-text/65',
          )}
          role="status"
          aria-live="polite"
        >
          {isCompleted || status === 'verified' ? (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>{statusText}</span>
            </span>
          ) : hasErrorState || status === 'expired' ? (
            <span className="inline-flex items-center gap-1.5 font-medium">
              {!isOnline ? (
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              <span className="break-words leading-tight">{statusText}</span>
            </span>
          ) : isLoadingState ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
              <span>{statusText}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-text/50" />
              <span>{statusText}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
});

RecaptchaField.displayName = 'RecaptchaField';
