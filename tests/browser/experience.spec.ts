import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../shared/world';

async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/state.ts';
    return (await import(/* @vite-ignore */ path)).getState();
  });
}
function listen(page: Page) {
  let latest: Snapshot | null = null;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('net::ERR_')) errors.push(m.text());
  });
  page.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      const text = payload.toString();
      if (text.startsWith('42')) {
        try {
          const [event, data] = JSON.parse(text.slice(2));
          if (event === 'snapshot') latest = data;
        } catch {
          /* other Socket.IO control frames */
        }
      }
    }),
  );
  return {
    get latest() {
      return latest;
    },
    errors,
  };
}
test('two browser tabs share motion, gestures, occupied seats, disconnect and reconnect', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('an-nhien-name', 'Mây kiểm thử'));
  const first = listen(page);
  const secondPage = await context.newPage();
  const second = listen(secondPage);
  await page.goto('/?room=browser-pair&instance=8&region=apac');
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await secondPage.addInitScript(() => localStorage.setItem('an-nhien-name', 'Sen kiểm thử'));
  await secondPage.goto('/?room=browser-pair&instance=8&region=apac');
  await secondPage.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('2 / 24');
  await expect(secondPage.locator('.room-count')).toHaveText('2 / 24');
  await expect.poll(() => second.latest?.players.length).toBe(2);
  const origin = await state(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowUp');
  const moved = await state(page);
  expect(Math.hypot(moved.x - origin.x, moved.z - origin.z)).toBeGreaterThan(1);
  await expect
    .poll(() => second.latest?.players.find((p) => p.name === 'Mây kiểm thử')?.z)
    .toBeLessThan(origin.z - 1);
  await page.getByRole('button', { name: 'Chắp tay', exact: true }).click();
  await expect
    .poll(() => second.latest?.players.find((p) => p.name === 'Mây kiểm thử')?.action)
    .toBe('greet');
  await expect(secondPage.locator('.toast')).toContainText('Mây kiểm thử chắp tay chào bạn.');
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
  await expect.poll(async () => (await state(page)).seated, { timeout: 20000 }).toBeTruthy();
  const occupied = (await state(page)).seated;
  await expect.poll(() => Object.keys(second.latest?.seats || {})).toContain(occupied);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'artifacts/desktop-meditation.png' });
  // Force one genuine server correction at the second player's seat boundary.
  // The click must still complete without another user action.
  await secondPage.evaluate(async () => {
    const path = '/src/network.ts';
    const { TempleNetwork } = await import(/* @vite-ignore */ path);
    const sync = TempleNetwork.prototype.syncPose;
    TempleNetwork.prototype.syncPose = function (pose: any) {
      TempleNetwork.prototype.syncPose = sync;
      return sync.call(this, { ...pose, x: 100 });
    };
  });
  await secondPage.getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
  await expect.poll(async () => (await state(secondPage)).seated, { timeout: 20000 }).toBeTruthy();
  expect((await state(secondPage)).seated).not.toBe(occupied);
  await secondPage.waitForTimeout(1800);
  await secondPage.screenshot({ path: 'artifacts/two-players.png' });
  await page.getByRole('button', { name: 'Đứng dậy', exact: true }).last().click();
  await expect.poll(async () => (await state(page)).seated).toBeNull();
  await expect.poll(() => second.latest?.seats[occupied]).toBeUndefined();
  await page.getByRole('button', { name: 'Lễ Phật', exact: true }).click();
  await expect.poll(() => second.latest?.players.find((p) => p.name === 'Mây kiểm thử')?.action).toBe('bow');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Dừng lễ', exact: true }).click();
  expect((await state(page)).bows).toBe(0);
  await expect.poll(async () => (await state(page)).bows, { timeout: 6500 }).toBe(1);
  await expect.poll(async () => (await state(page)).action).toBe('idle');
  await page.waitForTimeout(4500);
  expect((await state(page)).bows).toBe(1);
  await secondPage.close();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await context.setOffline(true);
  await expect(page.locator('.offline-note')).toBeVisible({ timeout: 35000 });
  expect((await state(page)).online).toBe(0);
  await context.setOffline(false);
  await expect(page.locator('.room-count')).toHaveText('1 / 24', { timeout: 20000 });
  expect(first.errors).toEqual([]);
  expect(second.errors).toEqual([]);
});

test('108 beads, audio, identity, room URL and camera controls work through UI', async ({ page }) => {
  const audit = listen(page);
  await page.goto('/?room=controls-qa&instance=0&region=apac');
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await page.getByRole('button', { name: 'Chuỗi hạt', exact: true }).click();
  for (let i = 0; i < 108; i++) await page.getByRole('button', { name: 'Lần một hạt', exact: true }).click();
  await expect(page.locator('.bead-number strong')).toHaveText('108');
  await expect(page.getByRole('button', { name: 'Lần một hạt', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/beads-complete.png' });
  await page.getByRole('button', { name: 'Bắt đầu vòng mới' }).click();
  await expect(page.locator('.bead-number strong')).toHaveText('00');
  await page.getByRole('button', { name: 'Lần thêm một hạt' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.bead-number strong')).toHaveText('01');
  await page.getByRole('button', { name: 'Đóng bảng' }).click();
  await page.getByRole('button', { name: 'Âm thanh', exact: true }).click();
  await expect(page.locator('.sound-master')).toContainText('Âm thanh đang bật');
  await page.getByRole('button', { name: 'Âm thanh đang bật', exact: true }).click();
  expect((await state(page)).sound).toBe(false);
  await page.getByRole('button', { name: 'Bật âm thanh', exact: true }).click();
  await expect(page.locator('.sound-master')).toContainText('Âm thanh đang bật');
  await page.getByRole('slider', { name: 'Âm lượng' }).fill('0.25');
  expect((await state(page)).volume).toBe(0.25);
  await page.getByRole('button', { name: 'Giai điệu thiền' }).click();
  expect((await state(page)).channels.music).toBe(true);
  await page.getByRole('button', { name: 'Thỉnh một tiếng chuông' }).click();
  await page.getByRole('button', { name: 'Âm thanh đang bật' }).click();
  expect((await state(page)).sound).toBe(false);
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await page.getByLabel('Tên trong sân chùa').fill('Sen bình yên');
  await page.getByRole('button', { name: 'Màu áo #668d91' }).click();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect.poll(async () => (await state(page)).name).toBe('Sen bình yên');
  await expect.poll(() => audit.latest?.players[0].color).toBe('#668d91');
  await page.getByRole('button', { name: 'Chọn phòng' }).click();
  await page.getByPlaceholder('Ví dụ: sen-hong').fill('phong-moi');
  await page.getByLabel('Nhánh phòng').fill('3');
  await page.getByLabel('Nhóm vùng').selectOption('eu');
  await page.getByRole('button', { name: 'Vào phòng', exact: true }).click();
  await expect(page).toHaveURL(/room=phong-moi&instance=3&region=eu/);
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await page.reload();
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  expect((await state(page)).name).toBe('Sen bình yên');
  const before = await page.locator('canvas').screenshot();
  await page.mouse.move(770, 450);
  await page.mouse.down();
  await page.mouse.move(970, 510, { steps: 15 });
  await page.mouse.up();
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(500);
  const after = await page.locator('canvas').screenshot();
  expect(before.equals(after)).toBe(false);
  await page.getByRole('button', { name: 'Góc nhìn', exact: true }).click();
  expect(audit.errors).toEqual([]);
});

test('mobile layout, touch navigation and panels remain usable', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const audit = listen(page);
  await page.goto('http://localhost:5173/?room=mobile-qa&instance=0&region=apac');
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).tap();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'artifacts/mobile-exterior.png' });
  for (const label of ['Ngồi thiền', 'Lễ Phật', 'Chắp tay', 'Chuỗi hạt', 'Âm thanh']) {
    const bounds = await page.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  }
  await page.getByRole('button', { name: 'Chuỗi hạt', exact: true }).tap();
  await page.getByRole('button', { name: 'Lần thêm một hạt' }).tap();
  await expect(page.locator('.bead-number strong')).toHaveText('01');
  await page.screenshot({ path: 'artifacts/mobile-beads.png' });
  await page.getByRole('button', { name: 'Đóng bảng' }).tap();
  await page.getByRole('button', { name: 'Ngồi thiền', exact: true }).tap();
  await expect.poll(async () => (await state(page)).seated, { timeout: 20000 }).toBeTruthy();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'artifacts/mobile-meditation.png' });
  expect(audit.errors).toEqual([]);
  await context.close();
});
