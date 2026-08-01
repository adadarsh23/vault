import type { ReactNode } from 'react';

export interface SentryErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

export default function ErrorBoundary(props: SentryErrorBoundaryProps): ReactNode;
