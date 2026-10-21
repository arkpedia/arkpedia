import { expect, test, type Page } from '@playwright/test';
import { censusWidth } from './layout-checks';
import { setTheme } from './overlay-checks';

/*
 * The list pages' filters on a phone (components/ui/FilterSheet). The owner's review,
 * 2026-10-22: "On mobile, filters consume the entire first screen" -- at 390 the roster's
 * first card started under rows of rarity, class, faction, owned and sort controls, and
 * /artists and /voice-actors had their own 420px of them. Under 720px the toolbar is the
 * search (and a page's tab strip), a Filters button with a count and a chip per filter on;
 * the button opens every other control in the site's modal dialog. Over 720px nothing
 * changed. Both projects (1440 and 390), both themes.
 */

test.setTimeout(120000);

interface Place {
  route: string;
  /** The list's first item. */
  item: string;
  /** A filter to press in the sheet, the chip it adds, and the address key it writes. */
  press: (scope: Page | ReturnType<Page['getByRole']>) => ReturnType<Page['getByRole']>;
  chip: string;
  key: string;
}

const PLACES: Place[] = [
  { route: '/operators', item: 'main .roster-card', press: (s) => s.getByRole('button', { name: '6-star', exact: true }), chip: '6★', key: 'rarity' },
  { route: '/artists', item: 'main .credit-person', press: (s) => s.getByRole('button', { name: '6-star', exact: true }), chip: '6★', key: 'rarity' },
  { route: '/voice-actors', item: 'main .credit-person', press: (s) => s.getByRole('button', { name: '6-star', exact: true }), chip: '6★', key: 'rarity' },
  { route: '/skins', item: 'main .skin-card', press: (s) => s.getByRole('group', { name: 'Skin availability' }).getByRole('button', { name: 'Shop', exact: true }), chip: 'Shop', key: 'availability' },
];

/** Where the list starts, the bar's top and the reader's scroll: what may not move. */
const frame = (page: Page) => page.evaluate(() => ({
  main: Math.round(document.querySelector('main')!.getBoundingClientRect().top),
  bar: Math.round(document.querySelector('.filter-bar')!.getBoundingClientRect().top),
  scroll: Math.round(scrollY),
}));

async function query(page: Page, key: string, value: string | null) {
  await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value);
}

for (const theme of ['dark', 'light'] as const) {
  for (const place of PLACES) {
    test(`${place.route}: the filters fold into a sheet on a phone and stay put on a desktop (${theme})`, async ({ page }) => {
      const width = await censusWidth(page);
      await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* private mode */ } }, theme);
      await page.goto(place.route);
      await expect(page.locator(place.item).first()).toBeVisible();
      await setTheme(page, theme);
      const filters = page.getByRole('button', { name: /^Filters/ });

      if (width === 1440) {
        // Unchanged: no Filters button, no chips, every control in the toolbar.
        await expect(filters).toBeHidden();
        await expect(page.locator('.filter-bar')).toBeHidden();
        await expect(place.press(page)).toBeVisible();
        await place.press(page).click();
        await query(page, place.key, place.route === '/skins' ? 'shop' : '6');
        await expect(page.locator('.filter-tag')).toBeHidden();
        return;
      }

      // The first item of the list is on the first screen, with room to see it.
      const first = await page.locator(place.item).first().evaluate((el) => el.getBoundingClientRect().top);
      expect(first, 'the first list item starts on the first screen').toBeLessThan(844 - 300);
      // Every filter is behind the button.
      await expect(place.press(page)).toHaveCount(0);
      await expect(filters).toHaveText(/^Filters$/);
      const before = await frame(page);

      // Opened from the keyboard: the sheet is labelled, holds focus, and Escape closes it,
      // handing focus back to the button. The page under it does not move.
      await filters.focus();
      await page.keyboard.press('Enter');
      const sheet = page.getByRole('dialog', { name: 'Filters' });
      await expect(sheet).toBeVisible();
      await expect(sheet).toBeFocused();
      expect(await frame(page), 'opening the sheet').toEqual(before);
      expect(await page.evaluate(() => getComputedStyle(document.body).overflow), 'the page under the sheet does not scroll').toBe('hidden');
      // Tab stays inside it.
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('dialog.filter-sheet')), `Tab ${i + 1} stays in the sheet`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(filters).toBeFocused();
      expect(await frame(page), 'closing the sheet').toEqual(before);

      // A filter pressed in the sheet applies at once, and adds a chip and a count.
      await filters.click();
      await expect(sheet).toBeVisible();
      await place.press(sheet).click();
      await query(page, place.key, place.route === '/skins' ? 'shop' : '6');
      await expect(filters).toHaveText(/^Filters\s*1$/);
      const chip = page.locator('.filter-tag', { hasText: place.chip });
      await expect(chip).toHaveCount(1);
      expect(await frame(page), 'applying a filter under the sheet').toEqual(before);
      await sheet.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(sheet).toHaveCount(0);
      expect(await frame(page), 'Done').toEqual(before);

      // The chip's × is the site's ×, and removes the filter without moving anything.
      const x = chip.getByRole('button', { name: `Remove filter: ${place.chip}` });
      const box = await x.evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { cls: el.className, border: s.borderTopWidth, fill: s.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) };
      });
      expect(box.cls).toContain('btn-x');
      expect(box.border).toBe('0px');
      expect(box.fill).toBe('rgba(0, 0, 0, 0)');
      expect(box.w).toBe(box.h);
      await x.click();
      await query(page, place.key, null);
      await expect(page.locator('.filter-tag')).toHaveCount(0);
      await expect(filters).toHaveText(/^Filters$/);
      await expect(filters).toBeFocused();
      expect(await frame(page), 'removing a chip').toEqual(before);

      // Reset in the sheet clears what the chips show.
      await filters.click();
      await place.press(sheet).click();
      await expect(page.locator('.filter-tag')).toHaveCount(1);
      await sheet.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(page.locator('.filter-tag')).toHaveCount(0);
      await query(page, place.key, null);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
    });
  }
}

test('a shared address opens on its chips, and the sheet keeps the page under it when scrolled', async ({ page }) => {
  const width = await censusWidth(page);
  test.skip(width !== 390, 'the sheet is the phone layout');
  await page.goto('/operators?class=Sniper&rarity=6&faction=Rhodes%20Island');
  await expect(page.locator('main .roster-card').first()).toBeVisible();
  await expect(page.locator('.filter-tag')).toHaveText(['6★', 'Sniper', 'Rhodes Island']);
  await expect(page.getByRole('button', { name: /^Filters/ })).toHaveText(/^Filters\s*3$/);
  // Many chips scroll inside the bar; the page does not widen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // From further down a long list: the bar near the top of the screen, then a filter in the
  // sheet that leaves a handful of cards. The page may not clamp the reader upward.
  // The roster restores its last filters from this browser (operatorsFilters): start clean.
  await page.evaluate(() => localStorage.removeItem('operatorsFilters'));
  await page.goto('/operators');
  await expect(page.locator('main .roster-card').first()).toBeVisible();
  await expect(page.locator('.filter-tag')).toHaveCount(0);
  await page.locator('.filter-bar').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40));
  await page.waitForTimeout(300);
  const before = await frame(page);
  await page.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: '1-star', exact: true }).click();
  await query(page, 'rarity', '1');
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(300);
  expect(await frame(page), 'a filter that shortens the list').toEqual(before);
  await page.getByRole('button', { name: 'Remove filter: 1★', exact: true }).click();
  await query(page, 'rarity', null);
  await page.waitForTimeout(300);
  expect(await frame(page), 'removing it again').toEqual(before);
});
