import React from 'react';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { useIntegrityStore } from '../../store/integrityStore';

export const VaultIntegrityAlarmBanner: React.FC = () => {
  const tamperAlarmActive = useIntegrityStore((state) => state.tamperAlarmActive);
  const corruptedItems = useIntegrityStore((state) => state.corruptedItems);
  const triggerTamperAlarm = useIntegrityStore((state) => state.triggerTamperAlarm);
  const lastAlarmPayload = useIntegrityStore((state) => state.lastAlarmPayload);

  if (!tamperAlarmActive) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-rose-500/40 bg-rose-950/95 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs text-rose-200 backdrop-blur-md shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 animate-pulse" />
        <span className="font-bold text-rose-300 shrink-0">CRITICAL TAMPER ALARM:</span>
        <span className="truncate text-rose-200/90">
          Merkle Tree mismatch ({corruptedItems.length} corrupted item
          {corruptedItems.length === 1 ? '' : 's'}).
        </span>
      </div>

      <button
        onClick={() => {
          if (lastAlarmPayload) {
            triggerTamperAlarm(lastAlarmPayload);
          }
        }}
        className="w-full sm:w-auto flex shrink-0 items-center justify-center gap-1 rounded-lg bg-rose-500/20 px-3 py-1.5 font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors border border-rose-500/30 text-xs"
      >
        <span>View Alarm Details</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </button>
    </div>
  );
};
