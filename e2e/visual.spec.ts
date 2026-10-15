import { expect, test, type TestInfo } from '@playwright/test';

/**
 * Pixel comparison for the interface surfaces. The canvas is hidden before each
 * shot so the comparison is DOM only: the arena behind the transparent UI box
 * animates on a wall clock, and that phase is not frozen by this build.
 */

type Page = import('@playwright/test').Page;

const ui = (page: Page) => page.locator('#ui');

/**
 * 1.5 percent of a 1440x900 frame is about 19k pixels, which is what let a copy
 * change on the results list pass while the committed baseline still showed the
 * old words. With the canvas out of the shot, only text and boxes remain, so the
 * budget can be two orders of magnitude tighter.
 */
const DIFF_RATIO = 0.0015;

function shot(name: string) {
  return { maxDiffPixelRatio: DIFF_RATIO, animations: 'disabled' as const, name };
}

/**
 * Writes a full viewport shot for a human first, then hides the arena and pins
 * the interface layer.
 */
async function pin(page: Page, name: string, info: TestInfo): Promise<void> {
  await page.screenshot({ path: `test-results/visual-review/${info.project.name}-${name}.png` });
  await page.addStyleTag({ content: '#stage canvas { visibility: hidden }' });
  await expect(ui(page)).toHaveScreenshot(`${name}.png`, shot(`${name}.png`));
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
    (window as unknown as { __tb: { world: { winner: string | null } } }).__tb.world.winner = 'red';
  });
  await advance(page, 0);
  await page.evaluate(() => {
    (window as unknown as { __tb: { world: { over: boolean } } }).__tb.world.over = true;
  });
  await send(page, 'finished');
  await pin(page, 'results', info);
});
