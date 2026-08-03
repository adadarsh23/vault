export const INCLUDED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.svg',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.sql',
  '.graphql',
  '.gql',
]);

export const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vite',
  '.cache',
  '.parcel-cache',
  '.pytest_cache',
  '.memory',
  '.venv',
  'venv',
  'node_modules',
  'vendor',
  'build',
  'dist',
  'out',
  'coverage',
  'playwright-report',
  'test-results',
  'backups',
  'logs',
  'tmp',
  'temp',
]);
export const EXCLUDED_BASENAMES = new Set([
  'index.html',
  'stats.html',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.tsbuildinfo',
]);

export const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024;
export const DEFAULT_HISTORY_LIMIT = 20;
export const TOP_LIMIT = 30;

export const IMPORT_LINE_RE = /^\s*import(?:\s+type)?\s+.+$/gm;
export const EXPORT_LINE_RE = /^\s*export(?:\s+type)?\s+.+$/gm;
export const FUNCTION_RE =
  /\b(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:(?:React\.)?(?:memo|forwardRef)\s*\(\s*)?(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)|\b(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)|\b(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
export const TODO_RE = /\b(TODO|FIXME|NOTE|HACK|BUG|OPTIMIZE|REFACTOR)\b/gi;
export const COMMENT_LINE_RE = /^\s*(\/\/|\/\*|\*|\*\/)/;
export const WHITESPACE_LINE_RE = /^\s*$/;
