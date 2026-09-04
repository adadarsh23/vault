/**
 * Integrated Security Middleware
 *
 * Chains all security services:
 * - Fingerprinting
 * - Anomaly detection
 * - Adaptive rate limiting
 * - Threat detection
 * - Automated response
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.ts';
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

interface RequestWithSecurity extends Request {
  security?: SecurityContext;
  user?: AuthenticatedUser;
  files?: any;
}

/**
 * Main security middleware that orchestrates all security checks
 */
export const securityMiddleware = async (
  req: RequestWithSecurity,
  res: Response,
  next: NextFunction,
) => {
  try {
    const requestId = `req_${randomUUID()}`;
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');

    // Extract client data from headers + body
    const clientData = extractClientData(req);

    // Step 1: Generate/validate device fingerprint
    let fingerprintId = req.get('x-fingerprint-id');
    let fingerprintResult = fingerprintId
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
    let anomalies: string[] = [...fingerprintResult.anomalies];
    let riskScore = Math.max(0, 100 - fingerprintResult.trustScore);

    if (req.user?.userId) {
      // Check if IP is blacklisted
      const isBlacklisted = await checkIpBlacklist(ip);
      if (isBlacklisted) {
        anomalies.push('IP_BLACKLISTED');
        riskScore += 100;
      }

      // Analyze login behavior
      const loginAnomaly = await aiAnomalyDetectionService.analyzeLoginAttempt(
        req.user.userId,
        ip,
        null, // Location would come from GeoIP lookup
        fingerprintId || 'unknown',
        req.get('user-agent') || '',
      );

      riskScore += loginAnomaly.loginRisk;
      anomalies.push(...loginAnomaly.factors);

      // Analyze API usage
      if (req.method !== 'GET' || req.path.includes('/api')) {
        const apiAnalysis = await aiAnomalyDetectionService.analyzeApiUsage(
          req.user.userId,
          `${req.method} ${req.path}`,
          0, // Will be updated on response
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

    // Log security event
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
      // Trigger threat response
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
        error: 'Access Denied',
        message: 'Your account has triggered security measures. Please contact support.',
        requestId,
      });
      return;
    }

    if (req.security.recommendedAction === 'challenge') {
      // Require MFA/additional verification
      res.set('X-Security-Challenge', 'true');
    }

    // Include security headers in response
    res.set('X-Request-ID', requestId);
    res.set('X-Risk-Score', riskScore.toString());

    next();
  } catch (error) {
    logger.error('[SECURITY] Error in security middleware', error);
    // Fail open but log the error
    next();
  }
};

/**
 * Verify file upload security
 */
export const fileUploadSecurityMiddleware = async (
  req: RequestWithSecurity,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawFiles = req.files;
    if (!rawFiles) {
      next();
      return;
    }

    const files: any[] = Array.isArray(rawFiles)
      ? rawFiles
      : typeof rawFiles === 'object'
        ? Object.values(rawFiles).flat()
        : [rawFiles];

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

    for (const file of files) {
      const fileName: string = file.name || file.originalname || '';
      // Check file extension
      const ext = fileName.includes('.')
        ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
        : '';
      if (dangerousExtensions.includes(ext)) {
        const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');

        if (req.user?.userId) {
          await threatResponseService.handleMaliciousUpload(
            req.user.userId,
            ip,
            fileName,
            'Dangerous file extension',
          );
        }

        res.status(400).json({
          error: 'File Upload Rejected',
          message: `File type ${ext} is not allowed`,
        });
        return;
      }

      // Check file size
      const maxSize = 500 * 1024 * 1024; // 500 MB
      const fileSize = typeof file.size === 'number' ? file.size : 0;
      if (fileSize > maxSize) {
        res.status(400).json({
          error: 'File Too Large',
          message: 'Maximum file size is 500 MB',
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
          const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
          if (req.user?.userId) {
            await threatResponseService.handleMaliciousUpload(
              req.user.userId,
              ip,
              fileName,
              'Malware signature detected (EICAR)',
            );
          }
          res.status(400).json({
            error: 'File Upload Rejected',
            message: 'Malware signature detected in uploaded file.',
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
 */
export const performanceSecurityMiddleware = (
  req: RequestWithSecurity,
  res: Response,
  next: NextFunction,
) => {
  const startTime = Date.now();

  // Capture original send function
  const originalSend = res.send;

  res.send = function (data: any) {
    const duration = Date.now() - startTime;

    // Detect slow requests (potential DoS or inefficient queries)
    if (duration > 5000) {
      logger.warn(`[PERFORMANCE] Slow request detected`, {
        path: req.path,
        method: req.method,
        duration,
        userId: req.user?.userId,
      });

      // Could trigger additional monitoring
    }

    // Continue with normal send
    return originalSend.call(this, data);
  };

  next();
};

/**
 * Extract client data from request
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
 * Check if IP is blacklisted
 */
async function checkIpBlacklist(_ip: string): Promise<boolean> {
  // In production, check Redis cache
  // const blacklisted = await redisClient.exists(`blacklist:${_ip}`)
  // return blacklisted === 1
  return false;
}

/**
 * Log security event to immutable audit trail
 */
export const auditLogMiddleware = (req: RequestWithSecurity, res: Response, next: NextFunction) => {
  const originalSend = res.send;

  res.send = function (data: any) {
    // Log sensitive operations
    const sensitivePaths = ['/auth/login', '/auth/register', '/api/vault/delete', '/api/users/me'];

    if (sensitivePaths.some((p) => req.path.includes(p))) {
      logger.info(`[AUDIT] Sensitive operation`, {
        requestId: req.security?.requestId,
        method: req.method,
        path: req.path,
        userId: req.user?.userId,
        ip: req.ip,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
      });
    }

    return originalSend.call(this, data);
  };

  next();
};
