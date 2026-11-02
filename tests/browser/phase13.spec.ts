import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { writeFile } from 'node:fs/promises';
import type { Ack, Snapshot } from '../../shared/world';
const state = (page: Page) =>
  page.evaluate(async () => {
    const path = '/src/state.ts';
    return (await import(/* @vite-ignore */ path)).getState();
  });
async function enter(page: Page, url: string, name: string) {
  await page.goto(url);
  await expect(page.locator('.onboarding')).toBeVisible();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Bước vào sân chùa' }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('private invitations, social actions, prayer, map, rooms and refresh across independent clients', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  const one = await a.newPage(),
    two = await b.newPage();
  const errors: string[] = [];
  const navigationSamples: unknown[] = [];
  const corrections: unknown[] = [];
  one.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      const raw = payload.toString();
      if (raw.startsWith('42["correction"')) corrections.push(JSON.parse(raw.slice(2))[1]);
    }),
  );
  one.on('pageerror', (e) => errors.push(e.message));
  two.on('pageerror', (e) => errors.push(e.message));
  try {
    await one.goto('/?room=an-nhien&instance=0&region=apac');
    await expect(one.locator('.onboarding')).toBeVisible();
    expect((await state(one)).online).toBe(0);
    await one.getByLabel('Tên hiển thị', { exact: true }).fill('DCK kiểm thử');
    await one.getByRole('button', { name: 'Tạo phòng', exact: true }).click();
    await one.getByRole('button', { name: 'Tạo phòng và bước vào' }).click();
    await expect(one).toHaveURL(/invite=/);
    const invitation = one.url();
    await enter(two, invitation, 'Liên kiểm thử');
    await expect(one.locator('.room-count')).toHaveText('2 / 24');
    expect(new Set((await state(one)).players.map((p: any) => p.id)).size).toBe(2);
    await one.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
    await two.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
    await one.getByLabel('Tin nhắn', { exact: true }).fill('Chào bạn, cùng ngồi thiền nhé.');
    await one.getByRole('button', { name: 'Gửi tin nhắn' }).click();
    await expect(two.getByRole('log')).toContainText('Chào bạn, cùng ngồi thiền nhé.');
    await two.getByRole('button', { name: 'Người đang có mặt' }).click();
    await two.getByRole('button', { name: 'Chặn DCK kiểm thử', exact: true }).click();
    await expect(two.getByRole('log')).not.toContainText('Chào bạn, cùng ngồi thiền nhé.');
    await two.getByRole('button', { name: 'Ẩn DCK kiểm thử', exact: true }).click();
    expect((await state(two)).hiddenIds.length).toBe(1);
    await two.getByRole('button', { name: 'Đóng bảng' }).click();
    await two.getByRole('button', { name: 'Đóng trò chuyện' }).click();
    await one.getByRole('button', { name: 'Đóng trò chuyện' }).click();
    await one.getByRole('button', { name: 'Vẫy tay', exact: true }).click();
    await expect
      .poll(async () => (await state(two)).players.find((p: any) => p.name === 'DCK kiểm thử')?.action)
      .toBe('wave');
    await one.waitForTimeout(2400);
    // Independent contexts own different windows. Make the walking client's
    // window active explicitly instead of depending on prior fullscreen tests.
    await one.bringToFront();
    await one.getByRole('button', { name: 'Đi đến Tượng Phật', exact: true }).click();
    await expect
      .poll(
        async () => {
          const s = await state(one);
          navigationSamples.push({
            at: Date.now(),
            x: s.x,
            z: s.z,
            action: s.action,
            fps: s.fps,
            status: s.status,
          });
          return Math.hypot(s.x, s.z + 6.2);
        },
        { timeout: 20000 },
      )
      .toBeLessThan(0.5);
    await one.keyboard.press('KeyE');
    await expect
      .poll(async () => (await state(two)).players.find((p: any) => p.name === 'DCK kiểm thử')?.action)
      .toBe('pray');
    await one.screenshot({ path: 'artifacts/phase13-prayer.png' });
    await one.keyboard.press('KeyE');
    await one.getByRole('button', { name: 'Túi hành trang' }).click();
    await expect(one.locator('.journey-list')).toContainText('Nhà tắm');
    await expect(one.locator('.inventory-beads')).toContainText('108 hạt');
    await one.getByRole('button', { name: 'Đóng bảng' }).click();
    await one.getByRole('button', { name: 'Mở minimap' }).click();
    await expect(one.locator('.minimap')).toHaveClass(/expanded/);
    await one.getByRole('button', { name: 'Chọn phòng' }).click();
    await one.getByRole('button', { name: 'Trở về phòng chính' }).click();
    await expect(one).not.toHaveURL(/invite=/);
    await expect(one.locator('.room-count')).toHaveText('1 / 24');
    await expect(two.locator('.room-count')).toHaveText('1 / 24');
    await two.reload();
    await two.getByRole('button', { name: 'Bước vào sân chùa' }).click();
    await expect(two.locator('.room-count')).toHaveText('1 / 24');
    expect(errors).toEqual([]);
  } catch (error) {
    console.log(JSON.stringify({ navigationSamples, corrections, errors }));
    throw error;
  } finally {
    await a.close();
    await b.close();
  }
});

test('mobile joystick drives real movement and responsive onboarding fits', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('/?room=phase13-mobile&instance=0&region=apac');
    await expect(page.locator('.onboarding')).toBeVisible();
    await page.screenshot({ path: 'artifacts/phase13-mobile-onboarding.png' });
    await page.getByRole('button', { name: 'Bước vào sân chùa' }).click();
    await expect(page.locator('.onboarding')).toHaveCount(0);
    await page.waitForTimeout(1400);
    await page.getByRole('button', { name: 'Chạy cảm ứng' }).click();
    const start = await state(page);
    const rect = (await page.locator('.joystick').boundingBox())!;
    await page.mouse.move(rect.x + 50, rect.y + 50);
    await page.mouse.down();
    await page.mouse.move(rect.x + 82, rect.y + 55);
    await page.waitForTimeout(700);
    await expect.poll(async () => (await state(page)).action).toBe('run');
    await page.mouse.up();
    const end = await state(page);
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1);
    await expect.poll(async () => (await state(page)).action).toBe('idle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: 'artifacts/phase13-mobile-world.png' });
  } finally {
    await context.close();
  }
});

test('20 actual connections animate while frame rate and websocket traffic are measured', async ({
  page,
}) => {
  test.setTimeout(90000);
  const clients: Socket[] = [],
    starts: { x: number; z: number }[] = [];
  let bytes = 0,
    frames = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  page.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      bytes += Buffer.byteLength(payload);
      frames++;
    }),
  );
  try {
    await enter(page, '/?room=phase13-load&instance=0&region=apac', 'Người quan sát');
    for (let i = 0; i < 19; i++) {
      const socket = io('http://localhost:3001', { transports: ['websocket'], forceNew: true });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const ack = await new Promise<Ack>((resolve) =>
        socket.emit(
          'join',
          {
            room: 'phase13-load',
            instance: 0,
            region: 'apac',
            name: `Tải thử ${i + 1}`,
            avatar: ['dck', 'lotus', 'sage'][i % 3],
            sessionId: crypto.randomUUID(),
          },
          resolve,
        ),
      );
      expect(ack.ok).toBe(true);
      const player = ack.snapshot!.players.find((p) => p.id === ack.snapshot!.selfId)!;
      starts.push({ x: player.x, z: player.z });
    }
    await expect(page.locator('.room-count')).toHaveText('20 / 24');
    let t = 0;
    timer = setInterval(() => {
      t += 0.1;
      clients.forEach((socket, i) =>
        socket.emit('pose', {
          x: starts[i].x + Math.sin(t + i) * 0.3,
          z: starts[i].z + Math.sin(t * 0.8) * 0.3,
          rotation: t,
          action: 'walk',
          actionAt: Date.now(),
        }),
      );
    }, 100);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = await cdp.send('Performance.getMetrics');
    bytes = 0;
    frames = 0;
    const started = Date.now();
    const sample = await page.evaluate(
      () =>
        new Promise<{ fps: number; p95: number; heap: number | null }>((resolve) => {
          let first = 0,
            last = 0;
          const deltas: number[] = [];
          const frame = (now: number) => {
            if (!first) first = now;
            if (last) deltas.push(now - last);
            last = now;
            if (now - first < 8000) requestAnimationFrame(frame);
            else {
              deltas.sort((a, b) => a - b);
              resolve({
                fps: (deltas.length * 1000) / (now - first),
                p95: deltas[Math.floor(deltas.length * 0.95)],
                heap: (performance as any).memory?.usedJSHeapSize ?? null,
              });
            }
          };
          requestAnimationFrame(frame);
        }),
    );
    const after = await cdp.send('Performance.getMetrics'),
      duration = (Date.now() - started) / 1000;
    const metric = (data: any, name: string) => data.metrics.find((x: any) => x.name === name)?.value || 0;
    const report = {
      clients: 20,
      syntheticLoadClients: 19,
      realBrowserClients: 1,
      quality: (await state(page)).quality,
      ...sample,
      seconds: duration,
      inboundBytesPerSecond: bytes / duration,
      inboundFrames: frames,
      mainThreadTaskSeconds: metric(after, 'TaskDuration') - metric(before, 'TaskDuration'),
      drawCalls: (await state(page)).drawCalls,
      gpuTiming: 'not exposed',
      note: 'Headless Chrome on current Windows machine; not a low-end device guarantee',
    };
    await writeFile('artifacts/phase13-performance.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    expect((await state(page)).players.length).toBe(20);
    expect(sample.fps).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Góc nhìn', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'artifacts/phase13-20-players.png' });
  } finally {
    if (timer) clearInterval(timer);
    clients.forEach((s) => s.disconnect());
  }
});
