import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, AlertTriangle, Lock, RefreshCw, FileWarning } from 'lucide-react';
import { useIntegrityStore } from '../../store/integrityStore';
import { useVaultStore } from '../../store/vaultStore';
import { Button } from '../ui/Button';

export const VaultIntegrityAlarmModal: React.FC = () => {
  const tamperAlarmActive = useIntegrityStore((state) => state.tamperAlarmActive);
  const corruptedItems = useIntegrityStore((state) => state.corruptedItems);
  const dismissTamperAlarm = useIntegrityStore((state) => state.dismissTamperAlarm);
  const auditIntegrity = useIntegrityStore((state) => state.auditIntegrity);
  const isAuditing = useIntegrityStore((state) => state.isAuditing);
  const lock = useVaultStore((state) => state.lock);

  if (!tamperAlarmActive) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-rose-500/40 bg-zinc-950 p-6 text-white shadow-[0_0_50px_-10px_rgba(244,63,94,0.4)] sm:p-8"
        >
          {/* Pulsing Alert Indicator */}
          <div className="flex items-center gap-3 border-b border-rose-500/20 pb-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
              <ShieldAlert className="h-6 w-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-rose-400">
                🚨 Cryptographic Tamper Alarm Triggered
              </h3>
              <p className="text-xs text-rose-200/70">
                Merkle Tree Verification Failed — Bit-flip or silent data modification detected!
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="my-5 space-y-3 text-sm text-zinc-300">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-rose-200">
                  <p className="font-semibold text-rose-300 mb-1">
                    Threat Alert: Cryptographic Invariant Broken
                  </p>
                  A single or multi-bit discrepancy was detected between your stored Merkle Root and
                  the raw binary payload. Even a 1-bit silent modification in cloud storage triggers
                  this immediate alarm to prevent bit-flip attacks.
                </div>
              </div>
            </div>

            {/* List of Corrupted / Modified Items */}
            {corruptedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Affected Item(s) ({corruptedItems.length}):
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                  {corruptedItems.map((item, idx) => (
                    <div
                      key={item.itemId || idx}
                      className="rounded-xl border border-rose-500/20 bg-zinc-900/80 p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-zinc-200">
                        <span className="flex items-center gap-1.5 truncate max-w-[280px]">
                          <FileWarning className="h-3.5 w-3.5 text-rose-400" />
                          {item.title}
                        </span>
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300 uppercase">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-rose-300/80">{item.reason}</p>
                      <div className="grid grid-cols-1 gap-1 pt-1 font-mono text-[10px] text-zinc-400">
                        <div className="truncate">
                          <span className="text-zinc-500">Expected: </span>
                          <span className="text-emerald-400">{item.expectedHash}</span>
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">Actual: </span>
                          <span className="text-rose-400">{item.actualHash}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button
              variant="danger"
              onClick={() => {
                lock();
                dismissTamperAlarm();
              }}
              className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-lg"
            >
              <Lock className="h-4 w-4" />
              Lockdown Vault Immediately
            </Button>

            <Button
              variant="secondary"
              onClick={() => auditIntegrity()}
              disabled={isAuditing}
              className="flex items-center justify-center gap-2 border-white/10 text-zinc-300 hover:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${isAuditing ? 'animate-spin' : ''}`} />
              Re-Scan Merkle Tree
            </Button>

            <Button
              variant="ghost"
              onClick={dismissTamperAlarm}
              className="text-zinc-400 hover:text-white"
            >
              Dismiss Alarm
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
