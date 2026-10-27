import { expect, type Page } from '@playwright/test';

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
  await page.waitForURL(url => url.pathname + url.search === href);
}

/** The selected sidebar item remains in the DOM while the phone dropdown is closed. */
export function musicViewLink(page: Page, name: string | RegExp) {
  return page.locator('nav[aria-label="Music"] a').filter({ hasText: name });
}

export async function openPlayerActions(page: Page) {
  const bar = page.getByRole('region', { name: 'Player', exact: true });
  const more = bar.getByRole('button', { name: 'More player actions', exact: true });
  if (!await more.isVisible()) {
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
