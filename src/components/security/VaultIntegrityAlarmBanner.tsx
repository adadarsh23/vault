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
    <div className="sticky top-0 z-50 flex items-center justify-between border-b border-rose-500/40 bg-rose-950/90 px-4 py-2.5 text-xs text-rose-200 backdrop-blur-md shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2.5 truncate">
        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 animate-pulse" />
        <span className="font-bold text-rose-300">CRITICAL TAMPER ALARM:</span>
        <span className="truncate">
          Merkle Tree mismatch ({corruptedItems.length} corrupted/modified item(s) detected).
        </span>
      </div>

      <button
        onClick={() => {
          if (lastAlarmPayload) {
            triggerTamperAlarm(lastAlarmPayload);
          }
        }}
        className="ml-3 flex shrink-0 items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors border border-rose-500/30"
      >
        View Alarm Details <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
};
