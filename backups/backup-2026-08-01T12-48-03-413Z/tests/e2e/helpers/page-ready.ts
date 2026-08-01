import { expect, type Locator, type Page } from '@playwright/test';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RECOVERY_ATTEMPTS = 4;

export async function ensureVisibleWithRecovery(
  page: Page,
  target: Locator,
  options?: { timeout?: number; pathHint?: string }
) {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const loadingLabel = page.getByText(/loading vault\.\.\./i);

  for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
    try {
      await expect(target).toBeVisible({ timeout });
      return;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RECOVERY_ATTEMPTS - 1;
      if (isLastAttempt) {
        throw error;
      }

      const loadingVisible = await loadingLabel.isVisible().catch(() => false);
      if (!loadingVisible) {
        throw error;
      }

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    }
  }
}
