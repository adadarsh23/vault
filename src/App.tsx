import { Suspense, lazy, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { LoadingScreen } from './components/app/LoadingScreen';
import { UniversalSyncWidget } from './components/vault/UniversalSyncWidget';
import { useVaultStore } from './store/vaultStore';
import { useMediaQuery } from './hooks/use-media-query';
import { logger } from './lib/logger';
import { useAnalyticsPageTracking } from './lib/telemetry';

type TrustedTypesPolicy = {
  createScriptURL: (input: string) => string;
};

type TrustedTypesApi = {
  getPolicy?: (name: string) => TrustedTypesPolicy | undefined;
  createPolicy: (
    name: string,
    rules: { createScriptURL: (input: string) => string },
  ) => TrustedTypesPolicy;
};

type WindowWithTrustedTypes = Window &
  typeof globalThis & {
    trustedTypes?: TrustedTypesApi;
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

const LockedVaultHost = lazy(() =>
  import('./components/app/LockedVaultHost').then((module) => ({
    default: module.LockedVaultHost || (module as any).default,
  })),
);

const UnlockedVaultHost = lazy(() =>
  import('./components/app/UnlockedVaultHost').then((module) => ({
    default: module.UnlockedVaultHost || (module as any).default,
  })),
);

export default function App() {
  useAnalyticsPageTracking();

  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const { isVaultReady, isRefreshConfirmationEnabled } = useVaultStore(
    useShallow((state) => ({
      isVaultReady: state.isVaultReady,
      isRefreshConfirmationEnabled: state.preferences.isRefreshConfirmationEnabled,
    })),
  );

  // Ensure latest Service Worker is active for production media streaming
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1';

    // Dev safety: aggressively remove stale workers/caches to avoid reload loops.
    if (import.meta.env.DEV || isLocalhost) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch((error) => {
          logger.warn('Service worker cleanup failed in dev', { error });
        });

      if ('caches' in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch((error) => {
            logger.warn('Cache cleanup failed in dev', { error });
          });
      }

      return;
    }

    if (import.meta.env.PROD) {
      const registerServiceWorker = () => {
        const trustedTypesApi = (window as WindowWithTrustedTypes).trustedTypes;
        const swUrl = (() => {
          if (!trustedTypesApi) {
            return '/sw.js';
          }

          const policy =
            trustedTypesApi.getPolicy?.('vault-sw') ??
            trustedTypesApi.createPolicy('vault-sw', {
              createScriptURL: (input: string) => input,
            });
          return policy.createScriptURL('/sw.js');
        })();

        navigator.serviceWorker
          .register(swUrl as unknown as string, { updateViaCache: 'none' })
          .then((registration) => {
            registration.update().catch((error) => {
              logger.warn('Service worker update check failed', { error });
            });
          })
          .catch((error) => {
            logger.warn('Service worker registration failed', { error });
          });
      };

      const currentWindow = window as WindowWithTrustedTypes;
      if (currentWindow.requestIdleCallback) {
        const idleId = currentWindow.requestIdleCallback(registerServiceWorker);
        return () => currentWindow.cancelIdleCallback?.(idleId);
      }

      const timeoutId = window.setTimeout(registerServiceWorker, 1500);
      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  // Prevent accidental refresh/close when vault is unlocked or has active session
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern browsers require a very specific pattern for the refresh prompt.
      // Trigger the confirmation when the vault is NOT ready (locked) and the user has enabled the preference.
      if (!isVaultReady && isRefreshConfirmationEnabled) {
        const message = 'You have unsaved changes. Are you sure you want to refresh the page?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    // Bind listener globally
    window.addEventListener('beforeunload', handleBeforeUnload, {
      capture: true,
    });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, {
        capture: true,
      });
    };
  }, [isVaultReady, isRefreshConfirmationEnabled]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Toaster />
      <Suspense fallback={<LoadingScreen label="Loading vault..." className="px-4 py-8" />}>
        {isVaultReady ? (
          <UnlockedVaultHost shouldReduceMotion={shouldReduceMotion} />
        ) : (
          <LockedVaultHost shouldReduceMotion={shouldReduceMotion} />
        )}
      </Suspense>
      {isVaultReady && <UniversalSyncWidget />}
    </ErrorBoundary>
  );
}
