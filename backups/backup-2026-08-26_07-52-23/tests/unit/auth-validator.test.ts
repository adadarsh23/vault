import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../../server/validators/authValidator.ts';

const CAPTCHA_TOKEN = 'test-captcha-token-abcdefghijklmnopqrstuvwxyz';

describe('updateProfileSchema', () => {
  it('accepts valid profile updates', () => {
    const parsed = updateProfileSchema.parse({
      profileName: '  Alice  ',
      profilePhoto: 'https://example.com/avatar.png',
    });

    expect(parsed.profileName).toBe('Alice');
    expect(parsed.profilePhoto).toBe('https://example.com/avatar.png');
  });

  it('normalizes empty fields to "none"', () => {
    const parsed = updateProfileSchema.parse({
      profileName: '   ',
      profilePhoto: '  ',
    });

    expect(parsed.profileName).toBe('none');
    expect(parsed.profilePhoto).toBe('none');
  });

  it('accepts http profile photo URLs', () => {
    const parsed = updateProfileSchema.parse({
      profilePhoto:
        'http://localhost:4000/api/avatar/raw/6a6f318fc96229128b86b05f/9084394ec33895a6.avif',
    });

    expect(parsed.profilePhoto).toBe(
      'http://localhost:4000/api/avatar/raw/6a6f318fc96229128b86b05f/9084394ec33895a6.avif',
    );
  });

  it('rejects malformed profile photo URLs', () => {
    const result = updateProfileSchema.safeParse({
      profilePhoto: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty payloads', () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts "none" for profilePhoto case-insensitively', () => {
    const parsed = updateProfileSchema.parse({
      profilePhoto: '  NoNe  ',
    });

    expect(parsed.profilePhoto).toBe('none');
  });

  it('rejects profileName values longer than 120 characters', () => {
    const result = updateProfileSchema.safeParse({
      profileName: 'a'.repeat(121),
    });

    expect(result.success).toBe(false);
  });

  it('rejects profilePhoto values longer than 2048 characters', () => {
    const result = updateProfileSchema.safeParse({
      profilePhoto: `https://example.com/${'a'.repeat(2048)}`,
    });

    expect(result.success).toBe(false);
  });

  it('normalizes valid https profilePhoto URLs', () => {
    const parsed = updateProfileSchema.parse({
      profilePhoto: 'https://example.com/avatar.png',
    });

    expect(parsed.profilePhoto).toBe('https://example.com/avatar.png');
  });
});

describe('loginSchema', () => {
  it('normalizes username to lowercase and trims deviceId', () => {
    const parsed = loginSchema.parse({
      username: '  Alice.User-01  ',
      password: 'Validpassword123!',
      deviceId: '  device-123  ',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(parsed.username).toBe('alice.user-01');
    expect(parsed.deviceId).toBe('device-123');
  });

  it('rejects usernames with unsupported characters', () => {
    const result = loginSchema.safeParse({
      username: 'alice user',
      password: 'Validpassword123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid password strings during login', () => {
    const result = loginSchema.safeParse({
      username: 'alice.user',
      password: 'Validpassword1234',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(true);
  });
});

describe('registerSchema', () => {
  it('rejects weak registration passwords that do not include a special character', () => {
    const result = registerSchema.safeParse({
      username: 'alice.user',
      password: 'Validpassword1234',
      masterKey: 'Validmasterkey123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('requires a strong master key', () => {
    const result = registerSchema.safeParse({
      username: 'alice.user',
      password: 'Validpassword123!',
      masterKey: 'weakmasterkey1234',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('rejects registration when password and master key are identical', () => {
    const result = registerSchema.safeParse({
      username: 'Alice',
      password: 'Strongpassword123!',
      masterKey: 'Strongpassword123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid registration payloads', () => {
    const parsed = registerSchema.parse({
      username: 'Alice',
      password: 'Strongpassword123!',
      masterKey: 'Anotherstrongkey123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(parsed.username).toBe('alice');
    expect(parsed.password).toBe('Strongpassword123!');
    expect(parsed.masterKey).toBe('Anotherstrongkey123!');
  });
});

describe('changePasswordSchema', () => {
  it('requires currentPassword to be non-empty', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'Validpassword123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('rejects newPassword equal to currentPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Replacementpass123!',
      newPassword: 'Replacementpass123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('rejects weak replacement passwords', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'current-password',
      newPassword: 'short1!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });

  it('accepts strong replacement passwords', () => {
    const parsed = changePasswordSchema.parse({
      currentPassword: 'current-password',
      newPassword: 'Replacementpass123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(parsed.newPassword).toBe('Replacementpass123!');
  });

  it('rejects replacement passwords that contain spaces', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'Replacement pass123!',
      captchaToken: CAPTCHA_TOKEN,
    });

    expect(result.success).toBe(false);
  });
});
