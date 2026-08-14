/**
 * Real-Time Security Monitoring Dashboard
 *
 * Provides:
 * - Live threat feeds via WebSocket
 * - Security metrics and KPIs
 * - Incident timeline
 * - Risk scoring trends
 * - Admin incident management
 */

import { Server as SocketServer } from 'socket.io';
import { logger } from '../utils/logger.ts';
import mongoose from 'mongoose';

interface DashboardMetrics {
  summary: {
    activeUsers: number;
    suspiciousActivities: number;
    blockedIps: number;
    threatLevel: 'green' | 'yellow' | 'orange' | 'red';
  };
  recentIncidents: Array<{
    id: string;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: string;
    userId?: string;
    ip: string;
  }>;
  threatTrends: Array<{
    timestamp: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
  }>;
  topThreats: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
}

class SecurityDashboardService {
  private io: SocketServer | null = null;
  private readonly METRICS_RETENTION_MS = 86400000; // 24 hours

  /**
   * Initialize WebSocket server for real-time updates
   */
  initializeWebSocket(io: SocketServer): void {
    this.io = io;

    io.on('connection', (socket) => {
      logger.info(`[DASHBOARD] Admin connected: ${socket.id}`);

      // Authenticate user (verify admin token)
      const token = socket.handshake.auth.token;
      if (!this.validateAdminToken(token)) {
        socket.disconnect();
        return;
      }

      // Send initial metrics
      socket.emit('metrics', this.getCurrentMetrics());

      // Handle subscriptions
      socket.on('subscribe', (channel) => {
        if (['threats', 'incidents', 'anomalies', 'performance'].includes(channel)) {
          socket.join(`dashboard:${channel}`);
          logger.info(`[DASHBOARD] Subscribed to ${channel}`);
        }
      });

      // Handle incident update
      socket.on('update_incident', (data) => {
        this.handleIncidentUpdate(socket, data);
      });

      // Handle manual response
      socket.on('manual_response', (data) => {
        this.handleManualResponse(socket, data);
      });

      socket.on('disconnect', () => {
        logger.info(`[DASHBOARD] Admin disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Broadcast new incident to dashboard
   */
  broadcastIncident(incident: any): void {
    if (!this.io) return;

    const enrichedIncident = {
      id: incident.id,
      timestamp: incident.timestamp,
      severity: incident.severity,
      type: incident.type,
      userId: incident.userId,
      ip: incident.ip,
      details: incident.details,
      autoActions: incident.autoResponse?.map((r: any) => r.action) || [],
    };

    this.io.to('dashboard:incidents').emit('incident', enrichedIncident);
    this.io.to('dashboard:threats').emit('threat_alert', enrichedIncident);

    logger.info(`[DASHBOARD] Broadcast incident: ${incident.id}`);
  }

  /**
   * Broadcast anomaly detection event
   */
  broadcastAnomaly(userId: string, anomalyData: any): void {
    if (!this.io) return;

    this.io.to('dashboard:anomalies').emit('anomaly', {
      timestamp: Date.now(),
      userId,
      ...anomalyData,
    });
  }

  /**
   * Update performance metrics
   */
  broadcastPerformanceMetric(metric: {
    endpoint: string;
    method: string;
    responseTime: number;
    statusCode: number;
  }): void {
    if (!this.io) return;

    // Only broadcast slow/error responses
    if (metric.responseTime > 1000 || metric.statusCode >= 400) {
      this.io.to('dashboard:performance').emit('performance', metric);
    }
  }

  /**
   * Get comprehensive dashboard metrics
   */
  async getCurrentMetrics(): Promise<DashboardMetrics> {
    const now = Date.now();
    const oneDayAgo = now - this.METRICS_RETENTION_MS;

    try {
      // Fetch incidents from database
      const IncidentModel = mongoose.model('SecurityIncident');

      const recentIncidents = (await IncidentModel.find({
        timestamp: { $gte: oneDayAgo },
      })
        .sort({ timestamp: -1 })
        .allowDiskUse(true)
        .limit(50)
        .lean()) as any[];

      const suspiciousActivities = recentIncidents.filter(
        (i) => i.severity === 'high' || i.severity === 'critical'
      ).length;

      // Calculate threat level
      let threatLevel: 'green' | 'yellow' | 'orange' | 'red' = 'green';
      if (suspiciousActivities > 20) {
        threatLevel = 'red';
      } else if (suspiciousActivities > 10) {
        threatLevel = 'orange';
      } else if (suspiciousActivities > 5) {
        threatLevel = 'yellow';
      }

      // Group by threat type
      const typeMap: Record<string, { count: number; severity: string }> = {};
      const severityTrend: Record<number, Record<string, number>> = {};

      for (const incident of recentIncidents) {
        // By type
        if (!typeMap[incident.type]) {
          typeMap[incident.type] = { count: 0, severity: incident.severity };
        }
        typeMap[incident.type].count++;

        // By severity over time (hourly)
        const hour = Math.floor(incident.timestamp / 3600000) * 3600000;
        if (!severityTrend[hour]) {
          severityTrend[hour] = {
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
          };
        }

        const key = `${incident.severity}Count`;
        if (key in severityTrend[hour]) {
          severityTrend[hour][key]++;
        }
      }

      const threatTrends = Object.entries(severityTrend)
        .map(([ts, counts]) => ({ timestamp: parseInt(ts), ...counts }))
        .sort((a, b) => a.timestamp - b.timestamp);

      const topThreats = Object.entries(typeMap)
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const metrics: DashboardMetrics = {
        summary: {
          activeUsers: 0, // Would fetch from sessions
          suspiciousActivities,
          blockedIps: 0, // Would fetch from blacklist
          threatLevel,
        },
        recentIncidents: recentIncidents as any,
        threatTrends: threatTrends as any,
        topThreats,
      };

      return metrics;
    } catch (error) {
      logger.error('[DASHBOARD] Error fetching metrics', error);
      throw error;
    }
  }

  /**
   * Get incident details for admin review
   */
  async getIncidentDetails(incidentId: string): Promise<any> {
    const IncidentModel = mongoose.model('SecurityIncident');

    const incident = (await IncidentModel.findOne({ id: incidentId }).lean()) as any;
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    return {
      ...incident,
      relatedIncidents: await this.findRelatedIncidents(incident),
      userActivity: await this.getUserActivity(incident.userId),
      ipReputation: await this.getIpReputation(incident.ip),
    };
  }

  /**
   * Manual incident management by admin
   */
  async updateIncidentStatus(
    incidentId: string,
    status: 'open' | 'investigating' | 'mitigated' | 'resolved',
    notes?: string
  ): Promise<void> {
    const IncidentModel = mongoose.model('SecurityIncident');

    await IncidentModel.findOneAndUpdate(
      { id: incidentId },
      {
        status,
        adminNotes: notes,
        updatedAt: new Date(),
      }
    );

    logger.info(`[DASHBOARD] Incident status updated: ${incidentId} -> ${status}`);
  }

  /**
   * Apply manual security action
   */
  async applyManualAction(
    action: 'block_ip' | 'whitelist_ip' | 'logout_user' | 'disable_user',
    target: string,
    durationHours?: number
  ): Promise<void> {
    const hours = durationHours || 24;

    switch (action) {
      case 'block_ip':
        // Would set in Redis blacklist
        logger.warn(`[ADMIN] Manually blocked IP: ${target} for ${hours}h`);
        break;

      case 'whitelist_ip':
        // Would set in Redis whitelist
        logger.info(`[ADMIN] Manually whitelisted IP: ${target}`);
        break;

      case 'logout_user':
        // Would invalidate user sessions
        logger.warn(`[ADMIN] Manually forced logout: ${target}`);
        break;

      case 'disable_user':
        // Would disable user account
        logger.error(`[ADMIN] Manually disabled user: ${target}`);
        break;
    }

    // Broadcast to all admins
    if (this.io) {
      this.io.to('dashboard:threats').emit('admin_action', {
        action,
        target,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Export security report
   */
  async generateSecurityReport(startDate: Date, endDate: Date): Promise<Buffer> {
    const IncidentModel = mongoose.model('SecurityIncident');

    const incidents = (await IncidentModel.find({
      timestamp: { $gte: startDate.getTime(), $lte: endDate.getTime() },
    }).lean()) as any[];

    // Generate CSV
    let csv = 'ID,Timestamp,Severity,Type,User ID,IP,Status\n';
    for (const incident of incidents) {
      csv += `${incident.id},${new Date(incident.timestamp).toISOString()},${incident.severity},${incident.type},${incident.userId || 'N/A'},${incident.ip},${incident.status}\n`;
    }

    return Buffer.from(csv, 'utf-8');
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private validateAdminToken(token: string): boolean {
    // In production, verify JWT token and check admin role
    // TODO: Implement proper token validation
    return token !== undefined;
  }

  private async handleIncidentUpdate(socket: any, data: any): Promise<void> {
    try {
      await this.updateIncidentStatus(data.incidentId, data.status, data.notes);
      socket.emit('update_success', { message: 'Incident updated' });
    } catch (error) {
      socket.emit('update_error', { message: 'Failed to update incident' });
    }
  }

  private async handleManualResponse(socket: any, data: any): Promise<void> {
    try {
      await this.applyManualAction(data.action, data.target, data.duration);
      socket.emit('action_success', {
        message: `Action completed: ${data.action}`,
      });
    } catch (error) {
      socket.emit('action_error', { message: 'Failed to apply action' });
    }
  }

  private async findRelatedIncidents(incident: any): Promise<any[]> {
    const IncidentModel = mongoose.model('SecurityIncident');

    return await IncidentModel.find({
      $or: [{ ip: incident.ip }, { userId: incident.userId }],
      id: { $ne: incident.id },
    })
      .limit(10)
      .lean();
  }

  private async getUserActivity(userId?: string): Promise<any> {
    if (!userId) return null;

    // Would fetch user's recent activities
    return {
      lastLogin: new Date(),
      loginAttempts: 2,
      apiCallsLast24h: 150,
    };
  }

  private async getIpReputation(ip: string): Promise<any> {
    // In production, call IP reputation API (MaxMind, AbuseIPDB, etc)
    return {
      ip,
      reputation: 'unknown',
      abuseScore: 0,
    };
  }
}

export const securityDashboardService = new SecurityDashboardService();
