import { expect, type Page } from '@playwright/test';

// The maintainer requested the desktop square on phones too (2026-11-09).
// It floats above ordinary pages and steps aside for modal dialogs.
export const WIDTHS = [412, 390, 360];
export const NO_WIDGET = new Set(['/music', '/music/discover', '/games/music-guesser']);

/** Check the floating tile in every phone census state, including room at the page end. */
export async function musicTabCheck(page: Page, name: string, route: string) {
  const widget = page.locator('[data-music-widget]');
  if (NO_WIDGET.has(route)) {
    await expect(widget, `${route} does not float the widget`).toHaveCount(0);
    return;
  }
  await expect(widget, `${name} floats the widget`).toHaveCount(1);
  const modal = page.locator('[aria-modal="true"]:not(.mobile-nav-drawer:not(.open)), dialog[open]').filter({ visible: true });
  const opener = page.getByRole('button', { name: 'Expand player', exact: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    if (await modal.count()) {
      await expect(opener, `${width}px: the tile steps aside for the dialog`).toBeHidden();
      continue;
    }
    await expect(opener).toBeVisible();
    const box = (await opener.boundingBox())!;
    expect(box.width).toBe(44);
    expect(box.height).toBe(44);
    expect(Math.round(box.x + box.width)).toBe(width - 16);
    expect(box.y + box.height).toBeLessThanOrEqual(844 - 16);
    expect(await page.locator('main').first().evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual(76);
  }
}
