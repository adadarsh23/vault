import { test } from '@playwright/test'
import { ensureVisibleWithRecovery } from '../helpers/page-ready'

test.describe('public navigation', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Public navigation smoke is currently unstable in non-Chromium engines.',
  )

  test('public navigation routes work without auth', async ({ page }) => {
    await page.goto('/legal')
    await ensureVisibleWithRecovery(page, page.getByRole('heading', { name: /Legal &/i }), {
      timeout: 20_000,
    })

    await page.goto('/contact')
    await ensureVisibleWithRecovery(page, page.getByRole('heading', { name: /Get in Touch/i }), {
      timeout: 20_000,
    })
  })
})
