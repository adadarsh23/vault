import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect CI and platform execution parameters
const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const isWindows = process.platform === 'win32';

// Calibrate concurrency based on available CPU cores and runtime environment
const calculateMaxConcurrency = (): number => {
  const explicitThreads = process.env.VITEST_MAX_THREADS || process.env.VITEST_WORKERS;
  if (explicitThreads) {
    const parsed = Number.parseInt(explicitThreads, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  if (isWindows) {
    return 1;
  }

  const cpuCount = os.cpus().length || 2;
  if (isCI) {
    // In CI environments, limit concurrency to prevent memory exhaustion / OOM kills
    return Math.min(4, Math.max(1, cpuCount - 1));
  }

  // In local environments, balance speed with UI responsiveness
  return Math.min(4, Math.max(1, Math.floor(cpuCount / 2)));
};

const maxConcurrency = calculateMaxConcurrency();

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'pqc-kyber': path.resolve(__dirname, './node_modules/pqc-kyber/pqc_kyber.js'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs'],
  },

  test: {
    // Fork workers avoid native thread-pool teardown access violations on Windows.
    pool: (process.env.VITEST_POOL as 'threads' | 'forks') || 'forks',
    maxWorkers: maxConcurrency,
    isolate: true,

    // Global assertions and APIs (describe, it, expect, vi, beforeEach, etc.)
    globals: true,

    // Default execution environment is node (fastest for crypto/server/services)
    environment: 'node',

    environmentOptions: {
      jsdom: {
        html: '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
        url: 'http://localhost:3000',
      },
    },

    // Global setup scripts for test polyfills, secrets, and cleanup
    setupFiles: ['./tests/setup/vitest.setup.ts', './src/setupTests.ts'],

    // Discovery patterns
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/build/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.git/**',
      '**/.memory/**',
      '**/lighthouse/**',
      '**/logs/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.config.{js,ts,mjs,cjs}',
      'tests/run-tests.ts',
      'tests/helpers/**',
      'tests/setup/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],

    // Lifecycle timeouts: generous for heavy crypto (Argon2 / Kyber / PBKDF2) and server setup
    testTimeout: isCI ? 30_000 : 20_000,
    hookTimeout: 60_000,
    teardownTimeout: 10_000,
    slowTestThreshold: 3_000,

    // Mock lifecycle
    clearMocks: true,
    mockReset: false,
    restoreMocks: true,

    // CI and local reporting configuration (allow CLI flags like --ui, --reporter to take precedence locally)
    ...(isCI
      ? {
          reporters: ['default', 'junit'],
          outputFile: {
            junit: './test-results/junit.xml',
          },
        }
      : {}),
    passWithNoTests: true,

    // Snapshot formatting
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },

    // Assertion config
    chaiConfig: {
      truncateThreshold: 0,
    },

    // In-memory test execution tuning
    css: false,
    server: {
      deps: {
        inline: ['@testing-library/react', '@testing-library/jest-dom', 'framer-motion'],
      },
    },

    // Deterministic test environment variables
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
      TZ: 'UTC',
    },

    // Production V8 coverage configuration
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'text-summary', 'json', 'lcov', 'html', 'clover'],
      reportsDirectory: './coverage',
      clean: true,
      cleanOnRerun: true,
      include: ['src/**/*.{ts,tsx}', 'server/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/__tests__/**',
        '**/__mocks__/**',
        'src/setupTests.ts',
        'tests/**',
        'scripts/**',
        'build/**',
        'node_modules/**',
        'server/scripts/**',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
        autoUpdate: false,
      },
    },
  },
});
