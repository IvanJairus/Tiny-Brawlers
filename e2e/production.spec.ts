import { expect, test } from '@playwright/test';

/**
 * Everything else in this folder runs against the dev server because it needs the
 * debug handle. This file runs against `vite preview`, which serves the exact
 * artifact that would be deployed, so a build that only works in dev cannot pass.
 */

async function startSoloMatch(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('playing');
}

test('the deployed bundle boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await startSoloMatch(page);
  await page.waitForTimeout(2500);

  expect(errors).toEqual([]);
});

test('the audio context is only created by the gesture that starts play', async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    const counter = window as unknown as { __audioContexts: number };
    counter.__audioContexts = 0;
    class Counting extends Real {
      constructor(...args: ConstructorParameters<typeof AudioContext>[]) {
        super(...args);
        counter.__audioContexts++;
      }
    }
    window.AudioContext = Counting as unknown as typeof AudioContext;
  });

  const count = () => page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  expect(await count()).toBe(0);

  await page.getByRole('button', { name: 'Main', exact: true }).click();
  expect(await count()).toBe(0);
  await startSoloMatch(page);

  expect(await count()).toBe(1);
});

test('the fonts ship inside the bundle and no third-party host is called', async ({ page }) => {
  const external: string[] = [];
  const fontFiles: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost') external.push(url.href);
    if (url.pathname.endsWith('.woff2')) fontFiles.push(url.pathname);
  });

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');

  const faces = await page.evaluate(async () => {
    const loaded = await Promise.all([
      document.fonts.load('700 20px "Baloo 2"'),
      document.fonts.load('700 20px "Nunito Sans"')
    ]);
    return loaded.flat().map((face) => ({ family: face.family, status: face.status }));
  });

  expect(faces.length).toBe(2);
  expect(faces.every((face) => face.status === 'loaded')).toBe(true);
  expect(fontFiles.sort()).toEqual([
    '/fonts/baloo2-latin.woff2',
    '/fonts/nunito-sans-latin.woff2'
  ]);
  expect(external).toEqual([]);
});

test('the deployed bundle lays out correctly on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await startSoloMatch(page);

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  }));
  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
  expect(metrics.scrollHeight).toBe(metrics.clientHeight);

  const hudVisible = await page.locator('.card-player').isVisible();
  expect(hudVisible).toBe(true);
});

test('the deployed bundle renders a real frame, not a black canvas', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await page.waitForTimeout(2000);

  const canvas = page.locator('#stage canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(600);

  const shot = await canvas.screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);
});

test('the on-device performance meter reports frame time', async ({ page }) => {
  await page.goto('/?meter=1');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await page.waitForTimeout(2500);

  const text = (await page.locator('.meter').textContent()) ?? '';
  expect(text).toMatch(/\d+ fps/);
  expect(text).toMatch(/p95 \d+\.\d+ms/);
  expect(text).toMatch(/draw \d+/);
});

test('a long session does not grow the DOM or leak heap', async ({ page }) => {
  test.setTimeout(120_000);
  await startSoloMatch(page);
  await page.waitForTimeout(5000);

  const nodesAt = () => page.evaluate(() => document.querySelectorAll('*').length);
  const heapAt = () => page.evaluate(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize : 0;
  });

  const before = { nodes: await nodesAt(), heap: await heapAt() };
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(45_000);
  await page.keyboard.up('KeyD');
  const after = { nodes: await nodesAt(), heap: await heapAt() };

  expect(after.nodes).toBeLessThan(before.nodes + 40);
  if (before.heap > 0 && after.heap > 0) {
    expect(after.heap).toBeLessThan(before.heap * 1.8);
  }
});

test('the production build ships no debug handle', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);
  const hasHandle = await page.evaluate(() => '__tb' in window);
  expect(hasHandle).toBe(false);
});


test('the deployed bundle walks the whole screen route', async ({ page }) => {
  await page.goto('/');
  const screen = () => page.evaluate(() => document.body.dataset.screen);
  await expect.poll(screen, { timeout: 15_000 }).toBe('title');

  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await expect.poll(screen).toBe('select');
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await expect.poll(screen).toBe('playing');
  await expect(page.locator('.card-player')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect.poll(screen).toBe('paused');
  await page.getByRole('button', { name: /Keluar ke Judul/ }).click();
  await expect.poll(screen).toBe('title');
});

for (const size of [{ width: 1440, height: 900 }, { width: 740, height: 360 }, { width: 390, height: 844 }]) {
test(`the built bundle has no sideways leak and no overlapping cards at ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size);
  await startSoloMatch(page);

  const layout = await page.evaluate(() => {
    const boxes = ['.card-player', '.card-scoreboard', '.card-pad:not(.is-hidden)']
      .map((selector) => document.querySelector(selector))
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => el.getBoundingClientRect());
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      boxes: boxes.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }))
    };
  });

  console.log(`prod: ${layout.boxes.length} HUD cards measured at ${size.width}x${size.height}`);
  expect(layout.boxes.length, 'the probe must see the HUD cards or the overlap loop proves nothing').toBeGreaterThanOrEqual(2);
  expect(layout.overflowX).toBe(0);
  for (let i = 0; i < layout.boxes.length; i++) {
    for (let j = i + 1; j < layout.boxes.length; j++) {
      const a = layout.boxes[i];
      const b = layout.boxes[j];
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlaps, `card ${i} overlaps card ${j}`).toBe(false);
    }
  }
});
}
