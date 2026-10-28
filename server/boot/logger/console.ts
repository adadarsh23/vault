import process from 'process';
import { ansi, colorize } from './colors.ts';

// Regular expression matching ANSI escape sequences
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Strips ANSI escape sequences from a string to compute its visible display width.
 */
export const stripAnsi = (str: string): string =>
  typeof str === 'string' ? str.replace(ANSI_REGEX, '') : '';

/**
 * Calculates the visible length of a string in terminal columns.
 */
export const visibleLength = (str: string): number => stripAnsi(str).length;

export const log = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
  debug: (msg: string) => console.debug(msg),
};

export const padRight = (value: string, length: number): string => {
  const vLen = visibleLength(value);
  return vLen >= length ? value : `${value}${' '.repeat(length - vLen)}`;
};

export const truncate = (value: string, max = 140): string => {
  const vLen = visibleLength(value);
  if (vLen <= max) return value;
  const plain = stripAnsi(value);
  return `${plain.slice(0, Math.max(max - 3, 1))}...`;
};

export const getTerminalWidth = (): number => {
  const cols = process.stdout?.columns;
  if (!cols || !Number.isFinite(cols)) return 100;
  return Math.min(Math.max(cols, 60), 120);
};

export const getInnerWidth = (): number => Math.max(getTerminalWidth() - 6, 32);

export const fit = (value: string, width: number): string => {
  const vLen = visibleLength(value);
  if (vLen <= width) return `${value}${' '.repeat(width - vLen)}`;
  const plain = stripAnsi(value);
  return `${plain.slice(0, Math.max(width - 3, 1))}...`;
};

export const kv = (key: string, value: string): string =>
  `  | ${fit(`${padRight(key, 13)} : ${value}`, getInnerWidth())} |`;

export const section = (title: string): string => {
  const inner = getInnerWidth();
  const label = ` ${title.toUpperCase()} `;
  const dashes = '-'.repeat(Math.max(inner - label.length, 0));
  return colorize(`  +${label}${dashes}+`, `${ansi.bold}${ansi.cyan}`);
};

export const sectionEnd = (): string => colorize(`  +${'-'.repeat(getInnerWidth())}+`, ansi.gray);

export const hr = (): string => colorize(`  +${'='.repeat(getInnerWidth())}+`, ansi.gray);

export const row = (value: string): string => `  | ${fit(value, getInnerWidth())} |`;

export const titleBox = (title: string, subtitle?: string): string[] => {
  const inner = getInnerWidth();
  const top = `  +${'='.repeat(inner)}+`;
  const t = row(title);
  const s = subtitle ? row(subtitle) : null;
  const bottom = `  +${'='.repeat(inner)}+`;
  return [top, t, ...(s ? [s] : []), bottom];
};

export const badge = (label: 'UP' | 'WARN' | 'DOWN' | 'INFO', message: string): string => {
  const color =
    label === 'UP'
      ? ansi.green
      : label === 'WARN'
        ? ansi.yellow
        : label === 'DOWN'
          ? ansi.magenta
          : ansi.cyan;
  return row(`${colorize(`[${label}]`, color)} ${message}`);
};

export const meter = (label: string, percent: number, width = 24): string => {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const filled = Math.round((clamped / 100) * width);
  const bar = `${'#'.repeat(filled)}${'-'.repeat(Math.max(width - filled, 0))}`;
  return row(`${padRight(label, 13)} : [${bar}] ${clamped.toFixed(1)}%`);
};
