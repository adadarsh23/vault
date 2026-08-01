import React from 'react';
import * as Sentry from '@sentry/react';
import { sentryIsEnabled } from '../lib/sentry';

export function ErrorBoundary({ children, fallback }) {
  if (!sentryIsEnabled()) {
    return children;
  }

  return (
    <Sentry.ErrorBoundary
      fallback={fallback}
      beforeCapture={(scope, error, componentStack) => {
        scope.setTag('boundary', 'react');
        scope.setContext('react', {
          componentStack: componentStack || undefined,
        });
      }}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

export default ErrorBoundary;
