import type { Component, ComponentType, ErrorInfo, ReactNode } from 'react';

/**
 * Properties passed to custom error fallback render functions or components.
 */
export interface FallbackProps {
  error: Error;
  componentStack?: string | null;
  resetError: () => void;
  resetErrorBoundary: () => void;
  reset: () => void;
}

/**
 * Custom fallback render callback, supporting both Sentry object signature
 * and standard React error boundary signatures.
 */
export type FallbackRender =
  | ((props: FallbackProps) => ReactNode)
  | ((error: Error, resetErrorBoundary: () => void) => ReactNode);

/**
 * Props for the ErrorBoundary component.
 */
export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | FallbackRender;
  fallbackRender?: FallbackRender;
  FallbackComponent?: ComponentType<FallbackProps>;
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: readonly unknown[];
  name?: string;
  beforeCapture?: (scope: unknown, error: Error, componentStack: string | null) => void;
  showDialog?: boolean;
}

/**
 * State for the ErrorBoundary component.
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
  copiedDetails: boolean;
}

/**
 * Production-ready React Error Boundary with telemetry, accessibility, and multi-device support.
 */
export declare class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;
  resetErrorBoundary: () => void;
  toggleDetails: () => void;
  copyErrorDetails: () => Promise<void>;
  handleReload: () => void;
  render(): ReactNode;
}

/**
 * Backward compatibility alias for SentryErrorBoundaryProps.
 */
export type SentryErrorBoundaryProps = ErrorBoundaryProps;

/**
 * Higher-order component to wrap any React component with ErrorBoundary.
 */
export declare function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
): ComponentType<P>;

export default ErrorBoundary;
