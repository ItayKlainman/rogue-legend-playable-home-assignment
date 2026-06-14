import { test, expect } from '@playwright/test';

test('egg-summon boots without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000/?type=egg-summon');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2000);

  expect(errors, errors.join('\n')).toEqual([]);
});
