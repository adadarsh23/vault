/**
 * Security Intelligence, Anomaly Detection, and Threat Response Types
 */

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ThreatAction = 'allow' | 'challenge' | 'block';

export interface SecurityContext {
  requestId: string;
  fingerprint: string;
  userId?: string;
  riskScore: number;
  anomalies: string[];
  recommendedAction: ThreatAction;
  ip?: string;
  userAgent?: string;
}

export interface RequestFingerprint {
  hash: string;
  ip: string;
  userAgent: string;
  acceptLanguage?: string;
  secChUa?: string;
  secChUaPlatform?: string;
  timestamp: number;
}

export interface ThreatEvent {
  id: string;
  type: string;
  severity: ThreatSeverity;
  timestamp: Date;
  sourceIp: string;
  userId?: string;
  actionTaken: ThreatAction;
  details: Record<string, unknown>;
}

export interface RateLimitStatus {
  key: string;
  totalHits: number;
  resetTime: Date;
  remaining: number;
  isBlocked: boolean;
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  score: number;
  reasons: string[];
  confidence: number;
  recommendedAction: ThreatAction;
}

export interface IpReputation {
  ip: string;
  score: number;
  isBlacklisted: boolean;
  isTor?: boolean;
  isVpn?: boolean;
  countryCode?: string;
}

export interface SanitizationOptions {
  maskFields?: string[];
  truncateStringsLength?: number;
  maxDepth?: number;
}
