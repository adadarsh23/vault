# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: protected-route.spec.ts >> protected route >> authenticated user can reach a protected route when credentials are configured
- Location: tests\e2e\specs\protected-route.spec.ts:23:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('navigation', { name: /Sidebar/i })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('navigation', { name: /Sidebar/i })

```

```yaml
- main:
  - region "Notifications alt+T"
  - main "Vault Authentication":
    - heading "Encrypted Vault Access" [level=3]
    - paragraph: Sign in with your account password, then decrypt with your vault key.
    - button "Sign In"
    - button "Sign Up"
    - text: Account Identifier (Username)
    - textbox "Account Identifier (Username)":
      - /placeholder: Username
      - text: demo-user
    - text: Account Password
    - textbox "Account Password":
      - /placeholder: Password
    - button "Show account password"
    - button "Generate account password" [disabled]
    - text: Master Key
    - textbox "Master Key"
    - button "Show master key"
    - button "Generate master key" [disabled]
    - button "Unlock" [disabled]
    - button "Return to Home"
```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test';
  2  | import { testIds } from './selectors';
  3  | import { ensureVisibleWithRecovery } from './page-ready';
  4  | 
  5  | const e2eUsername = process.env.E2E_USERNAME || 'demo-user';
  6  | const e2eAccountPassword = process.env.E2E_ACCOUNT_PASSWORD || 'DemoPassword123!';
  7  | const e2eMasterKey = process.env.E2E_MASTER_KEY || 'DemoMasterKey123!';
  8  | 
  9  | // True only when all three credentials were explicitly set by the user
  10 | // (before playwright.config.ts applies its defaults). The config sets
  11 | // E2E_CREDENTIALS_CONFIGURED=1 for exactly this purpose.
  12 | export const hasE2ECredentials = process.env.E2E_CREDENTIALS_CONFIGURED === '1';
  13 | 
  14 | export async function openLoginForm(page: Page) {
  15 |   await page.goto('/');
  16 |   const enterVaultButton = page.getByTestId(testIds.enterVaultButton).first();
  17 |   const usernameInput = page.getByTestId(testIds.usernameInput);
  18 | 
  19 |   // Wait for whichever entry path appears first: direct auth form or landing CTA.
  20 |   await ensureVisibleWithRecovery(page, enterVaultButton.or(usernameInput).first(), {
  21 |     timeout: 30_000,
  22 |   });
  23 | 
  24 |   if (await usernameInput.isVisible()) {
  25 |     return;
  26 |   }
  27 | 
  28 |   await enterVaultButton.click();
  29 |   await expect(page.getByTestId(testIds.usernameInput)).toBeVisible();
  30 | }
  31 | 
  32 | export async function loginWithEnvCredentials(page: Page) {
  33 |   if (!hasE2ECredentials) {
  34 |     return;
  35 |   }
  36 | 
  37 |   await openLoginForm(page);
  38 |   await page.getByTestId(testIds.usernameInput).fill(e2eUsername!);
  39 |   await page.getByTestId(testIds.accountPasswordInput).fill(e2eAccountPassword!);
  40 |   await page.getByTestId(testIds.masterKeyInput).fill(e2eMasterKey!);
  41 |   // Wait for React to process the filled values so isFormValid becomes true
  42 |   // before clicking — otherwise the disabled button ignores the click.
  43 |   await expect(page.getByTestId(testIds.submitButton)).toBeEnabled({ timeout: 10_000 });
  44 |   await page.getByTestId(testIds.submitButton).click();
> 45 |   await expect(page.getByRole('navigation', { name: /Sidebar/i })).toBeVisible({
     |                                                                    ^ Error: expect(locator).toBeVisible() failed
  46 |     timeout: 20_000,
  47 |   });
  48 | }
  49 | 
```