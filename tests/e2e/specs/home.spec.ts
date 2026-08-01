import { expect, test } from '@playwright/test'
import { ensureVisibleWithRecovery } from '../helpers/page-ready'
import { testIds } from '../helpers/selectors'

test.describe('home page', () => {
  test('homepage loads and shows entry actions', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Vault/i)

    const enterVaultButton = page.getByTestId(testIds.enterVaultButton)
    const usernameInput = page.getByTestId(testIds.usernameInput)

    // Avoid locator.or() here to keep behavior consistent across engines.
    // We wait for either entry path (button or username field) to become visible.
    await Promise.any([
      ensureVisibleWithRecovery(page, enterVaultButton, { timeout: 20_000 }),
      ensureVisibleWithRecovery(page, usernameInput, { timeout: 20_000 }),
    ])

    if (await enterVaultButton.isVisible()) {
      await expect(page.getByTestId(testIds.getStartedButton)).toBeVisible()
    }
  })
})
