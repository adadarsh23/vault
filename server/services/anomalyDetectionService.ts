import NodeCache from 'node-cache';
import mongoose from 'mongoose';
import { logger } from '../utils/logger.ts';
import { createNotification } from './notificationService.ts';

/**
 * AnomalyDetectionService - Security Intelligence & Threat Detection
 *
 * Monitors for suspicious patterns (brute-forcing, scraping, credential sharing)
 * and triggers high-severity security alerts when thresholds are breached.
 */
class AnomalyDetectionService {
  // Store usage patterns in memory with sliding expiration
  private tracker = new NodeCache({ stdTTL: 3600, checkperiod: 300 });

  private THRESHOLDS = {
    KEY_REQUESTS_MIN: 50, // Max key requests per minute
    AUTH_FAILURES_10M: 10, // Max failed auth attempts in 10 minutes
    UNIQUE_IPS_1H: 3, // Max unique IPs per user in 1 hour
    OTP_ATTEMPTS_LIMIT: 5, // Max OTP attempts
  };

  /**
   * Track and evaluate media segment/key requests
   */
  trackMediaRequest(userId: string, itemId: string, ip: string): void {
    const key = `usage:media:${userId}:${itemId}`;
    const count = (this.tracker.get<number>(key) || 0) + 1;
    this.tracker.set(key, count, 60); // 1 minute TTL

    if (count > this.THRESHOLDS.KEY_REQUESTS_MIN) {
      this.triggerAlert(
        'RATE_ANOMALY',
        `Excessive media key requests detected for user ${userId}`,
        {
          userId,
          itemId,
          ip,
          count,
          threshold: this.THRESHOLDS.KEY_REQUESTS_MIN,
        },
      );
    }
  }

  /**
   * Track failed authentication attempts (JWT/Login)
   */
  trackAuthFailure(ip: string, username?: string): void {
    const key = `auth:fail:${ip}`;
    const count = (this.tracker.get<number>(key) || 0) + 1;
    this.tracker.set(key, count, 600); // 10 minutes TTL

    if (count > this.THRESHOLDS.AUTH_FAILURES_10M) {
      this.triggerAlert('BRUTE_FORCE_ATTEMPT', `Brute-force pattern detected from IP ${ip}`, {
        ip,
        username,
        count,
        threshold: this.THRESHOLDS.AUTH_FAILURES_10M,
      });
    }
  }

  /**
   * Track IP drift for a single user session
   */
  trackIpDrift(userId: string, currentIp: string): void {
    const key = `user:ips:${userId}`;
    const ipSet = new Set(this.tracker.get<string[]>(key) || []);

    if (!ipSet.has(currentIp)) {
      ipSet.add(currentIp);
      this.tracker.set(key, Array.from(ipSet), 3600); // 1 hour TTL

      const count = ipSet.size;
      if (count >= this.THRESHOLDS.UNIQUE_IPS_1H) {
        this.triggerAlert(
          'IP_DRIFT_ANOMALY',
          `Multiple source IPs (${count}) detected for user ${userId} within 1 hour`,
          {
            userId,
            ips: Array.from(ipSet),
            count,
            threshold: this.THRESHOLDS.UNIQUE_IPS_1H,
          },
        );
      }
    }
  }

  /**
   * Track OTP attempts
   */
  trackOTPAttempt(userId: string): void {
    const key = `auth:otp:${userId}`;
    const count = (this.tracker.get<number>(key) || 0) + 1;
    this.tracker.set(key, count, 300); // 5 minutes TTL

    if (count > this.THRESHOLDS.OTP_ATTEMPTS_LIMIT) {
      this.triggerAlert('OTP_BRUTE_FORCE', `Excessive OTP attempts detected for user ${userId}`, {
        userId,
        count,
        threshold: this.THRESHOLDS.OTP_ATTEMPTS_LIMIT,
      });
      throw new Error('Too many failed attempts. Please try again in 5 minutes.');
    }
  }

  /**
   * Clear OTP attempts on success
   */
  clearOTPAttempts(userId: string): void {
    this.tracker.del(`auth:otp:${userId}`);
  }

  /**
   * Centralized alert triggering
   */
  private triggerAlert(type: string, message: string, metadata: any): void {
    logger.error(`[SECURITY_ALERT] ${type}: ${message}`, {
      alertType: type,
      timestamp: new Date().toISOString(),
      ...metadata,
      severity: 'CRITICAL',
    });

    // In a real production system, this would trigger an email, Slack, or PagerDuty alert
    // For now, we ensure it's logged with CRITICAL severity for log aggregation
    void (async () => {
      try {
        let targetUserId = metadata?.userId;
        if (!targetUserId && metadata?.username) {
          const User = mongoose.model('User');
          const user = (await User.findOne({ username: metadata.username.toLowerCase() })
            .select('_id')
            .lean()
            .exec()) as any;
          if (user) {
            targetUserId = user._id.toString();
          }
        }

        if (targetUserId) {
          await createNotification(
            targetUserId,
            'security_alert',
            `Security Threat: ${type}`,
            message,
            metadata,
          );
        }
      } catch (err) {
        logger.warn('Failed to trigger in-app notification for security alert', { error: err });
      }
    })();
  }
}

export const anomalyDetectionService = new AnomalyDetectionService();
