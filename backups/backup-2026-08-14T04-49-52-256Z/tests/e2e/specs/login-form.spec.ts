import { expect, test } from '@playwright/test';
import { openLoginForm } from '../helpers/auth';
import { testIds } from '../helpers/selectors';

test.describe('login form', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Auth flow is currently unstable in non-Chromium engines.'
  );

  test('login form renders required fields', async ({ page }) => {
    await openLoginForm(page);

    await expect(page.getByTestId(testIds.usernameInput)).toBeVisible();
    await expect(page.getByTestId(testIds.accountPasswordInput)).toBeVisible();
    await expect(page.getByTestId(testIds.masterKeyInput)).toBeVisible();
    await expect(page.getByTestId(testIds.submitButton)).toBeDisabled();
  });
});
