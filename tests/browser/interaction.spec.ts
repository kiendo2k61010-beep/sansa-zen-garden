import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Ack } from '../../shared/world';
const state = async (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const path = '/src/state.ts';
    return (await import(/* @vite-ignore */ path)).getState();
  });
test('full-room rejection preserves current room, seat and honest connection count', async ({ page }) => {
  const guests: Socket[] = [];
  try {
    for (let i = 0; i < 24; i++) {
      const socket = io('http://localhost:3001', { transports: ['websocket'], forceNew: true });
      guests.push(socket);
      await new Promise<void>((resolve) => socket.once('connect', resolve));
      const ack = await new Promise<Ack>((resolve) =>
        socket.emit(
          'join',
          { room: 'capacity-browser', instance: 0, region: 'apac', name: `Test ${i}`, color: '#c88943' },
          resolve,
        ),
      );
      expect(ack.ok).toBe(true);
    }
    await page.goto('/?room=keep-room&instance=0&region=apac');
    await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
    await expect(page.locator('.room-count')).toHaveText('1 / 24');
    await page.getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
    await expect.poll(async () => (await state(page)).seated, { timeout: 18000 }).toBeTruthy();
    const seat = (await state(page)).seated;
    await page.getByRole('button', { name: 'Chọn phòng' }).click();
    await page.getByPlaceholder('Ví dụ: sen-hong').fill('capacity-browser');
    await page.getByRole('button', { name: 'Vào phòng', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Phòng đã đầy');
    await expect(page.locator('.room-count')).toHaveText('1 / 24');
    await expect(page).toHaveURL(/room=keep-room/);
    expect((await state(page)).seated).toBe(seat);
    expect((await state(page)).status).toBe('online');
  } finally {
    guests.forEach((s) => s.disconnect());
  }
});
test('a visible cushion is clickable and fullscreen toggles without blocking the scene', async ({ page }) => {
  await page.goto('/?room=click-seat&instance=0&region=apac');
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await page.getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
  await expect.poll(async () => (await state(page)).seated, { timeout: 18000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Đứng dậy', exact: true }).last().click();
  await page.waitForTimeout(1500);
  // Use actual screen-space projection of the known view to select a cushion.
  // The controller's DOM input and raycaster remain the production handlers.
  const point = await page.evaluate(async () => {
    const threePath = '/node_modules/.vite/deps/three.js';
    const THREE = await import(/* @vite-ignore */ threePath);
    const sharedPath = '/shared/world.ts';
    const { SEATS } = await import(/* @vite-ignore */ sharedPath);
    const statePath = '/src/state.ts';
    const local = (await import(/* @vite-ignore */ statePath)).getState();
    const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.15, 220);
    const focus = new THREE.Vector3(local.x, 0.9 + 0.6, local.z);
    const horizontal = Math.sin(1.05) * 20;
    camera.position.set(
      focus.x + Math.sin(0.18) * horizontal,
      focus.y + Math.cos(1.05) * 20,
      focus.z + Math.cos(0.18) * horizontal,
    );
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    const desired = SEATS.find((s: any) => s.x === -2 && s.z === 0);
    const p = new THREE.Vector3(desired.x, 0.81, desired.z).project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  });
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state(page)).seated, { timeout: 18000 }).toBeTruthy();
  await page.getByRole('button', { name: 'Toàn màn hình', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
