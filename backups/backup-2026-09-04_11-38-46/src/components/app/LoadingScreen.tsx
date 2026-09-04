import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LoadingScreenProps {
  label?: string;
  className?: string;
  fullscreen?: boolean;
}

export const LoadingScreen = memo(function LoadingScreen({
  label = 'Loading...',
  className,
  fullscreen = true,
}: LoadingScreenProps) {
  const shouldReduceMotion = useReducedMotion();

  const safeLabel = typeof label === 'string' && label.trim() ? label : 'Loading...';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-4 bg-bg text-center',
        fullscreen ? 'min-h-dvh' : 'h-full min-h-full',
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

      <p className={cn('text-text/50 text-sm font-medium', !shouldReduceMotion && 'animate-pulse')}>
        {safeLabel}
      </p>
    </div>
  );
});
