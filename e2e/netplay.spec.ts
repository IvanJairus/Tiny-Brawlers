import { expect, test, type Page } from '@playwright/test';

const peers = (page: Page) => page.evaluate(() => (
  window as unknown as { __tb: { netInfo(): { peers: number } } }
).__tb.netInfo().peers);

const humanSeats = (page: Page) => page.evaluate(() => (
  window as unknown as { __tb: { roster(): Array<{ human: boolean }> } }
).__tb.roster().filter((entry) => entry.human).length);

const worldReport = (page: Page) => page.evaluate(() => {
  const tb = (window as unknown as {
    __tb: {
      world: {
        tick: number;
        localPlayer: number;
        buddies: Array<{ id: number; isBot: boolean; carryCrate: number }>;
        crates: Array<{ id: number }>;
      };
    };
  }).__tb;
  const w = tb.world;
  return {
    tick: w.tick,
    humans: w.buddies.filter((b) => b.isBot === false).length,
    mine: w.buddies.some((b) => b.id === w.localPlayer),
    ghost: w.buddies.some((b) => b.carryCrate !== 0 && !w.crates.some((c) => c.id === b.carryCrate))
  };
});

async function startSharedMatch(context: import('@playwright/test').BrowserContext): Promise<{ host: Page; guest: Page }> {
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

  // Starting before the host has taken the join leaves the guest outside the room
  // while its screen still fills with snapshots, so the handshake is waited for.
  await expect.poll(() => peers(host), { timeout: 20_000 }).toBe(1);
  await expect.poll(() => humanSeats(host), { timeout: 20_000 }).toBe(2);

  await host.getByRole('button', { name: 'Mulai Pertandingan' }).click();

  await expect.poll(() => guest.evaluate(() => {
    const tb = (window as unknown as { __tb?: { world: { buddies: unknown[] } } }).__tb;
    return tb ? tb.world.buddies.length : 0;
  }), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => host.evaluate(() => document.body.dataset.screen), { timeout: 20_000 }).toBe('playing');
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 20_000 }).toBe('playing');
  return { host, guest };
}

test('two browser pages play one match together', async ({ context }) => {
  test.setTimeout(90_000);
  const { host, guest } = await startSharedMatch(context);

  expect((await worldReport(host)).humans).toBe(2);
  expect((await worldReport(guest)).mine).toBe(true);

  await host.keyboard.down('KeyD');
  await guest.keyboard.down('KeyA');
  await host.waitForTimeout(3000);
  await host.keyboard.up('KeyD');
  await guest.keyboard.up('KeyA');

  const both = [await worldReport(host), await worldReport(guest)];
  expect(both[0].tick).toBeGreaterThan(0);
  expect(both[1].tick).toBeGreaterThan(0);
  expect(both[1].mine).toBe(true);
  expect(both[1].ghost).toBe(false);

  await guest.locator('[data-action="pause"]').click();
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('confirming');
  await guest.getByRole('button', { name: 'Lanjut Main' }).click();
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('playing');

  await guest.locator('[data-action="pause"]').click();
  await guest.getByRole('button', { name: 'Ya, Keluar' }).click();
  await expect.poll(() => guest.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('title');
  await expect.poll(() => guest.evaluate(() => (
    window as unknown as { __tb: { netInfo(): { kind: string } } }
  ).__tb.netInfo().kind), { timeout: 10_000 }).toBe('solo');
});

/**
 * Only two real pages can prove this: a loopback transport never drops the way a
 * closed tab does, and the bug class is the host sitting still after its peer
 * disappeared.
 */
test('a guest whose tab vanishes is taken over by the AI', async ({ context }) => {
  test.setTimeout(90_000);
  const { host, guest } = await startSharedMatch(context);

  const before = await worldReport(host);
  expect(before.humans).toBe(2);

  await guest.close();

  await expect.poll(() => worldReport(host), { timeout: 20_000 }).toEqual(
    expect.objectContaining({ humans: 1, ghost: false })
  );
  expect((await worldReport(host)).tick).toBeGreaterThan(before.tick);
});
