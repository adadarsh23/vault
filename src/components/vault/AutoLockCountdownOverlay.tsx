import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';

interface AutoLockCountdownOverlayProps {
  countdownSeconds: number | null;
  resetTimer: () => void;
}

export const AutoLockCountdownOverlay: React.FC<AutoLockCountdownOverlayProps> = ({
  countdownSeconds,
  resetTimer,
}) => {
  const isVisible = countdownSeconds !== null && countdownSeconds <= 30;

  return (
    <AnimatePresence>
      {isVisible && (
        <div
          className="fixed inset-0 z-[150] flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="autolock-title"
          aria-describedby="autolock-description"
        >
          {/* Blur backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-xl"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-black/90 p-8 text-center shadow-2xl backdrop-blur-2xl"
          >
            {/* Subtle monochrome ambient glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-white/[0.04] blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-white/[0.02] blur-3xl" />

            {/* Lock Icon */}
            <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white shadow-inner">
              <Lock className="h-9 w-9 text-white" strokeWidth={1.75} />
            </div>

            <h2
              id="autolock-title"
              className="relative mb-2 text-2xl font-bold tracking-tight text-white"
            >
              Auto-Locking
            </h2>
            <p
              id="autolock-description"
              className="relative mb-8 text-sm leading-relaxed text-white/60"
            >
              Your vault will lock automatically to secure your data in{' '}
              <span className="inline-block rounded-md border border-white/10 bg-white/10 px-2 py-0.5 font-mono text-sm font-bold text-white tabular-nums">
                {countdownSeconds}s
              </span>
            </p>

            <div className="relative flex w-full flex-col gap-3">
              <Button
                variant="primary"
                className="h-12 w-full justify-center rounded-xl bg-white font-semibold text-black shadow-lg shadow-white/5 hover:bg-white/90 active:scale-[0.98]"
                onClick={resetTimer}
              >
                <ShieldCheck className="mr-2 h-5 w-5 text-black" />
                Stay Active
              </Button>
            </div>

            {/* Progress Bar */}
            <div className="relative mt-8 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-white"
                initial={{ width: '100%' }}
                animate={{ width: `${(Math.max(0, countdownSeconds ?? 0) / 30) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
