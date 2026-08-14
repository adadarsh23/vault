// import { expect, test } from '@playwright/test';
// import { hasE2ECredentials, loginWithEnvCredentials } from '../helpers/auth';
// import { ensureVisibleWithRecovery } from '../helpers/page-ready';
// import { testIds } from '../helpers/selectors';

// test.describe('protected route', () => {
//   test.skip(
//     ({ browserName }) => browserName !== 'chromium',
//     'Protected-route auth flow is currently unstable in non-Chromium engines.'
//   );

//   test('protected route redirects unauthenticated user to auth flow', async ({ page }) => {
//     await page.goto('/settings');

//     const enterVaultButton = page.getByTestId(testIds.enterVaultButton);
//     const usernameInput = page.getByTestId(testIds.usernameInput);

//     await ensureVisibleWithRecovery(page, enterVaultButton.or(usernameInput).first(), {
//       timeout: 20_000,
//     });
//   });

//   test('authenticated user can reach a protected route when credentials are configured', async ({
//     page,
//   }) => {
//     test.skip(
//       !hasE2ECredentials,
//       'Set E2E_USERNAME, E2E_ACCOUNT_PASSWORD, and E2E_MASTER_KEY to run this test.'
//     );

//     await loginWithEnvCredentials(page);
//     await page.goto('/settings');
//     await expect(page.getByRole('navigation', { name: /Sidebar/i })).toBeVisible({
//       timeout: 10_000,
//     });
//   });
// });


import { expect, test } from '@playwright/test';
import {
  hasE2ECredentials,
  loginWithEnvCredentials,
} from '../helpers/auth';
import { ensureVisibleWithRecovery } from '../helpers/page-ready';
import { testIds } from '../helpers/selectors';

test.describe('protected route', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Protected-route auth flow is currently unstable in non-Chromium engines.'
  );

  test('protected route redirects unauthenticated user to auth flow', async ({
    page,
  }) => {
    await page.goto('/settings');

    const enterVaultButton = page.getByTestId(testIds.enterVaultButton);
    const usernameInput = page.getByTestId(testIds.usernameInput);

    await ensureVisibleWithRecovery(
      page,
      enterVaultButton.or(usernameInput).first(),
      {
        timeout: 20_000,
      }
    );
  });

  test('authenticated user can reach a protected route when credentials are configured', async ({
    page,
  }) => {
    test.skip(
      !hasE2ECredentials,
      'Set E2E_USERNAME, E2E_ACCOUNT_PASSWORD, and E2E_MASTER_KEY to run this test.'
    );

    // Authenticate the user.
    await loginWithEnvCredentials(page);

    // Open the protected route.
    await page.goto('/settings');

    // The protected route must remain accessible after authentication.
    await expect(page).toHaveURL(/\/settings(?:\/)?$/, {
      timeout: 20_000,
    });

    // Verify that the authentication flow did not send us back
    // to the login/authentication screen.
    await expect(
      page.getByTestId(testIds.usernameInput)
    ).toBeHidden({
      timeout: 10_000,
    });
  });
});
