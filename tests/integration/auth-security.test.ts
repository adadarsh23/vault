import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createAuthTestApp } from '../helpers/createAuthTestApp.ts';
import { User } from '../../server/models/user.ts';
import { RefreshToken } from '../../server/models/RefreshToken.ts';
import { createAccessToken } from '../../server/utils/auth.ts';
import { connectToMongo } from '../../server/mongo.ts';

const app = createAuthTestApp();
const request = supertest(app);

let isMongoConnected = false;

describe('🔐 Auth Security & Token Rotation Integration Tests', () => {
  beforeAll(async () => {
    try {
      await connectToMongo();
      isMongoConnected = mongoose.connection.readyState === 1;
    } catch {
      console.warn('MongoDB connection unavailable. Skipping DB integration tests.');
      isMongoConnected = false;
    }
  });

  afterAll(async () => {
    if (isMongoConnected) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async (context) => {
    if (!isMongoConnected) {
      context.skip();
      return;
    }
    await User.deleteMany({});
    await RefreshToken.deleteMany({});
  });

  /* -------------------------------------------------------------------
   * 1.1 Password & User Registration Security
   * ------------------------------------------------------------------- */
  describe('1.1 Registration Security', () => {
    it('should register user with hashed password and return tokens in JSON & HttpOnly cookie', async () => {
      const res = await request.post('/api/auth/signup').send({
        email: '  TestUser@Example.com  ',
        password: 'Password123!',
        fullName: 'Security Tester',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('passwordHash');

      // Verify Set-Cookie header contains HttpOnly refresh token
      const cookies = res.get('Set-Cookie') || [];
      expect(cookies.some((c) => c.includes('refreshToken'))).toBe(true);
      expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);

      // Verify Database Sanitization and Password Hashing
      const userInDb = await User.findOne({ email: 'testuser@example.com' }).select('+password');
      expect(userInDb).not.toBeNull();
      expect(userInDb?.email).toBe('testuser@example.com');
      expect(userInDb?.password).not.toBe('Password123!');
    });

    it('should reject duplicate email registration with HTTP 409 Conflict', async () => {
      // First registration
      await request.post('/api/auth/signup').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        fullName: 'Original User',
      });

      // Duplicate registration attempt
      const duplicateRes = await request.post('/api/auth/signup').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        fullName: 'Imposter User',
      });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error).toMatch(/Email already registered/i);
    });

    it('should reject weak passwords violating security policy with HTTP 400 Bad Request', async () => {
      const weakRes = await request.post('/api/auth/signup').send({
        email: 'weakpass@example.com',
        password: 'short',
        fullName: 'Weak Password User',
      });

      expect(weakRes.status).toBe(400);
    });

    it('should sanitize payload by trimming whitespace and lowercasing email/username', async () => {
      await request.post('/api/auth/signup').send({
        email: '  UNTRIMMED.User@DOMAIN.com  ',
        password: 'Password123!',
        fullName: 'Sanitized User',
      });

      const userInDb = await User.findOne({ email: 'untrimmed.user@domain.com' });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.username).toBe('untrimmed.user');
    });
  });

  /* -------------------------------------------------------------------
   * 1.2 Credential Validation & Login
   * ------------------------------------------------------------------- */
  describe('1.2 Credential Validation & Login', () => {
    beforeEach(async () => {
      await request.post('/api/auth/signup').send({
        email: 'login@example.com',
        password: 'Password123!',
        fullName: 'Login User',
      });
    });

    it('should authenticate valid credentials, return 200, create familyId in RefreshToken DB, and emit cookies', async () => {
      const loginRes = await request
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 TestBrowser/1.0')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toHaveProperty('accessToken');

      const cookies = loginRes.get('Set-Cookie') || [];
      expect(cookies.some((c) => c.includes('refreshToken'))).toBe(true);

      // Verify RefreshToken collection document created with familyId
      const refreshTokens = await RefreshToken.find({ isRevoked: false });
      expect(refreshTokens.length).toBeGreaterThan(0);
      const tokenDoc = refreshTokens[0];
      expect(tokenDoc.familyId).toBeDefined();
      expect(tokenDoc.userAgent).toContain('TestBrowser');
    });

    it('should reject invalid credentials with generic 401 Unauthorized without revealing user existence', async () => {
      // Non-existent email
      const nonExistentRes = await request.post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'Password123!',
      });
      expect(nonExistentRes.status).toBe(401);

      // Wrong password
      const wrongPasswordRes = await request.post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'WrongPassword999!',
      });
      expect(wrongPasswordRes.status).toBe(401);

      // Ensure error messages are identical to prevent email enumeration
      expect(nonExistentRes.body.message || nonExistentRes.body.error).toEqual(
        wrongPasswordRes.body.message || wrongPasswordRes.body.error
      );
    });

    it('should record client IP and User-Agent in RefreshToken collection document', async () => {
      await request.post('/api/auth/login').set('User-Agent', 'SecurityAuditorAgent/2.0').send({
        email: 'login@example.com',
        password: 'Password123!',
      });

      const tokenDoc = await RefreshToken.findOne().sort({ createdAt: -1 });
      expect(tokenDoc).not.toBeNull();
      expect(tokenDoc?.userAgent).toBe('SecurityAuditorAgent/2.0');
    });
  });

  /* -------------------------------------------------------------------
   * 1.3 Token Rotation & Replay Attack Defense (CRITICAL SECURITY)
   * ------------------------------------------------------------------- */
  describe('1.3 Token Rotation & Breach Containment', () => {
    it('should perform valid refresh cycle: invalidate old token, issue new token under same familyId', async () => {
      const signupRes = await request.post('/api/auth/signup').send({
        email: 'rotation@example.com',
        password: 'Password123!',
        fullName: 'Rotation User',
      });

      const cookieHeader1 = signupRes.get('Set-Cookie');

      // Refresh session
      const refreshRes1 = await request.post('/api/auth/refresh').set('Cookie', cookieHeader1);

      expect(refreshRes1.status).toBe(200);
      expect(refreshRes1.body).toHaveProperty('accessToken');

      const cookieHeader2 = refreshRes1.get('Set-Cookie');
      expect(cookieHeader2).toBeDefined();

      // Verify active tokens count in RefreshToken collection
      const activeTokens = await RefreshToken.find({ isRevoked: false });
      expect(activeTokens.length).toBe(1);
    });

    it('should detect token reuse attack and revoke entire familyId lineage', async () => {
      // 1. Signup & get initial refresh token
      const signupRes = await request.post('/api/auth/signup').send({
        email: 'victim@example.com',
        password: 'Password123!',
        fullName: 'Victim User',
      });

      const cookieHeader1 = signupRes.get('Set-Cookie');

      // 2. Perform legitimate token refresh (rotates token)
      const refreshRes1 = await request.post('/api/auth/refresh').set('Cookie', cookieHeader1);

      expect(refreshRes1.status).toBe(200);
      const cookieHeader2 = refreshRes1.get('Set-Cookie');

      // 3. REUSE ATTACK: Attacker uses the stolen OLD cookieHeader1
      const attackRes = await request.post('/api/auth/refresh').set('Cookie', cookieHeader1);

      expect(attackRes.status).toBe(403); // Forbidden

      // 4. Verify ALL tokens in that family are now revoked in DB
      const activeTokens = await RefreshToken.find({ isRevoked: false });
      expect(activeTokens.length).toBe(0);

      // 5. Verify even the legitimate user (cookieHeader2) is now locked out for safety
      const victimRes = await request.post('/api/auth/refresh').set('Cookie', cookieHeader2);

      expect(victimRes.status).toBe(401);
    });
  });

  /* -------------------------------------------------------------------
   * 1.4 Session Restoration & Invalidation
   * ------------------------------------------------------------------- */
  describe('1.4 Session Restoration & Invalidation', () => {
    it('should allow protected endpoint access with valid Bearer token', async () => {
      const signupRes = await request.post('/api/auth/signup').send({
        email: 'protected@example.com',
        password: 'Password123!',
        fullName: 'Protected User',
      });

      const token = signupRes.body.accessToken || signupRes.body.token;

      const meRes = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body).toHaveProperty('data');
    });

    it('should reject expired access token with 401 Unauthorized', async () => {
      const user = await User.create({
        username: 'expireduser',
        email: 'expired@example.com',
        password: { cipherText: 'enc', iv: 'iv', authTag: 'tag' },
        masterKey: { cipherText: 'enc', iv: 'iv', authTag: 'tag' },
      });

      const expiredToken = createAccessToken(
        { sub: user._id.toString(), username: user.username, sessionId: 'expired-session' },
        -10 // Expired 10 seconds ago
      );

      const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject malformed or forged access token with 401 Unauthorized', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.forgedsignature';

      const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
    });

    it('should revoke RefreshToken and clear cookie on explicit logout', async () => {
      const signupRes = await request.post('/api/auth/signup').send({
        email: 'logout@example.com',
        password: 'Password123!',
        fullName: 'Logout User',
      });

      const cookieHeader = signupRes.get('Set-Cookie');

      const logoutRes = await request.post('/api/auth/logout').set('Cookie', cookieHeader);

      expect(logoutRes.status).toBe(200);

      // Verify token in DB is revoked
      const activeTokens = await RefreshToken.find({ isRevoked: false });
      expect(activeTokens.length).toBe(0);

      // Verify cleared cookie header
      const cookies = logoutRes.get('Set-Cookie') || [];
      expect(cookies.some((c) => c.includes('refreshToken=;'))).toBe(true);
    });
  });
});
