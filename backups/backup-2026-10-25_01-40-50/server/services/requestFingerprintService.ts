/**
 * Request Fingerprinting & Device Binding Service
 *
 * Creates unique device fingerprints combining:
 * - Hardware characteristics
 * - Browser/OS properties
 * - Network characteristics
 * - Behavioral signals
 *
 * Prevents:
 * - Token theft and impersonation
 * - Account takeover
 * - Cross-device fraud
 * - Bot attacks
 */

import crypto from 'crypto';
import { Request } from 'express';
import { logger } from '../utils/logger.ts';

interface DeviceFingerprint {
  id: string; // Unique fingerprint hash
  userId?: string;
  createdAt: number;
  lastSeen: number;
  accessCount: number;
  metadata: {
    userAgent: string;
    acceptLanguage?: string;
    acceptEncoding?: string;
    platform?: string;
    screenResolution?: string;
    timezone?: string;
    webglRenderer?: string; // GPU info from WebGL
    canvasFingerprint?: string;
    audioContext?: string;
    hardwareInfo?: string;
  };
  riskFactors: string[];
  trustScore: number; // 0-100
  isVerified: boolean;
}

interface FingerprintValidation {
  isValid: boolean;
  trustScore: number;
  anomalies: string[];
  recommendation: 'allow' | 'challenge' | 'block';
}

class RequestFingerprintService {
  private deviceFingerprints: Map<string, DeviceFingerprint> = new Map();
  private userDevices: Map<string, Set<string>> = new Map(); // userId -> Set of fingerprint IDs

  private readonly TRUST_DECAY_RATE = 0.95; // Daily decay
  private readonly MAX_DEVICES_PER_USER = 10;
  private readonly ANOMALY_THRESHOLD = 3;

  /**
   * Generate fingerprint from request metadata
   * Combines multiple signals for high uniqueness
   */
  generateFingerprint(
    req: Request,
    userId?: string,
    clientData?: Record<string, string>,
  ): DeviceFingerprint {
    const signals = this.extractSignals(req, clientData);
    const fingerprintHash = this.hashSignals(signals);
    const now = Date.now();

    const fingerprint: DeviceFingerprint = {
      id: fingerprintHash,
      userId,
      createdAt: now,
      lastSeen: now,
      accessCount: 1,
      metadata: signals,
      riskFactors: [],
      trustScore: 50, // Start neutral
      isVerified: false,
    };

    this.deviceFingerprints.set(fingerprintHash, fingerprint);

    // Track user devices
    if (userId) {
      if (!this.userDevices.has(userId)) {
        this.userDevices.set(userId, new Set());
      }
      this.userDevices.get(userId)!.add(fingerprintHash);
      this.pruneUserDevices(userId);
    }

    return fingerprint;
  }

  /**
   * Validate request fingerprint against stored device profile
   */
  async validateFingerprint(
    req: Request,
    _userId?: string,
    clientData?: Record<string, string>,
    expectedFingerprintId?: string,
  ): Promise<FingerprintValidation> {
    const currentSignals = this.extractSignals(req, clientData);
    const anomalies: string[] = [];
    let trustScore = 50;

    // If fingerprint ID provided, validate against stored profile
    if (expectedFingerprintId) {
      const storedFingerprint = this.deviceFingerprints.get(expectedFingerprintId);

      if (!storedFingerprint) {
        anomalies.push('UNKNOWN_DEVICE');
        trustScore = 20;
        return {
          isValid: false,
          trustScore,
          anomalies,
          recommendation: 'challenge',
        };
      }

      // Check signal consistency
      const signalDifference = this.compareSignals(storedFingerprint.metadata, currentSignals);
      if (signalDifference > 0.3) {
        anomalies.push('SIGNAL_DRIFT');
        trustScore -= 20;
      }

      // Check access pattern
      const timeSinceLastAccess = Date.now() - storedFingerprint.lastSeen;
      if (timeSinceLastAccess < 1000) {
        anomalies.push('TOO_FAST_REPEAT');
        trustScore -= 30; // Possible automated attack
      }

      // Apply trust decay
      const daysSinceCreation = (Date.now() - storedFingerprint.createdAt) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.pow(this.TRUST_DECAY_RATE, daysSinceCreation);
      trustScore = Math.floor(storedFingerprint.trustScore * decayFactor);

      // Update metadata
      storedFingerprint.lastSeen = Date.now();
      storedFingerprint.accessCount++;
      storedFingerprint.metadata = { ...currentSignals }; // Update with latest signals
    }

    // Check for suspicious patterns
    const suspiciousPatterns = this.detectSuspiciousPatterns(currentSignals);
    anomalies.push(...suspiciousPatterns);

    if (suspiciousPatterns.length >= this.ANOMALY_THRESHOLD) {
      trustScore -= suspiciousPatterns.length * 15;
    }

    // Determine recommendation
    let recommendation: 'allow' | 'challenge' | 'block' = 'allow';
    if (trustScore >= 70) {
      recommendation = 'allow';
    } else if (trustScore >= 40) {
      recommendation = 'challenge'; // Require MFA
    } else {
      recommendation = 'block';
    }

    return {
      isValid: trustScore >= 20,
      trustScore: Math.max(0, Math.min(100, trustScore)),
      anomalies,
      recommendation,
    };
  }

  /**
   * Mark device as verified by MFA
   */
  markDeviceVerified(fingerprintId: string, userId: string): void {
    const fingerprint = this.deviceFingerprints.get(fingerprintId);
    if (fingerprint) {
      fingerprint.isVerified = true;
      fingerprint.trustScore = 85; // Boost trust after MFA verification
      logger.info(`Device verified for user ${userId}`, {
        fingerprint: fingerprintId,
      });
    }
  }

  /**
   * Get user's trusted devices
   */
  getUserDevices(userId: string): DeviceFingerprint[] {
    const deviceIds = this.userDevices.get(userId);
    if (!deviceIds) return [];

    const devices: DeviceFingerprint[] = [];
    for (const id of deviceIds) {
      const device = this.deviceFingerprints.get(id);
      if (device) devices.push(device);
    }

    return devices.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Forget device (remotely logout)
   */
  forgetDevice(fingerprintId: string, userId: string): boolean {
    const device = this.deviceFingerprints.get(fingerprintId);
    if (!device || device.userId !== userId) {
      return false;
    }

    this.deviceFingerprints.delete(fingerprintId);
    const userDevices = this.userDevices.get(userId);
    if (userDevices) {
      userDevices.delete(fingerprintId);
    }

    logger.info(`Device forgotten for user ${userId}`, {
      fingerprint: fingerprintId,
    });
    return true;
  }

  /**
   * Forget all devices except current
   */
  forgetAllOtherDevices(currentFingerprintId: string, userId: string): number {
    const userDevices = this.userDevices.get(userId);
    if (!userDevices) return 0;

    let count = 0;
    for (const id of userDevices) {
      if (id !== currentFingerprintId) {
        this.deviceFingerprints.delete(id);
        count++;
      }
    }

    this.userDevices.set(userId, new Set([currentFingerprintId]));
    logger.info(`Forgotten all devices except current for user ${userId}`, {
      count,
    });
    return count;
  }

  /**
   * Cleanup: Enforce device limit and prune old devices
   */
  private pruneUserDevices(userId: string): void {
    const userDevices = this.userDevices.get(userId);
    if (!userDevices || userDevices.size <= this.MAX_DEVICES_PER_USER) {
      return;
    }

    // Sort by last access, keep most recent
    const devicesList = Array.from(userDevices)
      .map((id) => ({ id, device: this.deviceFingerprints.get(id)! }))
      .sort((a, b) => b.device.lastSeen - a.device.lastSeen);

    // Remove oldest devices beyond limit
    for (let i = this.MAX_DEVICES_PER_USER; i < devicesList.length; i++) {
      this.deviceFingerprints.delete(devicesList[i].id);
      userDevices.delete(devicesList[i].id);
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Extract signals from request
   */
  private extractSignals(
    req: Request,
    clientData?: Record<string, string>,
  ): DeviceFingerprint['metadata'] {
    const userAgent = req.get('user-agent') || '';
    const acceptLanguage = req.get('accept-language') || '';
    const acceptEncoding = req.get('accept-encoding') || '';

    return {
      userAgent,
      acceptLanguage,
      acceptEncoding,
      platform: clientData?.platform,
      screenResolution: clientData?.screenResolution,
      timezone: clientData?.timezone,
      webglRenderer: clientData?.webglRenderer,
      canvasFingerprint: clientData?.canvasFingerprint,
      audioContext: clientData?.audioContext,
      hardwareInfo: clientData?.hardwareInfo,
    };
  }

  /**
   * Create deterministic hash from signals
   */
  private hashSignals(signals: DeviceFingerprint['metadata']): string {
    const signalString = JSON.stringify(signals);
    return crypto.createHash('sha256').update(signalString).digest('hex');
  }

  /**
   * Calculate signal similarity (0-1, where 1 is identical)
   */
  private compareSignals(
    oldSignals: DeviceFingerprint['metadata'],
    newSignals: DeviceFingerprint['metadata'],
  ): number {
    let differences = 0;
    const keys = new Set([...Object.keys(oldSignals), ...Object.keys(newSignals)]);

    for (const key of keys) {
      if (
        oldSignals[key as keyof typeof oldSignals] !== newSignals[key as keyof typeof newSignals]
      ) {
        differences++;
      }
    }

    return differences / Math.max(1, keys.size);
  }

  /**
   * Detect suspicious patterns in signals
   */
  private detectSuspiciousPatterns(signals: DeviceFingerprint['metadata']): string[] {
    const suspicious: string[] = [];

    // Headless browser detection
    if (signals.userAgent?.includes('HeadlessChrome') || signals.userAgent?.includes('PhantomJS')) {
      suspicious.push('HEADLESS_BROWSER');
    }

    // Bot user agents
    const botPatterns = ['bot', 'crawler', 'spider', 'scraper'];
    if (botPatterns.some((p) => signals.userAgent?.toLowerCase().includes(p))) {
      suspicious.push('BOT_DETECTED');
    }

    // Missing WebGL (possible VM/headless)
    if (!signals.webglRenderer) {
      suspicious.push('MISSING_WEBGL');
    }

    // Unusual screen resolution
    if (signals.screenResolution) {
      const [width, height] = signals.screenResolution.split('x').map(Number);
      const aspect = width / height;
      if (aspect < 0.5 || aspect > 5) {
        suspicious.push('UNUSUAL_RESOLUTION');
      }
    }

    return suspicious;
  }
}

export const requestFingerprintService = new RequestFingerprintService();
