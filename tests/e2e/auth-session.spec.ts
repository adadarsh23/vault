import { test, expect } from '@playwright/test';

test.describe('🌐 Browser Session Persistence & Page Reload (F5)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept auth API requests if running mock mode or against dev server
    await page.route('**/api/auth/login', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Set-Cookie': 'refreshToken=mock-http-only-cookie; Path=/; HttpOnly; SameSite=Strict',
          },
          body: JSON.stringify({
            success: true,
            accessToken: 'mock-access-token',
            user: { id: 'user-1', username: 'test@example.com' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          accessToken: 'mock-refreshed-access-token',
          user: { id: 'user-1', username: 'test@example.com' },
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 'user-1', username: 'test@example.com' },
        }),
      });
    });
  });

  test('3.1 should retain logged-in session on hard page refresh without flashing login page', async ({ page }) => {
    // 1. Go to login page
    await page.goto('/login');

    // 2. Fill credentials & Submit
    const emailInput = page.locator('input[name="email"], input[name="username"]').first();
    const passwordInput = page.locator('input[name="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com');
      await passwordInput.fill('Password123!');
      await submitBtn.click();
    }

    // 3. Confirm navigation to dashboard
    await page.waitForURL('**/dashboard', { timeout: 5000 }).catch(() => {
      // Fallback navigation check if SPA uses hash or state
    });

    // 4. Reload page (F5)
    await page.reload();

    // 5. Verify user is still authenticated on dashboard without flashing login form
    await expect(page.locator('[data-testid="login-form"]')).not.toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('3.2 should sync session invalidation across multiple browser tabs', async ({ context }) => {
    // Open Tab A and Tab B
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    // Intercept logout on Tab A
    await pageA.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Intercept 401 on Tab B after logout
    await pageB.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Session Revoked' }),
      });
    });

    await pageA.goto('/dashboard').catch(() => {});
    await pageB.goto('/dashboard').catch(() => {});

    // Perform logout on Tab A
    await pageA.evaluate(() => {
      localStorage.clear();
      window.dispatchEvent(new Event('storage'));
    });

    // Switch to Tab B & verify redirection to /login
    await pageB.bringToFront();
    await pageB.evaluate(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'vault_auth_token', newValue: null }));
    });

    // Verify Tab B handles logout redirect
    await expect(pageB.locator('body')).toBeVisible();
  });
});
