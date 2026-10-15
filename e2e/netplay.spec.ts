import { expect, test } from '@playwright/test';

test('two browser pages play one match together', async ({ context }) => {
  test.setTimeout(90_000);
  const host = await context.newPage();
  const guest = await context.newPage();

  await host.goto('/?seed=11');
  await expect.poll(() => host.evaluate(() => document.body.dataset.screen)).toBe('title');
  await host.getByRole('button', { name: /teman/ }).click();
  await host.getByRole('button', { name: 'Buat Ruangan' }).click();

  const code = await host.evaluate(() => document.querySelector('[data-role="code"]')?.textContent ?? '');
  expect(code).toMatch(/Kode ruangan: [A-Z2-9]{6}/);

  await guest.goto('/?seed=22');
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen)).toBe('title');
  await guest.getByRole('button', { name: /teman/ }).click();
  await guest.locator('[data-role="codeInput"]').fill(code.split(': ')[1]);
  await guest.getByRole('button', { name: 'Gabung Kode' }).click();

  await host.getByRole('button', { name: 'Mulai Pertandingan' }).click();

  await expect.poll(() => guest.evaluate(() => {
    const tb = (window as unknown as { __tb?: { world: { buddies: unknown[] } } }).__tb;
    return tb ? tb.world.buddies.length : 0;
  }), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => host.evaluate(() => document.body.dataset.screen), { timeout: 20_000 }).toBe('playing');
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 20_000 }).toBe('playing');

  await host.keyboard.down('KeyD');
  await guest.keyboard.down('KeyA');
  await host.waitForTimeout(3000);
  await host.keyboard.up('KeyD');
  await guest.keyboard.up('KeyA');

  const both = await Promise.all([host, guest].map((page) => page.evaluate(() => {
    const tb = (window as unknown as { __tb: { world: { tick: number; buddies: unknown[] } } }).__tb;
    return { tick: tb.world.tick, buddies: tb.world.buddies.length };
  })));

  expect(both[0].buddies).toBeGreaterThan(0);
  expect(both[1].buddies).toBe(both[0].buddies);
  expect(both[1].tick).toBeGreaterThan(0);
});
