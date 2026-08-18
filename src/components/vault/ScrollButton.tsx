import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

export const ScrollButton: React.FC<{
  onClick: () => void;
  visible: boolean;
  icon: React.ElementType;
  className?: string;
  ariaLabel?: string;
}> = ({ onClick, visible, icon: Icon, className, ariaLabel = 'Scroll' }) => {
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    },
    [onClick]
  );

  const handleTouchEnd = React.useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    },
    [onClick]
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          aria-label={ariaLabel}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
          className={cn(
            'absolute z-30 p-2 rounded-full bg-zinc-900/90 text-white/70 hover:text-white hover:bg-zinc-800 shadow-xl transition-colors border border-white/15 backdrop-blur-md touch-manipulation cursor-pointer select-none',
            className
          )}
        >
          <Icon className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
};
