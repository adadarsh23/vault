import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, LogIn, Lock, AlertTriangle, Loader2, Copy, Check } from 'lucide-react';
import { useVaultStore } from '../../store/vaultStore';
import { useScrollLock } from '../../hooks/useScrollLock';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { logger } from '../../lib/logger';

export interface SessionRevokedModalProps {
  /** Optional custom sign-in redirect URL (defaults to '/'). Sanitized to prevent open redirects. */
  redirectUrl?: string;
  /** Optional callback invoked before redirecting */
  onBeforeRedirect?: () => void;
}

/**
 * Sanitize redirect URL to ensure only same-origin relative paths are used.
 * Prevents open-redirect and javascript: URI vulnerabilities.
 */
function sanitizeRedirectUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '/';
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      /* parse error, fallback to root */
    }
  }
  return '/';
}

/**
 * Safely format revocation timestamp with fail-safe error handling.
 * Guarantees no RangeError on malformed dates.
 */
function formatRevokedTimestamp(timestamp?: number | string | null): string {
  if (!timestamp) return 'Just now';
  try {
    const numericTime =
      typeof timestamp === 'string' ? Number(timestamp) || Date.parse(timestamp) : timestamp;
    const date = new Date(numericTime);
    if (Number.isNaN(date.getTime())) {
      return 'Just now';
    }
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Just now';
  }
}

/**
 * Map internal reason codes to clear, human-readable explanations.
 */
function getRevocationReasonDetails(reason?: string | null): {
  badge: string;
  description: string;
} {
  switch (reason) {
    case 'REVOKED_BY_ANOTHER_DEVICE':
      return {
        badge: 'Terminated from Another Device',
        description: 'This device session has been revoked from another verified device.',
      };
    case 'REVOKED_BY_SERVER':
      return {
        badge: 'Revoked by Security Service',
        description: 'This session has been terminated by the server security enforcement service.',
      };
    case 'SECURITY_POLICY_VIOLATION':
      return {
        badge: 'Security Policy Violation',
        description: 'Access was terminated due to a security compliance or policy check failure.',
      };
    case 'SESSION_EXPIRED':
      return {
        badge: 'Session Expired',
        description: 'Your authentication credentials have expired and can no longer be used.',
      };
    case 'ADMIN_REVOKED':
      return {
        badge: 'Administrative Revocation',
        description: 'An administrator or security policy has terminated this device session.',
      };
    default:
      if (reason && reason.trim()) {
        const readable = reason.replace(/_/g, ' ').toLowerCase();
        const capitalized = readable.charAt(0).toUpperCase() + readable.slice(1);
        return {
          badge: capitalized,
          description: 'This device session has been invalidated.',
        };
      }
      return {
        badge: 'Session Access Terminated',
        description: 'This device session has been revoked from another device.',
      };
  }
}

/**
 * Inner dialog component containing the presentation and interaction logic.
 * Only mounts when `isRevoked` is true, ensuring zero idle overhead.
 */
const SessionRevokedDialog: React.FC<SessionRevokedModalProps> = ({
  redirectUrl = '/',
  onBeforeRedirect,
}) => {
  const sessionRevokedState = useVaultStore((state) => state.sessionRevokedState);
  const dismissSessionRevoked = useVaultStore((state) => state.dismissSessionRevoked);

  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasCopiedSessionId, setHasCopiedSessionId] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeTargetUrl = useMemo(() => sanitizeRedirectUrl(redirectUrl), [redirectUrl]);

  const formattedTime = useMemo(
    () => formatRevokedTimestamp(sessionRevokedState?.timestamp),
    [sessionRevokedState?.timestamp],
  );

  const reasonInfo = useMemo(
    () => getRevocationReasonDetails(sessionRevokedState?.reason),
    [sessionRevokedState?.reason],
  );

  // Focus preservation and initial focus
  useEffect(() => {
    previousActiveElementRef.current =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;

    // Use a small delay to ensure elements are mounted across all mobile browsers
    const timer = window.setTimeout(() => {
      actionButtonRef.current?.focus({ preventScroll: true });
    }, 20);

    return () => {
      window.clearTimeout(timer);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      try {
        if (
          previousActiveElementRef.current &&
          typeof previousActiveElementRef.current.focus === 'function' &&
          document.body.contains(previousActiveElementRef.current)
        ) {
          previousActiveElementRef.current.focus();
        }
      } catch {
        /* ignore focus restoration errors */
      }
    };
  }, []);

  const handleReturnToSignIn = useCallback(() => {
    if (isRedirecting) return;
    setIsRedirecting(true);

    try {
      if (typeof onBeforeRedirect === 'function') {
        onBeforeRedirect();
      }
    } catch (err) {
      logger.warn('[SessionRevokedModal] onBeforeRedirect callback threw', { error: String(err) });
    }

    try {
      dismissSessionRevoked();
    } catch (err) {
      logger.error('[SessionRevokedModal] Error dismissing session state', { error: String(err) });
    }

    if (typeof window !== 'undefined') {
      try {
        // Replace history entry to prevent backward navigation back into revoked state
        const isCurrentUrl =
          window.location.pathname === safeTargetUrl ||
          window.location.href.endsWith(safeTargetUrl);

        if (isCurrentUrl) {
          window.location.reload();
        } else {
          window.location.replace(safeTargetUrl);
        }
      } catch {
        // Fallback for sandboxed environments or browsers where location.replace is restricted
        window.location.href = safeTargetUrl;
      }
    }
  }, [dismissSessionRevoked, isRedirecting, onBeforeRedirect, safeTargetUrl]);

  // Focus trapping and keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleReturnToSignIn();
        return;
      }

      if (e.key === 'Escape') {
        // Revoked session cannot be simply closed without sign-in; redirect directly
        e.preventDefault();
        handleReturnToSignIn();
        return;
      }

      // Trap Tab within the modal dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        // If focus is currently outside the modal dialog, immediately pull it back in
        if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first?.focus();
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReturnToSignIn]);

  const handleCopySessionId = useCallback(() => {
    const sessionIdToCopy = sessionRevokedState?.sessionId;
    if (!sessionIdToCopy) return;

    const onCopySuccess = () => {
      setHasCopiedSessionId(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setHasCopiedSessionId(false);
      }, 2000);
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(sessionIdToCopy).then(onCopySuccess, () => {
          // Fallback for permission denial
          fallbackCopyText(sessionIdToCopy, onCopySuccess);
        });
      } else {
        fallbackCopyText(sessionIdToCopy, onCopySuccess);
      }
    } catch {
      fallbackCopyText(sessionIdToCopy, onCopySuccess);
    }
  }, [sessionRevokedState?.sessionId]);

  const rawSessionId = sessionRevokedState?.sessionId;
  const truncatedSessionId = useMemo(() => {
    if (!rawSessionId || typeof rawSessionId !== 'string') return null;
    return rawSessionId.length > 14
      ? `${rawSessionId.slice(0, 6)}...${rawSessionId.slice(-4)}`
      : rawSessionId;
  }, [rawSessionId]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-revoked-title"
      aria-describedby="session-revoked-desc"
      aria-live="assertive"
      className="fixed inset-0 z-[99999] min-h-[100vh] min-h-[100dvh] overflow-y-auto overscroll-contain bg-black/85 p-3 sm:p-4 md:p-6 backdrop-blur-xl animate-in fade-in duration-200 scroll-smooth-mobile touch-pan-y motion-reduce:animate-none"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="flex min-h-full w-full items-center justify-center py-3 sm:py-6">
        <div
          ref={dialogRef}
          className="relative my-auto w-full max-w-[calc(100vw-1.5rem)] xs:max-w-md sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl sm:rounded-3xl border border-red-500/30 bg-[#0c0d0e] p-4 xs:p-6 sm:p-8 shadow-2xl shadow-red-950/40 overscroll-contain"
        >
          {/* Top ambient glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 sm:-top-24 left-1/2 -translate-x-1/2 h-36 sm:h-48 w-64 sm:w-80 rounded-full bg-red-500/15 blur-2xl sm:blur-3xl motion-reduce:hidden"
          />

          <div className="relative flex flex-col items-center text-center">
            {/* Status Icon */}
            <div
              aria-hidden="true"
              className="relative mb-3.5 sm:mb-5 flex h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500 shadow-inner"
            >
              <ShieldAlert className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 animate-pulse motion-reduce:animate-none" />
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-red-600 text-white shadow">
                <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </div>
            </div>

            {/* Security Badge */}
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 sm:px-3 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-red-400">
              <AlertTriangle className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <span className="truncate">{reasonInfo.badge}</span>
            </div>

            {/* Title */}
            <h2
              id="session-revoked-title"
              className="mt-3 sm:mt-4 text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white select-none"
            >
              Session Revoked
            </h2>

            {/* Description */}
            <p
              id="session-revoked-desc"
              className="mt-2 sm:mt-3 text-xs sm:text-sm md:text-base leading-relaxed text-neutral-300"
            >
              {reasonInfo.description} To protect your data,{' '}
              <strong className="font-semibold text-white">
                all edit, update, and remove actions are permanently blocked
              </strong>{' '}
              and decrypted vault memory has been securely wiped.
            </p>

            {/* Security Details Card */}
            <div className="mt-4 sm:mt-6 w-full rounded-xl sm:rounded-2xl border border-white/5 bg-white/[0.03] p-3 sm:p-4 text-left text-xs text-neutral-400 space-y-2 sm:space-y-2.5">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <span className="font-medium text-neutral-400 sm:text-neutral-500 text-[11px] sm:text-xs shrink-0">
                  Security Status
                </span>
                <span className="font-semibold text-red-400 uppercase tracking-wider text-[10px] sm:text-[11px] text-right truncate">
                  Operations Banned
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <span className="font-medium text-neutral-400 sm:text-neutral-500 text-[11px] sm:text-xs shrink-0">
                  Terminated At
                </span>
                <span className="font-mono text-neutral-300 text-[11px] sm:text-xs text-right truncate">
                  {formattedTime}
                </span>
              </div>

              {truncatedSessionId ? (
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  <span className="font-medium text-neutral-400 sm:text-neutral-500 text-[11px] sm:text-xs shrink-0">
                    Session ID
                  </span>
                  <div className="flex items-center gap-1.5 max-w-[65%] justify-end">
                    <span
                      className="font-mono text-neutral-300 text-[11px] sm:text-xs text-right truncate"
                      title={rawSessionId}
                    >
                      {truncatedSessionId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySessionId}
                      title={hasCopiedSessionId ? 'Copied!' : 'Copy Session ID'}
                      aria-label={
                        hasCopiedSessionId
                          ? 'Session ID copied to clipboard'
                          : 'Copy Session ID to clipboard'
                      }
                      className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-red-400 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center touch-manipulation"
                    >
                      {hasCopiedSessionId ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Primary Action Button */}
            <button
              ref={actionButtonRef}
              type="button"
              disabled={isRedirecting}
              onClick={handleReturnToSignIn}
              aria-busy={isRedirecting}
              aria-label="Return to Sign In to authenticate a new session"
              className="mt-4 sm:mt-6 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-600 to-red-500 py-3 sm:py-3.5 px-4 sm:px-6 text-sm sm:text-base font-semibold text-white shadow-lg shadow-red-600/30 transition-all hover:from-red-500 hover:to-red-400 hover:shadow-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black cursor-pointer active:scale-[0.98] disabled:opacity-75 disabled:pointer-events-none touch-manipulation select-none"
            >
              {isRedirecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Redirecting to Sign In...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 shrink-0" />
                  <span>Return to Sign In</span>
                </>
              )}
            </button>

            <p className="mt-2.5 sm:mt-3 text-[10px] sm:text-[11px] text-neutral-400 sm:text-neutral-500 leading-tight">
              Sign in with your master credentials to start a new verified session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Fallback document clipboard copy for older browsers or insecure test environments.
 */
function fallbackCopyText(text: string, onSuccess: () => void): void {
  try {
    if (typeof document === 'undefined') return;
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      onSuccess();
    }
  } catch {
    /* fallback copy ignored */
  }
}

/**
 * Fallback dialog rendered if any unexpected error occurs inside SessionRevokedDialog.
 * Guarantees the user is never stuck without a return-to-sign-in option.
 */
const EmergencyRevokedFallback: React.FC = () => {
  const handleEmergencyRedirect = () => {
    if (typeof window !== 'undefined') {
      try {
        window.location.replace('/');
      } catch {
        window.location.href = '/';
      }
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 p-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#0c0d0e] p-6 text-center text-white shadow-2xl">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500 mb-3" />
        <h2 className="text-xl font-bold">Session Revoked</h2>
        <p className="mt-2 text-sm text-neutral-300">
          Your session was terminated. Please return to sign in to authenticate.
        </p>
        <button
          type="button"
          onClick={handleEmergencyRedirect}
          className="mt-5 w-full min-h-[48px] rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 transition-colors cursor-pointer touch-manipulation"
        >
          Return to Sign In
        </button>
      </div>
    </div>
  );
};

/**
 * Production-ready SessionRevokedModal component.
 *
 * Performance features:
 * - Selects ONLY `isRevoked` boolean at root to eliminate re-renders during normal vault operations.
 * - Entire dialog is lazy-rendered only when revocation is active.
 * - Memoized to prevent parent-driven re-renders.
 * - Hardware accelerated CSS animations with `motion-reduce` support.
 *
 * Device compatibility:
 * - Dynamic viewport height handling (`100dvh`).
 * - iOS notch & safe-area insets (`env(safe-area-inset-*)`).
 * - Landscape mobile scrollable container prevents action button cutoff.
 * - Touch friendly min-height 48px hit areas with `touch-manipulation`.
 *
 * Error handling & Security:
 * - Built-in `ErrorBoundary` with `EmergencyRevokedFallback`.
 * - Fail-safe date formatting prevents RangeErrors.
 * - Same-origin URL sanitization prevents open redirect attacks.
 * - Robust clipboard copy with fallback.
 * - Graceful fallback navigation logic.
 */
export const SessionRevokedModal: React.FC<SessionRevokedModalProps> = React.memo((props) => {
  const isRevoked = useVaultStore((state) => Boolean(state.sessionRevokedState?.isRevoked));
  useScrollLock(isRevoked);

  if (!isRevoked) {
    return null;
  }

  return (
    <ErrorBoundary fallback={<EmergencyRevokedFallback />}>
      <SessionRevokedDialog {...props} />
    </ErrorBoundary>
  );
});

SessionRevokedModal.displayName = 'SessionRevokedModal';
