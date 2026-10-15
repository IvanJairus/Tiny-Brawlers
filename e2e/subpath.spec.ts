import { expect, test } from '@playwright/test';

/**
 * A project site on GitHub Pages is served from a repository subpath, not from a
 * domain root, and it has no SPA fallback. Everything here would pass at the root
 * of `vite preview` while the same build 404s its own fonts on Pages.
 */

test('the build survives being served under a repository subpath', async ({ page }) => {
  const missing: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('title');
  expect(page.url()).toMatch(/\/Tiny-Brawlers\/$/);

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      display: document.fonts.check('700 16px "Baloo 2"'),
      text: document.fonts.check('600 16px "Nunito Sans"')
    };
  });
  expect(fonts, 'font files must resolve relative to the subpath').toEqual({ display: true, text: true });

  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Petarung/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 15_000 }).toBe('playing');

  const canvas = page.locator('#stage canvas');
  const shot = await canvas.screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);

  expect(missing, 'no request may 404 under the subpath').toEqual([]);
});
