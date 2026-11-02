import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const get = async (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const path = '/src/state.ts';
    return (await import(/* @vite-ignore */ path)).getState();
  });
test('canvas tap, navigation cancellation, bow spam and mobile pointer gestures', async ({ page }) => {
  await page.goto('/?room=edge-qa&instance=0&region=apac');
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  const initial = await get(page);
  await page.mouse.click(830, 696);
  await page.waitForTimeout(900);
  const moved = await get(page);
  expect(Math.hypot(moved.x - initial.x, moved.z - initial.z)).toBeGreaterThan(0.5);
  await page.getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
  await expect.poll(async () => (await get(page)).pendingSeat).toBeTruthy();
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  await expect.poll(async () => (await get(page)).pendingSeat).toBeNull();
  await page.getByRole('button', { name: 'Lễ Phật', exact: true }).click();
  for (let i = 0; i < 6; i++) await page.locator('.action-button').nth(1).click();
  expect((await get(page)).bows).toBe(0);
  if ((await get(page)).bowRunning) await page.getByRole('button', { name: 'Dừng lễ', exact: true }).click();
  await expect.poll(async () => (await get(page)).bows, { timeout: 6000 }).toBe(1);
  await page.waitForTimeout(4300);
  expect((await get(page)).bows).toBe(1);
  const a = await page.locator('canvas').screenshot();
  // PointerEvents exercise the same handlers used by two-finger touch devices.
  await page.locator('canvas').evaluate((canvas) => {
    const send = (type: string, id: number, x: number, y: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      );
    const originalSet = canvas.setPointerCapture.bind(canvas);
    canvas.setPointerCapture = () => {};
    send('pointerdown', 31, 600, 400);
    send('pointerdown', 32, 700, 400);
    send('pointermove', 31, 520, 410);
    send('pointermove', 32, 800, 420);
    send('pointerup', 31, 520, 410);
    send('pointerup', 32, 800, 420);
    canvas.setPointerCapture = originalSet;
  });
  await page.waitForTimeout(500);
  const b = await page.locator('canvas').screenshot();
  expect(a.equals(b)).toBe(false);
  await page.getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
  await expect.poll(async () => (await get(page)).seated, { timeout: 20000 }).toBeTruthy();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'artifacts/desktop-final-interior.png' });
  const sample = await page.evaluate(
    () =>
      new Promise<{ frames: number; seconds: number; fps: number }>((resolve) => {
        const start = performance.now();
        let frames = 0;
        function frame(now: number) {
          frames++;
          if (now - start >= 2500)
            resolve({ frames, seconds: (now - start) / 1000, fps: frames / ((now - start) / 1000) });
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
  await fs.writeFile(
    'artifacts/frame-sample.json',
    JSON.stringify(
      {
        environment:
          'Chrome headless, 1440x900, actual host; short sample, not a universal performance guarantee',
        ...sample,
      },
      null,
      2,
    ),
  );
});
test('Web Audio produces a signal only after interaction and mute silences it', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const capture: AudioContext[] = [];
    (window as any).__testAudio = capture;
    window.AudioContext = new Proxy(Original, {
      construct(Target, args) {
        const context = new Target(...args);
        capture.push(context);
        const originalGain = context.createGain.bind(context);
        (context as any).__testGains = [];
        context.createGain = () => {
          const gain = originalGain();
          (context as any).__testGains.push(gain);
          return gain;
        };
        return context;
      },
    });
  });
  await page.goto('/?room=audio-qa&instance=0&region=apac');
  await expect(page.locator('.onboarding')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testAudio.length)).toBe(0);
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await page.getByRole('button', { name: 'Âm thanh', exact: true }).click();
  await expect(page.locator('.sound-master')).toContainText('Âm thanh đang bật');
  await page.waitForTimeout(600);
  const signal = () =>
    page.evaluate(async () => {
      const context = (window as any).__testAudio[0] as AudioContext;
      const master = (context as any).__testGains[0] as GainNode;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      master.connect(analyser);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      master.disconnect(analyser);
      analyser.disconnect();
      return {
        state: context.state,
        rms: Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length),
      };
    });
  const audible = await signal();
  expect(audible.state).toBe('running');
  expect(audible.rms).toBeGreaterThan(0.00001);
  await page.getByRole('button', { name: 'Âm thanh đang bật' }).click();
  await page.waitForTimeout(1500);
  expect((await signal()).rms).toBeLessThan(audible.rms * 0.01);
});
test('production build serves assets and real Socket.IO without Vite', async ({ page, request }) => {
  const health = await request.get('http://localhost:3001/api/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).regionMode).toBe('namespace');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3001/?room=production-qa&instance=0&region=apac');
  await page.getByRole('button', { name: 'Bước vào sân chùa', exact: true }).click();
  await expect(page.locator('.room-count')).toHaveText('1 / 24');
  await expect(page.locator('.loading-screen')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chuỗi hạt', exact: true }).click();
  await page.getByRole('button', { name: 'Lần một hạt', exact: true }).click();
  await expect(page.locator('.bead-number strong')).toHaveText('01');
  expect(errors).toEqual([]);
});
