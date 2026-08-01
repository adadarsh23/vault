# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: home.spec.ts >> home page >> homepage loads and shows entry actions
- Location: tests\e2e\specs\home.spec.ts:6:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('enter-vault-button').or(getByTestId('auth-username-input')).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByTestId('enter-vault-button').or(getByTestId('auth-username-input')).first()
  - Page crashed

```

```yaml
- main:
  - region "Notifications alt+T"
  - status:
    - paragraph: Loading vault...
```

# Test source

```ts
  1  | import { expect, type Locator, type Page } from '@playwright/test'
  2  | 
  3  | const DEFAULT_TIMEOUT_MS = 20_000
  4  | const MAX_RECOVERY_ATTEMPTS = 4
  5  | 
  6  | export async function ensureVisibleWithRecovery(
  7  |   page: Page,
  8  |   target: Locator,
  9  |   options?: { timeout?: number; pathHint?: string },
  10 | ) {
  11 |   const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS
  12 |   const loadingLabel = page.getByText(/loading vault\.\.\./i)
  13 | 
  14 |   for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
  15 |     try {
> 16 |       await expect(target).toBeVisible({ timeout })
     |                            ^ Error: expect(locator).toBeVisible() failed
  17 |       return
  18 |     } catch (error) {
  19 |       const isLastAttempt = attempt === MAX_RECOVERY_ATTEMPTS - 1
  20 |       if (isLastAttempt) {
  21 |         throw error
  22 |       }
  23 | 
  24 |       const loadingVisible = await loadingLabel.isVisible().catch(() => false)
  25 |       if (!loadingVisible) {
  26 |         throw error
  27 |       }
  28 | 
  29 |       await page.reload({ waitUntil: 'domcontentloaded' })
  30 |       await page.waitForTimeout(1000)
  31 |     }
  32 |   }
  33 | }
  34 | 
```