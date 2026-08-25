import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Film, PlayCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { VaultItem } from '../../../../lib/storage';
import { SafeMedia } from './SafeMedia';
import { cn } from '../../../../lib/utils';
import { useVaultStore } from '../../../../store/vaultStore';

interface MediaFilmstripProps {
  items: VaultItem[];
  activeItemId: string | null;
  masterKey: string | CryptoKey | null;
  type: 'photo' | 'video';
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}

export const MediaFilmstrip: React.FC<MediaFilmstripProps> = ({
  items,
  activeItemId,
  masterKey,
  type,
  isOpen,
  onToggle,
  onSelect,
}) => {
  const isDecoyMode = useVaultStore((state) => state.isDecoyMode);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active thumbnail into center view
  useEffect(() => {
    if (isOpen && activeThumbnailRef.current && scrollContainerRef.current) {
      activeThumbnailRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeItemId, isOpen]);

  if (items.length <= 1) return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-auto max-w-[96vw]"
      style={{
        bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))',
      }}
    >
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="h-6 rounded-full bg-black/75 hover:bg-black/90 px-2.5 text-[10px] text-white/80 border border-white/15 backdrop-blur-md mb-1.5 flex items-center gap-1 shadow-lg"
        title={isOpen ? 'Hide filmstrip' : 'Show filmstrip'}
      >
        <Film className="h-3 w-3 text-blue-400" />
        <span>Filmstrip ({items.length})</span>
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </Button>

      {/* Filmstrip drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl border border-white/20 bg-black/85 backdrop-blur-2xl shadow-2xl max-w-[96vw] md:max-w-2xl overflow-hidden"
          >
            <div
              ref={scrollContainerRef}
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto custom-scrollbar py-0.5 px-0.5 scroll-smooth"
            >
              {items.map((item) => {
                const isActive = item.id === activeItemId;
                return (
                  <button
                    key={item.id}
                    ref={isActive ? activeThumbnailRef : null}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item.id);
                    }}
                    className={cn(
                      'relative h-11 w-11 sm:h-14 sm:w-14 shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer focus:outline-none',
                      isActive
                        ? 'border-blue-500 scale-105 shadow-[0_0_15px_rgba(59,130,246,0.6)] ring-2 ring-blue-400/40'
                        : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/40'
                    )}
                    title={item.title}
                  >
                    {(masterKey || isDecoyMode) && (
                      <SafeMedia
                        item={item}
                        masterKey={masterKey}
                        type={type}
                        isThumbnail={true}
                        autoPlayVideo={false}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <PlayCircle className="h-4 w-4 text-white/80" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
