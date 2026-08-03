import { expect, test } from '@playwright/test';

test('health API returns successful response', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data).toMatchObject({
    success: true,
  });
});
