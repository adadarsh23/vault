let activitySyncHandler: (() => void) | null = null;
let activityLoggingEnabled = true;
let pendingSyncTimeout: number | null = null;
let lifecycleListenersInstalled = false;

const SYNC_DEBOUNCE_MS = 1500;

const flushPendingActivitySync = () => {
  if (pendingSyncTimeout != null) {
    window.clearTimeout(pendingSyncTimeout);
    pendingSyncTimeout = null;
  }

  activitySyncHandler?.();
};

const ensureLifecycleListeners = () => {
  if (lifecycleListenersInstalled || typeof window === 'undefined') {
    return;
  }

  lifecycleListenersInstalled = true;

  window.addEventListener('pagehide', flushPendingActivitySync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingActivitySync();
    }
  });
};

export const setActivitySyncHandler = (handler: (() => void) | null) => {
  activitySyncHandler = handler;
  ensureLifecycleListeners();
};

export const triggerActivitySync = () => {
  if (!activityLoggingEnabled) {
    return;
  }

  if (typeof window === 'undefined') {
    activitySyncHandler?.();
    return;
  }

  ensureLifecycleListeners();

  if (pendingSyncTimeout != null) {
    window.clearTimeout(pendingSyncTimeout);
  }

  pendingSyncTimeout = window.setTimeout(() => {
    pendingSyncTimeout = null;
    activitySyncHandler?.();
  }, SYNC_DEBOUNCE_MS);
};

export const setActivityLoggingEnabled = (enabled: boolean) => {
  activityLoggingEnabled = enabled;
  if (!enabled && pendingSyncTimeout != null) {
    window.clearTimeout(pendingSyncTimeout);
    pendingSyncTimeout = null;
  }
};

export const isActivityLoggingEnabled = () => activityLoggingEnabled;

export const flushActivitySync = () => {
  flushPendingActivitySync();
};
