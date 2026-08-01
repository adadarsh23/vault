import { describe, expect, it } from 'vitest';
import {
  generatePasswordWithOptions,
  evaluatePasswordStrength,
  PASSPHRASE_WORDS,
} from '../../src/lib/passwordGenerator';

describe('generatePasswordWithOptions', () => {
  it('generates standard custom passwords with correct length', () => {
    const password = generatePasswordWithOptions({ length: 20 });
    expect(password.length).toBe(20);
  });

  it('handles passphrase generation correctly', () => {
    const passphrase = generatePasswordWithOptions({
      passphrase: true,
      numWords: 4,
      separator: '-',
      capitalize: true,
    });

    const parts = passphrase.split('-');
    expect(parts.length).toBe(4);
    parts.forEach((word) => {
      expect(word[0]).toMatch(/[A-Z]/);
      const lowerWord = word.toLowerCase();
      expect(PASSPHRASE_WORDS).toContain(lowerWord);
    });
  });

  it('respects uppercase, lowercase, number, symbol filters', () => {
    const password = generatePasswordWithOptions({
      length: 50,
      uppercase: true,
      lowercase: false,
      numbers: false,
      symbols: false,
    });

    expect(password).toMatch(/^[A-Z]+$/);
  });

  it('excludes confusing characters when requested', () => {
    // Generate many passwords to ensure no confusing chars slip in
    for (let i = 0; i < 50; i++) {
      const password = generatePasswordWithOptions({
        length: 30,
        excludeConfusing: true,
      });
      expect(password).not.toMatch(/[iIlLoO01!|]/);
    }
  });
});

describe('evaluatePasswordStrength', () => {
  it('correctly rates very weak passwords', () => {
    const res = evaluatePasswordStrength('short');
    expect(res.score).toBeLessThanOrEqual(1);
    expect(res.label).toMatch(/Weak/i);
  });

  it('correctly rates very strong passwords', () => {
    const res = evaluatePasswordStrength('Correct-Horse-Battery-Staple-2026!');
    expect(res.score).toBe(4);
    expect(res.label).toBe('Very Strong');
  });

  it('handles empty input', () => {
    const res = evaluatePasswordStrength('');
    expect(res.score).toBe(0);
    expect(res.percentage).toBe(0);
  });
});
