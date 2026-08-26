import process from 'process';

export const ansi = Object.freeze({
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
});

export const isProd = process.env.NODE_ENV === 'production';

const noColor =
  process.env.NO_COLOR === 'true' || process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'yes';

export const supportsAnimatedTerminal =
  Boolean(process.stdout.isTTY) && process.env.CI !== 'true' && !noColor;

export const colorize = (value: string, color: string) =>
  supportsAnimatedTerminal ? `${color}${value}${ansi.reset}` : value;
