import { expect, type Page } from '@playwright/test'
import { testIds } from './selectors'
import { ensureVisibleWithRecovery } from './page-ready'

const e2eUsername = process.env.E2E_USERNAME || 'demo-user'
const e2eAccountPassword = process.env.E2E_ACCOUNT_PASSWORD || 'DemoPassword123!'
const e2eMasterKey = process.env.E2E_MASTER_KEY || 'DemoMasterKey123!'

export const hasE2ECredentials = Boolean(
  e2eUsername && e2eAccountPassword && e2eMasterKey,
)

export async function openLoginForm(page: Page) {
  await page.goto('/')
  const enterVaultButton = page.getByTestId(testIds.enterVaultButton).first()
  const usernameInput = page.getByTestId(testIds.usernameInput)

  // Wait for whichever entry path appears first: direct auth form or landing CTA.
  await ensureVisibleWithRecovery(page, enterVaultButton.or(usernameInput).first(), {
    timeout: 30_000,
  })

  if (await usernameInput.isVisible()) {
    return
  }

  await enterVaultButton.click()
  await expect(page.getByTestId(testIds.usernameInput)).toBeVisible()
}

export async function loginWithEnvCredentials(page: Page) {
  if (!hasE2ECredentials) {
    return
  }

  await openLoginForm(page)
  await page.getByTestId(testIds.usernameInput).fill(e2eUsername!)
  await page.getByTestId(testIds.accountPasswordInput).fill(e2eAccountPassword!)
  await page.getByTestId(testIds.masterKeyInput).fill(e2eMasterKey!)
  await page.getByTestId(testIds.submitButton).click()
}
