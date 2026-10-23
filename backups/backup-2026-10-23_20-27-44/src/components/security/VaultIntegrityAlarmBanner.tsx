import { memo, useCallback } from 'react';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { useIntegrityStore, TamperAlarmPayload } from '../../store/integrityStore';
import { cn } from '../../lib/utils';

export interface VaultIntegrityAlarmBannerProps {
  className?: string;
}

export const VaultIntegrityAlarmBanner = memo(function VaultIntegrityAlarmBanner({
  className,
}: VaultIntegrityAlarmBannerProps) {
  const tamperAlarmActive = useIntegrityStore((state) => state.tamperAlarmActive);
  const corruptedItems = useIntegrityStore((state) => state.corruptedItems);
  const triggerTamperAlarm = useIntegrityStore((state) => state.triggerTamperAlarm);
  const lastAlarmPayload = useIntegrityStore((state) => state.lastAlarmPayload);

  const safeCorruptedItems = Array.isArray(corruptedItems) ? corruptedItems : [];
  const corruptedCount = safeCorruptedItems.length;

  const handleViewDetails = useCallback(() => {
    try {
      if (lastAlarmPayload) {
        triggerTamperAlarm(lastAlarmPayload);
      } else {
        const fallbackPayload: TamperAlarmPayload = {
          type: 'CRYPTOGRAPHIC_TAMPER_DETECTED',
          severity: 'CRITICAL',
          corruptedItems: safeCorruptedItems,
          timestamp: Date.now(),
        };
        triggerTamperAlarm(fallbackPayload);
      }
    } catch (err) {
      console.error('Failed to open tamper alarm details:', err);
    }
  }, [lastAlarmPayload, triggerTamperAlarm, safeCorruptedItems]);

  if (!tamperAlarmActive) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'sticky top-0 z-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-b border-rose-500/40 bg-rose-950/95 px-3 py-2 sm:px-4 sm:py-2.5 text-xs text-rose-200 backdrop-blur-md shadow-lg animate-in slide-in-from-top duration-300',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 animate-pulse" aria-hidden="true" />
        <span className="font-bold text-rose-300 shrink-0 uppercase tracking-wide">
          CRITICAL TAMPER ALARM:
        </span>
        <span className="truncate text-rose-200/90 font-medium">
          {corruptedCount > 0
            ? `Merkle Tree mismatch (${corruptedCount} corrupted item${corruptedCount === 1 ? '' : 's'}).`
            : 'Merkle Tree mismatch (cryptographic anomaly detected).'}
        </span>
      </div>

      <button
        type="button"
        onClick={handleViewDetails}
        className="w-full sm:w-auto min-h-[38px] sm:min-h-[32px] flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-rose-500/25 px-3.5 py-1.5 font-semibold text-rose-200 hover:bg-rose-500/35 active:bg-rose-500/45 transition-colors border border-rose-500/40 text-xs focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1 focus:ring-offset-rose-950"
      >
        <span>View Alarm Details</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </div>
  );
});

VaultIntegrityAlarmBanner.displayName = 'VaultIntegrityAlarmBanner';
