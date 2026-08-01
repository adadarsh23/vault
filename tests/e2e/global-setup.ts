import type { FullConfig } from '@playwright/test'

async function globalSetup(_config: FullConfig) {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
}

export default globalSetup
