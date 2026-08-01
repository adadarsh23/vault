import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import '@fontsource-variable/geist';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { ErrorBoundary as AppErrorBoundary } from './components/ui/ErrorBoundary.tsx';
import { ErrorFallback } from './components/ui/ErrorFallback.tsx';
import { logger } from './lib/logger.ts';
import { captureLogRocketError, initLogRocket } from './lib/logrocket.ts';
import { installGlobalFetchCsrfProtection } from './lib/csrf.ts';
import { initTouchDragDrop } from './lib/vaultDragDrop.ts';

let trackRouteNavigationWhenReady:
  | ((location: { pathname: string; search?: string; hash?: string }) => void)
  | null = null;

const runWhenIdle = (cb: () => void) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (fn: () => void) => number }).requestIdleCallback(cb);
    return;
  }
  setTimeout(cb, 1);
};

const shouldBootstrapSentry = () => {
  const env = import.meta.env;
  const dsn = env.VITE_SENTRY_DSN;
  if (!dsn) return false;

  if (env.VITE_SENTRY_ENABLED === 'false') return false;
  if (env.VITE_SENTRY_ENABLED === 'true') return true;

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1';
  const allowLocalhost = env.VITE_SENTRY_ENABLE_LOCALHOST === 'true';

  return env.PROD === true && (!isLocalhost || allowLocalhost);
};

runWhenIdle(() => {
  void initLogRocket();
});

installGlobalFetchCsrfProtection();
runWhenIdle(() => {
  initTouchDragDrop();
});

runWhenIdle(() => {
  if (!shouldBootstrapSentry()) {
    return;
  }

  void import('./lib/sentry.js')
    .then((module) => {
      try {
        module.initSentry();
        module.bindGlobalErrorHandlers();
        trackRouteNavigationWhenReady = module.trackRouteNavigation;
      } catch (error) {
        logger.warn('Sentry init skipped due to runtime bootstrap failure', { error });
      }
    })
    .catch((error) => {
      logger.warn('Sentry bundle could not be loaded; continuing without it.', { error });
    });
});

function RouteChangeTracker() {
  const location = useLocation();
  useEffect(() => {
    if (trackRouteNavigationWhenReady) {
      trackRouteNavigationWhenReady(location);
    }
  }, [location]);
  return null;
}

window.addEventListener('error', (event) => {
  logger.error('Unhandled runtime error', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as
    | { name?: string; message?: string }
    | string
    | undefined;
  const reasonMessage =
    typeof reason === 'string'
      ? reason
      : reason?.message ?? '';

  const reasonName =
    typeof reason === 'string' ? '' : (reason?.name ?? '');

  const isAbortedViewTransition =
    reasonName === 'InvalidStateError' &&
    reasonMessage.includes('Transition was aborted');

  if (isAbortedViewTransition) {
    event.preventDefault();
    logger.warn('View transition aborted due to state race; safely ignored', {
      reason: event.reason,
    });
    return;
  }

  logger.error('Unhandled promise rejection', {
    reason: event.reason,
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary
      fallback={<ErrorFallback label="The app crashed before it could finish loading. Please refresh and try again." />}
      onError={(error, errorInfo) => {
        captureLogRocketError(error, {
          componentStack: errorInfo?.componentStack,
        });
      }}
    >
      <BrowserRouter>
        <RouteChangeTracker />
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>
);
