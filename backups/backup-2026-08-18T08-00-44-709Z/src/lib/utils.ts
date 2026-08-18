import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* -------------------------------------------------------------------------- */
/*                                UI Helpers                                  */
/* -------------------------------------------------------------------------- */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/*                        Credential Length Configuration                     */
/* -------------------------------------------------------------------------- */

export const MIN_GENERATED_CREDENTIAL_LENGTH = 16;
export const MAX_GENERATED_CREDENTIAL_LENGTH = 64;

export function normalizeGeneratedCredentialLength(length: number | undefined | null): number {
  if (typeof length !== 'number' || Number.isNaN(length)) {
    return MIN_GENERATED_CREDENTIAL_LENGTH;
  }

  return Math.min(
    Math.max(length, MIN_GENERATED_CREDENTIAL_LENGTH),
    MAX_GENERATED_CREDENTIAL_LENGTH
  );
}

/* -------------------------------------------------------------------------- */
/*                          Password Validation Rules                         */
/* -------------------------------------------------------------------------- */

const SPECIAL_CHARS = '!@#$%^&*()_+=[];:,.<>?{}|-';
const REQUIRED_GENERATED_SPECIAL_CHARS = '!@#$%^&*(),.?<>:{}|';

export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < MIN_GENERATED_CREDENTIAL_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${MIN_GENERATED_CREDENTIAL_LENGTH} characters long.`,
    };
  }

  if (password.length > MAX_GENERATED_CREDENTIAL_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at most ${MAX_GENERATED_CREDENTIAL_LENGTH} characters long.`,
    };
  }

  if (/\s/.test(password)) {
    return {
      isValid: false,
      error: 'Password cannot contain spaces.',
    };
  }

  if (!/^[A-Z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must start with a capital letter.',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one lowercase letter.',
    };
  }

  if (!/\d/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one number.',
    };
  }

  const specialRegex = new RegExp(`[${SPECIAL_CHARS.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}]`);
  if (!specialRegex.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one special character.',
    };
  }

  return { isValid: true };
}

/* -------------------------------------------------------------------------- */
/*                      Secure Random (Crypto-based)                          */
/* -------------------------------------------------------------------------- */

function getRandomInt(max: number): number {
  if (max <= 0) return 0;

  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

/* -------------------------------------------------------------------------- */
/*                        Secure Password Generator                           */
/* -------------------------------------------------------------------------- */

export function generateFormattedPassword(length: number = 16): string {
  length = normalizeGeneratedCredentialLength(length);

  const capitals = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specials = SPECIAL_CHARS;
  const requiredSpecials = REQUIRED_GENERATED_SPECIAL_CHARS;

  const allChars = capitals + lowers + numbers + specials;

  let password = '';

  // Ensure required characters
  password += capitals[getRandomInt(capitals.length)];
  password += lowers[getRandomInt(lowers.length)];
  password += numbers[getRandomInt(numbers.length)];
  password += requiredSpecials[getRandomInt(requiredSpecials.length)];

  // Fill remaining length
  for (let i = 4; i < length; i++) {
    password += allChars[getRandomInt(allChars.length)];
  }

  // Shuffle (except first character)
  const rest = password.slice(1).split('');

  for (let i = rest.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1);
    const temp = rest[i];
    rest[i] = rest[j];
    rest[j] = temp;
  }

  return password[0] + rest.join('');
}

/* -------------------------------------------------------------------------- */
/*                        Coordinate Parsing Utilities                        */
/* -------------------------------------------------------------------------- */

/**
 * Parses a coordinate string (decimal or DMS format)
 * Examples:
 * - "40.7128"
 * - "40° 42' 46\" N"
 * - "40 42 46 N"
 * - "40.7128N"
 */
export function parseCoordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const str = String(value).trim();

  // Try decimal
  const num = Number(str);
  if (!Number.isNaN(num)) return num;

  // Try DMS
  const dmsRegex =
    /^([NSEW])?\s*([-+]?\d*\.?\d+)[°\s]*(\d*\.?\d*)['′\s]*(\d*\.?\d*)["″\s]*([NSEW])?$/i;

  const match = str.match(dmsRegex);

  if (!match) return null;

  const hemiPrefix = match[1]?.toUpperCase();
  const degrees = parseFloat(match[2]) || 0;
  const minutes = parseFloat(match[3]) || 0;
  const seconds = parseFloat(match[4]) || 0;
  const hemiSuffix = match[5]?.toUpperCase();

  const hemisphere = hemiPrefix || hemiSuffix;

  let decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600;

  if (degrees < 0 || hemisphere === 'S' || hemisphere === 'W') {
    decimal = -decimal;
  }

  return Number.isFinite(decimal) ? decimal : null;
}

/* -------------------------------------------------------------------------- */
/*                         Coordinate Validation                              */
/* -------------------------------------------------------------------------- */

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/* -------------------------------------------------------------------------- */
/*                         Decimal → DMS Conversion                           */
/* -------------------------------------------------------------------------- */

export function toDMS(decimal: number, isLatitude: boolean): string {
  if (!Number.isFinite(decimal)) return '';

  const absolute = Math.abs(decimal);

  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Number(((minutesFloat - minutes) * 60).toFixed(2));

  const hemisphere = isLatitude ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W';

  return `${degrees}° ${minutes}′ ${seconds}″ ${hemisphere}`;
}
