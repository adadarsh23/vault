import { expect, test } from '@playwright/test';
import { ensureVisibleWithRecovery } from '../helpers/page-ready';
import { testIds } from '../helpers/selectors';

test.describe('home page', () => {
  test('homepage loads and shows entry actions', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Vault/i);

    const enterVaultButton = page.getByTestId(testIds.enterVaultButton);
    const usernameInput = page.getByTestId(testIds.usernameInput);

    await ensureVisibleWithRecovery(page, enterVaultButton.or(usernameInput).first(), {
      timeout: 20_000,
    });

    if (await enterVaultButton.isVisible()) {
      await expect(page.getByTestId(testIds.getStartedButton)).toBeVisible();
    }
  });
});
