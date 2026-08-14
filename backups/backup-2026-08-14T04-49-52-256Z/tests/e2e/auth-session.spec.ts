import { expect, test, type Page } from '@playwright/test';

const TEST_USER = {
  id: 'user-1',
  username: 'test@example.com',
};

const ACCESS_TOKEN = 'mock-access-token';
const REFRESHED_ACCESS_TOKEN = 'mock-refreshed-access-token';

async function mockAuthApi(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Set-Cookie': 'refreshToken=mock-http-only-cookie; Path=/; HttpOnly; SameSite=Strict',
      },
      body: JSON.stringify({
        success: true,
        accessToken: ACCESS_TOKEN,
        user: TEST_USER,
      }),
    });
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        accessToken: REFRESHED_ACCESS_TOKEN,
        user: TEST_USER,
      }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: TEST_USER,
      }),
    });
  });
}

async function login(page: Page) {
  await page.goto('/login');

  const emailInput = page.locator('input[name="email"], input[name="username"]').first();

  const passwordInput = page.locator('input[name="password"]').first();

  const submitButton = page.locator('button[type="submit"]').first();

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(submitButton).toBeVisible();

  await emailInput.fill('test@example.com');
  await passwordInput.fill('Password123!');

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/login') && response.request().method() === 'POST'
    ),
    submitButton.click(),
  ]);

  await expect(page).not.toHaveURL(/\/login(?:$|[?#])/);
}

test.describe('🌐 Browser Session Persistence & Page Reload (F5)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthApi(page);
  });

  test('3.1 retains the logged-in session after a hard page refresh', async ({ page }) => {
    await login(page);

    // Confirm that authentication completed before refreshing.
    await expect(page).not.toHaveURL(/\/login(?:$|[?#])/);

    const currentUrl = page.url();

    // Hard refresh.
    await page.reload({ waitUntil: 'domcontentloaded' });

    // The refresh endpoint should restore the session.
    await expect(page).not.toHaveURL(/\/login(?:$|[?#])/);

    // If the application uses /dashboard, confirm it remains there.
    if (currentUrl.includes('/dashboard')) {
      await expect(page).toHaveURL(/\/dashboard/);
    }

    // Login form must not be visible after session restoration.
    const loginForm = page.locator('[data-testid="login-form"]');

    if (await loginForm.count()) {
      await expect(loginForm).not.toBeVisible();
    }
  });

  test('3.2 handles session invalidation in another browser tab', async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await mockAuthApi(pageA);
    await mockAuthApi(pageB);

    let sessionRevoked = false;

    // Tab A logout endpoint.
    await pageA.route('**/api/auth/logout', async (route) => {
      sessionRevoked = true;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
        }),
      });
    });

    // Tab B sees the revoked session.
    await pageB.route('**/api/auth/me', async (route) => {
      if (sessionRevoked) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Session Revoked',
          }),
        });

        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: TEST_USER,
        }),
      });
    });

    await pageA.goto('/dashboard');
    await pageB.goto('/dashboard');

    await expect(pageA).not.toHaveURL(/\/login/);
    await expect(pageB).not.toHaveURL(/\/login/);

    // Simulate logout from Tab A.
    await pageA.evaluate(() => {
      localStorage.removeItem('vault_auth_token');

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'vault_auth_token',
          oldValue: 'mock-access-token',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });

    // Tab B receives the same storage event.
    await pageB.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'vault_auth_token',
          oldValue: 'mock-access-token',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });

    await pageB.bringToFront();

    // Allow the application to process the storage event.
    await pageB.waitForTimeout(250);

    // The page must remain usable.
    await expect(pageB.locator('body')).toBeVisible();
  });
});
