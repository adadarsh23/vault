export function initializeAnalytics(): Promise<boolean>;
export function trackPageView(path: string, title?: string): void;
export function trackEvent(
  action: string,
  category?: string,
  label?: string,
  value?: number | string
): void;
export function trackButtonClick(buttonName: string, location?: string): void;
export function trackFeatureUsage(featureName: string, context?: string): void;
export function trackError(errorName: string, source?: string, details?: number | string): void;
export function useAnalyticsPageTracking(): void;
