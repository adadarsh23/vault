import { describe, expect, it } from 'vitest';
import {
  MAX_GENERATED_CREDENTIAL_LENGTH,
  MIN_GENERATED_CREDENTIAL_LENGTH,
  generateFormattedPassword,
  normalizeGeneratedCredentialLength,
  parseCoordinate,
  toDMS,
  validatePassword,
} from '../../src/lib/utils.ts';

// The default length equals the minimum (16) per the implementation
const DEFAULT_GENERATED_CREDENTIAL_LENGTH = MIN_GENERATED_CREDENTIAL_LENGTH;

// ---------------------------------------------------------------------------
// generateFormattedPassword
// ---------------------------------------------------------------------------

describe('generateFormattedPassword', () => {
  it('always generates a password that passes validatePassword (100 samples)', () => {
    for (let i = 0; i < 100; i += 1) {
      const password = generateFormattedPassword();
      expect(validatePassword(password)).toEqual({ isValid: true });
    }
  });

  it('enforces the documented password format at default length', () => {
    const password = generateFormattedPassword(16);

    expect(password.length).toBeGreaterThanOrEqual(16);
    expect(password[0]).toMatch(/[A-Z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[!@#$%^&*(),.?":{}|<>]/);
  });

  it('respects the minimum supported length (clamps values below MIN)', () => {
    const password = generateFormattedPassword(4);

    expect(password.length).toBeGreaterThanOrEqual(MIN_GENERATED_CREDENTIAL_LENGTH);
    expect(validatePassword(password)).toEqual({ isValid: true });
  });

  it('respects the maximum supported length (clamps values above MAX)', () => {
    const password = generateFormattedPassword(9999);

    expect(password.length).toBeLessThanOrEqual(MAX_GENERATED_CREDENTIAL_LENGTH);
    expect(validatePassword(password)).toEqual({ isValid: true });
  });

  it('generates passwords at exactly the maximum length', () => {
    const password = generateFormattedPassword(MAX_GENERATED_CREDENTIAL_LENGTH);

    expect(password.length).toBe(MAX_GENERATED_CREDENTIAL_LENGTH);
    expect(validatePassword(password)).toEqual({ isValid: true });
  });

  it('contains at least one uppercase, one lowercase, one digit, and one special char', () => {
    for (let i = 0; i < 50; i += 1) {
      const p = generateFormattedPassword();
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[!@#$%^&*()\-_=+[\]{}|;:,.<>?]/);
    }
  });

  it('always starts with an uppercase letter', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateFormattedPassword()[0]).toMatch(/[A-Z]/);
    }
  });

  it('produces different passwords on consecutive calls (entropy check)', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateFormattedPassword()));
    // With 20 calls the probability of any collision is negligible
    expect(passwords.size).toBeGreaterThan(15);
  });
});

// ---------------------------------------------------------------------------
// normalizeGeneratedCredentialLength
// ---------------------------------------------------------------------------

describe('normalizeGeneratedCredentialLength', () => {
  it('falls back to the shared default length for NaN', () => {
    expect(normalizeGeneratedCredentialLength(Number.NaN)).toBe(
      DEFAULT_GENERATED_CREDENTIAL_LENGTH
    );
  });

  it('falls back for null', () => {
    expect(normalizeGeneratedCredentialLength(null)).toBe(DEFAULT_GENERATED_CREDENTIAL_LENGTH);
  });

  it('falls back for undefined', () => {
    expect(normalizeGeneratedCredentialLength(undefined)).toBe(DEFAULT_GENERATED_CREDENTIAL_LENGTH);
  });

  it('clamps values below the minimum to MIN_GENERATED_CREDENTIAL_LENGTH', () => {
    expect(normalizeGeneratedCredentialLength(1)).toBe(MIN_GENERATED_CREDENTIAL_LENGTH);
    expect(normalizeGeneratedCredentialLength(0)).toBe(MIN_GENERATED_CREDENTIAL_LENGTH);
    expect(normalizeGeneratedCredentialLength(-100)).toBe(MIN_GENERATED_CREDENTIAL_LENGTH);
  });

  it('clamps values above the maximum to MAX_GENERATED_CREDENTIAL_LENGTH', () => {
    expect(normalizeGeneratedCredentialLength(999)).toBe(MAX_GENERATED_CREDENTIAL_LENGTH);
  });

  it('passes through a valid in-range value unchanged', () => {
    expect(normalizeGeneratedCredentialLength(24)).toBe(24);
    expect(normalizeGeneratedCredentialLength(48)).toBe(48);
  });

  it('passes through the exact boundary values', () => {
    expect(normalizeGeneratedCredentialLength(MIN_GENERATED_CREDENTIAL_LENGTH)).toBe(
      MIN_GENERATED_CREDENTIAL_LENGTH
    );
    expect(normalizeGeneratedCredentialLength(MAX_GENERATED_CREDENTIAL_LENGTH)).toBe(
      MAX_GENERATED_CREDENTIAL_LENGTH
    );
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('validatePassword', () => {
  it('accepts a valid password', () => {
    expect(validatePassword('SecureVaultPass2026!')).toEqual({ isValid: true });
  });

  it('rejects an empty password', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a password shorter than the minimum length', () => {
    const result = validatePassword('Ab1!');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/at least/i);
  });

  it('rejects a password that does not start with a capital letter', () => {
    const result = validatePassword('lowercase1!password');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/capital/i);
  });

  it('rejects a password with no lowercase letter', () => {
    const result = validatePassword('ALLUPPERCASE123!');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/lowercase/i);
  });

  it('rejects a password with no digit', () => {
    const result = validatePassword('NoDigitsInThisPassword!!!');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/number/i);
  });

  it('rejects a password with no special character', () => {
    const result = validatePassword('NoSpecialCharAllowed123');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/special/i);
  });

  it('rejects a password longer than the supported maximum length', () => {
    const result = validatePassword(`A${'a'.repeat(70)}1!`);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/at most/i);
  });

  it('rejects a password containing whitespace', () => {
    const result = validatePassword('Secure VaultPass2026!');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/spaces/i);
  });
});

// ---------------------------------------------------------------------------
// parseCoordinate
// ---------------------------------------------------------------------------

describe('parseCoordinate', () => {
  it('parses a positive decimal string', () => {
    expect(parseCoordinate('40.7128')).toBeCloseTo(40.7128);
  });

  it('parses a negative decimal string', () => {
    expect(parseCoordinate('-73.9857')).toBeCloseTo(-73.9857);
  });

  it('passes a finite number through unchanged', () => {
    expect(parseCoordinate(51.5074)).toBeCloseTo(51.5074);
  });

  it('returns null for null', () => {
    expect(parseCoordinate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseCoordinate(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseCoordinate('')).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(parseCoordinate(Infinity)).toBeNull();
  });

  it('parses DMS notation with N suffix', () => {
    // 40° 42′ 46″ N  ≈ 40.7128°
    const result = parseCoordinate('40° 42\' 46" N');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(40.7128, 1);
  });

  it('parses DMS with S suffix as negative', () => {
    const result = parseCoordinate('33° 51\' 54" S');
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });

  it('returns null for fully unrecognized text', () => {
    expect(parseCoordinate('not-a-coordinate')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toDMS
// ---------------------------------------------------------------------------

describe('toDMS', () => {
  it('converts a positive latitude to N hemisphere', () => {
    const result = toDMS(40.7128, true);
    expect(result).toContain('N');
    expect(result).toMatch(/°/);
  });

  it('converts a negative latitude to S hemisphere', () => {
    const result = toDMS(-33.865, true);
    expect(result).toContain('S');
  });

  it('converts a positive longitude to E hemisphere', () => {
    const result = toDMS(151.209, false);
    expect(result).toContain('E');
  });

  it('converts a negative longitude to W hemisphere', () => {
    const result = toDMS(-74.006, false);
    expect(result).toContain('W');
  });

  it('returns an empty string for Infinity', () => {
    expect(toDMS(Infinity, true)).toBe('');
  });

  it('returns an empty string for NaN', () => {
    expect(toDMS(NaN, false)).toBe('');
  });
});
