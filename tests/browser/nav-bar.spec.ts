import { expect, test } from '@playwright/test';

/*
 * The framed bar (styles/core/nav.css): capped at the page's 1040px, with about 30px of slack at
 * that cap once the clock shows, so search is a magnifier and Support lives in About. The clock goes below 1055px and
 * the phone bar takes over below 901px. At every width it shows, nothing in it overlaps and no
 * link's label is clipped: the links clip their own labels instead of overflowing, so this is
 * the check that would see them squeezed.
 */

const WIDTHS = [1600, 1440, 1100, 1055, 1054, 1000, 960, 901];

test('the bar fits at every width it shows, without a clipped label or an overlap', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'widths are set here');
  await page.goto('/schedule');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.site-nav')).toBeVisible();
    const measured = await page.evaluate(() => {
      const items = [...document.querySelector('.site-nav-inner')!.children]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => { const box = el.getBoundingClientRect(); return { name: el.className.split(' ')[0], left: box.left, right: box.right }; });
      const overlaps = items.slice(1).filter((item, i) => item.left < items[i].right - 0.5).map((item) => item.name);
      const clipped = [...document.querySelectorAll('.site-nav-links > *, .site-nav-link')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.trim());
      const links = document.querySelector('.site-nav-links')!;
      const inner = document.querySelector('.site-nav-inner')!;
      const padding = parseFloat(getComputedStyle(inner).paddingRight);
      return { overlaps, clipped, overflow: links.scrollWidth > links.clientWidth + 1, right: items.at(-1)!.right, end: inner.getBoundingClientRect().right - padding };
    });
    expect(measured, `${width}px`).toMatchObject({ overlaps: [], clipped: [], overflow: false });
    expect(measured.right, `${width}px: the controls end inside the frame`).toBeLessThanOrEqual(measured.end + 0.5);
  }
});

test('the clock goes below 1055px and the phone bar takes over below 901px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'widths are set here');
  await page.goto('/schedule');
  const state = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    return page.evaluate(() => ({
      clock: getComputedStyle(document.querySelector('.site-nav .site-nav-clock')!).display !== 'none',
      bar: getComputedStyle(document.querySelector('.site-nav')!).display !== 'none',
    }));
  };
  expect(await state(1055)).toEqual({ clock: true, bar: true });
  expect(await state(1054)).toEqual({ clock: false, bar: true });
  expect((await state(900)).bar).toBe(false);
  await expect(page.locator('.mobile-nav-bar')).toBeVisible();
});

test('What\'s new, Credits and Support are in the About menu, not loose in the bar', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop bar');
  await page.goto('/schedule');
  const bar = page.locator('.site-nav');
  await expect(bar.getByRole('link', { name: 'Support', exact: true })).toHaveCount(0);
  await bar.getByRole('button', { name: 'About', exact: true }).click();
  const menu = bar.getByRole('menu', { name: 'About' });
  await expect(menu.getByRole('link')).toHaveText(["What's new", 'Credits', 'Support']);
});
