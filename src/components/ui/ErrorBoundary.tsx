import React from 'react';
import { logger } from '../../lib/logger';
import { captureException } from '../../lib/sentry';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

export type FallbackRender = (error: Error, resetErrorBoundary: () => void) => React.ReactNode;

export type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode | FallbackRender;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
};

export type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  copiedDetails: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    showDetails: false,
    copiedDetails: false,
  };

  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : JSON.stringify(error) || 'Unknown error');
    return { hasError: true, error: normalizedError };
  }

  override componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : JSON.stringify(error) || 'Unknown error');

    logger.error('ErrorBoundary caught a rendering error', {
      error: normalizedError.message,
      stack: normalizedError.stack,
      componentStack: errorInfo.componentStack,
      context: 'error-boundary',
    });

    try {
      captureException(normalizedError, {
        extra: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // Sentry fallback - ignore if sentry is disabled or fails
    }

    this.props.onError?.(normalizedError, errorInfo);
  }

  override componentWillUnmount() {
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
      this.copyTimeout = null;
    }
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      showDetails: false,
      copiedDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  copyErrorDetails = async () => {
    if (!this.state.error) return;
    const textToCopy = `Error: ${this.state.error.message}\n\nStack:\n${this.state.error.stack || 'No stack trace available'}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.setState({ copiedDetails: true });
      if (this.copyTimeout) clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => {
        this.setState({ copiedDetails: false });
      }, 2000);
    } catch {
      // Clipboard access denied or unsupported
    }
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.resetErrorBoundary);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default modern interactive fallback UI
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 sm:p-6 my-4 bg-red-950/20 border border-red-500/30 rounded-xl sm:rounded-2xl shadow-lg backdrop-blur-md max-w-lg mx-auto text-red-100 transition-all"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-red-500/20 rounded-lg text-red-400 shrink-0">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-red-200">
                Something went wrong
              </h3>
              <p className="text-xs sm:text-sm text-red-300/80 mt-1">
                An unforeseen rendering error occurred in this view.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={this.resetErrorBoundary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-1.5 text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm touch-manipulation active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>

                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-100 transition-colors touch-manipulation py-1"
                >
                  {this.state.showDetails ? (
                    <>
                      Hide technical details <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      View technical details <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              {this.state.showDetails && (
                <div className="mt-3 p-3 bg-black/40 border border-red-500/20 rounded-lg text-xs font-mono text-red-300 break-words max-h-48 overflow-y-auto relative group">
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-red-400/80">
                      Error details
                    </span>
                    <button
                      type="button"
                      onClick={this.copyErrorDetails}
                      className="inline-flex items-center gap-1 text-[11px] text-red-300/80 hover:text-red-100 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors touch-manipulation"
                      title="Copy error details to clipboard"
                    >
                      {this.state.copiedDetails ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div>{this.state.error.message || 'No specific error message provided.'}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
