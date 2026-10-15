import { expect, test, type TestInfo } from '@playwright/test';

/**
 * Pixel comparison for the interface surfaces. The shot is the #ui box, which is
 * transparent, so the arena behind it is in the picture too and its animation
 * phase (water, idle bob, pad pulse) is not frozen. That is what the 1.5 percent
 * budget absorbs: this gate catches layout, chrome and art changes, and it will
 * not notice a small shift in a wave crest.
 */

type Page = import('@playwright/test').Page;

const ui = (page: Page) => page.locator('#ui');

function shot(name: string) {
  return { maxDiffPixelRatio: 0.015, animations: 'disabled' as const, name };
}

/**
 * Pins the interface layer and drops a full viewport shot next to it, for a human
 * to look at. The baseline covers the #ui box only; the review image shows the
 * whole frame, including the arena outside the HUD padding.
 */
async function pin(page: Page, name: string, info: TestInfo): Promise<void> {
  await expect(ui(page)).toHaveScreenshot(`${name}.png`, shot(`${name}.png`));
  await page.screenshot({ path: `test-results/visual-review/${info.project.name}-${name}.png` });
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

test('the title screen', async ({ page }, info) => {
  await openTitle(page);
  await pin(page, 'title', info);
});

test('the class select screen', async ({ page }, info) => {
  await openTitle(page);
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await pin(page, 'select', info);
});

test('the HUD three seconds into a match', async ({ page }, info) => {
  await startSolo(page);
  await advance(page, 90);
  await pin(page, 'playing', info);
});

test('the solo pause screen', async ({ page }, info) => {
  await startSolo(page);
  await advance(page, 30);
  await send(page, 'pause');
  await pin(page, 'paused', info);
});

test('the leave confirmation', async ({ page }, info) => {
  await startSolo(page);
  await advance(page, 30);
  await send(page, 'leave');
  await pin(page, 'confirming', info);
});

test('the connection lost notice', async ({ page }, info) => {
  await startSolo(page);
  await send(page, 'dropped');
  await pin(page, 'disconnected', info);
});

test('the results screen of a finished match', async ({ page }, info) => {
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
  await pin(page, 'results', info);
});
