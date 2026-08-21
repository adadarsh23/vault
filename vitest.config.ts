import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Work around intermittent child_process worker exits on Windows by using worker_threads there.
    pool: process.platform === 'win32' ? 'threads' : 'forks',
    environment: 'node',
    globals: true,
    testTimeout: 20000,
    hookTimeout: 60000,
    setupFiles: ['./tests/setup/vitest.setup.ts', './src/setupTests.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['src/**/*.test.tsx', 'jsdom'],
      ['tests/**/*.test.tsx', 'jsdom'],
    ],
    coverage: {
      enabled: false,
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'server/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
