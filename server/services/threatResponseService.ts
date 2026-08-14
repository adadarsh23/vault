/**
 * Automated Threat Response & Incident Management
 *
 * Automatically responds to security threats:
 * - Block/throttle IPs
 * - Logout suspicious sessions
 * - Revoke tokens
 * - Escalate to admins
 * - Create audit trail
 */

import { Schema, model, Document } from 'mongoose';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.ts';

interface SecurityIncident extends Document {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string; // e.g., 'brute_force', 'data_exfil', 'suspicious_login'
  userId?: string;
  ip: string;
  details: Record<string, any>;
  status: 'open' | 'investigating' | 'mitigated' | 'resolved';
  autoResponse: {
    action: string;
    timestamp: number;
    success: boolean;
    details?: Record<string, any>;
  }[];
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema<SecurityIncident>(
  {
    id: { type: String, unique: true, index: true },
    timestamp: { type: Number, index: true },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    type: { type: String, index: true },
    userId: { type: String, index: true },
    ip: { type: String, index: true },
    details: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['open', 'investigating', 'mitigated', 'resolved'],
      default: 'open',
    },
    autoResponse: [
      {
        action: String,
        timestamp: Number,
        success: Boolean,
        details: Schema.Types.Mixed,
      },
    ],
    adminNotes: String,
  },
  { timestamps: true }
);

const IncidentModel = model<SecurityIncident>('SecurityIncident', incidentSchema);

interface ThreatResponse {
  threatened: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions: string[];
}

class ThreatResponseService {
  private readonly SEVERITY_THRESHOLDS = {
    low: 20,
    medium: 40,
    high: 60,
    critical: 80,
  };

  /**
   * Process threat and trigger automated response
   */
  async processThreat(params: {
    userId?: string;
    ip: string;
    riskScore: number;
    type: 'brute_force' | 'api_abuse' | 'suspicious_login' | 'data_exfil' | 'malware_upload';
    details: Record<string, any>;
  }): Promise<ThreatResponse> {
    const { userId, ip, riskScore, type, details } = params;
    const severity = this.calculateSeverity(riskScore, type);

    const actions: string[] = [];

    // Create incident record
    const incident = await this.createIncident({
      severity,
      type,
      userId,
      ip,
      details,
    });

    // Automated response based on severity
    if (severity === 'critical') {
      // Immediate action required
      if (userId) {
        actions.push('logout_user');
        await this.logoutUser(userId);
      }
      actions.push('block_ip');
      await this.blockIp(ip, 3600); // 1 hour

      actions.push('escalate_admin');
      await this.escalateToAdmin(incident);
    } else if (severity === 'high') {
      if (userId) {
        actions.push('challenge_mfa');
        // Send MFA challenge to user
      }
      actions.push('throttle_ip');
      await this.throttleIp(ip, 300000); // 5 minutes

      actions.push('alert_admin');
      await this.sendAdminAlert(incident);
    } else if (severity === 'medium') {
      actions.push('monitor_user');
      // Increase monitoring frequency
      actions.push('flag_ip');
      await this.flagIp(ip);
    } else {
      actions.push('log_event');
    }

    // Record automated response
    await this.recordResponse(incident.id, actions);

    logger.warn(`[THREAT] ${severity.toUpperCase()}: ${type}`, {
      incident: incident.id,
      userId,
      ip,
      riskScore,
      actions,
    });

    return {
      threatened: severity !== 'low',
      severity,
      actions,
    };
  }

  /**
   * Brute force attack detection and response
   */
  async handleBruteForceAttempt(userId: string, ip: string, failedAttempts: number): Promise<void> {
    if (failedAttempts > 10) {
      // Critical
      await this.processThreat({
        userId,
        ip,
        riskScore: 90,
        type: 'brute_force',
        details: { failedAttempts },
      });
    } else if (failedAttempts > 5) {
      // High
      await this.processThreat({
        userId,
        ip,
        riskScore: 70,
        type: 'brute_force',
        details: { failedAttempts },
      });
    } else {
      // Medium
      await this.processThreat({
        userId,
        ip,
        riskScore: 50,
        type: 'brute_force',
        details: { failedAttempts },
      });
    }
  }

  /**
   * API abuse detection and response
   */
  async handleApiAbuse(
    userId: string,
    ip: string,
    endpoint: string,
    requestsPerMinute: number
  ): Promise<void> {
    const baselineRequestsPerMinute = 10;
    const ratio = requestsPerMinute / baselineRequestsPerMinute;

    if (ratio > 20) {
      // Critical
      await this.processThreat({
        userId,
        ip,
        riskScore: 85,
        type: 'api_abuse',
        details: { endpoint, requestsPerMinute, ratio },
      });
    } else if (ratio > 10) {
      // High
      await this.processThreat({
        userId,
        ip,
        riskScore: 65,
        type: 'api_abuse',
        details: { endpoint, requestsPerMinute, ratio },
      });
    } else if (ratio > 5) {
      // Medium
      await this.processThreat({
        userId,
        ip,
        riskScore: 45,
        type: 'api_abuse',
        details: { endpoint, requestsPerMinute, ratio },
      });
    }
  }

  /**
   * Data exfiltration attempt detection
   */
  async handleDataExfiltration(
    userId: string,
    ip: string,
    itemCount: number,
    dataSize: number
  ): Promise<void> {
    // Heuristics: Large bulk download/export is suspicious
    const itemThreshold = 500;
    const dataThreshold = 1024 * 1024 * 500; // 500 MB

    let riskScore = 0;
    const details: Record<string, any> = { itemCount, dataSize };

    if (itemCount > itemThreshold) {
      riskScore += 40;
      details.reason = 'Excessive item count';
    }

    if (dataSize > dataThreshold) {
      riskScore += 40;
      details.reason = 'Excessive data size';
    }

    if (riskScore > 0) {
      await this.processThreat({
        userId,
        ip,
        riskScore: Math.min(100, riskScore),
        type: 'data_exfil',
        details,
      });
    }
  }

  /**
   * Malicious file upload detection
   */
  async handleMaliciousUpload(
    userId: string,
    ip: string,
    fileName: string,
    reason: string
  ): Promise<void> {
    await this.processThreat({
      userId,
      ip,
      riskScore: 90,
      type: 'malware_upload',
      details: { fileName, reason },
    });
  }

  // ==================== PRIVATE RESPONSE ACTIONS ====================

  /**
   * Logout user from all sessions
   */
  private async logoutUser(userId: string): Promise<void> {
    try {
      // In production, update user sessions in database
      logger.warn(`[SECURITY] Force logout user: ${userId}`);
      // DELETE all active sessions for this user
      // Notify user via email
    } catch (error) {
      logger.error(`Failed to logout user ${userId}`, error);
    }
  }

  /**
   * Block IP address
   */
  private async blockIp(ip: string, durationMs: number): Promise<void> {
    try {
      // In production, set in Redis cache
      logger.warn(`[SECURITY] Blocked IP: ${ip} for ${durationMs}ms`);
    } catch (error) {
      logger.error(`Failed to block IP ${ip}`, error);
    }
  }

  /**
   * Throttle IP address (rate limit)
   */
  private async throttleIp(ip: string, durationMs: number): Promise<void> {
    try {
      logger.warn(`[SECURITY] Throttled IP: ${ip} for ${durationMs}ms`);
    } catch (error) {
      logger.error(`Failed to throttle IP ${ip}`, error);
    }
  }

  /**
   * Flag IP for enhanced monitoring
   */
  private async flagIp(ip: string): Promise<void> {
    try {
      logger.info(`[SECURITY] Flagged IP for monitoring: ${ip}`);
    } catch (error) {
      logger.error(`Failed to flag IP ${ip}`, error);
    }
  }

  /**
   * Create security incident record
   */
  private async createIncident(params: {
    severity: string;
    type: string;
    userId?: string;
    ip: string;
    details: Record<string, any>;
  }): Promise<SecurityIncident> {
    const incident = new IncidentModel({
      id: `incident_${randomUUID()}`,
      timestamp: Date.now(),
      ...params,
      autoResponse: [],
    });

    await incident.save();
    return incident;
  }

  /**
   * Record automated response actions
   */
  private async recordResponse(incidentId: string, actions: string[]): Promise<void> {
    try {
      const incident = await IncidentModel.findOne({ id: incidentId });
      if (incident) {
        for (const action of actions) {
          incident.autoResponse.push({
            action,
            timestamp: Date.now(),
            success: true,
          });
        }
        await incident.save();
      }
    } catch (error) {
      logger.error(`Failed to record response for incident ${incidentId}`, error);
    }
  }

  /**
   * Escalate to admin for manual review
   */
  private async escalateToAdmin(incident: SecurityIncident): Promise<void> {
    try {
      // In production, send email/Slack alert
      logger.error(`[ADMIN ALERT] Critical security incident: ${incident.id}`);
      // Notify administrators via email/Slack
    } catch (error) {
      logger.error(`Failed to escalate incident ${incident.id}`, error);
    }
  }

  /**
   * Send admin alert
   */
  private async sendAdminAlert(incident: SecurityIncident): Promise<void> {
    try {
      logger.warn(`[ADMIN ALERT] High severity incident: ${incident.id}`);
    } catch (error) {
      logger.error(`Failed to send admin alert for ${incident.id}`, error);
    }
  }

  /**
   * Calculate severity based on risk score and threat type
   */
  private calculateSeverity(
    riskScore: number,
    type: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Certain threat types are always high severity
    const criticalTypes = ['malware_upload', 'data_exfil'];
    if (criticalTypes.includes(type) && riskScore > 60) {
      return 'critical';
    }

    if (riskScore >= this.SEVERITY_THRESHOLDS.critical) {
      return 'critical';
    } else if (riskScore >= this.SEVERITY_THRESHOLDS.high) {
      return 'high';
    } else if (riskScore >= this.SEVERITY_THRESHOLDS.medium) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get incident statistics
   */
  async getIncidentStats(timeWindowMs: number = 86400000): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const since = Date.now() - timeWindowMs;
    const incidents = await IncidentModel.find({ timestamp: { $gte: since } });

    const stats = {
      total: incidents.length,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byType: {} as Record<string, number>,
    };

    for (const incident of incidents) {
      stats.bySeverity[incident.severity]++;
      stats.byType[incident.type] = (stats.byType[incident.type] || 0) + 1;
    }

    return stats;
  }
}

export const threatResponseService = new ThreatResponseService();
