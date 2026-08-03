import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../../lib/utils';

interface ToggleRowProps {
  title: string;
  description: string;
  isActive: boolean;
  onToggle: (value: boolean) => void;
  activeColor?: string;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  title,
  description,
  isActive,
  onToggle,
  activeColor = 'bg-text',
}) => (
  <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-text transition-colors">{title}</p>
      <p className="mt-1 text-xs leading-5 text-text/40 transition-colors">{description}</p>
    </div>

    <button
      type="button"
      onClick={() => onToggle(!isActive)}
      className={cn(
        'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        isActive
          ? `${activeColor} border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]`
          : 'border-white/10 bg-white/10 hover:bg-white/15'
      )}
      role="switch"
      aria-checked={isActive}
      aria-label={title}
    >
      <motion.span
        animate={{ x: isActive ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn(
          'block h-5 w-5 rounded-full shadow-md',
          isActive && activeColor === 'bg-text' ? 'bg-bg' : 'bg-white'
        )}
      />
    </button>
  </div>
);
