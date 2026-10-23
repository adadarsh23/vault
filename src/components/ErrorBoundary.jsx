import React, { Component } from 'react';
import * as Sentry from '@sentry/react';
import { sentryIsEnabled } from '../lib/sentry';
import { logger } from '../lib/logger';
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';

/**
 * Normalizes any error value (string, object, Error, unknown) into a standard Error object.
 * @param {unknown} error
 * @returns {Error}
 */
function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  if (error && typeof error === 'object') {
    const rawMessage =
      error.message ||
      error.error ||
      error.statusText ||
      (typeof error.toString === 'function' && error.toString() !== '[object Object]'
        ? error.toString()
        : null);
    const err = new Error(rawMessage || 'An unexpected error occurred in this view');
    if (error.stack) {
      try {
        err.stack = String(error.stack);
      } catch {
        // Ignore read-only stack error
      }
    }
    if (error.name) {
      err.name = String(error.name);
    }
    return err;
  }
  return new Error(String(error || 'An unexpected error occurred in this view'));
}

/**
 * Compares two resetKeys arrays shallowly for changes.
 * @param {readonly unknown[] | undefined} prevKeys
 * @param {readonly unknown[] | undefined} nextKeys
 * @returns {boolean}
 */
function areResetKeysEqual(prevKeys, nextKeys) {
  if (prevKeys === nextKeys) return true;
  if (!prevKeys || !nextKeys) return false;
  if (prevKeys.length !== nextKeys.length) return false;
  for (let i = 0; i < prevKeys.length; i++) {
    if (!Object.is(prevKeys[i], nextKeys[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Safe clipboard copy supporting modern Clipboard API and fallback for mobile webviews / older browsers.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to DOM textarea fallback
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Safe check for whether Sentry telemetry is currently enabled.
 * @returns {boolean}
 */
function isSentryActive() {
  try {
    return typeof sentryIsEnabled === 'function' && Boolean(sentryIsEnabled());
  } catch {
    return false;
  }
}

/**
 * Production-ready, high-performance, responsive React Error Boundary with Sentry telemetry,
 * accessible fallback UI, automatic resetKeys observation, and multi-device compatibility.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      showDetails: false,
      copiedDetails: false,
    };
    this.copyTimeout = null;
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error: normalizeError(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    const normalizedError = normalizeError(error);
    const componentStack = errorInfo?.componentStack || null;

    this.setState({ componentStack });

    // 1. Structured logging via application logger
    try {
      logger.error('ErrorBoundary caught rendering exception', {
        boundary: this.props.name || 'ErrorBoundary',
        message: normalizedError.message,
        stack: normalizedError.stack,
        componentStack,
      });
    } catch {
      // Fallback to console if logger transport fails
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ErrorBoundary]', normalizedError, componentStack);
      }
    }

    // 2. Sentry capture with scoped boundary metadata if telemetry is active
    try {
      if (isSentryActive() && Sentry?.withScope) {
        Sentry.withScope((scope) => {
          scope.setTag('boundary', this.props.name || 'react');
          scope.setTag('boundary_type', 'ErrorBoundary');
          scope.setContext('react', {
            componentStack: componentStack || undefined,
          });

          if (typeof this.props.beforeCapture === 'function') {
            try {
              this.props.beforeCapture(scope, normalizedError, componentStack);
            } catch (beforeCaptureError) {
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('[ErrorBoundary] beforeCapture failed:', beforeCaptureError);
              }
            }
          }

          Sentry.captureException(normalizedError);
        });
      }
    } catch (sentryError) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ErrorBoundary] Sentry capture failed:', sentryError);
      }
    }

    // 3. User-defined onError callback
    try {
      this.props.onError?.(normalizedError, errorInfo);
    } catch (callbackError) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ErrorBoundary] onError prop callback failed:', callbackError);
      }
    }
  }

  componentDidUpdate(prevProps) {
    // Automatically reset when resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      if (!areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)) {
        this.resetErrorBoundary();
      }
    }
  }

  componentWillUnmount() {
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
      this.copyTimeout = null;
    }
  }

  /**
   * Resets the error boundary state and notifies the onReset callback.
   */
  resetErrorBoundary = () => {
    try {
      this.props.onReset?.();
    } catch (callbackError) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ErrorBoundary] onReset callback failed:', callbackError);
      }
    }

    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      showDetails: false,
      copiedDetails: false,
    });
  };

  /**
   * Toggles visibility of technical error details accordion.
   */
  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  /**
   * Copies formatted error message and stack trace to user clipboard.
   */
  copyErrorDetails = async () => {
    if (!this.state.error) return;
    const parts = [
      `Error: ${this.state.error.message || 'Unknown error'}`,
      this.state.error.stack ? `\nStack:\n${this.state.error.stack}` : '',
      this.state.componentStack ? `\nComponent Stack:\n${this.state.componentStack}` : '',
    ].filter(Boolean);

    const success = await copyToClipboard(parts.join('\n'));
    if (success) {
      this.setState({ copiedDetails: true });
      if (this.copyTimeout) clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => {
        this.setState({ copiedDetails: false });
      }, 2000);
    }
  };

  /**
   * Safe reload for unrecoverable errors.
   */
  handleReload = () => {
    if (typeof window !== 'undefined' && window.location?.reload) {
      window.location.reload();
    } else {
      this.resetErrorBoundary();
    }
  };

  /**
   * Evaluates function fallbacks with universal argument compatibility (React + Sentry signatures).
   */
  renderFunctionFallback(fn, error, componentStack) {
    try {
      const wrappedError = Object.assign(error, {
        error,
        componentStack,
        resetError: this.resetErrorBoundary,
        resetErrorBoundary: this.resetErrorBoundary,
        reset: this.resetErrorBoundary,
      });
      return fn(wrappedError, this.resetErrorBoundary);
    } catch (renderError) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ErrorBoundary] Custom fallback render failed:', renderError);
      }
      return this.renderDefaultFallback(renderError, componentStack);
    }
  }

  /**
   * Renders the production-grade, responsive, device-adaptive fallback UI.
   */
  renderDefaultFallback(error, componentStack) {
    const { showDetails, copiedDetails } = this.state;
    const boundaryName = this.props.name;
    const title = boundaryName ? `Something went wrong in ${boundaryName}` : 'Something went wrong';

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="w-full p-4 sm:p-6 my-4 bg-zinc-950/80 border border-red-500/30 rounded-xl sm:rounded-2xl shadow-xl backdrop-blur-md max-w-lg mx-auto text-zinc-100 transition-all select-text"
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2 sm:p-2.5 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-red-200 tracking-tight leading-snug break-words">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300/80 mt-1 leading-relaxed">
              An unexpected error occurred while rendering this component. You can try recovering or
              reloading.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={this.resetErrorBoundary}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg sm:rounded-xl transition-all shadow-md touch-manipulation min-h-[40px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700/60 rounded-lg sm:rounded-xl transition-all touch-manipulation min-h-[40px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
                <span>Reload</span>
              </button>

              <button
                type="button"
                onClick={this.toggleDetails}
                aria-expanded={showDetails}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 py-1.5 px-2 rounded-md transition-colors touch-manipulation min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                {showDetails ? (
                  <>
                    <span>Hide details</span>
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <span>Technical details</span>
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>

            {showDetails && (
              <div className="mt-3 p-3 sm:p-3.5 bg-black/60 border border-zinc-800 rounded-lg sm:rounded-xl text-xs font-mono text-zinc-300 break-words max-h-56 overflow-y-auto relative animate-in fade-in duration-150">
                <div className="flex justify-between items-center gap-2 mb-2 pb-1.5 border-b border-zinc-800/80">
                  <span className="text-[10px] sm:text-[11px] uppercase font-bold tracking-wider text-red-400/90">
                    Diagnostics
                  </span>
                  <button
                    type="button"
                    onClick={this.copyErrorDetails}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all touch-manipulation"
                    title="Copy error details to clipboard"
                    aria-label="Copy error details"
                  >
                    {copiedDetails ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden="true" />
                        <span className="text-emerald-400 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden="true" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-1.5 text-[11px] sm:text-xs">
                  <div className="font-semibold text-red-300/90 break-words">
                    {error?.name || 'Error'}: {error?.message || 'No specific error message.'}
                  </div>
                  {error?.stack && (
                    <div className="text-zinc-400 whitespace-pre-wrap font-mono text-[10px] sm:text-[11px] max-h-28 overflow-y-auto leading-relaxed border-t border-zinc-900 pt-1.5">
                      {error.stack}
                    </div>
                  )}
                  {componentStack && (
                    <div className="text-zinc-500 whitespace-pre-wrap font-mono text-[9px] sm:text-[10px] max-h-24 overflow-y-auto leading-tight border-t border-zinc-900 pt-1.5">
                      {componentStack}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const { error, componentStack } = this.state;
      const { fallback, fallbackRender, FallbackComponent } = this.props;

      // 1. FallbackComponent support
      if (FallbackComponent) {
        const ComponentToRender = FallbackComponent;
        return (
          <ComponentToRender
            error={error}
            componentStack={componentStack}
            resetError={this.resetErrorBoundary}
            resetErrorBoundary={this.resetErrorBoundary}
            reset={this.resetErrorBoundary}
          />
        );
      }

      // 2. fallbackRender prop support
      if (typeof fallbackRender === 'function') {
        return this.renderFunctionFallback(fallbackRender, error, componentStack);
      }

      // 3. fallback prop: function support
      if (typeof fallback === 'function') {
        return this.renderFunctionFallback(fallback, error, componentStack);
      }

      // 4. Custom ReactNode fallback
      if (fallback !== undefined && fallback !== null) {
        return fallback;
      }

      // 5. Default responsive, high-performance fallback UI
      return this.renderDefaultFallback(error, componentStack);
    }

    return this.props.children ?? null;
  }
}

/**
 * Higher-Order Component (HOC) to wrap any React component with ErrorBoundary.
 * @template P
 * @param {React.ComponentType<P>} WrappedComponent
 * @param {Omit<import('./ErrorBoundary').ErrorBoundaryProps, 'children'>} [errorBoundaryProps]
 * @returns {React.FC<P>}
 */
export function withErrorBoundary(WrappedComponent, errorBoundaryProps = {}) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithErrorBoundary = (props) => (
    <ErrorBoundary name={displayName} {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  return WithErrorBoundary;
}

export default ErrorBoundary;
