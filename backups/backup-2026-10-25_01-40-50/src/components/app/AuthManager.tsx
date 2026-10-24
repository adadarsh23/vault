import { lazy, Suspense, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { LoadingScreen } from './LoadingScreen';
import { TAB_PATH_VALUES } from './NavigationHandler';

import {
  AUTH_TOKEN_CLEARED_EVENT,
  clearAuthToken,
  clearCloudSessionHint,
  clearRememberedVaultAccess,
  readCloudSessionHint,
} from '../../lib/auth-session';

import { logoutVaultSession, refreshVaultSession } from '../../lib/auth-api';
import { logger } from '../../lib/logger';

import { LandingPage } from '../../features/LandingPage';

const NotFoundPage = lazy(() =>
  import('../../features/NotFoundPage').then((module) => ({
    default: module.NotFoundPage || (module as any).default,
  })),
);
const AuthScreen = lazy(() =>
  import('../../features/auth/AuthScreen').then((module) => ({
    default: module.AuthScreen || (module as any).default,
  })),
);
const LegalPage = lazy(() =>
  import('../../features/LegalPage').then((module) => ({
    default: module.LegalPage || (module as any).default,
  })),
);
const ContactPage = lazy(() =>
  import('../../features/ContactPage').then((module) => ({
    default: module.ContactPage || (module as any).default,
  })),
);
const EmergencyClaimPage = lazy(() =>
  import('./EmergencyClaimPage').then((module) => ({
    default: module.EmergencyClaimPage || (module as any).default,
  })),
);

const SESSION_RESTORE_TIMEOUT_MS = 12_000;
const PUBLIC_AUTH_ROUTE_PATHS = new Set<string>(['/', '/legal', '/contact', '/emergency-claim']);

const normalizePathname = (pathname: string): string => {
  if (!pathname) return '/';
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
};

const safeTabPathValues = Array.isArray(TAB_PATH_VALUES) ? TAB_PATH_VALUES : [];

const PROTECTED_ROUTE_PATHS = new Set<string>(
  safeTabPathValues
    .map(normalizePathname)
    .filter((pathname) => !PUBLIC_AUTH_ROUTE_PATHS.has(pathname)),
);

const isProtectedRoutePath = (pathname: string): boolean =>
  PROTECTED_ROUTE_PATHS.has(normalizePathname(pathname));

const normalizeUsername = (value?: string | null): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

const AuthRouteLoading = () => <LoadingScreen label="Loading vault..." />;

export function useAuthManager() {
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    // If a session hint already exists, skip landing screen immediately to eliminate flicker
    const sessionHint = readCloudSessionHint();
    return !sessionHint?.username;
  });
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [restoredUsername, setRestoredUsername] = useState<string>(() => {
    const sessionHint = readCloudSessionHint();
    return normalizeUsername(sessionHint?.username);
  });
  const [hasCloudSession, setHasCloudSession] = useState<boolean>(() => {
    const sessionHint = readCloudSessionHint();
    return Boolean(sessionHint?.username);
  });

  const hasAttemptedAutoRestore = useRef(false);
  const restoreAbortRef = useRef(false);

  useEffect(() => {
    clearRememberedVaultAccess();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleAuthTokenCleared = () => {
      setHasCloudSession(false);
      setRestoredUsername('');
      setIsRestoringSession(false);
      setShowLanding(true);
    };

    window.addEventListener(AUTH_TOKEN_CLEARED_EVENT, handleAuthTokenCleared);

    return () => {
      window.removeEventListener(AUTH_TOKEN_CLEARED_EVENT, handleAuthTokenCleared);
    };
  }, []);

  const restoreCloudSession = useCallback(async () => {
    if (hasAttemptedAutoRestore.current) return;
    hasAttemptedAutoRestore.current = true;

    try {
      const sessionHint = readCloudSessionHint();
      const sessionHintUsername = normalizeUsername(sessionHint?.username);

      if (sessionHintUsername) {
        setHasCloudSession(true);
        setRestoredUsername(sessionHintUsername);
        setShowLanding(false);
      } else {
        setHasCloudSession(false);
        setRestoredUsername('');
        setShowLanding(true);
        setIsRestoringSession(false);
        return;
      }

      const data = await withTimeout(
        refreshVaultSession(),
        SESSION_RESTORE_TIMEOUT_MS,
        'Session restore timed out',
      );

      if (restoreAbortRef.current) return;

      if (!data || typeof data !== 'object' || typeof data.token !== 'string') {
        throw new Error('Invalid session response');
      }

      const username = normalizeUsername(data.user?.username) || sessionHintUsername;

      setHasCloudSession(true);
      setRestoredUsername(username);
      setShowLanding(false);
    } catch (error) {
      if (restoreAbortRef.current) {
        return;
      }

      const candidate = error as Error & {
        code?: string;
        status?: number;
      };
      const sessionHintUsername = normalizeUsername(readCloudSessionHint()?.username);

      const isExpected = candidate?.code === 'SESSION_REFRESH_FAILED' || candidate?.status === 401;

      if (!isExpected) {
        logger.error('Session restore failed', {
          error,
          context: 'cloud-session-restore',
        });
      } else {
        logger.info('No active cloud session found during auto-restore.', {
          context: 'cloud-session-restore',
        });
      }

      clearAuthToken();
      clearCloudSessionHint();

      setHasCloudSession(false);
      setRestoredUsername(sessionHintUsername);
      setShowLanding(true);
    } finally {
      if (!restoreAbortRef.current) {
        setIsRestoringSession(false);
      }
    }
  }, []);

  useEffect(() => {
    restoreAbortRef.current = false;
    void restoreCloudSession();

    return () => {
      restoreAbortRef.current = true;
    };
  }, [restoreCloudSession]);

  const handleSignOut = useCallback(async () => {
    try {
      await logoutVaultSession();
    } catch (err) {
      logger.warn('Sign out request failed during handleSignOut', { error: err });
    } finally {
      clearCloudSessionHint();
      clearAuthToken();
      clearRememberedVaultAccess();
      setHasCloudSession(false);
      setRestoredUsername('');
      setShowLanding(true);
    }
  }, []);

  return useMemo(
    () => ({
      hasCloudSession,
      isRestoringSession,
      restoredUsername,
      showLanding,
      setShowLanding,
      handleSignOut,
    }),
    [hasCloudSession, isRestoringSession, restoredUsername, showLanding, handleSignOut],
  );
}

export function AuthManager({
  cloudSessionActive,
  initialUsername,
  onEnterVault,
  onGoBack,
  showLanding,
}: {
  cloudSessionActive: boolean;
  initialUsername: string;
  onEnterVault: () => void;
  onGoBack: () => void;
  showLanding: boolean;
}) {
  const location = useLocation();
  const shouldRenderAuthFlowForFallback = isProtectedRoutePath(location.pathname);

  const authEntryElement = showLanding ? (
    <div key="landing">
      <LandingPage onEnterVault={onEnterVault} />
    </div>
  ) : (
    <div key="auth">
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-6 text-center">
            <div className="w-full max-w-md rounded-3xl border border-card-border bg-card/60 p-8 shadow-xl backdrop-blur-md">
              <h2 className="text-base font-bold text-text">Authentication Error</h2>
              <p className="mt-2 text-xs leading-relaxed text-text/60">
                {error?.message || 'Secure access could not be initialized.'}
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-text px-4 py-2 text-xs font-semibold text-bg transition hover:opacity-90 active:scale-95"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      >
        <Suspense fallback={<AuthRouteLoading />}>
          <AuthScreen
            onGoBack={onGoBack}
            initialUsername={initialUsername}
            cloudSessionActive={cloudSessionActive}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );

  return (
    <Routes>
      <Route
        path="/legal"
        element={
          <Suspense fallback={<AuthRouteLoading />}>
            <LegalPage />
          </Suspense>
        }
      />

      <Route
        path="/contact"
        element={
          <Suspense fallback={<AuthRouteLoading />}>
            <ContactPage />
          </Suspense>
        }
      />

      <Route
        path="/emergency-claim"
        element={
          <Suspense fallback={<AuthRouteLoading />}>
            <EmergencyClaimPage />
          </Suspense>
        }
      />

      <Route path="/" element={authEntryElement} />

      <Route
        path="*"
        element={
          shouldRenderAuthFlowForFallback ? (
            authEntryElement
          ) : (
            <Suspense fallback={<AuthRouteLoading />}>
              <NotFoundPage />
            </Suspense>
          )
        }
      />
    </Routes>
  );
}
