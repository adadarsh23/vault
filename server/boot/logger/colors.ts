import process from 'process';

export const ansi = Object.freeze({
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
});

/**
 * Checks whether the runtime environment is configured as production.
 * Evaluated dynamically to handle runtime environment updates safely.
 */
export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Backward-compatible boolean flag for production environment.
 */
export const isProd = process.env.NODE_ENV === 'production';

/**
 * Checks whether NO_COLOR is explicitly set according to https://no-color.org.
 */
export const isNoColorSet = (): boolean =>
  process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';

/**
 * Checks whether colorized terminal output is supported or forced.
 */
export const supportsColor = (): boolean => {
  if (isNoColorSet()) return false;
  if (process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true') return true;
  return Boolean(process.stdout?.isTTY) && process.env.CI !== 'true';
};

/**
 * Checks whether the terminal supports cursor positioning, carriage return animations, and interactive rewrites.
 */
export const checkAnimatedTerminal = (): boolean => {
  if (isNoColorSet()) return false;
  if (process.env.CI === 'true') return false;
  return Boolean(process.stdout?.isTTY);
};

export const supportsAnimatedTerminal = checkAnimatedTerminal();

/**
 * Wraps text with ANSI color codes when terminal output supports colors.
 */
export const colorize = (value: string, color: string): string =>
  supportsColor() ? `${color}${value}${ansi.reset}` : value;
