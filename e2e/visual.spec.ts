import { expect, test } from '@playwright/test';

/**
 * Pixel comparison for the interface surfaces. Only #ui is captured: the canvas
 * is drawn on a wall-clock animation curve (water, idle bob, pad pulse), so its
 * pixels cannot be pinned to a committed baseline without freezing that clock,
 * which this build deliberately does not do.
 */

type Page = import('@playwright/test').Page;

const ui = (page: Page) => page.locator('#ui');

function shot(name: string) {
  return { maxDiffPixelRatio: 0.015, animations: 'disabled' as const, name };
}

/**
 * Pins the interface layer and drops a full screen shot, arena included, where a
 * human can look at it. The review image is not asserted on: the canvas runs on a
 * wall-clock animation curve, so its pixels move between runs.
 */
async function pin(page: Page, name: string): Promise<void> {
  await expect(ui(page)).toHaveScreenshot(`${name}.png`, shot(`${name}.png`));
  await page.screenshot({ path: `test-results/visual-review/${name}.png` });
}

async function send(page: Page, event: string): Promise<void> {
  await page.evaluate((name) => {
    (window as unknown as { __tb: { send(event: string): void } }).__tb.send(name);
  }, event);
}

async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __tb: { advance(ticks: number): void } }).__tb.advance(count);
  }, ticks);
}

async function openTitle(page: Page): Promise<void> {
  await page.goto('/?seed=7');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
}

async function startSolo(page: Page): Promise<void> {
  await openTitle(page);
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('playing');
}

test('the title screen', async ({ page }) => {
  await openTitle(page);
  await pin(page, 'title');
});

test('the class select screen', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await pin(page, 'select');
});

test('the HUD three seconds into a match', async ({ page }) => {
  await startSolo(page);
  await advance(page, 90);
  await pin(page, 'playing');
});

test('the solo pause screen', async ({ page }) => {
  await startSolo(page);
  await advance(page, 30);
  await send(page, 'pause');
  await pin(page, 'paused');
});

test('the leave confirmation', async ({ page }) => {
  await startSolo(page);
  await advance(page, 30);
  await send(page, 'leave');
  await pin(page, 'confirming');
});

test('the connection lost notice', async ({ page }) => {
  await startSolo(page);
  await send(page, 'dropped');
  await pin(page, 'disconnected');
});

test('the results screen of a finished match', async ({ page }) => {
  await startSolo(page);
  await advance(page, 900);

  // No match clock exists yet and an unattended brawl at this seed had not
  // decided a winner after 400 simulated seconds, so the ending is forced here.
  // Everything else on the screen is real: the stats come from the drained
  // event log of those 900 ticks.
  await page.evaluate(() => {
    const tb = (window as unknown as { __tb: { world: { over: boolean; winner: string | null } } }).__tb;
    tb.world.over = true;
    tb.world.winner = 'red';
  });
  await send(page, 'finished');
  await pin(page, 'results');
});
