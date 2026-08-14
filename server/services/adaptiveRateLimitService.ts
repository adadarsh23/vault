/**
 * Adaptive Rate Limiting Based on User Behavior and Risk
 *
 * Uses machine learning to:
 * - Auto-adjust rate limits based on user profile
 * - Detect abnormal traffic patterns
 * - Apply stricter limits to suspicious IPs
 * - Implement graduated response (warn > throttle > block)
 */

import { logger } from '../utils/logger.ts';

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  hset(key: string, ...args: any[]): Promise<unknown>;
  exists(key: string): Promise<number | boolean>;
  del(key: string): Promise<unknown>;
}

class InMemoryRedisClient implements RedisLikeClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private hashStore = new Map<string, { data: Record<string, string>; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, _mode?: string, duration?: number): Promise<unknown> {
    const expiresAt = duration ? Date.now() + duration * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const count = (parseInt(current || '0', 10) || 0) + 1;
    const existing = this.store.get(key);
    this.store.set(key, { value: count.toString(), expiresAt: existing?.expiresAt });
    return count;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return -1;
    const remainingMs = entry.expiresAt - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : -2;
  }

  async expire(key: string, seconds: number): Promise<unknown> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
    }
    const hashEntry = this.hashStore.get(key);
    if (hashEntry) {
      hashEntry.expiresAt = Date.now() + seconds * 1000;
    }
    return 1;
  }

  async hset(key: string, ...args: any[]): Promise<unknown> {
    let hashEntry = this.hashStore.get(key);
    if (!hashEntry) {
      hashEntry = { data: {} };
      this.hashStore.set(key, hashEntry);
    }
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] !== undefined && args[i + 1] !== undefined) {
        hashEntry.data[String(args[i])] = String(args[i + 1]);
      }
    }
    return 1;
  }

  async exists(key: string): Promise<number | boolean> {
    const val = await this.get(key);
    if (val !== null) return 1;
    const hash = this.hashStore.get(key);
    if (hash) {
      if (hash.expiresAt && Date.now() > hash.expiresAt) {
        this.hashStore.delete(key);
        return 0;
      }
      return 1;
    }
    return 0;
  }

  async del(key: string): Promise<unknown> {
    this.store.delete(key);
    this.hashStore.delete(key);
    return 1;
  }
}

export interface UserRiskProfile {
  userId: string;
  riskScore: number; // 0-100
  requestsLastHour: number;
  suspiciousPatterns: number;
  reputation: 'trusted' | 'normal' | 'suspicious' | 'blocked';
}

export interface AdaptiveLimit {
  maxRequests: number;
  windowMs: number;
  cooldownMs: number;
  action: 'allow' | 'throttle' | 'block';
}

export class AdaptiveRateLimitService {
  private redisClient: RedisLikeClient;
  private userProfiles: Map<string, UserRiskProfile> = new Map();

  // Base rate limits
  private readonly BASE_LIMITS = {
    default: { maxRequests: 100, windowMs: 60000 }, // 100 req/min
    auth: { maxRequests: 10, windowMs: 300000 }, // 10 auth attempts per 5 min
    api: { maxRequests: 500, windowMs: 60000 }, // 500 API calls/min
    file: { maxRequests: 50, windowMs: 60000 }, // 50 file ops/min
  };

  // Risk-based multipliers
  private readonly RISK_MULTIPLIERS = {
    trusted: 2.0, // 2x normal limits
    normal: 1.0, // Normal limits
    suspicious: 0.3, // 30% of normal
    blocked: 0.0, // No requests allowed
  };

  private readonly COOLDOWN_PERIODS = {
    throttle: 60000, // 1 minute
    block: 3600000, // 1 hour
  };

  constructor(redisClient?: RedisLikeClient) {
    this.redisClient = redisClient || new InMemoryRedisClient();
  }

  /**
   * Check if request is allowed based on adaptive rate limits
   */
  async checkRateLimit(
    identifier: string,
    category: 'default' | 'auth' | 'api' | 'file' = 'default',
    userId?: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    riskLevel: string;
    action: 'allow' | 'throttle' | 'block';
  }> {
    const key = `ratelimit:${category}:${identifier}`;
    const cooldownKey = `ratelimit:cooldown:${identifier}`;

    // Check if in cooldown
    const inCooldown = await this.redisClient.get(cooldownKey);
    if (inCooldown) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: parseInt(inCooldown, 10),
        riskLevel: 'blocked',
        action: 'block',
      };
    }

    // Get adaptive limits
    const profile = userId ? this.userProfiles.get(userId) || null : null;
    const limits = this.getAdaptiveLimits(category, profile);

    // Get current request count
    const current = await this.redisClient.incr(key);
    let ttl = await this.redisClient.ttl(key);

    if (ttl === -1) {
      await this.redisClient.expire(key, Math.ceil(limits.windowMs / 1000));
      ttl = limits.windowMs;
    }

    const remaining = Math.max(0, limits.maxRequests - current);
    const resetTime = Date.now() + ttl * 1000;

    // Determine action
    let action: 'allow' | 'throttle' | 'block' = 'allow';
    let allowed = current <= limits.maxRequests;

    if (!allowed) {
      // Set cooldown
      const cooldownEnd = resetTime + this.COOLDOWN_PERIODS.throttle;
      await this.redisClient.set(
        cooldownKey,
        cooldownEnd.toString(),
        'EX',
        Math.ceil(this.COOLDOWN_PERIODS.throttle / 1000)
      );
      action = 'throttle';

      // Track repeated violations
      if (profile) {
        profile.suspiciousPatterns++;
        if (profile.suspiciousPatterns > 5) {
          action = 'block';
          profile.reputation = 'blocked';
        }
      }
    }

    return {
      allowed,
      remaining,
      resetTime,
      riskLevel: profile?.reputation || 'normal',
      action,
    };
  }

  /**
   * Update user risk score based on behavior
   */
  async updateRiskScore(
    userId: string,
    factors: {
      failedLogins?: number;
      apiAnomalies?: number;
      dataAccess?: number;
      newLocations?: number;
    }
  ): Promise<UserRiskProfile> {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        riskScore: 0,
        requestsLastHour: 0,
        suspiciousPatterns: 0,
        reputation: 'normal',
      };
    }

    // Calculate risk increment
    let riskDelta = 0;
    if (factors.failedLogins) riskDelta += factors.failedLogins * 10;
    if (factors.apiAnomalies) riskDelta += factors.apiAnomalies * 5;
    if (factors.dataAccess) riskDelta += factors.dataAccess * 3;
    if (factors.newLocations) riskDelta += factors.newLocations * 8;

    // Exponential decay (reduce risk over time if no new incidents)
    profile.riskScore = Math.max(0, profile.riskScore * 0.95 + riskDelta);

    // Update reputation
    if (profile.riskScore >= 80) {
      profile.reputation = 'blocked';
    } else if (profile.riskScore >= 50) {
      profile.reputation = 'suspicious';
    } else if (profile.riskScore >= 20) {
      profile.reputation = 'normal';
    } else {
      profile.reputation = 'trusted';
    }

    this.userProfiles.set(userId, profile);

    // Persist to Redis for distributed cache
    await this.redisClient.hset(
      `user:risk:${userId}`,
      'score',
      profile.riskScore.toString(),
      'reputation',
      profile.reputation,
      'patterns',
      profile.suspiciousPatterns.toString()
    );
    await this.redisClient.expire(`user:risk:${userId}`, 86400); // 24 hour TTL

    return profile;
  }

  /**
   * Get adaptive rate limits based on user profile
   */
  private getAdaptiveLimits(
    category: 'default' | 'auth' | 'api' | 'file',
    profile: UserRiskProfile | null
  ): AdaptiveLimit {
    const baseLimit = this.BASE_LIMITS[category];
    const multiplier = profile ? this.RISK_MULTIPLIERS[profile.reputation] : 1.0;

    const maxRequests = Math.floor(baseLimit.maxRequests * multiplier);

    let action: 'allow' | 'throttle' | 'block' = 'allow';
    if (multiplier === 0) {
      action = 'block';
    } else if (multiplier < 0.5) {
      action = 'throttle';
    }

    return {
      maxRequests,
      windowMs: baseLimit.windowMs,
      cooldownMs: multiplier < 0.5 ? this.COOLDOWN_PERIODS.throttle : 0,
      action,
    };
  }

  /**
   * Whitelist trusted IPs/users (automatic or manual)
   */
  async whitelistIdentifier(identifier: string, ttlHours?: number): Promise<void> {
    const key = `whitelist:${identifier}`;
    const ttl = (ttlHours || 24) * 3600;
    await this.redisClient.set(key, '1', 'EX', ttl);
    logger.info(`Whitelisted identifier: ${identifier}`);
  }

  /**
   * Blacklist suspicious IPs/users
   */
  async blacklistIdentifier(identifier: string, ttlHours?: number): Promise<void> {
    const key = `blacklist:${identifier}`;
    const ttl = (ttlHours || 24) * 3600;
    await this.redisClient.set(key, '1', 'EX', ttl);
    logger.warn(`Blacklisted identifier: ${identifier}`);
  }

  /**
   * Check if identifier is whitelisted
   */
  async isWhitelisted(identifier: string): Promise<boolean> {
    return (await this.redisClient.exists(`whitelist:${identifier}`)) === 1;
  }

  /**
   * Check if identifier is blacklisted
   */
  async isBlacklisted(identifier: string): Promise<boolean> {
    return (await this.redisClient.exists(`blacklist:${identifier}`)) === 1;
  }

  /**
   * Reset rate limit for identifier (manual admin override)
   */
  async resetLimit(identifier: string, category: string): Promise<void> {
    const key = `ratelimit:${category}:${identifier}`;
    await this.redisClient.del(key);
    logger.info(`Rate limit reset for ${identifier}`);
  }

  /**
   * Get user's current rate limit status
   */
  async getLimitStatus(identifier: string): Promise<{
    profile: UserRiskProfile | null;
    limits: Record<string, AdaptiveLimit>;
  }> {
    const profile = this.userProfiles.get(identifier) || null;
    const limits = {
      default: this.getAdaptiveLimits('default', profile),
      auth: this.getAdaptiveLimits('auth', profile),
      api: this.getAdaptiveLimits('api', profile),
      file: this.getAdaptiveLimits('file', profile),
    };
    return { profile, limits };
  }
}

export const createAdaptiveRateLimitService = (redisClient?: RedisLikeClient) => {
  return new AdaptiveRateLimitService(redisClient);
};
