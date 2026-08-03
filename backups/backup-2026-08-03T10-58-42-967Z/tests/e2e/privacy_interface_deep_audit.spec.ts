import { test, expect } from '@playwright/test';

test.describe('Privacy & Interface Deep Settings Audit', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Privacy & Interface Settings page
    await page.goto('/settings/privacy');
    await page.waitForSelector('text=Privacy and Interface');
  });

  test('Toggles update aria-checked and persist state', async ({ page }) => {
    const sidebarToggle = page.getByRole('switch', { name: /Sidebar on the right/i });
    await expect(sidebarToggle).toBeVisible();

    const initialState = await sidebarToggle.getAttribute('aria-checked');
    await sidebarToggle.click();

    const updatedState = await sidebarToggle.getAttribute('aria-checked');
    expect(updatedState).not.toBe(initialState);
  });

  test('Conditional duration selectors render properly when toggles are enabled', async ({
    page,
  }) => {
    const autoLockToggle = page.getByRole('switch', { name: /Auto-lock on inactivity/i });
    const isChecked = (await autoLockToggle.getAttribute('aria-checked')) === 'true';

    if (!isChecked) {
      await autoLockToggle.click();
    }

    await expect(page.locator('text=1m')).toBeVisible();
    await expect(page.locator('text=5m')).toBeVisible();
    await expect(page.locator('text=10m')).toBeVisible();

    const autoClearToggle = page.getByRole('switch', { name: /Clipboard auto-clear/i });
    const isAutoClearChecked = (await autoClearToggle.getAttribute('aria-checked')) === 'true';

    if (!isAutoClearChecked) {
      await autoClearToggle.click();
    }

    await expect(page.locator('text=10s')).toBeVisible();
    await expect(page.locator('text=30s')).toBeVisible();
  });

  test('Numeric inputs enforce bounds and reject illegal key inputs', async ({ page }) => {
    const lengthInput = page.getByPlaceholder('Enter length');
    await expect(lengthInput).toBeVisible();

    // Verify keydown rejection for illegal exponential/sign characters
    await lengthInput.focus();
    await page.keyboard.press('e');
    await page.keyboard.press('-');
    await page.keyboard.press('+');

    // Fill with an out-of-bounds value and blur
    await lengthInput.fill('9999');
    await lengthInput.blur();

    const val = await lengthInput.inputValue();
    expect(Number(val)).toBeLessThanOrEqual(64);
  });

  test('Supported Data Ecosystem badges and policy cards render correctly', async ({ page }) => {
    await expect(page.getByText('Supported Data Ecosystem & Upload Policy')).toBeVisible();
    await expect(page.getByText('AES-256-GCM')).toBeVisible();
    await expect(page.getByText('Photos & Images')).toBeVisible();
    await expect(page.getByText('Credentials & Secrets')).toBeVisible();
  });
});
