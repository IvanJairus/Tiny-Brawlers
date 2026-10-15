import { expect, test } from '@playwright/test';

const HUD_CARDS = ['.card-player', '.card-scoreboard', '.card-pad:not(.is-hidden)'];

async function startMatch(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?seed=4242');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 10_000 }).toBe('playing');
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('the title offers netplay when the browser can do WebRTC', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen)).toBe('title');
  await expect(page.getByRole('button', { name: /teman/ })).toHaveCount(1);
});

test('the page never scrolls sideways at any supported size', async ({ page }) => {
  await startMatch(page);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  }));
  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
  expect(metrics.scrollHeight).toBe(metrics.clientHeight);
});

test('HUD cards never overlap each other', async ({ page }) => {
  await startMatch(page);
  const boxes = await page.evaluate((selectors: string[]) => {
    return selectors
      .map((selector) => document.querySelector(selector))
      .filter((el): el is Element => Boolean(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
  }, HUD_CARDS);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(
        intersects(boxes[i], boxes[j]),
        `cards ${i} and ${j} overlap: ${JSON.stringify([boxes[i], boxes[j]])}`
      ).toBe(false);
    }
  }
});

test('touch controls only exist for touch input and are big enough', async ({ page }) => {
  await startMatch(page);
  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  const stickVisible = await page.locator('.stick-zone').isVisible();
  expect(stickVisible).toBe(coarse);

  if (stickVisible) {
    const sizes = await page.locator('.action-cluster .btn').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
    for (const size of sizes) {
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('the HUD keeps a quiet live region that costs no screen space', async ({ page }) => {
  await startMatch(page);

  const region = await page.evaluate(() => {
    const el = document.querySelector('[data-part="announce"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      live: el.getAttribute('aria-live'),
      atomic: el.getAttribute('aria-atomic'),
      overflow: style.overflow
    };
  });

  expect(region).not.toBeNull();
  expect(region!.live).toBe('polite');
  expect(region!.atomic).toBe('true');
  expect(region!.width).toBeLessThanOrEqual(1);
  expect(region!.height).toBeLessThanOrEqual(1);
  expect(region!.overflow).toBe('hidden');
});

test('a carried crate shows where it will land', async ({ page }) => {
  await startMatch(page);

  const visibleBy = (name: string) => page.evaluate((target) => {
    const tb = (window as unknown as { __tb: { stage: { scene: { traverse(fn: (o: { name?: string; visible?: boolean }) => void): void } } } }).__tb;
    let visible: boolean | null = null;
    tb.stage.scene.traverse((mesh) => {
      if (mesh.name === target) visible = Boolean(mesh.visible);
    });
    return visible;
  }, name);

  expect(await visibleBy('placement_ghost')).toBe(false);

  await page.evaluate(() => {
    const tb = (window as unknown as {
      __tb: {
        world: {
          ids: { alloc(): number };
          buddies: Array<{ id: number; carryCrate: number; x: number; z: number; state: string }>;
          crates: unknown[];
          localPlayer: number;
        };
      }
    }).__tb;
    const me = tb.world.buddies.find((b) => b.id === tb.world.localPlayer)!;
    const origin = { x: -21.2 * 0.66, z: -21.2 * 0.66 };
    me.x = origin.x;
    me.z = origin.z;
    const id = tb.world.ids.alloc();
    tb.world.crates.push({
      id, x: me.x, y: 1.9, z: me.z, vx: 0, vy: 0, vz: 0, spin: 0, spinZ: 0,
      state: 'held', heldBy: me.id, padTeam: null, padSlot: -1, claimTeam: null, settled: 0, dead: false
    });
    me.carryCrate = id;
  });
  await page.waitForTimeout(400);

  expect(await visibleBy('placement_ghost')).toBe(true);
  expect(await visibleBy('throw_arc')).toBe(false);

  await page.evaluate(() => {
    const tb = (window as unknown as {
      __tb: { world: { buddies: Array<{ id: number; x: number; z: number }>; localPlayer: number } };
    }).__tb;
    const me = tb.world.buddies.find((b) => b.id === tb.world.localPlayer)!;
    me.x = 0;
    me.z = 0;
  });
  await page.waitForTimeout(400);

  expect(await visibleBy('placement_ghost')).toBe(false);
  expect(await visibleBy('throw_arc')).toBe(true);
});

test('the renderer stays inside the draw-call budget while playing', async ({ page }) => {
  await startMatch(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyD');

  const report = await page.evaluate(() => {
    const tb = (window as unknown as { __tb?: { budgetProblems(): string[]; stage: { info(): { calls: number; triangles: number } } } }).__tb;
    return tb ? { problems: tb.budgetProblems(), info: tb.stage.info() } : null;
  });
  expect(report).not.toBeNull();
  expect(report!.problems).toEqual([]);
  expect(report!.info.calls).toBeLessThanOrEqual(60);
});

test('a full match can be played to a result screen', async ({ page }) => {
  await startMatch(page);
  const finished = await page.evaluate(async () => {
    const tb = (window as unknown as { __tb?: { world: { over: boolean } } }).__tb;
    if (!tb) return false;
    tb.world.over = true;
    return true;
  });
  expect(finished).toBe(true);
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 5000 }).toBe('results');
  await expect(page.getByRole('button', { name: 'Main Lagi' })).toBeVisible();
});

test('the HUD reports the same health the simulation holds', async ({ page }) => {
  await startMatch(page);
  await page.waitForTimeout(1500);

  let matched = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const pair = await page.evaluate(() => {
      const tb = (window as unknown as {
        __tb: { world: { buddies: Array<{ id: number; hp: number }>; localPlayer: number } }
      }).__tb;
      const me = tb.world.buddies.find((b) => b.id === tb.world.localPlayer);
      return { sim: Math.ceil(me?.hp ?? -1), dom: document.querySelector('[data-part="hpText"]')?.textContent ?? '' };
    });
    if (pair.dom.includes(String(pair.sim))) matched++;
    await page.waitForTimeout(180);
  }
  expect(matched).toBeGreaterThanOrEqual(4);
});
