import { isProd } from './colors.ts';

export const getWarnings = (input: {
  jwtConfigured: boolean;
  publicUrlConfigured: boolean;
  heapPercent: number;
  p95LatencyMs?: number;
}) => {
  const warnings: string[] = [];
  if (isProd && !input.jwtConfigured) warnings.push('JWT_SECRET missing in production');
  if (isProd && !input.publicUrlConfigured)
    warnings.push('PUBLIC_URL not configured in production');
  if (input.heapPercent > 85) warnings.push(`High heap usage: ${input.heapPercent.toFixed(1)}%`);
  if ((input.p95LatencyMs ?? 0) > 1000) {
    warnings.push(`High API latency p95: ${Math.round(input.p95LatencyMs || 0)} ms`);
  }
  return warnings;
};

export const getHealthScore = (signals: boolean[]) =>
  `${signals.filter(Boolean).length}/${signals.length}`;
