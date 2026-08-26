import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, AlertTriangle, Lock, RefreshCw, FileWarning, X } from 'lucide-react';
import { useIntegrityStore } from '../../store/integrityStore';
import { useVaultStore } from '../../store/vaultStore';
import { Button } from '../ui/Button';
import { useScrollLock } from '../../hooks/useScrollLock';

export const VaultIntegrityAlarmModal: React.FC = () => {
  const tamperAlarmActive = useIntegrityStore((state) => state.tamperAlarmActive);
  const corruptedItems = useIntegrityStore((state) => state.corruptedItems);
  const dismissTamperAlarm = useIntegrityStore((state) => state.dismissTamperAlarm);
  const auditIntegrity = useIntegrityStore((state) => state.auditIntegrity);
  const isAuditing = useIntegrityStore((state) => state.isAuditing);
  const lock = useVaultStore((state) => state.lock);

  useScrollLock(tamperAlarmActive);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tamperAlarmActive) {
        dismissTamperAlarm();
      }
    },
    [tamperAlarmActive, dismissTamperAlarm],
  );

  useEffect(() => {
    if (tamperAlarmActive) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [tamperAlarmActive, handleKeyDown]);

  if (!tamperAlarmActive) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            dismissTamperAlarm();
          }
        }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tamper-alarm-title"
        aria-describedby="tamper-alarm-description"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl my-auto max-h-[92vh] flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-rose-500/40 bg-zinc-950 p-4 sm:p-6 md:p-8 text-white shadow-[0_0_50px_-10px_rgba(244,63,94,0.4)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="flex items-start sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-3.5 sm:pb-4 shrink-0">
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
                <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="tamper-alarm-title"
                  className="text-sm sm:text-lg font-bold text-rose-400 leading-tight truncate"
                >
                  🚨 Cryptographic Tamper Alarm
                </h3>
                <p
                  id="tamper-alarm-description"
                  className="text-[11px] sm:text-xs text-rose-200/70 leading-snug mt-0.5"
                >
                  Merkle Tree Verification Failed — Bit-flip or silent data modification detected!
                </p>
              </div>
            </div>

            <button
              onClick={dismissTamperAlarm}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-white transition-colors shrink-0"
              aria-label="Close alarm"
              title="Close Alarm"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar my-3.5 sm:my-5 space-y-3 sm:space-y-4 pr-1 text-xs sm:text-sm text-zinc-300">
            {/* Warning Callout Box */}
            <div className="rounded-xl sm:rounded-2xl border border-rose-500/30 bg-rose-950/20 p-3 sm:p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-rose-400 shrink-0 mt-0.5" />
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
            {corruptedItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Affected Item(s) ({corruptedItems.length}):
                  </p>
                </div>
                <div className="max-h-44 sm:max-h-56 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                  {corruptedItems.map((item, idx) => (
                    <div
                      key={item.itemId || idx}
                      className="rounded-xl border border-rose-500/20 bg-zinc-900/80 p-2.5 sm:p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-zinc-200">
                        <span className="flex items-center gap-1.5 min-w-0 flex-1 truncate text-[11px] sm:text-xs">
                          <FileWarning className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </span>
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] sm:text-[10px] text-rose-300 uppercase font-mono shrink-0">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-rose-300/80 leading-relaxed break-words">
                        {item.reason}
                      </p>
                      <div className="grid grid-cols-1 gap-1 pt-1 font-mono text-[10px] text-zinc-400 border-t border-white/5">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-zinc-500 shrink-0">Expected:</span>
                          <span
                            className="text-emerald-400 truncate select-all"
                            title={item.expectedHash}
                          >
                            {item.expectedHash}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-zinc-500 shrink-0">Actual:</span>
                          <span
                            className="text-rose-400 truncate select-all"
                            title={item.actualHash}
                          >
                            {item.actualHash}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons Footer */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2.5 sm:justify-end shrink-0 pt-3 border-t border-rose-500/20">
            <Button
              variant="ghost"
              onClick={dismissTamperAlarm}
              className="text-zinc-400 hover:text-white w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm order-3 sm:order-1"
            >
              Dismiss Alarm
            </Button>

            <Button
              variant="secondary"
              onClick={() => auditIntegrity()}
              disabled={isAuditing}
              className="flex items-center justify-center gap-2 border-white/10 text-zinc-300 hover:bg-white/10 w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm order-2 sm:order-2"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Re-Scanning...' : 'Re-Scan Merkle Tree'}</span>
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                lock();
                dismissTamperAlarm();
              }}
              className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-lg w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-semibold order-1 sm:order-3"
            >
              <Lock className="h-4 w-4 shrink-0" />
              <span>Lockdown Vault</span>
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
