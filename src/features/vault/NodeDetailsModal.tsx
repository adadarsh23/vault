import React, { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { DiagramNode } from './ecosystemHelpers';
import { Variants } from 'framer-motion';

interface NodeDetailsModalProps {
  node: DiagramNode | null;
  onClose: () => void;
}

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 1, 1],
    },
  },
} as const;

const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 24,
    scale: 0.96,
    filter: 'blur(6px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 22,
      mass: 0.8,
    },
  },
  exit: {
    opacity: 0,
    y: 16,
    scale: 0.97,
    filter: 'blur(4px)',
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 1, 1],
    },
  },
} as const;

export const NodeDetailsModal: React.FC<NodeDetailsModalProps> = ({ node, onClose }) => {
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!node) return;

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [node, handleEscape]);

  return (
    <AnimatePresence mode="wait">
      {node && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`${node.title} details`}
        >
          {/* Backdrop layer */}
          <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />

          {/* Modal */}
          <motion.div
            variants={modalVariants}
            className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.7rem] border border-card-border bg-card-bg/90 p-5 text-text shadow-[0_30px_90px_-40px_rgba(15,23,42,0.55)] ring-1 ring-white/10 backdrop-blur-2xl sm:rounded-[1.85rem] sm:p-6 dark:border-white/10 dark:bg-black/65"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Node tone glow */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${node.tone.glow} opacity-65`}
            />
            {/* Surface shimmer */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent"
            />

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-card-border bg-text/5 text-text/70 transition-colors duration-200 hover:bg-text/10 hover:text-text focus:outline-none focus:ring-2 focus:ring-white/30 dark:border-white/10"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="relative flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-card-bg/85 ${node.tone.softBg} ${node.tone.ring}`}
              >
                {(() => {
                  const Icon = node.icon;
                  return <Icon className={`h-[18px] w-[18px] ${node.tone.icon}`} />;
                })()}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text/45">
                  Ecosystem Node
                </p>
                <h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-text">
                  {node.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text/65">{node.subtitle}</p>
              </div>
            </div>

            {/* Description */}
            <div className="mt-6 rounded-2xl border border-card-border bg-text/[0.04] p-4 dark:border-white/10">
              <p className="text-sm leading-7 text-text/70">{node.description}</p>
            </div>

            {/* Details */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {node.details.map((detail, index) => (
                <div
                  key={detail && detail.trim() ? `${detail.trim()}-${index}` : `detail-${index}`}
                  className={`relative overflow-hidden rounded-[1.1rem] border border-card-border bg-card-bg/85 p-4 text-sm leading-6 text-text/65 ring-1 transition-colors duration-200 hover:bg-text/[0.06] dark:border-white/10 ${node.tone.ring}`}
                >
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${node.tone.glow} opacity-35`}
                  />
                  <div className="relative">{detail}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
