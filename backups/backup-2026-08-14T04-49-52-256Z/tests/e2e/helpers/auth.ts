// import { expect, type Page } from '@playwright/test';
// import { testIds } from './selectors';
// import { ensureVisibleWithRecovery } from './page-ready';

// const e2eUsername = process.env.E2E_USERNAME || 'demo-user';
// const e2eAccountPassword = process.env.E2E_ACCOUNT_PASSWORD || 'DemoPassword123!';
// const e2eMasterKey = process.env.E2E_MASTER_KEY || 'DemoMasterKey123!';

// // True only when all three credentials were explicitly set by the user
// // (before playwright.config.ts applies its defaults). The config sets
// // E2E_CREDENTIALS_CONFIGURED=1 for exactly this purpose.
// export const hasE2ECredentials = process.env.E2E_CREDENTIALS_CONFIGURED === '1';

// export async function openLoginForm(page: Page) {
//   await page.goto('/');
//   const enterVaultButton = page.getByTestId(testIds.enterVaultButton).first();
//   const usernameInput = page.getByTestId(testIds.usernameInput);

//   // Wait for whichever entry path appears first: direct auth form or landing CTA.
//   await ensureVisibleWithRecovery(page, enterVaultButton.or(usernameInput).first(), {
//     timeout: 30_000,
//   });

//   if (await usernameInput.isVisible()) {
//     return;
//   }

//   await enterVaultButton.click();
//   await expect(page.getByTestId(testIds.usernameInput)).toBeVisible();
// }

// export async function loginWithEnvCredentials(page: Page) {
//   if (!hasE2ECredentials) {
//     return;
//   }

//   await openLoginForm(page);
//   await page.getByTestId(testIds.usernameInput).fill(e2eUsername!);
//   await page.getByTestId(testIds.accountPasswordInput).fill(e2eAccountPassword!);
//   await page.getByTestId(testIds.masterKeyInput).fill(e2eMasterKey!);
//   // Wait for React to process the filled values so isFormValid becomes true
//   // before clicking — otherwise the disabled button ignores the click.
//   await expect(page.getByTestId(testIds.submitButton)).toBeEnabled({ timeout: 10_000 });
//   await page.getByTestId(testIds.submitButton).click();
//   await expect(page.getByRole('navigation', { name: /Sidebar/i })).toBeVisible({
//     timeout: 20_000,
//   });
// }




import { expect, type Page } from '@playwright/test';
import { testIds } from './selectors';
import { ensureVisibleWithRecovery } from './page-ready';

const e2eUsername = process.env.E2E_USERNAME || 'demo-user';
const e2eAccountPassword =
  process.env.E2E_ACCOUNT_PASSWORD || 'DemoPassword123!';
const e2eMasterKey =
  process.env.E2E_MASTER_KEY || 'DemoMasterKey123!';

// True only when all three credentials were explicitly configured.
export const hasE2ECredentials =
  process.env.E2E_CREDENTIALS_CONFIGURED === '1';

export async function openLoginForm(page: Page) {
  await page.goto('/');

  const enterVaultButton = page
    .getByTestId(testIds.enterVaultButton)
    .first();

  const usernameInput = page.getByTestId(testIds.usernameInput);

  await ensureVisibleWithRecovery(
    page,
    enterVaultButton.or(usernameInput).first(),
    {
      timeout: 30_000,
    }
  );

  // Login form is already visible.
  if (await usernameInput.isVisible()) {
    return;
  }

  await enterVaultButton.click();

  await expect(usernameInput).toBeVisible({
    timeout: 15_000,
  });
}

export async function loginWithEnvCredentials(page: Page) {
  if (!hasE2ECredentials) {
    return;
  }

  await openLoginForm(page);

  const usernameInput = page.getByTestId(testIds.usernameInput);
  const accountPasswordInput = page.getByTestId(
    testIds.accountPasswordInput
  );
  const masterKeyInput = page.getByTestId(testIds.masterKeyInput);
  const submitButton = page.getByTestId(testIds.submitButton);

  await usernameInput.fill(e2eUsername);
  await accountPasswordInput.fill(e2eAccountPassword);
  await masterKeyInput.fill(e2eMasterKey);

  await expect(submitButton).toBeEnabled({
    timeout: 10_000,
  });

  await submitButton.click();

  // Wait until the authentication flow finishes.
  await expect(usernameInput).toBeHidden({
    timeout: 20_000,
  });
}
