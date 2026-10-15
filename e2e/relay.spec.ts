import { expect, test } from '@playwright/test';

/**
 * The relay is the path cross-device play depends on. Two pages negotiate through
 * a real WebSocket server here instead of BroadcastChannel, so a broken relay
 * protocol fails this test rather than failing on someone's phone.
 */
test('two pages negotiate through the websocket relay', async ({ context }) => {
  test.setTimeout(90_000);
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const [name, page] of [['H', host], ['G', guest]] as const) {
    page.on('pageerror', (error) => errors.push(`${name}:${error.message}`));
  }

  await host.goto('/?signal=ws://localhost:8090');
  await expect.poll(() => host.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  await host.getByRole('button', { name: /teman/ }).click();
  await host.getByRole('button', { name: 'Buat Ruangan' }).click();
  await host.waitForTimeout(600);

  const code = (await host.evaluate(() => document.querySelector('[data-role="code"]')?.textContent ?? '')).split(': ')[1];
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  await guest.goto('/?signal=ws://localhost:8090');
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  await guest.getByRole('button', { name: /teman/ }).click();
  await guest.locator('[data-role="codeInput"]').fill(code);
  await guest.getByRole('button', { name: 'Gabung Kode' }).click();
  await guest.waitForTimeout(2000);

  const hostPeers = await host.evaluate(() => (window as unknown as { __tb: { netInfo(): { peers: number } } }).__tb.netInfo().peers);
  expect(hostPeers).toBe(1);

  await host.getByRole('button', { name: 'Mulai Pertandingan' }).click();
  await expect.poll(() => guest.evaluate(() => {
    const tb = (window as unknown as { __tb?: { world: { buddies: unknown[] } } }).__tb;
    return tb ? tb.world.buddies.length : 0;
  }), { timeout: 30_000 }).toBeGreaterThan(0);

  expect(errors).toEqual([]);

  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('playing');

  // Escape never freezes a networked match for everyone: it opens the leave dialog instead.
  await guest.keyboard.press('Escape');
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('confirming');
  await guest.keyboard.press('Escape');
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('playing');

  await host.keyboard.press('Escape');
  await expect.poll(() => host.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('confirming');
  await host.getByRole('button', { name: 'Lanjut Main' }).click();
  await expect.poll(() => host.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('playing');
});
