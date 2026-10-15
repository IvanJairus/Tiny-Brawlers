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

