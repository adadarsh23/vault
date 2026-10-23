import { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LoadingScreenProps {
  label?: string;
  className?: string;
  fullscreen?: boolean;
  showTimeoutAction?: boolean;
  onRetry?: () => void;
}

export const LoadingScreen = memo(function LoadingScreen({
  label = 'Loading...',
  className,
  fullscreen = true,
  showTimeoutAction = true,
  onRetry,
}: LoadingScreenProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!showTimeoutAction) return;

    const timer = setTimeout(() => {
      setIsSlow(true);
    }, 7000);

    return () => clearTimeout(timer);
  }, [showTimeoutAction]);

  const safeLabel = typeof label === 'string' && label.trim() ? label : 'Loading...';

  const handleAction = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    try {
      window.location.reload();
    } catch {
      // Ignore if reload fails
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-4 bg-bg text-center px-4 select-none',
        fullscreen ? 'min-h-[100dvh]' : 'h-full min-h-full py-8',
        className,
      )}
    >
      <motion.div
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: 360 }}
        transition={
          shouldReduceMotion
            ? undefined
            : {
                duration: 0.9,
                repeat: Infinity,
                ease: 'linear',
              }
        }
        style={{ willChange: shouldReduceMotion ? 'auto' : 'transform' }}
      >
        <Loader2 className="h-10 w-10 text-text/50" strokeWidth={1.5} />
      </motion.div>

      <p className={cn('text-text/60 text-sm font-medium', !shouldReduceMotion && 'animate-pulse')}>
        {safeLabel}
      </p>

      {isSlow && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-2 mt-2"
        >
          <span className="text-xs text-text/40">Taking longer than expected...</span>
          <button
            type="button"
            onClick={handleAction}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text/80 bg-text/10 hover:bg-text/15 rounded-lg border border-text/15 transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            <span>{onRetry ? 'Try Again' : 'Reload Vault'}</span>
          </button>
        </motion.div>
      )}
    </div>
  );
});
