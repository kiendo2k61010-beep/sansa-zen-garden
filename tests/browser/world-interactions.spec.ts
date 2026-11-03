import { test, expect, type Page } from '@playwright/test';

const state = (page: Page) =>
  page.evaluate(async () => {
    const path = '/src/state.ts';
    return (await import(/* @vite-ignore */ path)).getState();
  });

test('players share bell and lantern interactions, late join restores active effects, switching rooms clears them', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  const one = await a.newPage(),
    two = await b.newPage();
  const errors: string[] = [];
  one.on('pageerror', (error) => errors.push(error.message));
  two.on('pageerror', (error) => errors.push(error.message));
  try {
    for (const [page, name] of [
      [one, 'Bạn thỉnh chuông'],
      [two, 'Bạn cùng chơi'],
    ] as const) {
      await page.goto('/?room=shared-world-qa&instance=0&region=apac');
      await page.getByLabel('Tên hiển thị', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Bước vào sân chùa' }).click();
      await expect(page.locator('.onboarding')).toHaveCount(0);
    }
    await expect(one.locator('.room-count')).toHaveText('2 / 24');
    for (const [kind, label, x, z] of [
      ['bell', 'Chuông chùa', -16, 10.5],
      ['lantern', 'Hồ sen', 8.4, 13],
    ] as const) {
      await one.getByRole('button', { name: `Đi đến ${label}`, exact: true }).click();
      await expect
        .poll(
          async () => {
            const s = await state(one);
            const authoritative = s.players.find((player: { id: string }) => player.id === s.selfId);
            return authoritative
              ? Math.max(Math.hypot(s.x - x, s.z - z), Math.hypot(authoritative.x - x, authoritative.z - z))
              : Infinity;
          },
          // Account for bounded prediction while awaiting ACKs on long routes.
          // Both local and server positions still have to reach the real target.
          { timeout: 45000 },
        )
        .toBeLessThan(0.35);
      await one.keyboard.press('KeyE');
      await expect.poll(async () => (await state(two)).worldEvents.at(-1)?.kind).toBe(kind);
      const event = (await state(two)).worldEvents.at(-1)!;
      expect(event.playerId).toBe((await state(one)).selfId);
      expect((await state(one)).worldEvents.at(-1)?.id).toBe(event.id);
      await one.screenshot({ path: `artifacts/shared-${kind}.png` });
    }
    const lantern = (await state(two)).worldEvents.at(-1)!;
    await two.reload();
    await two.getByRole('button', { name: 'Bước vào sân chùa' }).click();
    await expect
      .poll(async () =>
        (await state(two)).worldEvents.some((event: { id: string }) => event.id === lantern.id),
      )
      .toBe(true);
    await one.getByRole('button', { name: 'Chọn phòng' }).click();
    await one.getByRole('button', { name: 'Trở về phòng chính' }).click();
    await expect.poll(async () => (await state(one)).room.room).toBe('an-nhien');
    expect((await state(one)).worldEvents).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
