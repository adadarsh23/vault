import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  CloudCheck,
  Code,
  Copy,
  Download,
  Eye,
  FileUp,
  HardDrive,
  KeyRound,
  Laptop,
  Layers,
  Lock,
  PlusCircle,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  X,
  Edit,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ActivityEntry, ActivityActionType } from '../../store/activityStore';
import { Button } from '../ui/Button';

interface ActivityDetailsModalProps {
  entry: (ActivityEntry & { parsedTimestamp?: number }) | null;
  onClose: () => void;
}

const getActionInfo = (actionType: ActivityActionType) => {
  switch (actionType) {
    case 'file_upload':
      return {
        label: 'File Upload',
        category: 'Storage',
        icon: FileUp,
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
        glow: 'from-sky-500/20 via-sky-500/5 to-transparent',
      };
    case 'file_preview':
      return {
        label: 'File Preview',
        category: 'Media',
        icon: Eye,
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/20',
        glow: 'from-indigo-500/20 via-indigo-500/5 to-transparent',
      };
    case 'file_download':
      return {
        label: 'File Download',
        category: 'Transfer',
        icon: Download,
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
        glow: 'from-cyan-500/20 via-cyan-500/5 to-transparent',
      };
    case 'password_create':
      return {
        label: 'Password Created',
        category: 'Credentials',
        icon: KeyRound,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        glow: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
      };
    case 'password_change':
      return {
        label: 'Password Modified',
        category: 'Credentials',
        icon: KeyRound,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        glow: 'from-amber-500/20 via-amber-500/5 to-transparent',
      };
    case 'password_delete':
      return {
        label: 'Password Removed',
        category: 'Credentials',
        icon: Trash2,
        color: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/20',
        glow: 'from-rose-500/20 via-rose-500/5 to-transparent',
      };
    case 'auth_login':
      return {
        label: 'Vault Authenticated',
        category: 'Security',
        icon: Lock,
        color: 'text-teal-400',
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/20',
        glow: 'from-teal-500/20 via-teal-500/5 to-transparent',
      };
    case 'auth_lock':
      return {
        label: 'Vault Locked',
        category: 'Security',
        icon: Lock,
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        glow: 'from-purple-500/20 via-purple-500/5 to-transparent',
      };
    case 'vault_sync':
      return {
        label: 'Vault Synchronized',
        category: 'Cloud Sync',
        icon: RefreshCw,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        glow: 'from-blue-500/20 via-blue-500/5 to-transparent',
      };
    case 'import':
      return {
        label: 'Data Import',
        category: 'Migration',
        icon: Upload,
        color: 'text-teal-400',
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/20',
        glow: 'from-teal-500/20 via-teal-500/5 to-transparent',
      };
    case 'export':
      return {
        label: 'Data Export',
        category: 'Migration',
        icon: Download,
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
        glow: 'from-sky-500/20 via-sky-500/5 to-transparent',
      };
    case 'item_create':
      return {
        label: 'Item Created',
        category: 'Vault Item',
        icon: PlusCircle,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        glow: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
      };
    case 'item_update':
      return {
        label: 'Item Updated',
        category: 'Vault Item',
        icon: Edit,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        glow: 'from-blue-500/20 via-blue-500/5 to-transparent',
      };
    case 'item_delete':
      return {
        label: 'Item Deleted',
        category: 'Vault Item',
        icon: Trash2,
        color: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/20',
        glow: 'from-rose-500/20 via-rose-500/5 to-transparent',
      };
    case 'copy_value':
      return {
        label: 'Value Copied',
        category: 'Clipboard',
        icon: Copy,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        glow: 'from-amber-500/20 via-amber-500/5 to-transparent',
      };
    case 'error':
    default:
      return {
        label: 'System Event',
        category: 'System',
        icon: Activity,
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/20',
        glow: 'from-slate-500/20 via-slate-500/5 to-transparent',
      };
  }
};

const formatFullDate = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown time';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Unknown time';

  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

const formatRelativeTime = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Unknown';

  const now = Date.now();
  const diffInSeconds = Math.floor((now - d.getTime()) / 1000);

  if (diffInSeconds < 0 || diffInSeconds < 60) return 'Just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;

  return d.toLocaleDateString();
};

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({ entry, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showJsonInspector, setShowJsonInspector] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  // Focus trap and keyboard listener
  useEffect(() => {
    if (!entry) return;

    const originalOverflow = document.body.style.overflow;
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    const timer = setTimeout(() => {
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable && focusable.length > 0) {
        focusable[0]?.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleEscape);
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    };
  }, [entry, handleEscape]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      // fallback ignore
    }
  }, []);

  const timestampNumber = useMemo(() => {
    if (!entry) return 0;
    if (typeof entry.parsedTimestamp === 'number') return entry.parsedTimestamp;
    if (typeof entry.timestamp === 'number') return entry.timestamp;
    const parsed = new Date(entry.timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }, [entry]);

  const formattedFullDate = useMemo(() => formatFullDate(timestampNumber), [timestampNumber]);
  const formattedRelative = useMemo(() => formatRelativeTime(timestampNumber), [timestampNumber]);
  const formattedIso = useMemo(() => {
    return Number.isFinite(timestampNumber) && timestampNumber > 0
      ? new Date(timestampNumber).toISOString()
      : 'N/A';
  }, [timestampNumber]);

  const actionInfo = useMemo(() => {
    return entry ? getActionInfo(entry.actionType) : getActionInfo('error');
  }, [entry]);

  const fullSummary = useMemo(() => {
    if (!entry) return '';
    return `Activity Log Entry:
• Target: ${entry.itemName}
• Action: ${actionInfo.label} (${entry.actionType})
• Status: ${entry.status.toUpperCase()}
• Recorded Time: ${formattedFullDate} (${formattedIso})
• Device / Session: ${entry.sessionName || entry.userOrSessionId}
• Description: ${entry.description || 'None'}
• Cloud Sync: ${entry.isSynced ? 'Synced' : 'Local Only'}
• Event ID: ${entry.id}`;
  }, [entry, actionInfo, formattedFullDate, formattedIso]);

  const jsonString = useMemo(() => {
    if (!entry) return '';
    return JSON.stringify(entry, null, 2);
  }, [entry]);

  if (!entry) return null;

  const isFailure = entry.status === 'failure';
  const Icon = isFailure ? AlertTriangle : actionInfo.icon;

  const backdropVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: shouldReduceMotion ? 0.05 : 0.2,
        ease: 'easeOut',
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: shouldReduceMotion ? 0.05 : 0.15,
        ease: 'easeIn',
      },
    },
  };

  const modalVariants: Variants = {
    hidden: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.95,
      y: shouldReduceMotion ? 0 : 10,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 380,
        damping: 28,
        mass: 0.6,
      },
    },
    exit: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.96,
      y: shouldReduceMotion ? 0 : 8,
      transition: {
        duration: 0.14,
        ease: 'easeInOut',
      },
    },
  };

  return (
    <AnimatePresence mode="wait">
      {entry && (
        <motion.div
          key="activity-details-backdrop"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-2.5 sm:p-4 overflow-hidden touch-manipulation"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-modal-title"
        >
          {/* Backdrop Blur */}
          <div className="fixed inset-0 bg-black/80 sm:bg-black/70 backdrop-blur-sm sm:backdrop-blur-md will-change-transform" />

          {/* Modal Dialog Container - Fixed Maximum Height so Footer is Always Visible */}
          <motion.div
            ref={modalRef}
            key="activity-details-dialog"
            variants={modalVariants}
            className="relative z-10 w-full max-w-[calc(100vw-1rem)] xs:max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] max-h-[85dvh] flex flex-col rounded-2xl xs:rounded-3xl sm:rounded-[2rem] border border-card-border bg-card-bg/95 text-text shadow-[0_25px_70px_-15px_rgba(0,0,0,0.95)] ring-1 ring-white/10 backdrop-blur-2xl dark:border-white/10 dark:bg-black/95 transform-gpu overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Glow */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-gradient-to-br ${
                isFailure ? 'from-red-500/25 via-red-500/5' : actionInfo.glow
              } blur-3xl opacity-60`}
            />

            {/* Modal Header - Fixed at Top */}
            <div className="relative shrink-0 border-b border-card-border/40 dark:border-white/10 bg-text/[0.02] p-2.5 xs:p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 xs:gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                  {/* Context Icon */}
                  <div
                    className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border ${
                      isFailure
                        ? 'border-red-500/30 bg-red-500/10 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                        : `${actionInfo.border} ${actionInfo.bg} ${actionInfo.color} shadow-[0_0_15px_rgba(59,130,246,0.15)]`
                    }`}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    {/* Badges row - strictly one row on all devices */}
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto no-scrollbar scrollbar-none mb-1">
                      <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded bg-text/5 text-[8px] xs:text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider text-text/60 whitespace-nowrap">
                        {actionInfo.category}
                      </span>

                      <span
                        className={`inline-flex items-center shrink-0 gap-1 px-1.5 py-0.5 rounded text-[8px] xs:text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider whitespace-nowrap ${
                          isFailure
                            ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            isFailure ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                        {entry.status}
                      </span>

                      <span
                        className={`inline-flex items-center shrink-0 gap-1 px-1.5 py-0.5 rounded text-[8px] xs:text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider whitespace-nowrap ${
                          entry.isSynced
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {entry.isSynced ? (
                          <>
                            <CloudCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> Synced
                          </>
                        ) : (
                          <>
                            <HardDrive className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> Local Only
                          </>
                        )}
                      </span>
                    </div>

                    <h2
                      id="activity-modal-title"
                      className="text-xs xs:text-sm sm:text-base font-bold tracking-tight text-text truncate leading-tight"
                      title={entry.itemName}
                    >
                      {entry.itemName}
                    </h2>
                    <p className="text-[9.5px] xs:text-[10px] sm:text-xs text-text/50 font-medium truncate leading-tight mt-0.5">
                      {actionInfo.label}
                    </p>
                  </div>
                </div>

                {/* Close Button - Never overlaps */}
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 inline-flex h-7 w-7 xs:h-8 xs:w-8 items-center justify-center rounded-full border border-card-border/60 bg-text/5 text-text/70 transition-all duration-200 hover:bg-text/15 hover:text-text active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-white/10 cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="h-3.5 w-3.5 xs:h-4 xs:w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Content Body - min-h-0 prevents flex children from expanding container */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2.5 xs:p-3.5 sm:p-5 space-y-2.5 sm:space-y-3.5 overscroll-contain">
              {/* Event Description Card */}
              {entry.description && (
                <div className="relative overflow-hidden rounded-xl xs:rounded-2xl border border-card-border/60 bg-text/[0.03] p-2.5 sm:p-3.5 dark:border-white/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="text-[8.5px] sm:text-[10px] font-bold uppercase tracking-widest text-text/40">
                      Summary
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed text-text/85 break-words font-medium">
                    {entry.description}
                  </p>
                </div>
              )}

              {/* Responsive Data Grid */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-2.5">
                {/* Action Type */}
                <div className="flex flex-col rounded-xl xs:rounded-2xl border border-card-border/50 bg-card-bg/40 p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02] min-w-0">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-text/40 mb-0.5">
                    <Layers className="h-3 w-3 shrink-0" /> Action Type
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-text truncate">
                    {actionInfo.label}
                  </span>
                  <span className="text-[9px] sm:text-[9.5px] font-mono text-text/40 mt-0.5 truncate">
                    {entry.actionType}
                  </span>
                </div>

                {/* Target Name */}
                <div className="flex flex-col rounded-xl xs:rounded-2xl border border-card-border/50 bg-card-bg/40 p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02] min-w-0">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-text/40 mb-0.5">
                    <ShieldCheck className="h-3 w-3 shrink-0" /> Target / Entity
                  </div>
                  <span
                    className="text-xs sm:text-sm font-semibold text-text truncate"
                    title={entry.itemName}
                  >
                    {entry.itemName}
                  </span>
                  <span className="text-[9px] sm:text-[9.5px] text-text/40 mt-0.5">
                    Vault Resource
                  </span>
                </div>

                {/* Timestamp */}
                <div className="flex flex-col rounded-xl xs:rounded-2xl border border-card-border/50 bg-card-bg/40 p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02] min-w-0">
                  <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-text/40 mb-0.5">
                    <span className="flex items-center gap-1 truncate">
                      <Clock className="h-3 w-3 shrink-0" /> Time
                    </span>
                    <span className="text-blue-400 font-semibold shrink-0">
                      {formattedRelative}
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-text truncate">
                    {formattedFullDate}
                  </span>
                  <span
                    className="text-[9px] sm:text-[9.5px] font-mono text-text/40 truncate mt-0.5"
                    title={formattedIso}
                  >
                    {formattedIso}
                  </span>
                </div>

                {/* Session & Device Info */}
                <div className="flex flex-col rounded-xl xs:rounded-2xl border border-card-border/50 bg-card-bg/40 p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02] min-w-0">
                  <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-text/40 mb-0.5">
                    <span className="flex items-center gap-1 truncate">
                      <Laptop className="h-3 w-3 shrink-0" /> Device
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(entry.sessionName || entry.userOrSessionId, 'session')
                      }
                      className="text-[8.5px] sm:text-[10px] text-text/40 hover:text-text flex items-center gap-1 transition-colors p-0.5 cursor-pointer shrink-0"
                      title="Copy Device / Session ID"
                    >
                      {copiedKey === 'session' ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" /> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 hover:underline">
                          <Copy className="h-2.5 w-2.5" /> Copy
                        </span>
                      )}
                    </button>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-text truncate">
                    {entry.sessionName || 'Active Session'}
                  </span>
                  <span className="text-[9px] sm:text-[9.5px] font-mono text-text/40 truncate mt-0.5">
                    {entry.userOrSessionId}
                  </span>
                </div>
              </div>

              {/* Event Identifier Box with 1-click Copy */}
              <div className="flex flex-row items-center justify-between gap-2 rounded-xl xs:rounded-2xl border border-card-border/50 bg-card-bg/30 p-2.5 sm:px-3 sm:py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="min-w-0 flex-1">
                  <span className="text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider text-text/40 block truncate">
                    Event Identifier (UUID)
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono text-text/70 truncate block select-all">
                    {entry.id}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(entry.id, 'id')}
                  className="h-7 sm:h-8 px-2 xs:px-2.5 text-[9px] sm:text-[10px] shrink-0 rounded-lg xs:rounded-xl border-card-border/60 hover:bg-text/5 cursor-pointer active:scale-95 transition-transform justify-center"
                >
                  {copiedKey === 'id' ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy ID
                    </>
                  )}
                </Button>
              </div>

              {/* Collapsible Raw JSON Telemetry */}
              <div className="rounded-xl xs:rounded-2xl border border-card-border/40 bg-card-bg/20 overflow-hidden dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowJsonInspector((prev) => !prev)}
                  className="w-full flex items-center justify-between p-2.5 sm:p-3 text-left hover:bg-text/[0.02] active:bg-text/[0.04] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-[10.5px] sm:text-xs font-semibold text-text/70">
                    <Code className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    Telemetry Payload (JSON)
                  </span>
                  <span className="text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-text/40">
                    {showJsonInspector ? 'Hide' : 'Inspect'}
                  </span>
                </button>

                {showJsonInspector && (
                  <div className="p-2.5 sm:p-3 pt-0 border-t border-card-border/20 dark:border-white/5 space-y-2">
                    <div className="flex justify-end pt-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(jsonString, 'rawJson')}
                        className="h-6 sm:h-7 px-2 text-[8.5px] sm:text-[10px] rounded-lg bg-text/5 hover:bg-text/10 active:scale-95 cursor-pointer"
                      >
                        {copiedKey === 'rawJson' ? (
                          <>
                            <Check className="h-2.5 w-2.5 mr-1 text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5 mr-1" />
                            Copy JSON
                          </>
                        )}
                      </Button>
                    </div>
                    <pre className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-black/50 text-[9.5px] sm:text-[11px] font-mono text-text/80 overflow-x-auto max-h-36 sm:max-h-44 custom-scrollbar border border-white/5 select-all leading-relaxed">
                      {jsonString}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer - Always Pinned at Bottom of Container */}
            <div className="shrink-0 mt-auto border-t border-card-border/40 dark:border-white/10 bg-card-bg/95 dark:bg-black/95 backdrop-blur-md p-2.5 xs:p-3 sm:p-4 flex flex-row items-center justify-between gap-2 sm:gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(fullSummary, 'summary')}
                className="flex-1 xs:flex-initial h-8 sm:h-8.5 px-3 sm:px-3.5 rounded-xl border-card-border/70 text-[10.5px] sm:text-xs font-semibold hover:bg-text/5 justify-center cursor-pointer active:scale-95 transition-transform"
              >
                {copiedKey === 'summary' ? (
                  <>
                    <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5 text-emerald-400" />
                    Summary Copied!
                  </>
                ) : (
                  <>
                    <Share2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5" />
                    Copy Summary
                  </>
                )}
              </Button>

              {/* <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="flex-1 xs:flex-initial h-8 sm:h-8.5 px-4 sm:px-5 rounded-xl bg-text/10 hover:bg-text/15 text-text text-[10.5px] sm:text-xs font-bold justify-center cursor-pointer active:scale-95 transition-transform"
              >
                Close
              </Button> */}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
