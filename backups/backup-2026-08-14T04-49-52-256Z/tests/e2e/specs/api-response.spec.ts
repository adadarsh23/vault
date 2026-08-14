import { expect, test } from '@playwright/test';

test.describe('API response', () => {
  test('health API returns successful response', async ({ request }) => {
    const response = await request.get('/health', {
      timeout: 10_000,
    });

    expect(response.status()).toBe(200);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();

    expect(data).toEqual(
      expect.objectContaining({
        success: true,
      })
    );
  });
});
