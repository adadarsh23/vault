/// <reference types="vite/client" />

/**
 * Utility types for typed environment variables in Vite.
 */
type EnvBoolean = 'true' | 'false';
type EnvNumber = `${number}`;

/**
 * Type declarations for all client-accessible environment variables (`import.meta.env.*`).
 */
interface ImportMetaEnv {
  // --------------------------------------------------------------------------
  // Application URLs, Host & Network Routing
  // --------------------------------------------------------------------------
  /** Canonical / Public URL of the web application */
  readonly VITE_APP_PUBLIC_URL?: string;
  /** DNS prefetch host URL for preloading head hints */
  readonly VITE_DNS_PREFETCH_HOST?: string;
  /** Primary backend API base URL */
  readonly VITE_API_BASE_URL?: string;
  /** Development API base URL */
  readonly VITE_DEV_API_BASE_URL?: string;
  /** Default fallback API base URL */
  readonly VITE_DEFAULT_API_BASE_URL?: string;
  /** Content Security Policy (CSP) connect-src allowed origins */
  readonly VITE_CSP_CONNECT_SRC?: string;

  // --------------------------------------------------------------------------
  // Authentication & Security Challenges
  // --------------------------------------------------------------------------
  /** Google reCAPTCHA v2 site key (public) */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  /** Skip captcha challenge in development/testing mode ('true' | 'false') */
  readonly VITE_SKIP_CAPTCHA?: EnvBoolean;

  // --------------------------------------------------------------------------
  // Storage & Payload Limits
  // --------------------------------------------------------------------------
  /** Maximum client-side file upload size limit in megabytes (MB) */
  readonly VITE_MAX_FILE_SIZE_MB?: EnvNumber;

  // --------------------------------------------------------------------------
  // Application Release Metadata
  // --------------------------------------------------------------------------
  /** Current frontend application release tag or semantic version */
  readonly VITE_APP_RELEASE?: string;

  // --------------------------------------------------------------------------
  // Observability: Sentry Error Tracking & Session Replay
  // --------------------------------------------------------------------------
  /** Sentry Data Source Name (DSN) for client error reporting */
  readonly VITE_SENTRY_DSN?: string;
  /** Sentry error monitoring master switch ('true' | 'false') */
  readonly VITE_SENTRY_ENABLED?: EnvBoolean;
  /** Sentry environment name (e.g. 'production', 'staging', 'development') */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Sentry release version identifier */
  readonly VITE_SENTRY_RELEASE?: string;
  /** Enable Sentry tracking on localhost development environments ('true' | 'false') */
  readonly VITE_SENTRY_ENABLE_LOCALHOST?: EnvBoolean;
  /** Enable Sentry Session Replay recording ('true' | 'false') */
  readonly VITE_SENTRY_REPLAY_ENABLED?: EnvBoolean;
  /** Sentry performance traces sampling rate (between 0.0 and 1.0) */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: EnvNumber;
  /** Sentry Session Replay regular session sampling rate (between 0.0 and 1.0) */
  readonly VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE?: EnvNumber;
  /** Sentry Session Replay on-error sampling rate (between 0.0 and 1.0) */
  readonly VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE?: EnvNumber;
  /** Enable Sentry source maps generation ('true' | 'false') */
  readonly VITE_SENTRY_SOURCEMAPS?: EnvBoolean;

  // --------------------------------------------------------------------------
  // Observability: LogRocket & Telemetry
  // --------------------------------------------------------------------------
  /** LogRocket Frontend Application ID */
  readonly VITE_LOGROCKET_APP_ID?: string;
  /** LogRocket recording master switch ('true' | 'false') */
  readonly VITE_LOGROCKET_ENABLED?: EnvBoolean;
  /** Allow LogRocket recording on localhost ('true' | 'false') */
  readonly VITE_LOGROCKET_ALLOW_LOCALHOST?: EnvBoolean;
  /** Default telemetry consent preference ('true' | 'false') */
  readonly VITE_TELEMETRY_CONSENT?: EnvBoolean;
  /** Google Analytics 4 Measurement ID (e.g. 'G-XXXXXXXXXX') */
  readonly VITE_GA_ID?: string;

  // --------------------------------------------------------------------------
  // Vite Dev Server, Preview & Build Options
  // --------------------------------------------------------------------------
  /** Development server host binding (e.g. '0.0.0.0' or 'localhost') */
  readonly VITE_DEV_HOST?: string;
  /** Development server port number */
  readonly VITE_DEV_PORT?: EnvNumber;
  /** Preview server host binding */
  readonly VITE_PREVIEW_HOST?: string;
  /** Preview server port number */
  readonly VITE_PREVIEW_PORT?: EnvNumber;
  /** Enforce strict port binding for dev/preview server */
  readonly VITE_STRICT_PORT?: EnvBoolean;
  /** Automatically open browser on dev server start */
  readonly VITE_OPEN?: EnvBoolean;
  /** Warning limit threshold for bundle chunk sizes in kB */
  readonly VITE_CHUNK_SIZE_WARNING_LIMIT?: EnvNumber;
  /** Sourcemap generation option */
  readonly VITE_BUILD_SOURCEMAP?: EnvBoolean | 'inline' | 'hidden';
  /** Bundler minification engine */
  readonly VITE_BUILD_MINIFY?: 'oxc' | 'terser' | 'esbuild' | 'false';
}

/**
 * Global compile-time constants injected via Vite `define`.
 */
declare const __APP_ENV__: string;
declare const __APP_VERSION__: string;
declare const __SENTRY_RELEASE__: string;
declare const __BUILD_TIME__: string;

/**
 * Global Window interface extensions for Vite preload shims.
 */
interface Window {
  __VITE_PRELOAD__?: (loader: unknown, deps?: unknown) => Promise<unknown>;
  __vitePreload?: (loader: unknown, deps?: unknown) => Promise<unknown>;
}

/**
 * Ambient type declarations for JavaScript script modules used in tests.
 * These modules are not typed natively – declarations provide TypeScript coverage.
 */
declare module '*/scripts/backup.mjs' {
  export const formatBytes: (bytes: number) => string;
  export const sanitizeBackupName: (name: string) => string;
  export const getFormattedDate: (date?: Date | number | string) => {
    localDateStr: string;
    folderStamp: string;
    isoStr: string;
    timestamp: number;
  };
  export const computeFileSha256: (filePath: string) => string;
  export const renameWithRetrySync: (
    sourcePath: string,
    targetPath: string,
    maxRetries?: number,
    retryDelayMs?: number,
  ) => void;
  export const isExcludedItem: (name: string) => boolean;
  export const shouldExcludePath: (
    targetPath: string,
    rootDir: string,
    backupsRootDir: string,
  ) => boolean;
  export const calculateDirectoryStats: (dir: string) => {
    fileCount: number;
    dirCount: number;
    totalSize: number;
  };
  export const collectProjectFiles: (
    srcDir: string,
    backupsDir?: string,
  ) => {
    files: Array<{ fullPath: string; relativePath: string; size: number }>;
    totalBytes: number;
  };
  export const createBackup: (options: any) => any;
  export const verifyBackup: (
    backupPath: string,
    options?: any,
  ) => { valid: boolean; errors: string[] };
  export const restoreBackup: (options: any) => any;
  export const pruneOldBackups: (
    backupsRoot: string,
    maxToKeep: number,
    options?: any,
  ) => { pruned: string[]; kept: string[] };
  export const listBackups: (backupsRoot: string) => any[];
  export const parseCliArgs: (argv: string[]) => any;
  export const loadBackupsIndex: (backupsRoot: string) => any;
  export const updateBackupsIndex: (backupsRoot: string, entry: any) => any;
  export const rebuildBackupsIndex: (backupsRoot: string) => any;
  export const MANIFEST_FILENAME: string;
  export const INDEX_FILENAME: string;
}

declare module '*/scripts/lighthouse-runner.mjs' {
  export const DEFAULT_URL: string;
  export const DEFAULT_OUTPUT_PATH: string;
  export const DEFAULT_SPLIT_REPORT_DIR: string;
  export const DEFAULT_CATEGORIES: string;
  export const DEFAULT_CHROME_FLAGS: string;
  export const FALLBACK_CHROME_FLAGS: string;
  export const parseArgs: (argv?: string[]) => any;
  export const splitChromeFlags: (flags?: any) => string[];
  export const isSafeWorkspaceChild: (targetPath?: any, rootDir?: string) => boolean;
  export const escapeHtml: (str?: any) => string;
  export const stripMarkdownLinks: (str?: any) => string;
  export const slugify: (str?: any) => string;
  export const scorePercent: (score: number | null | undefined) => number | null;
  export const scoreClass: (score: number | null | undefined) => string;
  export const scoreColor: (score: number | null | undefined) => string;
  export const scoreLabel: (audit?: any) => string;
  export const formatDuration: (ms: number) => string;
  export const formatBytes: (bytes: number) => string;
  export const extractCoreWebVitals: (report: any) => any;
  export const extractOpportunities: (report: any) => any[];
  export const evaluateAssertions: (
    report: any,
    assertions?: any,
  ) => {
    passed: boolean;
    failures: string[];
    passes: string[];
    assertionsCount: number;
  };
  export const renderPage: (options: { title: string; body: string; subTitle?: string }) => string;
  export const renderAuditTable: (audits: any[]) => string;
  export const renderOpportunitiesTable: (opps: any[]) => string;
  export const renderMetricsGrid: (metrics: any[]) => string;
  export const writeSplitReports: (
    options: any,
    report: any,
    workspaceRoot?: string,
  ) => string | null;
  export const resolveChromeExecutablePath: (
    customCandidates?: string[],
    env?: any,
    platform?: string,
  ) => string;
  export const removeTempDirectorySafely: (
    dirPath?: any,
    retries?: number,
    delayMs?: number,
  ) => void;
  export const cleanupStaleLighthouseTempDirectories: (tempRoot?: string) => void;
  export const resolveNpxRunner: () => {
    command: string;
    prefixArgs: string[];
    options: { shell: boolean };
  };
  export const ensureProductionBuild: (
    workspaceRoot?: string,
    forceRebuild?: boolean,
  ) => boolean | Promise<boolean>;
  export const sanitizeNpmConfigEnv: (env?: any) => any;
  export const getSanitizedProcessEnv: (extraEnv?: Record<string, string>) => Record<string, any>;
}

declare module '*/scripts/open-report.mjs' {
  export const KNOWN_REPORT_HINTS: Record<string, string>;
  export const isCiOrHeadless: (env?: any, options?: any) => boolean;
  export const isWsl: () => boolean;
  export const resolveTarget: (targetPath: string, cwd?: string) => any;
  export const getReportHint: (targetPath: string, cwd?: string) => string | null;
  export const getOpenCommand: (
    target: string,
    platform?: any,
    isWslEnvironment?: boolean,
    browser?: string | null,
  ) => {
    cmd: string;
    args: string[];
    windowsVerbatimArguments?: boolean;
    fallbackCmd?: string;
    fallbackArgs?: string[];
  };
  export const parseCliArgs: (argv?: string[]) => any;
  export const openReport: (targetPath: string, options?: any) => any;
  export const showHelp: () => void;
}
