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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex flex-col items-center justify-center p-4"
        >
          {/* Blur backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-black/80 p-8 text-center shadow-2xl"
          >
            {/* Background effects */}
            <div className="absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="absolute -bottom-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />

            <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-inner">
              <Lock className="h-10 w-10" strokeWidth={1.5} />
            </div>

            <h2 className="relative mb-2 text-2xl font-bold tracking-tight text-white">
              Auto-Locking
            </h2>
            <p className="relative mb-8 text-sm leading-relaxed text-white/60">
              Your vault will lock automatically to secure your data in{' '}
              <span className="font-mono text-base font-medium text-amber-400">
                {countdownSeconds}
              </span>{' '}
              seconds.
            </p>

            <div className="relative flex w-full flex-col gap-3">
              <Button
                variant="primary"
                className="h-12 w-full justify-center rounded-xl bg-blue-600 font-semibold hover:bg-blue-500"
                onClick={resetTimer}
              >
                <ShieldCheck className="mr-2 h-5 w-5" />
                Stay Active
              </Button>
            </div>

            {/* Progress Bar */}
            <div className="relative mt-8 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full bg-amber-500"
                initial={{ width: '100%' }}
                animate={{ width: `${(countdownSeconds! / 30) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
