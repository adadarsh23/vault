import { isProduction } from './colors.ts';

export interface HealthWarningInput {
  jwtConfigured: boolean;
  publicUrlConfigured: boolean;
  heapPercent: number;
  p95LatencyMs?: number;
  mongoConnected?: boolean;
  refreshTokenConfigured?: boolean;
  encryptionKeyConfigured?: boolean;
  eventLoopLagMs?: number;
}

export const getWarnings = (input: HealthWarningInput): string[] => {
  const isProd = isProduction();
  const warnings: string[] = [];

  if (isProd && !input.jwtConfigured) {
    warnings.push('JWT_SECRET missing in production');
  }

  if (isProd && !input.publicUrlConfigured) {
    warnings.push('PUBLIC_URL not configured in production');
  }

  if (isProd && input.mongoConnected === false) {
    warnings.push('MongoDB is not connected in production');
  }

  if (isProd && input.refreshTokenConfigured === false) {
    warnings.push('REFRESH_TOKEN_SECRET missing in production');
  }

  if (isProd && input.encryptionKeyConfigured === false) {
    warnings.push('VAULT_ENCRYPTION_KEY missing in production');
  }

  if (Number.isFinite(input.heapPercent) && input.heapPercent > 85) {
    warnings.push(`High heap usage: ${input.heapPercent.toFixed(1)}%`);
  }

  if (input.p95LatencyMs !== undefined && input.p95LatencyMs > 1000) {
    warnings.push(`High API latency p95: ${Math.round(input.p95LatencyMs)} ms`);
  }

  if (input.eventLoopLagMs !== undefined && input.eventLoopLagMs > 150) {
    warnings.push(`High event loop lag: ${Math.round(input.eventLoopLagMs)} ms`);
  }

  return warnings;
};

export const getHealthScore = (signals: boolean[]): string => {
  if (!Array.isArray(signals) || signals.length === 0) {
    return '0/0';
  }
  const passed = signals.filter(Boolean).length;
  return `${passed}/${signals.length}`;
};

export const calculateHealthPercent = (signals: boolean[]): number => {
  if (!Array.isArray(signals) || signals.length === 0) {
    return 0;
  }
  const passed = signals.filter(Boolean).length;
  return (passed / signals.length) * 100;
};
