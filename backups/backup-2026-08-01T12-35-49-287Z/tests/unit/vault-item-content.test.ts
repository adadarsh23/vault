import { describe, expect, it } from 'vitest';
import { getStringContent, parseJsonSafely } from '../../src/lib/vaultItemContent.ts';

describe('vaultItemContent', () => {
  it('returns trimmed content for valid string payloads', () => {
    expect(getStringContent('  encrypted-payload  ')).toBe('encrypted-payload');
  });

  it('returns null for binary payloads', () => {
    expect(getStringContent(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('returns null for whitespace-only strings', () => {
    expect(getStringContent('   \n\t  ')).toBeNull();
  });

  it('parses valid JSON and tolerates leading BOM/whitespace', () => {
    const parsed = parseJsonSafely<{ task: string }>(' \uFEFF{"task":"Review backup"} ');
    expect(parsed).toEqual({ task: 'Review backup' });
  });

  it('returns null for malformed JSON', () => {
    expect(parseJsonSafely('{bad-json}')).toBeNull();
  });

  it('returns null for oversized JSON payloads', () => {
    const oversized = `"${'a'.repeat(4 * 1024 * 1024 + 1)}"`;
    expect(parseJsonSafely<string>(oversized)).toBeNull();
  });
});
