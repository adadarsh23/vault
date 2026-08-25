import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Check } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { CAMERA_FILTERS } from './filters';
import { CameraFilter } from './types';
import { triggerHaptic } from './haptics';

interface FilterPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFilter: CameraFilter;
  onSelectFilter: (filter: CameraFilter) => void;
}

export const FilterPickerModal: React.FC<FilterPickerModalProps> = ({
  isOpen,
  onClose,
  selectedFilter,
  onSelectFilter,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm sm:max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl text-white"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/15 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base tracking-wide leading-tight">
                    Live Filters
                  </h3>
                  <p className="text-[10px] text-white/40 font-medium">
                    Real-time hardware color grading
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Filter Grid */}
            <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
              {CAMERA_FILTERS.map((preset) => {
                const isSelected = selectedFilter === preset.id;
                const IconComponent = preset.icon;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tick');
                      onSelectFilter(preset.id);
                    }}
                    className={cn(
                      'group relative flex flex-col items-start p-2.5 sm:p-3 rounded-xl border text-left transition-all active:scale-95',
                      isSelected
                        ? 'border-primary/60 bg-primary/15 shadow-lg shadow-primary/10 ring-1 ring-primary/30'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20',
                    )}
                  >
                    <div className="flex w-full items-center justify-between mb-1.5">
                      <div
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-lg border transition-all',
                          isSelected
                            ? preset.badgeColor
                            : 'bg-white/5 border-white/10 text-white/70 group-hover:text-white',
                        )}
                      >
                        <IconComponent className={cn('h-3.5 w-3.5', preset.iconColor)} />
                      </div>
                      {isSelected && (
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-black">
                          <Check className="h-2.5 w-2.5 stroke-[3px]" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-bold text-white tracking-wide">
                      {preset.label}
                    </span>
                    <p className="text-[9px] text-white/40 leading-tight mt-0.5 line-clamp-1">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={onClose}
                className="rounded-xl px-5 text-xs font-bold shadow-lg shadow-primary/20"
              >
                Apply
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
