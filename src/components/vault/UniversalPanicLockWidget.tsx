import React, { useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { useVaultStore } from '../../store/vaultStore';
import { cn } from '../../lib/utils';

export interface UniversalPanicLockWidgetProps {
  className?: string;
  sideOffset?: number;
}

export const UniversalPanicLockWidget: React.FC<UniversalPanicLockWidgetProps> = ({
  className,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isUnlocked = useVaultStore((state) => state.isUnlocked);
  const isVaultReady = useVaultStore((state) => state.isVaultReady);
  const panicLock = useVaultStore((state) => state.panicLock);

  const handlePanicClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        panicLock();
      } catch (error) {
        console.error('Failed to execute instant panic lock:', error);
      }
    },
    [panicLock],
  );

  // Render only when vault is unlocked & ready
  if (!isUnlocked || !isVaultReady) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed bottom-[4.25rem] right-3.5 sm:bottom-[4.85rem] sm:right-5 z-40 select-none print:hidden pointer-events-auto',
        className,
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <AnimatePresence>
        <motion.button
          type="button"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          whileHover={shouldReduceMotion ? undefined : { scale: 1.08 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
          onClick={handlePanicClick}
          className={cn(
            'group relative flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full',
            'border border-red-500/30 dark:border-red-500/40 bg-sidebar-bg/95 dark:bg-zinc-900/95',
            'text-red-500 dark:text-red-400 shadow-lg backdrop-blur-xl transition-all duration-200',
            'hover:border-red-500/70 dark:hover:border-red-500/80 hover:bg-red-500/15 dark:hover:bg-red-500/25 hover:text-red-600 dark:hover:text-red-300',
            'hover:shadow-[0_0_16px_rgba(239,68,68,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60',
            'active:scale-95 touch-manipulation cursor-pointer',
          )}
          aria-label="Instant Panic Lock (Clears memory and locks vault, or press Esc 3 times)"
          title="Instant Panic Lock (Press Esc 3× or click to lock instantly)"
        >
          {/* Subtle Emergency Indicator Pulse Dot */}
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 pointer-events-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
          </span>

          <ShieldAlert className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
        </motion.button>
      </AnimatePresence>
    </div>
  );
};

export const UniversalPanicLock = UniversalPanicLockWidget;
export default UniversalPanicLockWidget;
