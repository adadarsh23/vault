import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Pin,
  ShieldCheck,
  Video,
  Camera,
  Clock,
  ArrowUpDown,
  LayoutGrid,
  Grid3X3,
  Grid2X2,
  List,
  CheckSquare,
  ChevronDown,
  Calendar,
  ArrowDownAZ,
  ArrowUpZA,
  HardDrive,
  Check,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { GridDensity, MediaFilterType, MediaSortType } from './mediaUtils';

interface MediaFiltersProps {
  type: 'photo' | 'video';
  totalCount: number;
  filteredCount: number;
  activeFilter: MediaFilterType;
  onFilterChange: (filter: MediaFilterType) => void;
  activeSort: MediaSortType;
  onSortChange: (sort: MediaSortType) => void;
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  isSelectionMode: boolean;
  onToggleSelectionMode: () => void;
  selectedCount: number;
}

const FILTER_ITEMS: { id: MediaFilterType; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: Sparkles },
  { id: 'favorites', label: 'Favorites', icon: Pin },
  { id: 'live', label: 'Live', icon: ShieldCheck },
  { id: '4k', label: '4K', icon: Video },
  { id: 'raw', label: 'RAW', icon: Camera },
  { id: 'recent', label: 'Recent', icon: Clock },
];

const SORT_OPTIONS: {
  id: MediaSortType;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
}[] = [
  { id: 'date-desc', label: 'Newest First', shortLabel: 'Newest', icon: Calendar },
  { id: 'date-asc', label: 'Oldest First', shortLabel: 'Oldest', icon: Clock },
  { id: 'name-asc', label: 'Name (A to Z)', shortLabel: 'Name A–Z', icon: ArrowDownAZ },
  { id: 'name-desc', label: 'Name (Z to A)', shortLabel: 'Name Z–A', icon: ArrowUpZA },
  { id: 'size-desc', label: 'Size (Largest)', shortLabel: 'Size (Max)', icon: HardDrive },
  { id: 'size-asc', label: 'Size (Smallest)', shortLabel: 'Size (Min)', icon: HardDrive },
];

export const MediaFilters: React.FC<MediaFiltersProps> = ({
  activeFilter,
  onFilterChange,
  activeSort,
  onSortChange,
  density,
  onDensityChange,
  isSelectionMode,
  onToggleSelectionMode,
  selectedCount,
}) => {
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const sortRef = React.useRef<HTMLDivElement>(null);

  // Close sort menu on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    if (isSortOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isSortOpen]);

  const activeSortOption = SORT_OPTIONS.find((o) => o.id === activeSort) || SORT_OPTIONS[0];

  return (
    <div className="flex flex-col gap-2 py-1.5 px-1 md:px-4 w-full">
      {/* Top bar: Quick Filter Chips + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
        {/* Compact & Sleek Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5 max-w-full">
          {FILTER_ITEMS.map((chip) => {
            const Icon = chip.icon;
            const isActive = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => onFilterChange(chip.id)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap border select-none shrink-0',
                  isActive
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                    : 'bg-white/5 text-text/60 border-white/10 hover:bg-white/10 hover:text-text hover:border-white/20',
                )}
                aria-pressed={isActive}
              >
                <Icon className={cn('h-3 w-3', isActive ? 'text-blue-400' : 'opacity-60')} />
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>

        {/* Controls: Sort Dropdown, Density Switcher, Batch Mode */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 w-full sm:w-auto">
          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSortOpen(!isSortOpen)}
              className={cn(
                'h-7 sm:h-7.5 rounded-full border px-2.5 text-[11px] backdrop-blur-md flex items-center gap-1 transition-all',
                isSortOpen
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'border-white/10 bg-white/5 text-text/80 hover:bg-white/10 hover:border-white/20',
              )}
              aria-label="Sort options"
            >
              <ArrowUpDown className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="font-medium">{activeSortOption.shortLabel}</span>
              <ChevronDown
                className={cn(
                  'h-2.5 w-2.5 opacity-60 transition-transform duration-200',
                  isSortOpen && 'rotate-180',
                )}
              />
            </Button>

            <AnimatePresence>
              {isSortOpen && (
                <>
                  {/* Backdrop on mobile for instant tap-away */}
                  <div
                    className="fixed inset-0 z-40 sm:hidden"
                    onClick={() => setIsSortOpen(false)}
                  />

                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-48 rounded-2xl border border-white/15 bg-black/95 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-50 flex flex-col gap-0.5 max-w-[calc(100vw-2rem)]"
                  >
                    <div className="px-2.5 py-1 text-[9px] font-bold text-text/40 uppercase tracking-widest border-b border-white/5 flex items-center justify-between">
                      <span>Sort By</span>
                      <ArrowUpDown className="h-2.5 w-2.5 text-text/40" />
                    </div>
                    {SORT_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = activeSort === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            onSortChange(opt.id);
                            setIsSortOpen(false);
                          }}
                          className={cn(
                            'w-full rounded-xl px-2.5 py-1.5 text-left text-[11px] transition-colors flex items-center justify-between gap-2',
                            isActive
                              ? 'bg-blue-500/20 text-blue-300 font-semibold'
                              : 'text-text/80 hover:bg-white/10 hover:text-white',
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon
                              className={cn('h-3 w-3', isActive ? 'text-blue-400' : 'opacity-60')}
                            />
                            <span>{opt.label}</span>
                          </div>
                          {isActive && <Check className="h-3 w-3 text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Density Switcher (Compact, Standard, Large, List) */}
          <div className="flex items-center rounded-full bg-white/5 p-0.5 border border-white/10 backdrop-blur-md shrink-0">
            <button
              onClick={() => onDensityChange('compact')}
              title="Compact View"
              className={cn(
                'rounded-full p-1 transition-all text-text/60 hover:text-text',
                density === 'compact' && 'bg-white/20 text-white shadow-sm',
              )}
              aria-label="Compact grid view"
            >
              <Grid3X3 className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDensityChange('standard')}
              title="Standard View"
              className={cn(
                'rounded-full p-1 transition-all text-text/60 hover:text-text',
                density === 'standard' && 'bg-white/20 text-white shadow-sm',
              )}
              aria-label="Standard grid view"
            >
              <LayoutGrid className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDensityChange('large')}
              title="Large View"
              className={cn(
                'rounded-full p-1 transition-all text-text/60 hover:text-text',
                density === 'large' && 'bg-white/20 text-white shadow-sm',
              )}
              aria-label="Large grid view"
            >
              <Grid2X2 className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDensityChange('list')}
              title="List View"
              className={cn(
                'rounded-full p-1 transition-all text-text/60 hover:text-text',
                density === 'list' && 'bg-white/20 text-white shadow-sm',
              )}
              aria-label="List view"
            >
              <List className="h-3 w-3" />
            </button>
          </div>

          {/* Batch Selection Mode Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSelectionMode}
            className={cn(
              'h-7 sm:h-7.5 rounded-full border px-2.5 text-[11px] transition-all flex items-center gap-1 shrink-0',
              isSelectionMode
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                : 'border-white/10 bg-white/5 text-text/70 hover:bg-white/10 hover:border-white/20',
            )}
            aria-label="Toggle batch selection"
          >
            <CheckSquare className="h-3 w-3" />
            <span>
              {isSelectionMode ? (selectedCount > 0 ? `${selectedCount} sel` : 'Done') : 'Select'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};
