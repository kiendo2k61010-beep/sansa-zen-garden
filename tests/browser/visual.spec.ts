import { test, expect } from '@playwright/test';
test('scene renders and first frame is reviewable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?room=visual-qa&instance=0&region=apac');
  await expect(page.locator('.loading-screen')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'SANSA ZEN GARDEN' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/phase13-onboarding.png' });
  await page.getByRole('button', { name: 'Bước vào sân chùa' }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'artifacts/desktop-exterior.png' });
  expect(errors).toEqual([]);
});
