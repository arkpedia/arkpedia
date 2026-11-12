import { expect, test } from '@playwright/test';

/*
 * The framed bar (styles/core/nav.css): capped at the page's 1040px, with about 1px of slack at
 * that cap, so search is a magnifier and Support its heart. The clock goes below 1100px and
 * the phone bar takes over below 901px. At every width it shows, nothing in it overlaps and no
 * link's label is clipped: the links clip their own labels instead of overflowing, so this is
 * the check that would see them squeezed.
 */

const WIDTHS = [1600, 1440, 1100, 1099, 1000, 960, 959, 901];

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

test('the clock goes below 1100px and the phone bar takes over below 901px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'widths are set here');
  await page.goto('/schedule');
  const state = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    return page.evaluate(() => ({
      clock: getComputedStyle(document.querySelector('.site-nav .site-nav-clock')!).display !== 'none',
      bar: getComputedStyle(document.querySelector('.site-nav')!).display !== 'none',
    }));
  };
  expect(await state(1100)).toEqual({ clock: true, bar: true });
  expect(await state(1099)).toEqual({ clock: false, bar: true });
  expect((await state(900)).bar).toBe(false);
  await expect(page.locator('.mobile-nav-bar')).toBeVisible();
});

test('About groups site information and Support', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop bar');
  await page.goto('/schedule');
  await page.locator('.site-nav').getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.locator('.site-nav-pop').getByRole('link', { name: 'Support', exact: true })).toHaveAttribute('href', '/support');
  await expect(page.locator('.site-nav-pop').getByRole('link', { name: /^What's new/ })).toHaveAttribute('href', "/whats-new");
});

test('long menus stay reachable in a short window and close before header utilities open', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sets desktop and phone viewports itself');
  await page.setViewportSize({ width: 1100, height: 320 });
  await page.goto('/schedule');
  await page.locator('.site-nav').getByRole('button', { name: 'Database', exact: true }).click();
  const last = page.locator('.site-nav-pop').getByRole('link', { name: 'Voice Actors', exact: true });
  await last.scrollIntoViewIfNeeded();
  const box = await last.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  await page.locator('.site-nav').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.site-nav-menu .site-nav-pop')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Settings', exact: true }).getByRole('button', { name: 'Import / export', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Choose Background Music', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: 'Use original visualizer waves' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.site-nav .site-nav-clock button')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.site-nav .profile-avatar-trigger')).toBeFocused();
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.locator('.site-nav').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
});

/* Schedule is a menu of its two views (the owner, 2026-10-29), not a link with tabs on the
   page: the menu names both, lights the one showing, and picking one switches the page. */
test('Schedule is a menu of Events and Calendar, lit by the view showing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the phone bar has the drawer instead');
  await page.goto('/schedule');
  await expect(page.getByRole('tablist', { name: 'Schedule view' })).toHaveCount(0);
  const trigger = page.locator('[data-menu="schedule"]');
  await expect(trigger).toHaveClass(/\bactive\b/);
  await trigger.click();
  const menu = page.locator('#site-nav-schedule');
  await expect(menu.getByRole('link')).toHaveText(['Events', 'Calendar']);
  await expect(menu.getByRole('link', { name: 'Events' })).toHaveClass(/\bactive\b/);
  await menu.getByRole('link', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/\/schedule\?view=calendar$/);
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await trigger.click();
  await expect(menu.getByRole('link', { name: 'Calendar' })).toHaveClass(/\bactive\b/);
  await expect(menu.getByRole('link', { name: 'Events' })).not.toHaveClass(/\bactive\b/);
  await menu.getByRole('link', { name: 'Events' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
  // Elsewhere neither is lit, and the menu is not.
  await page.goto('/farming');
  await expect(trigger).not.toHaveClass(/\bactive\b/);
});
