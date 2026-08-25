import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ArrowRightIcon,
  Download,
  Eye,
  FileUp,
  KeyRound,
  Lock,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  PlusCircle,
  Edit,
  Copy,
  Clock,
} from 'lucide-react';
import { useActivityStore, ActivityEntry } from '../../store/activityStore';
import { useVaultStore } from '../../store/vaultStore';
import { Button } from '../ui/Button';
import { ActivityDetailsModal } from './ActivityDetailsModal';

const PAGE_SIZE = 12;
const PAGE_TRANSITION_MS = 220;

type DisplayActivityEntry = ActivityEntry & { parsedTimestamp: number };

const actionIcon = (entry: ActivityEntry) => {
  if (entry.status === 'failure') return AlertTriangle;

  switch (entry.actionType) {
    case 'file_upload':
      return FileUp;
    case 'file_preview':
      return Eye;
    case 'file_download':
      return Download;
    case 'password_create':
    case 'password_change':
      return KeyRound;
    case 'auth_login':
    case 'auth_lock':
      return Lock;
    case 'vault_sync':
      return RefreshCw;
    case 'import':
      return Upload;
    case 'export':
      return Download;
    case 'item_delete':
      return Trash2;
    case 'item_create':
      return PlusCircle;
    case 'item_update':
      return Edit;
    case 'copy_value':
      return Copy;
    default:
      return Activity;
  }
};

const toTimestamp = (timestamp: number | string | Date): number => {
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

function formatRelativeTime(timestamp: number | string | Date) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  const now = Date.now();
  const diffInSeconds = Math.floor((now - date.getTime()) / 1000);

  if (diffInSeconds < 0) return 'Just now';
  if (diffInSeconds < 60) return 'Just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date(now).getFullYear() ? 'numeric' : undefined,
  });
}

export const RecentActivityPanel: React.FC = () => {
  const entries = useActivityStore((state) => state.entries);
  const isSyncingLogs = useVaultStore((state) => state.isSyncingLogs);
  const syncStatus = useVaultStore((state) => state.syncStatus);
  const [page, setPage] = useState(0);
  const [isPageChanging, setIsPageChanging] = useState(false);
  const [pageChangeDirection, setPageChangeDirection] = useState<'next' | 'prev' | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<DisplayActivityEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force re-render every minute to update relative times
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const normalizedEntries = useMemo<DisplayActivityEntry[]>(() => {
    return entries.map((entry) => ({
      ...entry,
      parsedTimestamp: toTimestamp(entry.timestamp),
    }));
  }, [entries]);

  // Sort newest first with stable tie-breaker by id.
  const sortedEntries = useMemo(() => {
    return [...normalizedEntries].sort((a, b) => {
      if (b.parsedTimestamp !== a.parsedTimestamp) {
        return b.parsedTimestamp - a.parsedTimestamp;
      }
      return b.id.localeCompare(a.id);
    });
  }, [normalizedEntries]);

  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;

  const visibleStart = sortedEntries.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = Math.min(sortedEntries.length, pageEnd);
  const isInitialLoading =
    sortedEntries.length === 0 && (isSyncingLogs || syncStatus === 'syncing');

  // Keep state aligned when data changes shrink total pages.
  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [page, currentPage]);

  const pagedEntries = useMemo(() => {
    return sortedEntries.slice(pageStart, pageEnd);
  }, [sortedEntries, pageStart, pageEnd]);

  const canPrevious = currentPage > 0;
  const canNext = currentPage < pageCount - 1;

  const changePage = useCallback(
    (direction: 'next' | 'prev') => {
      const nextPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
      if (nextPage < 0 || nextPage >= pageCount || nextPage === currentPage) {
        return;
      }

      setPageChangeDirection(direction);
      setIsPageChanging(true);
      setPage(nextPage);
    },
    [currentPage, pageCount],
  );

  // Handle scroll to top on page change.
  useEffect(() => {
    const scrollContainer = containerRef.current?.querySelector('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  useEffect(() => {
    if (!isPageChanging) {
      return;
    }

    const timer = setTimeout(() => {
      setIsPageChanging(false);
      setPageChangeDirection(null);
    }, PAGE_TRANSITION_MS);

    return () => clearTimeout(timer);
  }, [isPageChanging, currentPage]);

  // If list updates while transitioning, avoid sticky loading states.
  useEffect(() => {
    if (isPageChanging) {
      setIsPageChanging(false);
    }
  }, [sortedEntries.length, isPageChanging]);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-3 sm:space-y-4" ref={containerRef}>
      <style>
        {`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.4s ease-out forwards;
          }
        `}
      </style>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-2">
        {isInitialLoading && (
          <div className="space-y-2 py-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`activity-skeleton-${index}`}
                className="flex items-center gap-3 rounded-2xl border border-card-border/40 bg-card-bg/20 p-3 animate-pulse"
              >
                <div className="h-9 w-9 rounded-xl bg-text/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-text/10" />
                  <div className="h-2.5 w-11/12 rounded bg-text/10" />
                  <div className="h-2.5 w-1/3 rounded bg-text/10" />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-center gap-2 py-3 text-[11px] font-semibold text-text/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading secure activity timeline...
            </div>
          </div>
        )}

        {!isInitialLoading && (
          <div
            className={`space-y-2 transition-opacity duration-200 ${
              isPageChanging ? 'opacity-70' : 'opacity-100'
            }`}
          >
            {pagedEntries.map((entry, index) => {
              const Icon = actionIcon(entry);
              const isFailure = entry.status === 'failure';
              const animationDelay = `${index * 30}ms`;

              return (
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEntry(entry)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedEntry(entry);
                    }
                  }}
                  aria-label={`View activity details for ${entry.itemName}`}
                  className="group flex flex-row items-center gap-2.5 rounded-2xl border border-card-border/50 bg-card-bg/30 p-2 sm:p-3 transition-all duration-300 hover:shadow-lg hover:border-blue-500/30 hover:bg-card-bg/60 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 animate-fade-in-up opacity-0 relative overflow-hidden text-left"
                  style={{ animationDelay }}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-0.5 sm:hidden ${isFailure ? 'bg-red-500/40' : 'bg-emerald-500/40'}`}
                  />

                  <div
                    className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-500 group-hover:scale-110 ${
                      isFailure ? 'bg-red-500/10 text-red-400' : 'bg-text/5 text-blue-400'
                    }`}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 drop-shadow-[0_0_8px_currentColor]" />
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs sm:text-sm font-bold text-text truncate tracking-tight group-hover:text-blue-400 transition-colors">
                        {entry.itemName}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="hidden sm:flex items-center justify-center shrink-0 p-1.5 rounded-full bg-text/5 opacity-50 group-hover:opacity-100 transition-opacity">
                          {isFailure ? (
                            <AlertTriangle className="h-3 w-3 text-red-400" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                          )}
                        </div>
                        <div className="hidden group-hover:flex items-center text-text/40 text-[10px] font-semibold transition-all">
                          <ArrowRightIcon className="h-3 w-3" />
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] sm:text-[11px] text-text/50 truncate mb-1">
                      {entry.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-auto">
                      <span className="flex items-center gap-1 text-[9px] text-text/40 font-medium whitespace-nowrap">
                        <Clock className="w-3 h-3 opacity-50" />
                        {formatRelativeTime(entry.parsedTimestamp)}
                      </span>

                      <span className="hidden xs:inline-block px-1.5 py-[1px] rounded bg-text/5 text-[9px] font-mono text-text/30 truncate max-w-[80px]">
                        {entry.sessionName || entry.userOrSessionId.slice(0, 4) || '----'}
                      </span>

                      {entry.status && (
                        <span
                          className={`sm:hidden uppercase px-1.5 py-[1px] rounded text-[8px] font-black tracking-widest ${
                            isFailure
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-green-500/10 text-green-500'
                          }`}
                        >
                          {entry.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {sortedEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-text/5 p-8 rounded-3xl mb-4 border border-card-border/30 relative">
                  <div className="absolute inset-0 bg-blue-500/5 blur-2xl rounded-full" />
                  <Activity className="h-10 w-10 text-text/20 relative z-10" />
                </div>
                <p className="text-text/50 text-xs font-black uppercase tracking-[0.2em]">
                  Quiet sector
                </p>
                <p className="text-text/30 text-[10px] mt-2 max-w-[200px] leading-relaxed">
                  System telemetry is idle. No recent security events detected in the current cycle.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {sortedEntries.length > PAGE_SIZE && (
        <div className="shrink-0 flex items-center justify-between pt-3 border-t border-card-border/30 px-1 mt-auto">
          <div className="flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-widest text-text/30 flex items-center gap-1">
              <Loader2 className={`h-3 w-3 ${isPageChanging ? 'animate-spin' : 'hidden'}`} />
              Activity
            </p>
            <p className="text-[11px] font-bold text-text/60">
              {visibleStart}-{visibleEnd} of {sortedEntries.length} | {currentPage + 1}/{pageCount}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!canPrevious || isPageChanging}
              loading={isPageChanging && pageChangeDirection === 'prev'}
              onClick={() => changePage('prev')}
              className="h-8 rounded-xl bg-text/5 hover:bg-text/10 border-transparent text-[10px] font-black uppercase tracking-widest"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canNext || isPageChanging}
              loading={isPageChanging && pageChangeDirection === 'next'}
              onClick={() => changePage('next')}
              className="h-8 rounded-xl bg-text/5 hover:bg-text/10 border-transparent text-[10px] font-black uppercase tracking-widest"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Activity Details Popup Modal */}
      <ActivityDetailsModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
};
