export type SentryLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

export function initSentry(options?: Record<string, unknown>): boolean;
export function bindGlobalErrorHandlers(): void;
export function trackRouteNavigation(location: { pathname: string; search?: string }): void;
export function captureException(error: unknown, context?: Record<string, unknown>): string | null;
export function captureMessage(
  message: string,
  level?: SentryLevel,
  context?: Record<string, unknown>,
): string | null;
export function setUser(user: Record<string, unknown> | null): void;
export function clearUser(): void;
export function addBreadcrumb(breadcrumb: Record<string, unknown>): void;
export function sentryIsEnabled(): boolean;
