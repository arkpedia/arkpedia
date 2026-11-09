import { expect, type Page } from '@playwright/test';

/** Playback can already have exposed the shared player on arrival. */
export async function expandMusicPlayer(page: Page) {
  const opener = page.getByRole('button', { name: 'Expand player', exact: true });
  const player = page.getByRole('region', { name: 'Player', exact: true });
  await expect.poll(async () => await opener.isVisible() || await player.isVisible()).toBe(true);
  if (await opener.isVisible()) {
    try { await opener.click({ timeout: 1000 }); }
    catch (error) { if (!await player.isVisible()) throw error; }
  }
  await expect(player).toBeVisible();
  return player;
}

/** Use the same sidebar destinations, through the hamburger dropdown on phones. */
export async function openMusicMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Music menu', exact: true });
  if (!await page.evaluate(() => matchMedia('(max-width: 999px)').matches)) return;
  // The phone header mounts after hydration. Do not mistake that first frame for desktop.
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

export async function chooseMusicView(page: Page, name: string | RegExp) {
  await openMusicMenu(page);
  const link = page.getByRole('navigation', { name: 'Music', exact: true }).getByRole('link', { name, exact: typeof name === 'string' });
  const href = await link.getAttribute('href');
  await link.click();
  const destination = new URL(href!, page.url());
  // A pending search can update q during the click. Assert the chosen navigation destination.
  await expect(page).toHaveURL(url => url.pathname === destination.pathname && ['view', 'panel', 'playlist', 'scope'].every(
    key => url.searchParams.get(key) === destination.searchParams.get(key),
  ));
  await expect(musicViewLink(page, name)).toHaveAttribute('aria-current', 'page');
}

/** The selected sidebar item remains in the DOM while the phone dropdown is closed. */
export function musicViewLink(page: Page, name: string | RegExp) {
  return page.locator('nav[aria-label="Music"] a').filter({ hasText: name });
}

export async function openPlayerActions(page: Page) {
  const bar = page.getByRole('region', { name: 'Player', exact: true });
  const more = bar.getByRole('button', { name: 'More player actions', exact: true });
  if (await page.evaluate(() => matchMedia('(max-width: 999px)').matches) && !await more.isVisible()) {
    await bar.getByRole('link', { name: /Open Now playing$/ }).click();
    await page.waitForURL(/view=player/);
  }
  await more.click();
}

/** Expanded playback controls remain one tap away from the phone's compact player. */
export async function clickMusicControl(page: Page, name: string | RegExp) {
  const bar = page.getByRole('region', { name: 'Player', exact: true });
  const control = bar.getByRole('button', { name, exact: typeof name === 'string' });
  const previous = page.url();
  const expand = new URL(previous).searchParams.get('view') !== 'player' && !await control.isVisible();
  if (expand) {
    await bar.getByRole('link', { name: /Open Now playing$/ }).click();
    await page.waitForURL(/view=player/);
  }
  await expect(control).toBeVisible();
  await control.click();
  if (expand) { await page.goBack(); await page.waitForURL(previous); }
}

/** Geometry checks and native drag coordinates need the overlay's final position. */
export async function waitForMusicOverlays(page: Page) {
  await page.evaluate(() => Promise.all(Array.from(document.querySelectorAll('.music-queue-drawer, .music-player-bottombar[data-minimizable], .music-floating-toggle, .music-player.collapsed'))
    .flatMap(el => el.getAnimations())
    .map(animation => animation.finished.catch(() => {}))));
}
