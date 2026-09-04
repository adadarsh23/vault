import React, { useCallback, useEffect } from 'react';
import { ShieldAlert, LogIn, Lock, AlertTriangle } from 'lucide-react';
import { useVaultStore } from '../../store/vaultStore';
import { useScrollLock } from '../../hooks/useScrollLock';

export const SessionRevokedModal: React.FC = () => {
  const sessionRevokedState = useVaultStore((state) => state.sessionRevokedState);
  const dismissSessionRevoked = useVaultStore((state) => state.dismissSessionRevoked);

  const isRevoked = Boolean(sessionRevokedState?.isRevoked);
  useScrollLock(isRevoked);

  const handleReturnToSignIn = useCallback(() => {
    dismissSessionRevoked();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, [dismissSessionRevoked]);

  useEffect(() => {
    if (!isRevoked) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleReturnToSignIn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevoked, handleReturnToSignIn]);

  if (!isRevoked || !sessionRevokedState) {
    return null;
  }

  const formattedTime = sessionRevokedState.timestamp
    ? new Date(sessionRevokedState.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Just now';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-revoked-title"
      aria-describedby="session-revoked-desc"
      className="fixed inset-0 z-[99999] overflow-y-auto overscroll-contain bg-black/85 p-3 sm:p-4 md:p-6 backdrop-blur-xl animate-in fade-in duration-200 scroll-smooth-mobile touch-pan-y"
    >
      <div className="flex min-h-full w-full items-center justify-center py-3 sm:py-6">
        <div className="relative my-auto w-full max-w-[calc(100vw-1.5rem)] xs:max-w-md sm:max-w-lg overflow-hidden rounded-2xl sm:rounded-3xl border border-red-500/30 bg-[#0c0d0e] p-4 xs:p-6 sm:p-8 shadow-2xl shadow-red-950/40">
          {/* Top ambient glow */}
          <div className="pointer-events-none absolute -top-20 sm:-top-24 left-1/2 -translate-x-1/2 h-36 sm:h-48 w-64 sm:w-80 rounded-full bg-red-500/15 blur-2xl sm:blur-3xl" />

          <div className="relative flex flex-col items-center text-center">
            {/* Status Icon */}
            <div className="relative mb-3.5 sm:mb-5 flex h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500 shadow-inner">
              <ShieldAlert className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 animate-pulse" />
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-red-600 text-white shadow">
                <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </div>
            </div>

            {/* Security Badge */}
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 sm:px-3 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-red-400">
              <AlertTriangle className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <span className="truncate">Session Access Terminated</span>
            </div>

            {/* Title */}
            <h2
              id="session-revoked-title"
              className="mt-3 sm:mt-4 text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white"
            >
              Session Revoked
            </h2>

            {/* Description */}
            <p
              id="session-revoked-desc"
              className="mt-2 sm:mt-3 text-xs sm:text-sm md:text-base leading-relaxed text-neutral-300"
            >
              This device session has been revoked from another device. To protect your data,{' '}
              <strong className="font-semibold text-white">
                all edit, update, and remove actions are permanently blocked
              </strong>{' '}
              and the decrypted vault memory has been securely wiped.
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
              {sessionRevokedState.sessionId ? (
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  <span className="font-medium text-neutral-400 sm:text-neutral-500 text-[11px] sm:text-xs shrink-0">
                    Session ID
                  </span>
                  <span
                    className="font-mono text-neutral-300 text-[11px] sm:text-xs text-right truncate"
                    title={sessionRevokedState.sessionId}
                  >
                    {sessionRevokedState.sessionId.length > 14
                      ? `${sessionRevokedState.sessionId.slice(0, 6)}...${sessionRevokedState.sessionId.slice(-4)}`
                      : sessionRevokedState.sessionId}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              autoFocus
              onClick={handleReturnToSignIn}
              className="mt-4 sm:mt-6 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-600 to-red-500 py-3 sm:py-3.5 px-4 sm:px-6 text-sm sm:text-base font-semibold text-white shadow-lg shadow-red-600/30 transition-all hover:from-red-500 hover:to-red-400 hover:shadow-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black cursor-pointer active:scale-[0.98] touch-manipulation"
            >
              <LogIn className="h-4 w-4 shrink-0" />
              <span>Return to Sign In</span>
            </button>

            <p className="mt-2.5 sm:mt-3 text-[10px] sm:text-[11px] text-neutral-400 sm:text-neutral-500 leading-tight">
              Sign in with your master password to start a new verified session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
