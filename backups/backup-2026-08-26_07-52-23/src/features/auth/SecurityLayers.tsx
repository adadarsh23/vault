import React, { memo } from 'react';
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
  type LucideIcon,
} from 'lucide-react';

const MAX_PROGRESS_BEFORE_COMPLETION = 90;
const SYNC_MODE_PROGRESS = 95;
const COMPLETED_PROGRESS = 100;
const ZERO_PROGRESS = 0;

const BLUR_BG_SCALE_DURATION = 5;
const BLUR_BG_DRIFT_LEFT_DURATION = 7;
const BLUR_BG_DRIFT_RIGHT_DURATION = 6;
const ACTIVE_LAYER_PULSE_DURATION = 1.6;

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
  }) => {
    const prefersReducedMotion = useReducedMotion();

    const isSuccess = status === 'success' || success === true;
    const isError = status === 'error' || Boolean(error);
    const isSync = mode === 'sync' || title === 'Syncing Secure Vault';
    const currentLayerIndex = currentLayer ?? -1;

    const safeLayers: SecurityLayer[] = Array.isArray(layers)
      ? layers.filter((l): l is SecurityLayer => Boolean(l && l.name && (l.description || l.desc)))
      : [];

    const progressWidth: number =
      safeLayers.length === 0
        ? ZERO_PROGRESS
        : isSuccess
          ? COMPLETED_PROGRESS
          : isSync
            ? SYNC_MODE_PROGRESS
            : currentLayerIndex >= safeLayers.length
              ? COMPLETED_PROGRESS
              : Math.min(
                  ((Math.max(currentLayerIndex, 0) + 1) / safeLayers.length) *
                    MAX_PROGRESS_BEFORE_COMPLETION,
                  COMPLETED_PROGRESS,
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
        ? successMessage || 'Security verification completed successfully.'
        : activeLayer
          ? `Running security layer ${currentLayerIndex + 1} of ${safeLayers.length}: ${activeLayer.name}`
          : title || 'Security verification in progress';

    if (!safeLayers.length && !isSuccess && !isError) {
      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center p-4 text-center">
          <p className="text-text/50">Security layers are not available.</p>
        </div>
      );
    }

    return (
      <div className="relative flex min-h-[80vh] w-full items-center justify-center text-text">
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
            className="absolute left-1/2 top-20 h-64 w-64 -translate-x-1/2 rounded-full bg-text/[0.04] blur-3xl"
            animate={
              prefersReducedMotion ? undefined : { scale: [1, 1.05, 1], opacity: [0.2, 0.3, 0.2] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: BLUR_BG_SCALE_DURATION, repeat: Infinity, ease: 'easeInOut' }
            }
          />
          <motion.div
            className="absolute bottom-12 left-8 h-52 w-52 rounded-full bg-text/[0.03] blur-3xl"
            animate={prefersReducedMotion ? undefined : { x: [0, 14, 0], y: [0, -10, 0] }}
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: BLUR_BG_DRIFT_LEFT_DURATION, repeat: Infinity, ease: 'easeInOut' }
            }
          />
          <motion.div
            className="absolute right-10 top-20 h-60 w-60 rounded-full bg-text/[0.03] blur-3xl"
            animate={prefersReducedMotion ? undefined : { x: [0, -14, 0], y: [0, 8, 0] }}
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: BLUR_BG_DRIFT_RIGHT_DURATION, repeat: Infinity, ease: 'easeInOut' }
            }
          />
        </div>

        <div className={`relative z-10 w-full ${isSuccess || isError ? 'max-w-2xl' : 'max-w-4xl'}`}>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`overflow-hidden rounded-[2rem] border border-card-border bg-card-bg p-6 shadow-sm dark:border-white/10 dark:bg-black md:p-8 ${
              isSuccess || isError ? 'flex min-h-[56vh] items-center justify-center' : ''
            }`}
          >
            {!isSuccess && !isError && (
              <div className="mb-8 flex flex-col gap-6 border-b border-card-border pb-6 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-text/70 dark:border-white/10 dark:bg-black/40">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {isSync ? 'Vault Synchronization' : 'Security Check'}
                  </div>

                  <div className="text-left">
                    <h2 className="mb-2 text-3xl font-bold md:text-4xl">
                      {title ||
                        (isSync ? 'Syncing Secure Vault' : 'Establishing Secure Environment')}
                    </h2>

                    <p className="max-w-2xl text-sm leading-6 text-text/55 md:text-base">
                      {description ||
                        (isSync
                          ? 'Cloud sync is in progress. Establishing secure connection...'
                          : `Running ${safeLayers.length}-layer protocol check...`)}
                    </p>
                  </div>
                </div>

                <div className="grid min-w-[220px] grid-cols-2 gap-3 self-start md:self-auto">
                  <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-4 dark:border-white/10 dark:bg-black/40">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-text/35">Protocol</p>
                    <p className="mt-2 text-2xl font-semibold">{safeLayers.length}</p>
                    <p className="mt-1 text-xs text-text/45">Security</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-4 dark:border-white/10 dark:bg-black/40">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-text/35">Progress</p>
                    <p className="mt-2 text-2xl font-semibold">{Math.round(progressWidth)}%</p>
                    <p className="mt-1 text-xs text-text/45">
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
                  className="w-full py-6 text-center"
                >
                  <motion.div
                    className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 shadow-sm dark:border-red-500/30 dark:bg-red-950/30"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
                  >
                    <AlertTriangle
                      className="h-16 w-16 text-red-500 dark:text-red-400"
                      aria-hidden="true"
                    />
                  </motion.div>

                  <div className="mx-auto max-w-xl rounded-3xl border border-card-border bg-card-bg p-5 text-center dark:border-white/10 dark:bg-black/30">
                    <p className="text-sm font-semibold text-text/85">
                      {errorTitle || 'Security Verification Failed'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text/45">{resolvedErrorMessage}</p>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-text/10 px-4 py-2 text-xs font-semibold text-text transition hover:bg-text/20 focus:outline-none focus:ring-2 focus:ring-text/30"
                      >
                        Retry Verification
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : isSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full py-6 text-center"
                >
                  <motion.div
                    className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full border border-card-border bg-card-bg shadow-sm dark:border-white/10 dark:bg-black/30"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
                  >
                    <ShieldCheck className="h-16 w-16 text-green-400" aria-hidden="true" />
                  </motion.div>

                  <div className="mx-auto max-w-xl rounded-3xl border border-card-border bg-card-bg p-5 text-center dark:border-white/10 dark:bg-black/30">
                    <p className="text-sm font-semibold text-text/85">
                      {successTitle || 'Secure vault channel established'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text/45">
                      {successMessage ||
                        'Identity verification, hybrid key exchange, and encrypted sync completed successfully.'}
                    </p>
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
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-text/80">Layer Execution Matrix</p>
                      <p className="text-xs text-text/40">
                        Active layer is highlighted while completed layers are sealed.
                      </p>
                    </div>
                    <div className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-card-border bg-card-bg px-3 py-1.5 text-xs font-medium text-text/45 dark:border-white/10 dark:bg-black/40">
                      {Math.min(Math.max(currentLayerIndex + 1, 0), safeLayers.length)} /{' '}
                      {safeLayers.length}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {safeLayers.map((layer, idx) => {
                      const Icon = getSafeIcon(layer, idx);
                      const isCompleted = currentLayerIndex > idx;
                      const isActive = currentLayerIndex === idx;
                      const layerKey = layer.id ?? layer.name ?? `layer-${idx}`;
                      const layerDesc = getLayerDescription(layer);

                      return (
                        <motion.div
                          key={layerKey}
                          layout={!prefersReducedMotion}
                          initial={prefersReducedMotion ? false : { opacity: 0.3, y: 8 }}
                          animate={{
                            opacity: currentLayerIndex >= idx ? 1 : 0.3,
                            scale: prefersReducedMotion ? 1 : isActive ? 1.03 : 1,
                            y: 0,
                            borderColor: isActive
                              ? 'rgba(255, 255, 255, 0.16)'
                              : isCompleted
                                ? 'rgba(255, 255, 255, 0.1)'
                                : 'rgba(255, 255, 255, 0.08)',
                            backgroundColor: isActive
                              ? 'rgba(255, 255, 255, 0.04)'
                              : isCompleted
                                ? 'rgba(255, 255, 255, 0.02)'
                                : 'rgba(255, 255, 255, 0.01)',
                            boxShadow: isActive
                              ? '0 0 0 1px rgba(255, 255, 255, 0.02), 0 10px 24px rgba(0, 0, 0, 0.14)'
                              : '0 4px 16px rgba(0, 0, 0, 0.08)',
                          }}
                          transition={{
                            type: 'spring',
                            stiffness: 140,
                            damping: 16,
                            mass: 0.9,
                          }}
                          aria-current={isActive ? 'step' : undefined}
                          className="relative flex items-center gap-4 rounded-[1.5rem] border p-4"
                        >
                          {isActive && (
                            <motion.div
                              className="absolute inset-0 rounded-[1.5rem] bg-text/[0.03]"
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

                          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/30">
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
                            ) : (
                              <Icon
                                className={`h-5 w-5 ${isActive ? 'text-text' : 'text-text/75'}`}
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          <div className="relative min-w-0">
                            {layer.label && (
                              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-text/30">
                                {layer.label}
                              </p>
                            )}
                            <div className="mb-1 flex items-center gap-2">
                              <p className="text-sm font-bold">{layer.name}</p>
                              {isCompleted && (
                                <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-green-300">
                                  Done
                                </span>
                              )}
                              {isActive && (
                                <span className="rounded-full border border-text/10 bg-text/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text/80">
                                  Active
                                </span>
                              )}
                            </div>
                            {layerDesc && (
                              <p className="text-xs leading-5 text-text/40">{layerDesc}</p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between text-xs text-text/45">
                      <span>
                        {isSync ? 'Synchronizing vault data...' : 'Secure channel bootstrap'}
                      </span>
                      <span>{Math.round(progressWidth)}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progressWidth)}
                      aria-label="Security verification progress"
                      className="h-2 w-full overflow-hidden rounded-full bg-text/10"
                    >
                      <motion.div
                        className="h-full rounded-full bg-text/70"
                        style={{
                          background:
                            'linear-gradient(90deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.78) 50%, rgba(255,255,255,0.45) 100%)',
                          backgroundSize: '180% 100%',
                        }}
                        animate={{
                          width: `${progressWidth}%`,
                          backgroundPosition: '0%',
                        }}
                        transition={
                          prefersReducedMotion
                            ? { duration: 0.1 }
                            : {
                                duration: 0.45,
                                ease: 'easeOut',
                              }
                        }
                      />
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
