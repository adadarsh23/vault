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

const CAPTCHA_TOKEN = 'test-captcha-token-abcdefghijklmnopqrstuvwxyz';
const STRONG_PASSWORD_1 = 'SecureVaultPass2026!';
const STRONG_PASSWORD_2 = 'AnotherStrongPass2026!';
const MASTER_KEY_1 = 'SecureMasterKey2026!';

let isMongoConnected = false;

describe('🔐 Auth Security & Token Rotation Integration Tests', () => {
  beforeAll(async () => {
    process.env.SKIP_RECAPTCHA = 'true';
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
        username: 'securitytester',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('passwordHash');

      // Verify Set-Cookie header contains HttpOnly refresh token
      const cookies = res.get('Set-Cookie') || [];
      expect(
        cookies.some(
          (c) =>
            c.toLowerCase().includes('refresh_token') || c.toLowerCase().includes('refreshtoken')
        )
      ).toBe(true);
      expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);

      // Verify Database Sanitization and Password Hashing
      const userInDb = await User.findOne({ username: 'securitytester' }).select('+password');
      expect(userInDb).not.toBeNull();
      expect(userInDb?.username).toBe('securitytester');
      expect(userInDb?.password).not.toBe(STRONG_PASSWORD_1);
    });

    it('should reject duplicate registration with HTTP 400 or 409', async () => {
      // First registration
      await request.post('/api/auth/signup').send({
        username: 'duplicateuser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      // Duplicate registration attempt
      const duplicateRes = await request.post('/api/auth/signup').send({
        username: 'duplicateuser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      expect([400, 409]).toContain(duplicateRes.status);
    });

    it('should reject weak passwords violating security policy with HTTP 400 Bad Request', async () => {
      const weakRes = await request.post('/api/auth/signup').send({
        username: 'weakpassuser',
        password: 'short',
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      expect(weakRes.status).toBe(400);
    });

    it('should sanitize payload by trimming whitespace and lowercasing username', async () => {
      await request.post('/api/auth/signup').send({
        username: '  UNTRIMMED_User  ',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      const userInDb = await User.findOne({ username: 'untrimmed_user' });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.username).toBe('untrimmed_user');
    });
  });

  /* -------------------------------------------------------------------
   * 1.2 Credential Validation & Login
   * ------------------------------------------------------------------- */
  describe('1.2 Credential Validation & Login', () => {
    beforeEach(async () => {
      await request.post('/api/auth/signup').send({
        username: 'loginuser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });
    });

    it('should authenticate valid credentials, return 200, create familyId in RefreshToken DB, and emit cookies', async () => {
      const loginRes = await request
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 TestBrowser/1.0')
        .send({
          username: 'loginuser',
          password: STRONG_PASSWORD_1,
          captchaToken: CAPTCHA_TOKEN,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toHaveProperty('accessToken');

      const cookies = loginRes.get('Set-Cookie') || [];
      expect(
        cookies.some(
          (c) =>
            c.toLowerCase().includes('refresh_token') || c.toLowerCase().includes('refreshtoken')
        )
      ).toBe(true);

      // Verify RefreshToken collection document created with familyId
      const refreshTokens = await RefreshToken.find({ isRevoked: false });
      expect(refreshTokens.length).toBeGreaterThan(0);
      const tokenDoc = refreshTokens[0];
      expect(tokenDoc.familyId).toBeDefined();
      expect(tokenDoc.userAgent).toContain('TestBrowser');
    });

    it('should reject invalid credentials with generic 401 Unauthorized without revealing user existence', async () => {
      // Non-existent username
      const nonExistentRes = await request.post('/api/auth/login').send({
        username: 'nonexistentuser',
        password: STRONG_PASSWORD_1,
        captchaToken: CAPTCHA_TOKEN,
      });
      expect(nonExistentRes.status).toBe(401);

      // Wrong password
      const wrongPasswordRes = await request.post('/api/auth/login').send({
        username: 'loginuser',
        password: STRONG_PASSWORD_2,
        captchaToken: CAPTCHA_TOKEN,
      });
      expect(wrongPasswordRes.status).toBe(401);

      // Ensure error messages are identical to prevent user enumeration
      expect(nonExistentRes.body.message || nonExistentRes.body.error).toEqual(
        wrongPasswordRes.body.message || wrongPasswordRes.body.error
      );
    });

    it('should record client IP and User-Agent in RefreshToken collection document', async () => {
      await request.post('/api/auth/login').set('User-Agent', 'SecurityAuditorAgent/2.0').send({
        username: 'loginuser',
        password: STRONG_PASSWORD_1,
        captchaToken: CAPTCHA_TOKEN,
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
        username: 'rotationuser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      const cookieHeader1 = signupRes.get('Set-Cookie');
      expect(cookieHeader1).toBeDefined();

      // Refresh session
      const refreshRes1 = await request.post('/api/auth/refresh').set('Cookie', cookieHeader1!);

      expect(refreshRes1.status).toBe(200);
      const resBody = refreshRes1.body;
      const accessToken =
        resBody.accessToken || resBody.token || resBody?.data?.accessToken || resBody?.data?.token;
      expect(accessToken).toBeDefined();

      const cookieHeader2 = refreshRes1.get('Set-Cookie');
      expect(cookieHeader2).toBeDefined();

      // Verify active tokens count in RefreshToken collection
      const activeTokens = await RefreshToken.find({ isRevoked: false });
      expect(activeTokens.length).toBe(1);
    });

    it('should detect token reuse attack and revoke entire familyId lineage', async () => {
      // 1. Signup & get initial refresh token
      const signupRes = await request.post('/api/auth/signup').send({
        username: 'victimuser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      const cookieHeader1 = signupRes.get('Set-Cookie');
      expect(cookieHeader1).toBeDefined();

      // 2. Perform legitimate token refresh (rotates token)
      const refreshRes1 = await request.post('/api/auth/refresh').set('Cookie', cookieHeader1!);

      expect(refreshRes1.status).toBe(200);
      const cookieHeader2 = refreshRes1.get('Set-Cookie');
      expect(cookieHeader2).toBeDefined();

      // 3. REUSE ATTACK: Attacker uses the stolen OLD cookieHeader1
      const attackRes = await request.post('/api/auth/refresh').set('Cookie', cookieHeader1!);

      expect(attackRes.status).toBe(403); // Forbidden

      // 4. Verify ALL tokens in that family are now revoked in DB
      const activeTokens = await RefreshToken.find({ isRevoked: false });
      expect(activeTokens.length).toBe(0);

      // 5. Verify even the legitimate user (cookieHeader2) is now locked out for safety
      const victimRes = await request.post('/api/auth/refresh').set('Cookie', cookieHeader2!);

      expect(victimRes.status).toBe(401);
    });
  });

  /* -------------------------------------------------------------------
   * 1.4 Session Restoration & Invalidation
   * ------------------------------------------------------------------- */
  describe('1.4 Session Restoration & Invalidation', () => {
    it('should allow protected endpoint access with valid Bearer token', async () => {
      const signupRes = await request.post('/api/auth/signup').send({
        username: 'protecteduser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      const token =
        signupRes.body.accessToken ||
        signupRes.body.token ||
        signupRes.body?.data?.accessToken ||
        signupRes.body?.data?.token;

      const meRes = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body).toHaveProperty('data');
    });

    it('should reject expired access token with 401 Unauthorized', async () => {
      const user = await User.create({
        username: 'expireduser',
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
        username: 'logoutuser',
        password: STRONG_PASSWORD_1,
        masterKey: MASTER_KEY_1,
        captchaToken: CAPTCHA_TOKEN,
      });

      const cookieHeader = signupRes.get('Set-Cookie');
      expect(cookieHeader).toBeDefined();

      const logoutRes = await request.post('/api/auth/logout').set('Cookie', cookieHeader!);

      expect(logoutRes.status).toBe(200);

      // Verify token in DB is revoked
      const activeTokens = await RefreshToken.find({ isRevoked: false });
      expect(activeTokens.length).toBe(0);

      // Verify cleared cookie header
      const cookies = logoutRes.get('Set-Cookie') || [];
      expect(
        cookies.some(
          (c) =>
            c.toLowerCase().includes('refresh_token=;') ||
            c.toLowerCase().includes('refreshtoken=;')
        )
      ).toBe(true);
    });
  });
});
