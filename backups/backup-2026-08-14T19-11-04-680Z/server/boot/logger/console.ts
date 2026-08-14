import process from 'process';
import { ansi, colorize } from './colors.ts';

export const log = {
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
};

export const padRight = (value: string, length: number) =>
  value.length >= length ? value : `${value}${' '.repeat(length - value.length)}`;

export const truncate = (value: string, max = 140) =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

const getTerminalWidth = () => Math.max(process.stdout.columns || 100, 60);
const getInnerWidth = () => Math.max(getTerminalWidth() - 6, 32);

const fit = (value: string, width: number) => {
  const plain = value;
  if (plain.length <= width) return `${plain}${' '.repeat(width - plain.length)}`;
  return `${plain.slice(0, Math.max(width - 3, 1))}...`;
};

export const kv = (key: string, value: string) =>
  `  | ${fit(`${padRight(key, 13)} : ${value}`, getInnerWidth())} |`;

export const section = (title: string) => {
  const inner = getInnerWidth();
  const label = ` ${title.toUpperCase()} `;
  const dashes = '-'.repeat(Math.max(inner - label.length, 0));
  return colorize(`  +${label}${dashes}+`, `${ansi.bold}${ansi.cyan}`);
};

export const sectionEnd = () => colorize(`  +${'-'.repeat(getInnerWidth())}+`, ansi.gray);

export const hr = () => {
  return colorize(`  +${'='.repeat(getInnerWidth())}+`, ansi.gray);
};

export const row = (value: string) => `  | ${fit(value, getInnerWidth())} |`;

export const titleBox = (title: string, subtitle?: string) => {
  const inner = getInnerWidth();
  const top = `  +${'='.repeat(inner)}+`;
  const t = row(title);
  const s = subtitle ? row(subtitle) : null;
  const bottom = `  +${'='.repeat(inner)}+`;
  return [top, t, ...(s ? [s] : []), bottom];
};

export const badge = (label: 'UP' | 'WARN' | 'DOWN' | 'INFO', message: string) => {
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

export const meter = (label: string, percent: number, width = 24) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const bar = `${'#'.repeat(filled)}${'-'.repeat(Math.max(width - filled, 0))}`;
  return row(`${padRight(label, 13)} : [${bar}] ${clamped.toFixed(1)}%`);
};
