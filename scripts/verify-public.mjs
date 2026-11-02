import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const config = JSON.parse((await readFile('.runtime/public-preview.json', 'utf8')).replace(/^\uFEFF/, ''));
const origin = process.env.PUBLIC_TEST_ORIGIN || config.origin;
const healthResponse = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(20000) });
if (!healthResponse.ok) throw Error(`Health HTTP ${healthResponse.status}`);
const health = await healthResponse.json();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const errors = [];
const contexts = [
  await browser.newContext({ viewport: { width: 1440, height: 900 } }),
  await browser.newContext({ viewport: { width: 1440, height: 900 } }),
];
const pages = await Promise.all(contexts.map((c) => c.newPage()));
const snapshots = [null, null],
  websockets = [];
const worldEvents = [[], []];
const networkEvents = [],
  pathSamples = [];
let lastPathSample = 0;
pages.forEach((p, i) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  p.on('websocket', (ws) => {
    websockets.push(ws.url());
    ws.on('framereceived', ({ payload }) => {
      const raw = payload.toString();
      if (raw.startsWith('42'))
        try {
          const [event, data] = JSON.parse(raw.slice(2));
          if (event === 'snapshot') {
            snapshots[i] = data;
            if (i === 0 && Date.now() - lastPathSample > 900) {
              lastPathSample = Date.now();
              pathSamples.push({
                at: lastPathSample,
                player: data.players.find((p) => p.id === data.selfId),
              });
            }
          }
          if (event === 'correction') networkEvents.push({ client: i, event, data });
          if (event === 'world:event') worldEvents[i].push(data);
        } catch {}
      const acknowledgement = raw.match(/^43\d+(\[.*)/);
      if (acknowledgement) {
        try {
          const [ack] = JSON.parse(acknowledgement[1]);
          if (!ack.ok) networkEvents.push({ client: i, event: 'rejected', ack });
        } catch {}
      }
    });
  });
});
const url = origin + '/?room=public-qa-' + Date.now() + '&instance=0&region=apac';
const start = Date.now();
try {
  for (let i = 0; i < 2; i++) {
    await pages[i].goto(url, { timeout: 60000 });
    await expect(pages[i].getByLabel('Tên hiển thị', { exact: true })).toBeVisible({ timeout: 60000 });
    await pages[i].getByLabel('Tên hiển thị', { exact: true }).fill(i ? 'Liên HTTPS' : 'DCK HTTPS');
    if (i) await pages[i].getByRole('button', { name: /^Liên Áo sen/ }).click();
    await pages[i].getByRole('button', { name: 'Bước vào sân chùa' }).click();
    await expect(pages[i].locator('.onboarding')).toHaveCount(0, { timeout: 20000 });
  }
  for (const p of pages) await expect(p.locator('.room-count')).toHaveText('2 / 24');
  await expect.poll(() => snapshots[1]?.players.length).toBe(2);
  console.log('Two independent clients joined over HTTPS/WSS.');
  await pages[0].waitForTimeout(1500);
  const initial = snapshots[1].players.find((p) => p.name === 'DCK HTTPS');
  await pages[0].keyboard.down('KeyA');
  await pages[0].waitForTimeout(850);
  await pages[0].keyboard.up('KeyA');
  await expect
    .poll(() => {
      const p = snapshots[1]?.players.find((p) => p.name === 'DCK HTTPS');
      return p ? Math.hypot(p.x - initial.x, p.z - initial.z) : 0;
    })
    .toBeGreaterThan(1);
  await pages[0].getByRole('button', { name: 'Chắp tay', exact: true }).click();
  await expect.poll(() => snapshots[1]?.players.find((p) => p.name === 'DCK HTTPS')?.action).toBe('greet');
  await pages[0].waitForTimeout(2400);
  await pages[0].getByRole('button', { name: 'Ngồi thiền', exact: true }).click();
  console.log('Movement and greeting received; walking to meditation cushion.');
  await expect
    .poll(() => snapshots[1]?.players.find((p) => p.name === 'DCK HTTPS')?.action, { timeout: 30000 })
    .toBe('sit');
  for (const p of pages) await p.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
  await pages[0].getByLabel('Tin nhắn', { exact: true }).fill('Kiểm thử HTTPS và WSS thành công.');
  await pages[0].getByRole('button', { name: 'Gửi tin nhắn' }).click();
  await expect(pages[1].getByRole('log')).toContainText('Kiểm thử HTTPS và WSS thành công.');
  await pages[0].screenshot({ path: 'artifacts/public-https-two-clients.png' });
  for (const p of pages) await p.getByRole('button', { name: 'Đóng trò chuyện' }).click();
  for (const [kind, name, x, z] of [
    ['bell', 'Chuông chùa', -16, 10.5],
    ['lantern', 'Hồ sen', 8.4, 13],
  ]) {
    await pages[0].getByRole('button', { name: `Đi đến ${name}`, exact: true }).click();
    await expect
      .poll(
        () => {
          const player = snapshots[0]?.players.find((p) => p.name === 'DCK HTTPS');
          return player ? Math.hypot(player.x - x, player.z - z) : Infinity;
        },
        { timeout: 30000 },
      )
      .toBeLessThan(0.4);
    await pages[0].keyboard.press('KeyE');
    await expect.poll(() => worldEvents[1].at(-1)?.kind, { timeout: 12000 }).toBe(kind);
    expect(worldEvents[0].at(-1)?.id).toBe(worldEvents[1].at(-1)?.id);
    await pages[0].screenshot({ path: `artifacts/public-shared-${kind}.png` });
    console.log(`Shared public interaction verified: ${kind}`);
  }
  await pages[1].reload();
  await pages[1].getByRole('button', { name: 'Bước vào sân chùa' }).click();
  await expect(pages[0].locator('.room-count')).toHaveText('2 / 24');
  expect(new Set(snapshots[0].players.map((p) => p.id)).size).toBe(2);
  expect(websockets.length).toBeGreaterThanOrEqual(2);
  expect(websockets.every((u) => u.startsWith('wss://'))).toBe(true);
  expect(errors).toEqual([]);
  const departureAt = Date.now();
  await contexts[1].close();
  await expect(pages[0].locator('.room-count')).toHaveText('1 / 24', { timeout: 30000 });
  const departureMs = Date.now() - departureAt;
  console.log('Public multiplayer checks passed; inspecting forest, bathhouse and market.');
  for (const [id, name, x, z] of [
    ['forest', 'Rừng tĩnh lặng', -23, -14],
    ['bath', 'Nhà tắm', 21, -13],
    ['market', 'Hội chợ', -21, 20],
  ]) {
    await pages[0].getByRole('button', { name: `Đi đến ${name}`, exact: true }).click();
    await expect
      .poll(
        () => {
          const player = snapshots[0]?.players.find((p) => p.name === 'DCK HTTPS');
          return player ? Math.hypot(player.x - x, player.z - z) : Infinity;
        },
        { timeout: 45000 },
      )
      .toBeLessThan(0.5);
    await pages[0].waitForTimeout(1200);
    await pages[0].screenshot({ path: `artifacts/public-${id}.png` });
    console.log(`Public destination verified: ${name}`);
  }
  expect(errors).toEqual([]);
  const report = {
    verifiedAt: new Date().toISOString(),
    origin,
    shareUrl: config.url,
    temporary: true,
    healthStatus: healthResponse.status,
    health,
    twoIndependentBrowserContexts: true,
    wssUrls: websockets,
    checks: [
      'HTTPS frontend + API',
      'Direct room URL',
      'Two different avatars',
      'Movement received by second client',
      'Greeting received',
      'Meditation seat received',
      'Room chat received',
      'Bell and floating lantern events shared between two real clients',
      'Refresh no duplicates',
      'Disconnect removes player',
      'Walk to forest, bathhouse and market in same room',
    ],
    errors,
    departureMs,
    durationSeconds: (Date.now() - start) / 1000,
  };
  await writeFile('artifacts/public-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await pages[0].screenshot({ path: 'artifacts/public-failure.png' }).catch(() => {});
  const diagnostic = {
    error: String(error),
    errors,
    networkEvents,
    pathSamples,
    text: await pages[0]
      .locator('body')
      .innerText()
      .catch(() => ''),
  };
  await writeFile('artifacts/public-failure.json', JSON.stringify(diagnostic, null, 2));
  console.log(JSON.stringify(diagnostic));
  throw error;
} finally {
  await browser.close();
}
