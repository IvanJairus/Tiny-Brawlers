import { expect, test } from '@playwright/test';

/**
 * A six times CPU throttle on this machine is not a mid-range Android phone, and
 * this file does not claim to be that measurement. What it does catch is a
 * regression: if a change makes the main thread expensive, the frame budget is
 * missed here first, long before anyone has to find it on a device.
 */
test('the main thread holds 60 fps under six times cpu throttle', async ({ page, context }) => {
  test.setTimeout(120_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/?meter=1');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 20_000 }).toBe('title');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await page.waitForTimeout(12_000);

  const meter = (await page.locator('.meter').textContent()) ?? '';
  const p95 = Number((meter.match(/p95 ([\d.]+)ms/) ?? [])[1]);
  const fps = Number((meter.match(/(\d+) fps/) ?? [])[1]);

  expect(Number.isFinite(p95)).toBe(true);
  console.log(`throttled p95 ${p95}ms at ${fps} fps`);
  expect(p95).toBeLessThanOrEqual(20);
  expect(fps).toBeGreaterThanOrEqual(50);
  expect(meter).toMatch(/draw \d+/);

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
