import { expect, test } from '@playwright/test';
import { CHANGELOG, LATEST_CHANGE } from '../../lib/changelog/entries';
import { groupChangelogDays } from '../../lib/changelog/group';
import { canonicalPublicHref } from '../../lib/nav/publicRoutes';
import fs from 'node:fs/promises';

test.use({ timezoneId: 'Asia/Seoul' });

for (const theme of ['dark', 'light']) test(`What’s new groups local dates and categories and marks later same-day releases seen (${theme})`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.addInitScript(() => localStorage.setItem('arkpedia.changelog.seen', '2026-10-09T09:56:52Z'));
  await page.goto("/whats-new");
  const expected = groupChangelogDays(CHANGELOG, 'Asia/Seoul');
  const entries = page.locator('main .changelog-entry');
  await expect(entries).toHaveCount(expected.length);
  for (const day of expected) {
    const entry = entries.filter({ has: page.locator(`#changes-${day.day}`) });
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('h2 time')).toHaveAttribute('datetime', day.at);
    for (const kind of ['added', 'changed', 'fixed'] as const) {
      if (!day[kind]?.length) continue;
      await expect(entry.locator(`.is-${kind} h3`)).toHaveCount(1);
      await expect(entry.locator(`.is-${kind} li`)).toHaveCount(day[kind]!.length);
      for (const item of day[kind]!) {
        if (item.href) await expect(entry.getByRole('link', { name: item.title, exact: true })).toHaveAttribute('href', canonicalPublicHref(item.href));
        if (item.detail) await expect(entry).toContainText(item.detail);
      }
    }
  }
  const today = page.locator('#changes-2026-10-09').locator('..');
  await expect(today.getByRole('link', { name: 'Import a Friend', exact: true })).toHaveAttribute('href', '/friends');
  await expect(today).toContainText('Roaming chibis take a break');
  await expect(today).toContainText('Artwork for regional web events');
  await expect(today).toContainText('Fewer pauses in animated art');
  expect(await page.evaluate(() => localStorage.getItem('arkpedia.changelog.seen'))).toBe(LATEST_CHANGE);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await fs.mkdir('.cache/changelog-readability-qa', { recursive: true });
  await page.screenshot({ path: `.cache/changelog-readability-qa/${info.project.name}-${theme}.png` });
});
