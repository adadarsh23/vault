import './lib/vite-preload-shim';

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';

import { ScrollRestoration } from './components/router';

import '@fontsource-variable/geist';

import App from './App';
import './index.css';

import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary as AppErrorBoundary } from './components/ui/ErrorBoundary';
import { ErrorFallback } from './components/ui/ErrorFallback';

import { logger } from './lib/logger';
import { captureLogRocketError, initLogRocket } from './lib/logrocket';

import { installGlobalFetchCsrfProtection } from './lib/csrf';
import { initTouchDragDrop } from './lib/vaultDragDrop';

import { bindGlobalErrorHandlers, initSentry, trackRouteNavigation } from './lib/sentry.js';

/**
 * ============================================================================
 * Bootstrap State
 * ============================================================================
 */

let sentryInitialized = false;
let logRocketInitialized = false;
let dragDropInitialized = false;
let csrfInitialized = false;

let trackRouteNavigationWhenReady:
  ((location: { pathname: string; search?: string; hash?: string }) => void) | null = null;

/**
 * ============================================================================
 * Utilities
 * ============================================================================
 */

const runWhenIdle = (callback: () => void): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const win = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(callback);
    return;
  }

  setTimeout(callback, 1);
};

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

const isLocalhost = (): boolean => {
  if (!isBrowser()) {
    return false;
  }

  const hostname = window.location.hostname;

  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

/**
 * ============================================================================
 * Sentry
 * ============================================================================
 */

const shouldBootstrapSentry = (): boolean => {
  const env = import.meta.env;

  const dsn = env.VITE_SENTRY_DSN;

  if (!dsn) {
    return false;
  }

  if (env.VITE_SENTRY_ENABLED === 'false') {
    return false;
  }

  if (env.VITE_SENTRY_ENABLED === 'true') {
    return true;
  }

  const allowLocalhost = env.VITE_SENTRY_ENABLE_LOCALHOST === 'true';

  return env.PROD === true && (!isLocalhost() || allowLocalhost);
};

const bootstrapSentry = (): void => {
  if (sentryInitialized) {
    return;
  }

  if (!shouldBootstrapSentry()) {
    return;
  }

  try {
    initSentry();

    bindGlobalErrorHandlers();

    trackRouteNavigationWhenReady = trackRouteNavigation;

    sentryInitialized = true;
  } catch (error) {
    logger.warn('Sentry initialization failed', {
      error,
    });
  }
};

/**
 * ============================================================================
 * CSRF Protection
 * ============================================================================
 */

const bootstrapCsrfProtection = (): void => {
  if (csrfInitialized) {
    return;
  }

  try {
    installGlobalFetchCsrfProtection();

    csrfInitialized = true;
  } catch (error) {
    logger.error('CSRF protection failed to initialize', {
      error,
    });

    /**
     * Security-sensitive application:
     * fail closed instead of silently continuing.
     */
    throw new Error('Security protection could not be initialized.');
  }
};

/**
 * ============================================================================
 * LogRocket
 * ============================================================================
 */

const bootstrapLogRocket = (): void => {
  if (logRocketInitialized) {
    return;
  }

  try {
    const started = initLogRocket();
    if (started) {
      logRocketInitialized = true;
    }
  } catch (error) {
    logRocketInitialized = false;

    logger.warn('LogRocket initialization failed', {
      error,
    });
  }
};

/**
 * ============================================================================
 * Drag & Drop
 * ============================================================================
 */

const bootstrapDragDrop = (): void => {
  if (dragDropInitialized) {
    return;
  }

  try {
    initTouchDragDrop();

    dragDropInitialized = true;
  } catch (error) {
    logger.warn('Touch drag-and-drop initialization failed', {
      error,
    });
  }
};

/**
 * ============================================================================
 * Route Tracking
 * ============================================================================
 */

function RouteChangeTracker() {
  const location = useLocation();

  useEffect(() => {
    const tracker = trackRouteNavigationWhenReady;

    if (!tracker) {
      return;
    }

    try {
      tracker(location);
    } catch (error) {
      logger.warn('Route tracking failed', {
        error,
        pathname: location.pathname,
      });
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

/**
 * ============================================================================
 * Global Error Protection
 * ============================================================================
 *
 * NOTE:
 * These handlers should NOT duplicate handlers already
 * installed by bindGlobalErrorHandlers().
 *
 * If bindGlobalErrorHandlers() already handles these
 * events, remove these listeners from this file.
 * ============================================================================
 */

const installFallbackGlobalErrorHandlers = (): void => {
  if (!isBrowser()) {
    return;
  }

  window.addEventListener('error', (event) => {
    logger.error('Unhandled runtime error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,

      /**
       * Do not blindly serialize arbitrary error
       * objects in security-sensitive applications.
       */
      errorName: event.error?.name,
      errorMessage: event.error?.message,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as
      | {
          name?: string;
          message?: string;
        }
      | string
      | undefined;

    const reasonMessage = typeof reason === 'string' ? reason : (reason?.message ?? '');

    const reasonName = typeof reason === 'string' ? '' : (reason?.name ?? '');

    const isAbortedViewTransition =
      reasonName === 'InvalidStateError' && reasonMessage.includes('Transition was aborted');

    if (isAbortedViewTransition) {
      event.preventDefault();

      logger.warn('View transition aborted due to state race', {
        reasonName,
        reasonMessage,
      });

      return;
    }

    logger.error('Unhandled promise rejection', {
      reasonName,
      reasonMessage,
    });
  });
};

/**
 * ============================================================================
 * Critical Bootstrap
 * ============================================================================
 *
 * Security and error monitoring are initialized before React.
 * Non-critical services are deferred until browser idle time.
 * ============================================================================
 */

bootstrapCsrfProtection();
bootstrapSentry();

if (isBrowser()) {
  installFallbackGlobalErrorHandlers();
}

/**
 * ============================================================================
 * Deferred Bootstrap
 * ============================================================================
 */

runWhenIdle(() => {
  bootstrapLogRocket();
});

runWhenIdle(() => {
  bootstrapDragDrop();
});

/**
 * ============================================================================
 * React Root
 * ============================================================================
 */

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Application root element "#root" was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary
      fallback={
        <ErrorFallback label="The app crashed before it could finish loading. Please refresh and try again." />
      }
      onError={(error, errorInfo) => {
        try {
          captureLogRocketError(error, {
            componentStack: errorInfo?.componentStack,
          });
        } catch (loggingError) {
          logger.warn('Failed to report React error', {
            loggingError,
          });
        }
      }}
    >
      <BrowserRouter>
        <ScrollRestoration />
        <RouteChangeTracker />

        <ThemeProvider>
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
