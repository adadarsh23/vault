import React, { memo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Fingerprint,
  KeyRound,
  Lock,
  Activity,
  Shield,
  Clock,
  Database,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  RotateCcw,
  ArrowLeft,
  Check,
  Cpu,
  Terminal,
  Loader2,
  type LucideIcon,
} from 'lucide-react';

export const MAX_PROGRESS_BEFORE_COMPLETION = 90;
export const SYNC_MODE_PROGRESS = 95;
export const COMPLETED_PROGRESS = 100;
export const ZERO_PROGRESS = 0;

export const BLUR_BG_SCALE_DURATION = 5;
export const BLUR_BG_DRIFT_LEFT_DURATION = 7;
export const BLUR_BG_DRIFT_RIGHT_DURATION = 6;
export const ACTIVE_LAYER_PULSE_DURATION = 1.6;

/**
 * Calculates responsive, bounds-checked progress width percentage for security verification
 */
export const calculateProgressWidth = (
  currentLayerIndex: number,
  totalLayers: number,
  isSuccess: boolean,
  isSync: boolean,
): number => {
  if (totalLayers <= 0) return ZERO_PROGRESS;
  if (isSuccess) return COMPLETED_PROGRESS;
  if (isSync) return SYNC_MODE_PROGRESS;
  if (currentLayerIndex >= totalLayers) return COMPLETED_PROGRESS;
  if (currentLayerIndex < 0) return ZERO_PROGRESS;

  return Math.min(
    ((currentLayerIndex + 1) / totalLayers) * MAX_PROGRESS_BEFORE_COMPLETION,
    COMPLETED_PROGRESS,
  );
};

const DEFAULT_LAYER_ICONS: readonly LucideIcon[] = [
  Fingerprint,
  KeyRound,
  Lock,
  Activity,
  Shield,
  Clock,
  Database,
  ShieldCheck,
];

export interface SecurityLayer {
  id?: string;
  label?: string;
  name: string;
  description?: string;
  desc?: string;
  icon?: LucideIcon;
  standard?: string;
  category?: string;
  specs?: string;
  quantumSafe?: boolean;
  details?: string[];
}

export type SecurityStatus =
  'idle' | 'running' | 'authenticating' | 'syncing' | 'success' | 'error';

export interface SecurityLayersProps {
  layers?: readonly SecurityLayer[] | SecurityLayer[];
  currentLayer?: number | null;
  success?: boolean;
  error?: boolean | string | null;
  status?: SecurityStatus;
  mode?: 'security' | 'sync';
  title?: string;
  description?: string;
  successTitle?: string;
  successMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
}

const getSafeIcon = (layer: SecurityLayer, index: number): LucideIcon => {
  return layer.icon ?? DEFAULT_LAYER_ICONS[index % DEFAULT_LAYER_ICONS.length] ?? ShieldCheck;
};

const getLayerDescription = (layer: SecurityLayer): string => {
  return layer.description || layer.desc || '';
};

export const SecurityLayers: React.FC<SecurityLayersProps> = memo(
  ({
    layers = [],
    currentLayer = -1,
    success = false,
    error = null,
    status,
    mode = 'security',
    title,
    description,
    successTitle,
    successMessage,
    errorTitle,
    errorMessage,
    onRetry,
    onGoBack,
  }) => {
    const prefersReducedMotion = useReducedMotion();
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [showAllDetails, setShowAllDetails] = useState(false);

    const isSuccess = status === 'success' || success === true;
    const isError = status === 'error' || Boolean(error);
    const isSync = mode === 'sync' || title === 'Syncing Secure Vault';
    const currentLayerIndex = currentLayer ?? -1;

    const safeLayers: SecurityLayer[] = Array.isArray(layers)
      ? layers.filter((l): l is SecurityLayer => Boolean(l && l.name && (l.description || l.desc)))
      : [];

    const progressWidth: number = calculateProgressWidth(
      currentLayerIndex,
      safeLayers.length,
      isSuccess,
      isSync,
    );

    const activeLayer: SecurityLayer | undefined =
      currentLayerIndex >= 0 && currentLayerIndex < safeLayers.length
        ? safeLayers[currentLayerIndex]
        : undefined;

    const resolvedErrorMessage =
      typeof error === 'string'
        ? error
        : errorMessage || 'Security verification protocol failed. Please try again.';

    const ariaLiveStatus = isError
      ? `Error: ${resolvedErrorMessage}`
      : isSuccess
        ? `Success: ${successMessage || 'Security verification completed successfully.'}`
        : activeLayer
          ? `Running security layer ${currentLayerIndex + 1} of ${safeLayers.length}: ${activeLayer.name}`
          : title
            ? `Status: ${title}`
            : 'Security verification in progress';

    if (!safeLayers.length && !isSuccess && !isError) {
      return (
        <div className="flex min-h-[40vh] sm:min-h-[50vh] w-full flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-card-border/70 bg-card-bg/60 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <Shield className="h-7 w-7 text-text/40" aria-hidden="true" />
          </div>
          <p className="text-base font-medium text-text/80">Security layers are not available.</p>
          <p className="mt-1 text-xs text-text/50 max-w-sm">
            No verification layers are currently active or configured for this session.
          </p>
        </div>
      );
    }

    return (
      <div className="relative flex min-h-[60vh] sm:min-h-[70vh] md:min-h-[80vh] w-full items-center justify-center text-text px-1 sm:px-2 md:px-0 py-2 sm:py-4 md:py-6">
        {/* Screen reader live announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {ariaLiveStatus}
        </div>

        {/* Ambient background blur elements */}
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          aria-hidden="true"
        >
          <motion.div
            className="absolute left-1/2 top-8 sm:top-16 h-48 w-48 sm:h-80 sm:w-80 -translate-x-1/2 rounded-full bg-emerald-500/[0.06] dark:bg-emerald-400/[0.04] blur-2xl sm:blur-3xl transform-gpu will-change-transform"
            animate={
              prefersReducedMotion
                ? undefined
                : { scale: [1, 1.08, 1], opacity: [0.25, 0.45, 0.25] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: BLUR_BG_SCALE_DURATION, repeat: Infinity, ease: 'easeInOut' }
            }
          />
          <motion.div
            className="absolute bottom-6 sm:bottom-12 left-4 sm:left-10 h-36 w-36 sm:h-60 sm:w-60 rounded-full bg-cyan-500/[0.05] dark:bg-cyan-400/[0.03] blur-2xl sm:blur-3xl transform-gpu will-change-transform"
            animate={prefersReducedMotion ? undefined : { x: [0, 16, 0], y: [0, -12, 0] }}
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: BLUR_BG_DRIFT_LEFT_DURATION, repeat: Infinity, ease: 'easeInOut' }
            }
          />
          <motion.div
            className="absolute right-4 sm:right-12 top-8 sm:top-16 h-40 w-40 sm:h-64 sm:w-64 rounded-full bg-purple-500/[0.05] dark:bg-purple-400/[0.03] blur-2xl sm:blur-3xl transform-gpu will-change-transform"
            animate={prefersReducedMotion ? undefined : { x: [0, -16, 0], y: [0, 10, 0] }}
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: BLUR_BG_DRIFT_RIGHT_DURATION, repeat: Infinity, ease: 'easeInOut' }
            }
          />
        </div>

        <div
          className={`relative z-10 w-full my-auto transition-all duration-300 ${isSuccess || isError ? 'max-w-xl md:max-w-2xl' : 'max-w-4xl'}`}
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`relative overflow-hidden rounded-2xl sm:rounded-3xl md:rounded-[2rem] border border-card-border bg-card-bg p-4 sm:p-6 md:p-8 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-black ${
              isError
                ? 'flex min-h-[38vh] sm:min-h-[48vh] md:min-h-[56vh] flex-col items-center justify-start pt-6 sm:pt-8 md:pt-10'
                : isSuccess
                  ? 'flex min-h-[38vh] sm:min-h-[48vh] md:min-h-[56vh] items-center justify-center'
                  : ''
            }`}
          >
            {/* Top decorative gradient hairline */}
            <div
              className={`absolute top-0 inset-x-0 h-[2px] transition-colors duration-500 ${
                isError
                  ? 'bg-gradient-to-r from-red-500/0 via-red-500/80 to-red-500/0'
                  : isSuccess
                    ? 'bg-gradient-to-r from-emerald-500/0 via-emerald-500/80 to-emerald-500/0'
                    : 'bg-gradient-to-r from-transparent via-text/25 to-transparent dark:via-white/20'
              }`}
              aria-hidden="true"
            />

            {!isSuccess && !isError && (
              <div className="mb-5 sm:mb-6 md:mb-8 flex flex-col gap-4 sm:gap-5 md:gap-6 border-b border-card-border pb-4 sm:pb-5 md:pb-6 dark:border-white/10 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
                  <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-card-border bg-card-bg px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] sm:tracking-[0.24em] text-text/70 dark:border-white/10 dark:bg-black/40 shadow-xs">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <Sparkles
                      className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-amber-500/80 dark:text-amber-400/80"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {isSync ? 'Vault Synchronization' : 'Security Check'}
                    </span>
                  </div>

                  <div className="text-left">
                    <h2 className="mb-1.5 sm:mb-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-text break-words">
                      {title ||
                        (isSync ? 'Syncing Secure Vault' : 'Establishing Secure Environment')}
                    </h2>

                    <p className="max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed text-text/55">
                      {description ||
                        (isSync
                          ? 'Cloud sync is in progress. Establishing secure connection...'
                          : `Running ${safeLayers.length}-layer protocol check...`)}
                    </p>
                  </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:gap-2.5 md:gap-3 sm:w-auto sm:min-w-[220px] self-stretch md:self-auto">
                  <div className="group rounded-xl sm:rounded-2xl md:rounded-[1.5rem] border border-card-border bg-card-bg p-2.5 sm:p-3.5 md:p-4 text-left transition-all hover:border-card-border/80 dark:border-white/10 dark:bg-black/40 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] sm:tracking-[0.24em] text-text/35 truncate">
                        Protocol
                      </p>
                      <Cpu
                        className="h-3.5 w-3.5 text-text/25 hidden sm:block group-hover:text-text/50 transition-colors"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-1 sm:mt-2 text-xl sm:text-2xl font-bold sm:font-semibold text-text font-mono tracking-tight">
                      {safeLayers.length}
                    </p>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-text/45 truncate">
                      Security
                    </p>
                  </div>
                  <div className="group rounded-xl sm:rounded-2xl md:rounded-[1.5rem] border border-card-border bg-card-bg p-2.5 sm:p-3.5 md:p-4 text-left transition-all hover:border-card-border/80 dark:border-white/10 dark:bg-black/40 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] sm:tracking-[0.24em] text-text/35 truncate">
                        Progress
                      </p>
                      <Activity
                        className="h-3.5 w-3.5 text-emerald-500/70 hidden sm:block group-hover:scale-110 transition-transform"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-1 sm:mt-2 text-xl sm:text-2xl font-bold sm:font-semibold text-text font-mono tracking-tight">
                      {Math.round(progressWidth)}%
                    </p>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-text/45 truncate">
                      {isSync ? 'Synchronizing' : 'In verification'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isError ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full py-4 sm:py-6 text-center px-1 sm:px-4"
                >
                  <motion.div
                    className="relative mx-auto mb-4 sm:mb-6 flex h-20 w-20 sm:h-28 sm:w-28 md:h-32 md:w-32 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 shadow-lg shadow-red-500/5 dark:border-red-500/30 dark:bg-red-950/30"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
                  >
                    <div
                      className="absolute inset-0 rounded-full bg-red-500/10 animate-ping opacity-35"
                      aria-hidden="true"
                    />
                    <AlertTriangle
                      className="relative h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 text-red-500 dark:text-red-400"
                      aria-hidden="true"
                    />
                  </motion.div>

                  <div className="mx-auto max-w-xl rounded-2xl sm:rounded-3xl border border-card-border bg-card-bg p-4 sm:p-5 md:p-6 text-center shadow-md dark:border-white/10 dark:bg-black/30">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-red-600 dark:text-red-400 mb-2">
                      <span>Verification Interrupted</span>
                    </div>
                    <p className="text-sm sm:text-base font-semibold text-text/85 break-words">
                      {errorTitle || 'Security Verification Failed'}
                    </p>
                    <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm leading-relaxed text-text/50 break-words">
                      {resolvedErrorMessage}
                    </p>
                    <p className="mt-2 text-[11px] sm:text-xs text-text/40">
                      Please check your network connection or credentials and try again.
                    </p>
                    <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                      {onRetry && (
                        <button
                          type="button"
                          onClick={onRetry}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-text/10 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-text transition-all hover:bg-text/20 active:scale-95 focus:outline-none focus:ring-2 focus:ring-text/30 min-h-[40px] sm:min-h-[44px] w-full sm:w-auto cursor-pointer shadow-xs"
                        >
                          <RotateCcw
                            className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Retry Verification</span>
                        </button>
                      )}
                      {onGoBack && (
                        <button
                          type="button"
                          onClick={onGoBack}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-card-border bg-card-bg px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-text/75 transition-all hover:bg-text/10 hover:text-text active:scale-95 focus:outline-none focus:ring-2 focus:ring-text/30 min-h-[40px] sm:min-h-[44px] w-full sm:w-auto dark:border-white/10 dark:bg-black/40 cursor-pointer shadow-xs"
                        >
                          <ArrowLeft
                            className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Return to Sign In</span>
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : isSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full py-4 sm:py-6 text-center px-1 sm:px-4"
                >
                  <motion.div
                    className="relative mx-auto mb-4 sm:mb-6 flex h-20 w-20 sm:h-28 sm:w-28 md:h-32 md:w-32 items-center justify-center rounded-full border border-card-border bg-card-bg shadow-sm dark:border-white/10 dark:bg-black/30"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
                  >
                    <ShieldCheck
                      className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 text-green-500 dark:text-green-400"
                      aria-hidden="true"
                    />
                  </motion.div>

                  <div className="mx-auto max-w-xl rounded-2xl sm:rounded-3xl border border-card-border bg-card-bg p-4 sm:p-5 md:p-6 text-center shadow-md dark:border-white/10 dark:bg-black/30">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-green-600 dark:text-green-300 mb-2">
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Zero-Knowledge Secure Channel Active</span>
                    </div>
                    <p className="text-sm sm:text-base font-semibold text-text/85 break-words">
                      {successTitle || 'Secure vault channel established'}
                    </p>
                    <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm leading-relaxed text-text/50 break-words">
                      {successMessage ||
                        'Identity verification, hybrid key exchange, and encrypted sync completed successfully.'}
                    </p>
                    {safeLayers.length > 0 && (
                      <div className="mt-4 pt-3.5 border-t border-card-border/60 dark:border-white/10">
                        <div className="inline-flex items-center gap-1.5 mb-2.5">
                          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                          <p className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-text/50">
                            {safeLayers.length}/{safeLayers.length} Security Layers Verified
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-h-36 overflow-y-auto px-1 py-0.5">
                          {safeLayers.map((l, i) => (
                            <span
                              key={l.id ?? i}
                              className="rounded-full border border-card-border bg-card-bg px-2 py-0.5 text-[9px] sm:text-[10px] text-text/60 dark:border-white/10 dark:bg-white/[0.03] max-w-full truncate inline-flex items-center gap-1"
                            >
                              <CheckCircle2
                                className="h-2.5 w-2.5 text-emerald-500 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{l.name}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="mb-3.5 sm:mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3">
                        <p className="text-xs sm:text-sm font-semibold text-text/85">
                          Layer Execution Matrix
                        </p>
                        {safeLayers.some((l) => Boolean(l.details?.length || l.specs)) && (
                          <button
                            type="button"
                            onClick={() => setShowAllDetails((prev) => !prev)}
                            className="text-[10px] sm:text-[11px] font-medium text-text/50 hover:text-text underline decoration-dotted transition-colors focus:outline-none focus:ring-1 focus:ring-text/30 rounded px-1.5 py-0.5 min-h-[28px] sm:min-h-0 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Terminal className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                            <span>
                              {showAllDetails ? 'Compact view' : 'Inspect specifications'}
                            </span>
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] md:text-xs text-text/45 leading-normal mt-0.5">
                        Active layer is highlighted while completed layers are sealed. Click to
                        inspect cryptographic parameters.
                      </p>
                    </div>
                    <div className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-card-border bg-card-bg px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-[11px] md:text-xs font-mono font-medium text-text/55 dark:border-white/10 dark:bg-black/40 shadow-xs">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"
                        aria-hidden="true"
                      />
                      <span>
                        {Math.min(Math.max(currentLayerIndex + 1, 0), safeLayers.length)} /{' '}
                        {safeLayers.length}
                      </span>
                    </div>
                  </div>

                  {/* Uniform 8-Card Symmetrical Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 md:gap-3.5 items-stretch">
                    {safeLayers.map((layer, idx) => {
                      const Icon = getSafeIcon(layer, idx);
                      const isCompleted = currentLayerIndex > idx;
                      const isActive = currentLayerIndex === idx;
                      const layerKey = layer.id ?? layer.name ?? `layer-${idx}`;
                      const layerDesc = getLayerDescription(layer);
                      const hasDetails = Boolean(layer.details?.length);
                      const isExpanded = showAllDetails || expandedIndex === idx;
                      const toggleExpand = () => {
                        if (hasDetails) {
                          setExpandedIndex((prev) => (prev === idx ? null : idx));
                        }
                      };

                      return (
                        <motion.div
                          key={layerKey}
                          layout={!prefersReducedMotion}
                          initial={prefersReducedMotion ? false : { opacity: 0.3, y: 8 }}
                          animate={{
                            opacity: currentLayerIndex >= idx ? 1 : 0.45,
                            scale: prefersReducedMotion ? 1 : isActive ? 1.015 : 1,
                            y: 0,
                          }}
                          transition={{
                            type: 'spring',
                            stiffness: 140,
                            damping: 16,
                            mass: 0.9,
                          }}
                          aria-current={isActive ? 'step' : undefined}
                          onClick={hasDetails ? toggleExpand : undefined}
                          onKeyDown={
                            hasDetails
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleExpand();
                                  }
                                }
                              : undefined
                          }
                          tabIndex={hasDetails ? 0 : undefined}
                          role={hasDetails ? 'button' : undefined}
                          aria-expanded={hasDetails ? isExpanded : undefined}
                          className={`relative flex flex-col justify-between h-full rounded-xl sm:rounded-2xl md:rounded-[1.5rem] border p-3 sm:p-3.5 md:p-4 min-w-0 transition-all duration-200 min-h-[64px] sm:min-h-[72px] touch-manipulation ${
                            hasDetails
                              ? 'cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-text/20 active:scale-[0.99]'
                              : ''
                          } ${
                            isActive
                              ? 'border-text/25 bg-text/[0.05] shadow-md dark:border-white/20 dark:bg-white/[0.05]'
                              : isCompleted
                                ? 'border-card-border bg-card-bg/70 dark:border-white/10 dark:bg-white/[0.02]'
                                : 'border-card-border/60 bg-card-bg/30 dark:border-white/5 dark:bg-white/[0.01]'
                          }`}
                        >
                          {isActive && (
                            <motion.div
                              className="absolute inset-0 rounded-xl sm:rounded-2xl md:rounded-[1.5rem] bg-text/[0.03] dark:bg-white/[0.04] pointer-events-none transform-gpu will-change-opacity"
                              animate={
                                prefersReducedMotion
                                  ? { opacity: 0.25 }
                                  : { opacity: [0.18, 0.34, 0.18] }
                              }
                              transition={
                                prefersReducedMotion
                                  ? { duration: 0 }
                                  : {
                                      duration: ACTIVE_LAYER_PULSE_DURATION,
                                      repeat: Infinity,
                                      ease: 'easeInOut',
                                    }
                              }
                            />
                          )}

                          {/* Card Content Top Tier */}
                          <div className="relative flex flex-col justify-between h-full w-full min-w-0 gap-2 sm:gap-2.5">
                            {/* Header Row: Icon + Meta */}
                            <div className="flex items-start gap-2.5 sm:gap-3.5 w-full min-w-0">
                              <div
                                className={`relative mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 lg:h-11 lg:w-11 shrink-0 items-center justify-center rounded-lg sm:rounded-xl border transition-colors ${
                                  isCompleted
                                    ? 'border-green-500/30 bg-green-500/10 text-green-500 dark:border-green-500/35 dark:bg-green-950/20'
                                    : isActive
                                      ? 'border-text/30 bg-text/10 text-text dark:border-white/30 dark:bg-white/10 shadow-xs'
                                      : 'border-card-border bg-card-bg dark:border-white/10 dark:bg-black/30'
                                }`}
                              >
                                {isCompleted ? (
                                  <CheckCircle2
                                    className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 text-green-500 shrink-0"
                                    aria-hidden="true"
                                  />
                                ) : isActive ? (
                                  <Icon
                                    className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 shrink-0 text-text animate-pulse"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Icon
                                    className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 shrink-0 text-text/75"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>

                              <div className="relative min-w-0 flex-1">
                                <div className="mb-0.5 flex items-center justify-between gap-1.5 min-w-0">
                                  {layer.label && (
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-text/35 truncate">
                                      {layer.label}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1 shrink-0 ml-auto">
                                    {layer.category && (
                                      <span className="shrink-0 rounded-full border border-card-border/80 bg-card-bg/70 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-medium tracking-wider text-text/50 dark:border-white/10 dark:bg-white/[0.03]">
                                        {layer.category}
                                      </span>
                                    )}
                                    {hasDetails && (
                                      <ChevronDown
                                        className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-text/35 transition-transform duration-200 ${
                                          isExpanded ? 'rotate-180 text-text/70' : ''
                                        }`}
                                        aria-hidden="true"
                                      />
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-1.5 min-w-0">
                                  <p className="text-xs sm:text-sm font-bold text-text break-words line-clamp-1 sm:line-clamp-2 flex-1 pr-1">
                                    {layer.name}
                                  </p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isCompleted && (
                                      <span className="shrink-0 rounded-full border border-green-500/25 bg-green-500/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-green-600 dark:text-green-300">
                                        Done
                                      </span>
                                    )}
                                    {isActive && (
                                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-text/15 bg-text/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-text/80 dark:border-white/20 dark:bg-white/10">
                                        <Loader2
                                          className="h-2.5 w-2.5 animate-spin"
                                          aria-hidden="true"
                                        />
                                        Active
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Middle Badges Row (Standards & Quantum-Safe) */}
                            {(layer.quantumSafe || layer.standard) && (
                              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 min-h-[20px]">
                                {layer.quantumSafe && (
                                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-600 dark:text-purple-300">
                                    <Shield className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                    Quantum-Safe
                                  </span>
                                )}
                                {layer.standard && (
                                  <span className="shrink-0 rounded border border-card-border/70 bg-card-bg/60 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-mono font-medium text-text/50 dark:border-white/10 dark:bg-white/[0.02]">
                                    {layer.standard}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Description with Uniform 2-Line Clamp */}
                            {layerDesc && (
                              <p
                                className={`text-[11px] sm:text-xs leading-4 sm:leading-5 text-text/45 break-words flex-1 ${
                                  isExpanded ? '' : 'line-clamp-2'
                                }`}
                              >
                                {layerDesc}
                              </p>
                            )}

                            {/* Specs Telemetry Chip */}
                            {layer.specs && (
                              <div className="mt-auto pt-1">
                                <p className="font-mono text-[9px] sm:text-[10px] text-text/45 dark:text-text/50 break-words leading-relaxed rounded-md bg-text/[0.03] dark:bg-white/[0.03] px-2 py-1 border border-card-border/40 dark:border-white/5 inline-block w-full">
                                  {layer.specs}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Expandable Technical Drawer */}
                          {hasDetails && (
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={
                                    prefersReducedMotion ? undefined : { opacity: 0, height: 0 }
                                  }
                                  transition={{ duration: 0.2 }}
                                  className="mt-2.5 pt-2 border-t border-card-border/60 dark:border-white/10 w-full"
                                >
                                  <div className="space-y-1.5 pl-1">
                                    <div className="flex items-center gap-1.5">
                                      <Terminal
                                        className="h-3 w-3 text-emerald-500/70 shrink-0"
                                        aria-hidden="true"
                                      />
                                      <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-text/40">
                                        Cryptographic Specifications
                                      </p>
                                    </div>
                                    <ul className="space-y-1 text-[10px] sm:text-[11px] text-text/60 list-disc list-inside">
                                      {layer.details?.map((detail, dIdx) => (
                                        <li
                                          key={dIdx}
                                          className="leading-relaxed break-words pl-0.5"
                                        >
                                          {detail}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="mt-4 sm:mt-6 space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-text/50">
                      <span className="truncate pr-2 font-medium">
                        {isSync ? 'Synchronizing vault data...' : 'Secure channel bootstrap'}
                      </span>
                      <span className="shrink-0 font-mono font-medium text-text/70">
                        {Math.round(progressWidth)}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progressWidth)}
                      aria-label="Security verification progress"
                      className="relative h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-text/10 dark:bg-white/10"
                    >
                      <motion.div
                        className="relative h-full rounded-full bg-text/75 dark:bg-white/80 overflow-hidden"
                        animate={{
                          width: `${progressWidth}%`,
                        }}
                        transition={
                          prefersReducedMotion
                            ? { duration: 0.1 }
                            : {
                                duration: 0.45,
                                ease: 'easeOut',
                              }
                        }
                      >
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"
                          aria-hidden="true"
                        />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    );
  },
);

SecurityLayers.displayName = 'SecurityLayers';
