import React from 'react';
import { logger } from '../../lib/logger';
import { captureException } from '../../lib/sentry';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

type FallbackRender = (error: Error, resetErrorBoundary: () => void) => React.ReactNode;

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode | FallbackRender;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    showDetails: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('ErrorBoundary caught a rendering error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      context: 'error-boundary',
    });

    try {
      captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // Sentry fallback
    }

    this.props.onError?.(error, errorInfo);
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      showDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.resetErrorBoundary);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default modern interactive fallback UI
      return (
        <div className="p-6 my-4 bg-red-950/20 border border-red-500/30 rounded-xl shadow-lg backdrop-blur-md max-w-lg mx-auto text-red-100">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-red-500/20 rounded-lg text-red-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-red-200">Something went wrong</h3>
              <p className="text-sm text-red-300/80 mt-1">
                An unforeseen rendering error occurred in this view.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={this.resetErrorBoundary}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>

                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-100 transition-colors"
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
                <div className="mt-3 p-3 bg-black/40 border border-red-500/20 rounded-lg text-xs font-mono text-red-300 break-words max-h-40 overflow-y-auto">
                  {this.state.error.message || 'No specific error message provided.'}
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
