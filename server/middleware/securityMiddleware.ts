/**
 * Integrated Security Middleware
 *
 * Chains security services:
 * - Fingerprinting
 * - Anomaly detection
 * - Adaptive rate limiting
 * - Threat detection
 * - Automated response
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { aiAnomalyDetectionService } from '../services/aiAnomalyDetectionService.ts';
import { requestFingerprintService } from '../services/requestFingerprintService.ts';
import { threatResponseService } from '../services/threatResponseService.ts';
import { AuthenticatedUser } from '../utils/requestTypes.ts';

interface SecurityContext {
  requestId: string;
  fingerprint: string;
  userId?: string;
  riskScore: number;
  anomalies: string[];
  recommendedAction: 'allow' | 'challenge' | 'block';
}

export interface RequestWithSecurity extends Request {
  security?: SecurityContext;
  user?: AuthenticatedUser;
  files?: any;
  file?: any;
  requestId?: string;
}

const getOrCreateRequestId = (req: RequestWithSecurity): string => {
  if (typeof req.requestId === 'string' && req.requestId.trim()) {
    return req.requestId.trim();
  }
  const headerId = req.get('x-request-id');
  if (headerId && typeof headerId === 'string' && headerId.trim()) {
    return headerId.trim();
  }
  return `req_${randomUUID()}`;
};

const resolveBlacklistedIps = (): Set<string> => {
  const envList = process.env.IP_BLACKLIST?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(envList || []);
};

/**
 * Main security middleware that orchestrates security and anomaly checks
 */
export const securityMiddleware = async (
  req: RequestWithSecurity,
  res: Response,
  next: NextFunction,
) => {
  try {
    const requestId = getOrCreateRequestId(req);
    req.requestId = requestId;

    const ip = getClientIp(req);
    const clientData = extractClientData(req);

    // Step 1: Generate/validate device fingerprint
    const fingerprintId = req.get('x-fingerprint-id');
    const fingerprintResult = fingerprintId
      ? await requestFingerprintService.validateFingerprint(
          req,
          req.user?.userId,
          clientData,
          fingerprintId,
        )
      : {
          isValid: false,
          trustScore: 50,
          anomalies: ['NEW_DEVICE'],
          recommendation: 'allow' as const,
        };

    // Step 2: Perform anomaly detection if authenticated
    const anomalies: string[] = [...fingerprintResult.anomalies];
    let riskScore = Math.max(0, 100 - fingerprintResult.trustScore);

    if (req.user?.userId) {
      // Check if IP is blacklisted
      const isBlacklisted = checkIpBlacklist(ip);
      if (isBlacklisted) {
        anomalies.push('IP_BLACKLISTED');
        riskScore += 100;
      }

      // Analyze login behavior
      const loginAnomaly = await aiAnomalyDetectionService.analyzeLoginAttempt(
        req.user.userId,
        ip,
        null, // Location can be supplemented by GeoIP lookup
        fingerprintId || 'unknown',
        req.get('user-agent') || '',
      );

      riskScore += loginAnomaly.loginRisk;
      anomalies.push(...loginAnomaly.factors);

      // Analyze non-GET or API operations
      if (req.method !== 'GET' || req.path.includes('/api')) {
        const apiAnalysis = await aiAnomalyDetectionService.analyzeApiUsage(
          req.user.userId,
          `${req.method} ${req.path}`,
          0,
        );

        if (apiAnalysis.isAnomalous) {
          riskScore += apiAnalysis.riskScore;
          anomalies.push('API_ANOMALY');
        }
      }
    }

    // Store security context on request
    req.security = {
      requestId,
      fingerprint: fingerprintId || 'new',
      userId: req.user?.userId,
      riskScore,
      anomalies,
      recommendedAction: riskScore > 70 ? 'block' : riskScore > 40 ? 'challenge' : 'allow',
    };

    // Log security event for auditing and debugging
    logger.debug(`[SECURITY] Request processed`, {
      requestId,
      method: req.method,
      path: req.path,
      ip,
      userId: req.user?.userId,
      riskScore,
      anomalies,
      action: req.security.recommendedAction,
    });

    // Handle high-risk requests
    if (req.security.recommendedAction === 'block') {
      if (req.user?.userId) {
        await threatResponseService.processThreat({
          userId: req.user.userId,
          ip,
          riskScore,
          type: 'suspicious_login',
          details: { anomalies },
        });
      }

      res.status(403).json({
        success: false,
        message: 'Your account has triggered security measures. Please contact support.',
        error: {
          code: 'ACCESS_DENIED',
          requestId,
        },
      });
      return;
    }

    if (req.security.recommendedAction === 'challenge') {
      res.set('X-Security-Challenge', 'true');
    }

    // Include security tracking headers in response
    res.set('X-Request-ID', requestId);
    res.set('X-Risk-Score', riskScore.toString());

    next();
  } catch (error) {
    logger.error('[SECURITY] Error in security middleware', error);
    // Fail open but preserve request continuation
    next();
  }
};

/**
 * Verify file upload security
 * Inspects both req.file (single) and req.files (multiple/fields)
 */
export const fileUploadSecurityMiddleware = async (
  req: RequestWithSecurity,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawFiles = req.files || (req.file ? [req.file] : null);
    if (!rawFiles) {
      return next();
    }

    const files: any[] = req.file
      ? [req.file]
      : Array.isArray(rawFiles)
        ? rawFiles
        : typeof rawFiles === 'object' && rawFiles !== null
          ? Object.values(rawFiles).flat()
          : [];

    if (files.length === 0) {
      return next();
    }

    const dangerousExtensions = [
      '.exe',
      '.dll',
      '.zip',
      '.rar',
      '.7z',
      '.sh',
      '.bat',
      '.cmd',
      '.scr',
      '.vbs',
      '.js',
      '.jar',
      '.app',
    ];

    const ip = getClientIp(req);
    const requestId = getOrCreateRequestId(req);

    for (const file of files) {
      const fileName: string = file.name || file.originalname || '';
      const ext = fileName.includes('.')
        ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
        : '';

      if (dangerousExtensions.includes(ext)) {
        if (req.user?.userId) {
          await threatResponseService.handleMaliciousUpload(
            req.user.userId,
            ip,
            fileName,
            'Dangerous file extension',
          );
        }

        res.status(400).json({
          success: false,
          message: `File type ${ext} is not allowed`,
          error: {
            code: 'FILE_UPLOAD_REJECTED',
            requestId,
          },
        });
        return;
      }

      // Check file size (500 MB maximum)
      const maxSize = 500 * 1024 * 1024;
      const fileSize = typeof file.size === 'number' ? file.size : 0;
      if (fileSize > maxSize) {
        res.status(400).json({
          success: false,
          message: 'Maximum file size is 500 MB',
          error: {
            code: 'FILE_TOO_LARGE',
            requestId,
          },
        });
        return;
      }

      // Scan buffer for malware patterns and test signatures if buffer is loaded
      const buffer = file.data || file.buffer;
      if (Buffer.isBuffer(buffer)) {
        const ascii = buffer.toString('latin1');
        const isEicar = ascii.includes(
          'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        );
        if (isEicar) {
          if (req.user?.userId) {
            await threatResponseService.handleMaliciousUpload(
              req.user.userId,
              ip,
              fileName,
              'Malware signature detected (EICAR)',
            );
          }
          res.status(400).json({
            success: false,
            message: 'Malware signature detected in uploaded file.',
            error: {
              code: 'MALWARE_DETECTED',
              requestId,
            },
          });
          return;
        }
      }
    }

    next();
  } catch (error) {
    logger.error('[SECURITY] Error in file upload security', error);
    next();
  }
};

/**
 * Track request performance and detect slow/expensive endpoints
 * Uses event listener on response finish rather than monkey-patching res.send
 */
export const performanceSecurityMiddleware = (
  req: RequestWithSecurity,
  res: Response,
  next: NextFunction,
) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 5000) {
      logger.warn(`[PERFORMANCE] Slow request detected`, {
        path: req.path,
        method: req.method,
        duration,
        statusCode: res.statusCode,
        userId: req.user?.userId,
      });
    }
  });

  next();
};

/**
 * Extract client telemetry data from request headers
 */
function extractClientData(req: Request): Record<string, string> {
  return {
    screenResolution: req.get('x-screen-resolution') || '',
    timezone: req.get('x-timezone') || '',
    platform: req.get('x-platform') || '',
    webglRenderer: req.get('x-webgl-renderer') || '',
    canvasFingerprint: req.get('x-canvas-fingerprint') || '',
    audioContext: req.get('x-audio-context') || '',
  };
}

/**
 * Check if IP is blacklisted via environment or configured list
 */
function checkIpBlacklist(ip: string): boolean {
  const blacklist = resolveBlacklistedIps();
  return blacklist.has(ip);
}

/**
 * Log security event to audit trail on response finish
 */
export const auditLogMiddleware = (req: RequestWithSecurity, res: Response, next: NextFunction) => {
  const sensitivePaths = ['/auth/login', '/auth/register', '/api/vault/delete', '/api/users/me'];

  if (sensitivePaths.some((p) => req.path?.includes(p))) {
    res.on('finish', () => {
      logger.info(`[AUDIT] Sensitive operation`, {
        requestId: req.requestId || req.security?.requestId,
        method: req.method,
        path: req.path,
        userId: req.user?.userId,
        ip: getClientIp(req),
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
      });
    });
  }

  next();
};
