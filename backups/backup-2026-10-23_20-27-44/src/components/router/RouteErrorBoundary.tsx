import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate, type Location, type NavigateFunction } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { logger } from '../../lib/logger';

export interface RouteErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: { error: Error; reset: () => void }) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface InnerState {
  hasError: boolean;
  error: Error | null;
}

interface InnerProps extends RouteErrorBoundaryProps {
  location: Location;
  navigate: NavigateFunction;
}

class InnerRouteErrorBoundary extends Component<InnerProps, InnerState> {
  override state: InnerState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): InnerState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    try {
      logger.error('RouteErrorBoundary caught route navigation or chunk error', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        pathname: this.props.location.pathname,
        context: 'route-error-boundary',
      });
    } catch {
      // Degrade gracefully
    }
    this.props.onError?.(error, errorInfo);
  }

  override componentDidUpdate(prevProps: InnerProps): void {
    // Automatically reset error boundary state when user navigates to a new route
    if (this.state.hasError && prevProps.location.pathname !== this.props.location.pathname) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.reset();
    }
  };

  handleGoBack = (): void => {
    this.props.navigate(-1);
    this.reset();
  };

  handleGoHome = (): void => {
    this.props.navigate('/');
    this.reset();
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError =
        this.state.error.message.includes('dynamically imported module') ||
        this.state.error.message.includes('ChunkLoadError') ||
        this.state.error.message.includes('Loading chunk');

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center select-none"
        >
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 shadow-sm border border-destructive/20">
            <AlertTriangle className="w-7 h-7" aria-hidden="true" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2">
            {isChunkError ? 'Update or Connection Interruption' : 'Unable to Load Page'}
          </h2>

          <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
            {isChunkError
              ? 'A newer version of the vault was published or your internet connection dropped. Reloading will fetch the latest assets.'
              : this.state.error.message ||
                'An unexpected error occurred while loading this section.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Reload Page</span>
            </button>

            <button
              type="button"
              onClick={this.handleGoBack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border bg-background hover:bg-muted/60 transition-all active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Go Back</span>
            </button>

            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border bg-background hover:bg-muted/60 transition-all active:scale-[0.98]"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Vault Home</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Enterprise Route Error Boundary component.
 * Catches route render failures, network disconnects during dynamic chunk imports,
 * and automatically recovers whenever the user navigates back or to another route.
 */
export function RouteErrorBoundary(props: RouteErrorBoundaryProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return <InnerRouteErrorBoundary {...props} location={location} navigate={navigate} />;
}

export default RouteErrorBoundary;
