import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  RefreshCw,
  FileWarning,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { useIntegrityStore, CorruptedItemDetail } from '../../store/integrityStore';
import { useVaultStore } from '../../store/vaultStore';
import { Button } from '../ui/Button';
import { useScrollLock } from '../../hooks/useScrollLock';
import { cn } from '../../lib/utils';

export interface VaultIntegrityAlarmModalProps {
  className?: string;
}

export const VaultIntegrityAlarmModal = memo(function VaultIntegrityAlarmModal({
  className,
}: VaultIntegrityAlarmModalProps) {
  const tamperAlarmActive = useIntegrityStore((state) => state.tamperAlarmActive);
  const corruptedItems = useIntegrityStore((state) => state.corruptedItems);
  const dismissTamperAlarm = useIntegrityStore((state) => state.dismissTamperAlarm);
  const auditIntegrity = useIntegrityStore((state) => state.auditIntegrity);
  const isAuditing = useIntegrityStore((state) => state.isAuditing);
  const lock = useVaultStore((state) => state.lock);

  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const titleId = useId();
  const descriptionId = useId();

  useScrollLock(tamperAlarmActive);

  const safeCorruptedItems: CorruptedItemDetail[] = Array.isArray(corruptedItems)
    ? corruptedItems
    : [];

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Focus management: store previous active element, auto-focus, trap Tab, restore on close
  useEffect(() => {
    if (tamperAlarmActive) {
      if (typeof document !== 'undefined') {
        previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
      }

      // Initial focus on mount
      const focusTimer = setTimeout(() => {
        if (dialogRef.current) {
          const focusable = dialogRef.current.querySelector<HTMLElement>(
            'button[variant="danger"], button.bg-rose-600, button:not([disabled])',
          );
          focusable?.focus();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          dismissTamperAlarm();
          return;
        }

        if (e.key === 'Tab' && dialogRef.current) {
          const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          // If focus somehow left dialog, pull it back
          if (!dialogRef.current.contains(document.activeElement)) {
            firstElement.focus();
            e.preventDefault();
            return;
          }

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(focusTimer);
        window.removeEventListener('keydown', handleKeyDown);
        if (
          previouslyFocusedElementRef.current &&
          typeof previouslyFocusedElementRef.current.focus === 'function'
        ) {
          try {
            previouslyFocusedElementRef.current.focus();
          } catch {
            // Ignore focus errors
          }
        }
      };
    }
    return undefined;
  }, [tamperAlarmActive, dismissTamperAlarm]);

  const handleCopyHash = useCallback(async (hash: string, label: string) => {
    if (!hash) return;
    try {
      let copied = false;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(hash);
          copied = true;
        } catch {
          // Fall through to DOM fallback
        }
      }

      if (!copied && typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = hash;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        copied = true;
      }

      if (copied) {
        setCopiedHash(label);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => {
          setCopiedHash((curr) => (curr === label ? null : curr));
        }, 2000);
      }
    } catch (err) {
      console.warn('Could not copy hash to clipboard', err);
    }
  }, []);

  const handleAudit = useCallback(async () => {
    setActionError(null);
    try {
      const passed = await auditIntegrity();
      if (passed) {
        dismissTamperAlarm();
      }
    } catch (err) {
      setActionError('Integrity audit failed to connect to verification server. Please retry.');
      console.error('Audit failed:', err);
    }
  }, [auditIntegrity, dismissTamperAlarm]);

  const handleLockdown = useCallback(() => {
    setActionError(null);
    try {
      lock();
    } catch (err) {
      console.error('Error locking vault:', err);
    } finally {
      dismissTamperAlarm();
    }
  }, [lock, dismissTamperAlarm]);

  if (!tamperAlarmActive) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-sm sm:backdrop-blur-md"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            dismissTamperAlarm();
          }
        }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'relative w-full max-w-2xl my-auto max-h-[92vh] max-h-[min(92vh,calc(100dvh-1.5rem))] flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-rose-500/40 bg-zinc-950 p-3.5 sm:p-6 md:p-8 text-white shadow-[0_0_50px_-10px_rgba(244,63,94,0.4)] focus:outline-none',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="flex items-start sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-3 sm:pb-4 shrink-0">
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div
                className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30"
                aria-hidden="true"
              >
                <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id={titleId}
                  className="text-sm sm:text-lg font-bold text-rose-400 leading-tight truncate flex items-center gap-1.5"
                >
                  <span>🚨 Cryptographic Tamper Alarm</span>
                </h3>
                <p
                  id={descriptionId}
                  className="text-[11px] sm:text-xs text-rose-200/70 leading-snug mt-0.5 line-clamp-2"
                >
                  Merkle Tree Verification Failed — Bit-flip or silent data modification detected!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={dismissTamperAlarm}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-white transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
              aria-label="Close alarm"
              title="Close Alarm"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar my-3 sm:my-4 space-y-3 sm:space-y-4 pr-1 text-xs sm:text-sm text-zinc-300">
            {actionError && (
              <div
                className="rounded-xl border border-red-500/40 bg-red-950/30 p-2.5 sm:p-3 text-xs text-red-200"
                role="alert"
              >
                {actionError}
              </div>
            )}

            {/* Warning Callout Box */}
            <div className="rounded-xl sm:rounded-2xl border border-rose-500/30 bg-rose-950/20 p-3 sm:p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="h-4 w-4 sm:h-5 sm:w-5 text-rose-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-[11px] sm:text-xs leading-relaxed text-rose-200">
                  <p className="font-semibold text-rose-300 mb-0.5 sm:mb-1">
                    Threat Alert: Cryptographic Invariant Broken
                  </p>
                  A discrepancy was detected between your stored Merkle Root and the raw binary
                  payload in memory or cloud storage. Even a 1-bit silent modification triggers this
                  instant alarm.
                </div>
              </div>
            </div>

            {/* List of Corrupted / Modified Items */}
            {safeCorruptedItems.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Affected Item(s) ({safeCorruptedItems.length}):
                  </p>
                </div>
                <div className="max-h-48 sm:max-h-60 overflow-y-auto space-y-2.5 custom-scrollbar pr-1">
                  {safeCorruptedItems.map((item, idx) => {
                    const itemKey = item.itemId || `corrupted-${idx}`;
                    const isExpectedCopied = copiedHash === `expected-${itemKey}`;
                    const isActualCopied = copiedHash === `actual-${itemKey}`;

                    return (
                      <div
                        key={itemKey}
                        className="rounded-xl border border-rose-500/20 bg-zinc-900/80 p-2.5 sm:p-3.5 text-xs space-y-2 hover:border-rose-500/35 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 font-semibold text-zinc-200">
                          <span className="flex items-center gap-1.5 min-w-0 flex-1 truncate text-[11px] sm:text-xs">
                            <FileWarning
                              className="h-3.5 w-3.5 text-rose-400 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{item.title || 'Untitled Item'}</span>
                          </span>
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] sm:text-[10px] text-rose-300 uppercase font-mono shrink-0">
                            {item.category || 'unknown'}
                          </span>
                        </div>

                        <p className="text-[10px] sm:text-[11px] text-rose-300/80 leading-relaxed break-words">
                          {item.reason || 'Cryptographic integrity mismatch detected.'}
                        </p>

                        <div className="grid grid-cols-1 gap-1.5 pt-1.5 font-mono text-[10px] text-zinc-400 border-t border-white/5">
                          <div className="flex items-center justify-between gap-2 min-w-0 bg-black/30 px-2 py-1 rounded">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                              <span className="text-zinc-500 shrink-0">Expected:</span>
                              <span
                                className="text-emerald-400 truncate select-all"
                                title={item.expectedHash}
                              >
                                {item.expectedHash || 'N/A'}
                              </span>
                            </div>
                            {item.expectedHash && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyHash(item.expectedHash, `expected-${itemKey}`)
                                }
                                className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors shrink-0"
                                title="Copy Expected Hash"
                                aria-label="Copy expected hash"
                              >
                                {isExpectedCopied ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 min-w-0 bg-black/30 px-2 py-1 rounded">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                              <span className="text-zinc-500 shrink-0">Actual:</span>
                              <span
                                className="text-rose-400 truncate select-all"
                                title={item.actualHash}
                              >
                                {item.actualHash || 'N/A'}
                              </span>
                            </div>
                            {item.actualHash && (
                              <button
                                type="button"
                                onClick={() => handleCopyHash(item.actualHash, `actual-${itemKey}`)}
                                className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors shrink-0"
                                title="Copy Actual Hash"
                                aria-label="Copy actual hash"
                              >
                                {isActualCopied ? (
                                  <Check className="h-3 w-3 text-rose-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-500/20 bg-zinc-900/60 p-3 sm:p-4 text-xs text-zinc-300 space-y-1">
                <p className="font-semibold text-rose-300">Root Tree Inconsistency Detected</p>
                <p className="text-zinc-400 text-[11px] sm:text-xs">
                  The overall Merkle tree root does not match stored verification state. Run a
                  re-scan to identify affected vault leaves or lock the vault to protect your data.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons Footer */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2.5 sm:justify-end shrink-0 pt-3 border-t border-rose-500/20">
            <Button
              variant="ghost"
              onClick={dismissTamperAlarm}
              className="text-zinc-400 hover:text-white w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm order-3 sm:order-1 active:scale-[0.98]"
            >
              Dismiss Alarm
            </Button>

            <Button
              variant="secondary"
              onClick={handleAudit}
              disabled={isAuditing}
              aria-busy={isAuditing}
              className="flex items-center justify-center gap-2 border-white/10 text-zinc-300 hover:bg-white/10 w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm order-2 sm:order-2 active:scale-[0.98]"
            >
              <RefreshCw
                className={`h-4 w-4 shrink-0 ${isAuditing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isAuditing ? 'Re-Scanning...' : 'Re-Scan Merkle Tree'}</span>
            </Button>

            <Button
              variant="danger"
              onClick={handleLockdown}
              className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-lg w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-semibold order-1 sm:order-3 active:scale-[0.98]"
            >
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Lockdown Vault</span>
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
});

VaultIntegrityAlarmModal.displayName = 'VaultIntegrityAlarmModal';
