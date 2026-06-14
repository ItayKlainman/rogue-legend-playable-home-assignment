import { test, expect } from '@playwright/test';

// Boots egg-escalate and lets the auto-roll fallbacks (8s) drive it through the
// first roll → small fight → Boneclaw reveal, catching runtime errors in the
// new scenes/configs. safeInstall() opening the store is expected on boss-land.
test('egg-escalate boots and runs without console errors', async ({ page }) => {
  const waitMs = Number(process.env.EGG_ESCALATE_WAIT_MS ?? 20000);
  test.setTimeout(waitMs + 30000);

  const errors: string[] = [];
  // Ignore the benign Chrome autoplay-policy warning: the test drives the flow
  // via auto-advance timers (no real tap), so navigator.vibrate is blocked. In
  // the real ad the user taps first, so this never fires.
  const benign = (t: string) => /navigator\.vibrate/i.test(t);
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => { if (!benign(e.message)) errors.push(e.message); });

  const url = process.env.EGG_ESCALATE_URL ?? 'http://localhost:3000/?type=egg-escalate';
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  // Default 20s reaches the reward reveal (scene 3): roll1 auto-rolls at 8s,
  // small fight ~4s, then the Boneclaw reveal mounts. Set EGG_ESCALATE_WAIT_MS
  // higher to drive through roll2 + the boss fight.
  await page.waitForTimeout(waitMs);

  expect(errors, errors.join('\n')).toEqual([]);
});
