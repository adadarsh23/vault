import { Suspense, lazy, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { LoadingScreen } from './components/app/LoadingScreen';
import { UniversalSyncWidget } from './components/vault/UniversalSyncWidget';
import { UniversalPanicLockWidget } from './components/vault/UniversalPanicLockWidget';
import { LockedVaultHost } from './components/app/LockedVaultHost';
import { SessionRevokedModal } from './components/auth/SessionRevokedModal';
import {
  startSessionSecurityWatcher,
  stopSessionSecurityWatcher,
} from './lib/sessionSecurityService';
import { useVaultStore } from './store/vaultStore';
import { useMediaQuery } from './hooks/use-media-query';
import { logger } from './lib/logger';
import { useAnalyticsPageTracking } from './lib/telemetry';

type TrustedScriptURL = {
  readonly __brand: unique symbol;
};

type TrustedTypesPolicy = {
  createScriptURL: (input: string) => TrustedScriptURL | string;
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
    requestIdleCallback?: (callback: (deadline: IdleDeadline) => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

const CACHE_PREFIX = 'vault-';

function getServiceWorkerPath(): string {
  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${baseUrl}/sw.js`;
}

function isLocalhost(): boolean {
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getTrustedServiceWorkerUrl(rawUrl: string): string | TrustedScriptURL {
  const trustedTypesApi = (window as WindowWithTrustedTypes).trustedTypes;
  if (!trustedTypesApi?.createPolicy) {
    return rawUrl;
  }

  const expected = new URL(rawUrl, window.location.origin);

  try {
    const policy =
      trustedTypesApi.getPolicy?.('vault-sw') ??
      trustedTypesApi.createPolicy('vault-sw', {
        createScriptURL: (input: string) => {
          const actual = new URL(input, window.location.origin);

          if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) {
            throw new TypeError(`Untrusted service worker URL: ${input}`);
          }

          return input;
        },
      });

    return policy.createScriptURL(rawUrl);
  } catch (error) {
    logger.error('Failed to create or validate Trusted Types policy for service worker', { error });
    throw error;
  }
}

const UnlockedVaultHost = lazy(() =>
  import('./components/app/UnlockedVaultHost').then(({ UnlockedVaultHost: Component }) => ({
    default: Component,
  })),
);

function AppContent() {
  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isVaultReady = useVaultStore((state) => state.isVaultReady);

  useEffect(() => {
    if (isVaultReady) {
      startSessionSecurityWatcher();
    } else {
      stopSessionSecurityWatcher();
    }
    return () => {
      stopSessionSecurityWatcher();
    };
  }, [isVaultReady]);

  return (
    <>
      <Suspense fallback={<LoadingScreen label="Loading vault..." className="px-4 py-8" />}>
        {isVaultReady ? (
          <UnlockedVaultHost shouldReduceMotion={shouldReduceMotion} />
        ) : (
          <LockedVaultHost shouldReduceMotion={shouldReduceMotion} />
        )}
      </Suspense>
      <SessionRevokedModal />
      {isVaultReady && <UniversalPanicLockWidget />}
      {isVaultReady && <UniversalSyncWidget />}
    </>
  );
}

export default function App() {
  useAnalyticsPageTracking();

  const { isVaultReady, isRefreshConfirmationEnabled } = useVaultStore(
    useShallow((state) => ({
      isVaultReady: state.isVaultReady,
      isRefreshConfirmationEnabled: state.preferences.isRefreshConfirmationEnabled,
    })),
  );

  // Manage Service Worker lifecycle safely
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return undefined;
    }

    const swPath = getServiceWorkerPath();

    // Dev safety: scoped removal of stale vault workers/caches to avoid reload loops
    if (import.meta.env.DEV || isLocalhost()) {
      const isVaultServiceWorker = (registration: ServiceWorkerRegistration) => {
        try {
          const scriptUrl = registration.active?.scriptURL;
          if (!scriptUrl) return false;
          const url = new URL(scriptUrl, window.location.origin);
          return url.origin === window.location.origin && url.pathname === swPath;
        } catch {
          return false;
        }
      };

      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter(isVaultServiceWorker)
              .map((registration) => registration.unregister()),
          ),
        )
        .catch((error) => {
          logger.warn('Service worker cleanup failed in dev', { error });
        });

      if ('caches' in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
            ),
          )
          .catch((error) => {
            logger.warn('Cache cleanup failed in dev', { error });
          });
      }

      return undefined;
    }

    if (import.meta.env.PROD) {
      const registerServiceWorker = () => {
        try {
          const swUrl = getTrustedServiceWorkerUrl(swPath);

          navigator.serviceWorker
            .register(swUrl as string, { updateViaCache: 'none' })
            .catch((error) => {
              logger.warn('Service worker registration failed', { error });
            });
        } catch (error) {
          logger.error('Service worker URL validation failed, registration aborted', { error });
        }
      };

      const currentWindow = window as WindowWithTrustedTypes;
      if (typeof currentWindow.requestIdleCallback === 'function') {
        const idleId = currentWindow.requestIdleCallback(registerServiceWorker);
        return () => currentWindow.cancelIdleCallback?.(idleId);
      }

      const timeoutId = window.setTimeout(registerServiceWorker, 1500);
      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, []);

  // Prevent accidental refresh/close when vault is unlocked
  useEffect(() => {
    if (!isVaultReady || !isRefreshConfirmationEnabled) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload, { capture: true });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, { capture: true });
    };
  }, [isVaultReady, isRefreshConfirmationEnabled]);

  return (
    <>
      <Toaster />
      <ErrorBoundary fallback={<ErrorFallback />}>
        <AppContent />
      </ErrorBoundary>
    </>
  );
}
