import { existsSync } from 'node:fs'
import { chromium, defineConfig, devices, firefox, webkit } from '@playwright/test'

process.env.NO_PROXY = process.env.NO_PROXY ?? '127.0.0.1,localhost'
process.env.no_proxy = process.env.no_proxy ?? '127.0.0.1,localhost'

const e2ePort = process.env.PLAYWRIGHT_PORT ?? '4100'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${e2ePort}`
const reuseServer = !process.env.CI
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'
const isCI = !!process.env.CI

const browserProjects = [
  {
    name: 'chromium',
    browser: chromium,
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'firefox',
    browser: firefox,
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    browser: webkit,
    use: { ...devices['Desktop Safari'] },
  },
]

const installedBrowserProjects = browserProjects
  .filter(({ browser }) => isCI || existsSync(browser.executablePath()))
  .map(({ name, use }) => ({ name, use }))

const activeProjects = installedBrowserProjects.length > 0
  ? installedBrowserProjects
  : browserProjects.map(({ name, use }) => ({ name, use }))

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : 1,
  reporter: [['html', { open: 'never' }], ['list']],
  outputDir: 'test-results',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: activeProjects,
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'tsx server.ts',
          url: baseURL,
          reuseExistingServer: reuseServer,
          timeout: 300_000,
          env: {
            PORT: e2ePort,
            NODE_ENV: 'test',
            REQUIRE_ES256_IN_PRODUCTION: 'false',
            JWT_SECRET: 'playwright-e2e-jwt-secret-32chars-minimum!!',
            REFRESH_TOKEN_SECRET:
              'playwright-e2e-refresh-secret-32chars-min!',
            VAULT_ENCRYPTION_KEY:
              '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            AUTH_PEPPER: 'playwright-e2e-auth-pepper',
            ENVELOPE_KEK:
              'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            CLIENT_URL: baseURL,
            PUBLIC_URL: baseURL,
            VITE_APP_PUBLIC_URL: baseURL,
            TRUST_PROXY: '1',
            SKIP_MONGO_CONNECT: '1',
            KEEP_ALIVE_ENABLED: '0',
            ENABLE_OVERLOAD_PROTECTION: '0',
            ALLOW_LOCAL_CORS_ORIGINS: '1',
            EVENT_LOOP_LAG_THRESHOLD_MS: '5000',
          },
        },
      }),
  globalSetup: './tests/e2e/global-setup.ts',
})
