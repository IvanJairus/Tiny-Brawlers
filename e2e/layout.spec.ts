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

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type Ring = { size: number; start: string; forward: string[]; backward: string[] };

async function focusRing(page: import('@playwright/test').Page): Promise<Ring> {
  const size = await page.evaluate((selector) => {
    const root = document.querySelector('#ui')?.lastElementChild;
    if (!root) return 0;
    root.querySelectorAll('[data-kb]').forEach((el) => el.removeAttribute('data-kb'));
    const items = Array.from(root.querySelectorAll(selector)).filter((el) => el.getClientRects().length > 0);
    items.forEach((el, i) => el.setAttribute('data-kb', String(i)));
    return items.length;
  }, FOCUSABLE);

  const read = () => page.evaluate(() => document.activeElement?.getAttribute('data-kb') ?? 'none');
  const reset = () => page.locator('[data-kb="0"]').first().evaluate((el) => el.focus());

  const start = await read();
  await reset();
  const forward: string[] = [];
  for (let i = 0; i <= size; i++) {
    forward.push(await read());
    await page.keyboard.press('Tab');
  }
  await reset();
  const backward: string[] = [];
  for (let i = 0; i <= size; i++) {
    backward.push(await read());
    await page.keyboard.press('Shift+Tab');
  }
  return { size, start, forward, backward };
}

function ringOf(size: number, step: number): string[] {
  return Array.from({ length: size + 1 }, (_, i) => String((((step * i) % size) + size) % size));
}

async function tabTo(
  page: import('@playwright/test').Page,
  text: string,
  match: 'exact' | 'has' = 'exact'
): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const focused: string = await page.evaluate(
      () => ((document.activeElement as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim()
    );
    if (match === 'exact' ? focused === text : focused.includes(text)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`focus never reached a control ${match} "${text}"`);
}

test('every menu is walkable and trapped by keyboard, and Enter plays the whole route in', async ({ page }) => {
  await page.goto('/?seed=4242');
  const screen = () => page.evaluate(() => document.body.dataset.screen);
  await expect.poll(screen).toBe('title');

  const title = await focusRing(page);
  expect(title.start, 'title must take focus when it opens').not.toBe('none');
  expect(title.size).toBeGreaterThanOrEqual(2);
  expect(title.forward).toEqual(ringOf(title.size, 1));
  expect(title.backward).toEqual(ringOf(title.size, -1));

  await tabTo(page, 'Main');
  await page.keyboard.press('Enter');
  await expect.poll(screen).toBe('select');

  const select = await focusRing(page);
  expect(select.start, 'select must take focus when it opens').not.toBe('none');
  expect(select.size).toBeGreaterThanOrEqual(2);
  expect(select.forward).toEqual(ringOf(select.size, 1));
  expect(select.backward).toEqual(ringOf(select.size, -1));

  await tabTo(page, 'Petarung', 'has');
  await page.keyboard.press('Enter');
  await tabTo(page, 'Main');
  await page.keyboard.press('Enter');
  await expect.poll(screen).toBe('playing');

  await page.keyboard.press('Escape');
  await expect.poll(screen).toBe('paused');
  const paused = await focusRing(page);
  expect(paused.start, 'paused must take focus when it opens').not.toBe('none');
  expect(paused.size).toBeGreaterThanOrEqual(2);
  expect(paused.forward).toEqual(ringOf(paused.size, 1));
  expect(paused.backward).toEqual(ringOf(paused.size, -1));

  await tabTo(page, 'Lanjut');
  await page.keyboard.press('Enter');
  await expect.poll(screen).toBe('playing');
});

const motionProbe = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    let slowest = 0;
    let loops = 0;
    for (const el of Array.from(document.querySelectorAll('#ui *'))) {
      const cs = getComputedStyle(el);
      for (const value of cs.transitionDuration.split(',')) {
        const number = parseFloat(value);
        slowest = Math.max(slowest, value.trim().endsWith('ms') ? number : number * 1000);
      }
      if (cs.animationName !== 'none' && cs.animationIterationCount.includes('infinite')) loops++;
    }
    return { slowest, loops };
  });

test('reduced motion turns the UI transitions off, and nothing loops by itself', async ({ page }) => {
  await startMatch(page);
  const full = await motionProbe(page);
  expect(full.slowest, 'the probe must find a transition, or the reduced check below proves nothing').toBeGreaterThan(1);
  expect(full.loops, 'no endless CSS animation is allowed to run without a trigger').toBe(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await motionProbe(page);
  expect(reduced.slowest).toBeLessThan(1);
  expect(reduced.loops).toBe(0);
});

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

    const zoomOf = () => page.evaluate(() => (window as unknown as { __tb: { zoom(): number } }).__tb.zoom());
    const before = await zoomOf();

    // The ring is absolutely positioned inside the stick zone, so a wide enough
    // zone can spill over the thumb buttons and swallow their taps.
    const clashes = await page.locator('.stick-ring').evaluate((ring) => {
      const a = ring.getBoundingClientRect();
      return Array.from(document.querySelectorAll('.action-cluster .btn'))
        .map((node) => {
          const b = node.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          return { label: node.textContent ?? '', overlap };
        })
        .filter((row) => row.overlap > 0);
    });
    expect(clashes).toEqual([]);

    await page.locator('[data-action="zoomOut"]').tap();
    await page.waitForTimeout(400);
    expect(await zoomOf()).toBeGreaterThan(before);
  } else {
    await expect(page.locator('[data-action="zoomOut"]')).toBeHidden();
    const zoomOf = () => page.evaluate(() => (window as unknown as { __tb: { zoom(): number } }).__tb.zoom());
    const before = await zoomOf();
    await page.mouse.move(300, 200);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    expect(await zoomOf()).toBeGreaterThan(before);
  }
});

test('the game is still playable when the browser has no audio device', async ({ page }) => {
  const thrown: string[] = [];
  page.on('pageerror', (error) => thrown.push(error.message));
  await page.addInitScript(() => {
    const unavailable = function AudioUnavailable() { throw new Error('no audio device'); };
    Object.defineProperty(window, 'AudioContext', { value: unavailable, configurable: true });
    Object.defineProperty(window, 'webkitAudioContext', { value: unavailable, configurable: true });
  });

  await startMatch(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');

  const tick = await page.evaluate(() => (
    window as unknown as { __tb: { world: { tick: number } } }
  ).__tb.world.tick);
  expect(tick).toBeGreaterThan(10);
  expect(thrown).toEqual([]);
});

test('text mode renders the live world as readable text that stays on screen', async ({ page }) => {
  await page.goto('/?ascii=1&seed=5');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('playing');
  await page.waitForTimeout(700);

  const view = await page.locator('[data-part="asciiView"]').evaluate((el) => {
    const lines = (el.textContent ?? '').split('\n');
    const box = el.getBoundingClientRect();
    return {
      lines: lines.length,
      gridWidth: Math.max(...lines.slice(2, 35).map((row) => row.length)),
      widest: Math.max(...lines.map((row) => row.length)),
      first: lines[0],
      spillTop: Math.max(0, -box.top),
      spillLeft: Math.max(0, -box.left),
      spillRight: Math.max(0, box.right - window.innerWidth),
      spillBottom: Math.max(0, box.bottom - window.innerHeight)
    };
  });

  expect(view.lines).toBe(36);
  expect(view.gridWidth).toBe(65);
  expect(view.widest).toBeLessThanOrEqual(65);
  expect(view.first).toMatch(/^tick \d+/);
  expect([view.spillTop, view.spillLeft, view.spillRight, view.spillBottom]).toEqual([0, 0, 0, 0]);
  await expect(page.locator('[data-part="asciiView"]')).toContainText('@');
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
  await expect(page.locator('.stat-list dt')).toHaveText([
    'Rakitan', 'Tumbang', 'Peti dikirim', /^Bertahan/, 'Tim Merah', 'Tim Biru', 'Tim Kuning', 'Tim Sian'
  ]);
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

