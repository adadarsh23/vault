import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { ErrorFallback } from '../ui/ErrorFallback';
import { LoadingScreen } from './LoadingScreen';
import { TAB_PATH_VALUES } from './NavigationHandler';

import {
  AUTH_TOKEN_CLEARED_EVENT,
  clearAuthToken,
  clearCloudSessionHint,
  clearRememberedVaultAccess,
  readCloudSessionHint,
  restoreAuthSessionFromCookies,
} from '../../lib/auth-session';

import { refreshVaultSession } from '../../lib/auth-api';
import { logger } from '../../lib/logger';

const LandingPage = lazy(() => import('../../features/LandingPage'));
const NotFoundPage = lazy(() =>
  import('../../features/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  }))
);
const AuthScreen = lazy(() => import('../../features/auth/AuthScreen'));
const LegalPage = lazy(() =>
  import('../../features/LegalPage').then((module) => ({
    default: module.LegalPage,
  }))
);
const ContactPage = lazy(() =>
  import('../../features/ContactPage').then((module) => ({
    default: module.ContactPage,
  }))
);

const SESSION_RESTORE_TIMEOUT_MS = 12_000;
const PUBLIC_AUTH_ROUTE_PATHS = new Set<string>(['/', '/legal', '/contact']);

const normalizePathname = (pathname: string): string => {
  if (!pathname) return '/';
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
};

const safeTabPathValues = Array.isArray(TAB_PATH_VALUES) ? TAB_PATH_VALUES : [];

const PROTECTED_ROUTE_PATHS = new Set<string>(
  safeTabPathValues
    .map(normalizePathname)
    .filter((pathname) => !PUBLIC_AUTH_ROUTE_PATHS.has(pathname))
);

const isProtectedRoutePath = (pathname: string): boolean =>
  PROTECTED_ROUTE_PATHS.has(normalizePathname(pathname));

const normalizeUsername = (value?: string | null): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
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
  const [showLanding, setShowLanding] = useState(true);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [restoredUsername, setRestoredUsername] = useState('');
  const [hasCloudSession, setHasCloudSession] = useState(false);

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
      const restored = restoreAuthSessionFromCookies();
      const shouldAttemptRefresh = Boolean(restored.token || sessionHintUsername);

      if (restored.token && sessionHintUsername) {
        setHasCloudSession(true);
        setRestoredUsername(sessionHintUsername);
        setShowLanding(false);
      }

      if (!shouldAttemptRefresh) {
        setHasCloudSession(false);
        setRestoredUsername('');
        setShowLanding(true);
        return;
      }

      const data = await withTimeout(
        refreshVaultSession(),
        SESSION_RESTORE_TIMEOUT_MS,
        'Session restore timed out'
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

  return {
    hasCloudSession,
    isRestoringSession,
    restoredUsername,
    showLanding,
    setShowLanding,
  };
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
      <Suspense fallback={<AuthRouteLoading />}>
        <LandingPage onEnterVault={onEnterVault} />
      </Suspense>
    </div>
  ) : (
    <div key="auth">
      <ErrorBoundary fallback={<ErrorFallback label="Secure access failed. Please refresh." />}>
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
