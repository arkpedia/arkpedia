import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { AccountRecord } from '@/lib/account/accountStore';
import type { PullHistory } from '@/lib/account/pulls';

/** A record as a build before the pull archive wrote it, its rows on the record: the page moves
 *  them into the archive once and shows them from there. */
function account(server: 'en' | 'kr', sessions: number): AccountRecord & { pulls: PullHistory } {
  return {
    version: 1, server, importedAt: '2026-10-17T01:00:00Z', doctor: 'History fixture', operators: [], skins: [], cleared: [],
    pulls: {
      rows: Array.from({ length: sessions }, (_, index) => Array.from({ length: index === 0 ? 10 : 1 }, () => ({
        at: 1792198800 - index * 60, pool: `fixture_${server}`, char: 'char_002_amiya', star: 5,
      }))).flat(),
      pools: { [`fixture_${server}`]: `${server.toUpperCase()} fixture banner` }, names: {}, readAt: '2026-10-17T01:00:00Z', error: null,
    },
  };
}

async function seed(page: Page) {
  await page.goto('/account');
  await page.evaluate(({ shown, other }) => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(shown));
    localStorage.setItem('arkpediaOtherAccounts', JSON.stringify({ kr: other }));
  }, { shown: account('en', 65), other: account('kr', 3) });
  await page.reload();
  await page.getByRole('tab', { name: 'Pull history', exact: true }).click();
}

test('rows an older build kept on the records move into the archive once, and the records keep their read status', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.account-pulls-stats').getByText('74', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const archives = JSON.parse(localStorage.getItem('arkpediaPullArchives') ?? '[]') as { server: string; uid: string; history: { rows: unknown[] } }[];
    const shown = JSON.parse(localStorage.getItem('arkpediaAccount')!), others = JSON.parse(localStorage.getItem('arkpediaOtherAccounts')!);
    return { archives: archives.map(entry => [`${entry.server}:${entry.uid}`, entry.history.rows.length]), shown: shown.pulls, other: others.kr.pulls };
  })).toEqual({ archives: [['en:unknown', 74], ['kr:unknown', 12]], shown: { readAt: '2026-10-17T01:00:00Z', error: null }, other: { readAt: '2026-10-17T01:00:00Z', error: null } });
  // A second visit finds nothing to move: the archive text is the same.
  const before = await page.evaluate(() => localStorage.getItem('arkpediaPullArchives'));
  await page.reload();
  await page.getByRole('tab', { name: 'Pull history', exact: true }).click();
  await expect(page.locator('.account-pulls-stats').getByText('74', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaPullArchives'))).toBe(before);
});

test('Every pull mounts on request, grows on scroll, and keeps summaries and full CSV available', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('tabpanel', { name: 'Pull history', exact: true }).getByText('Browser only', { exact: false })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Every pull', exact: true });
  const sessions = page.locator('.account-pulls-session');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sessions).toHaveCount(0);
  await expect(page.locator('.account-pulls-stats').getByText('74', { exact: true })).toBeVisible();
  await expect(page.locator('.account-pulls-banner-name')).toHaveText('EN fixture banner');

  // Export still includes every row before any individual history has been mounted.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const file = await download;
  const csv = await readFile((await file.path())!, 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(75);
  expect(csv).toContain('EN fixture banner');
  expect(csv).not.toContain('KR fixture banner');
  await expect(sessions).toHaveCount(0);

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toBeFocused();
  await expect(sessions).toHaveCount(20);
  if (process.env.ARKPEDIA_QA_CAPTURE) {
    await page.locator('.account-pulls-op img').first().evaluate(image => (image as HTMLImageElement).decode().catch(() => {}));
    await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/structured-history-${test.info().project.name}.png`, fullPage: false, animations: 'disabled' });
  }
  await expect(sessions.first().locator('.account-pulls-op')).toHaveCount(10);
  await expect(sessions.first()).toContainText('×10');
  await expect(sessions.first().getByRole('link').first()).toHaveAttribute('href', '/operators/Amiya');
  for (const image of await sessions.first().locator('img').all()) await expect(image).toHaveAttribute('loading', 'lazy');

  await sessions.last().scrollIntoViewIfNeeded();
  await expect.poll(() => sessions.count()).toBeGreaterThan(20);
  while (await sessions.count() < 65) {
    const count = await sessions.count();
    await sessions.last().scrollIntoViewIfNeeded();
    await expect.poll(() => sessions.count()).toBeGreaterThan(count);
  }
  await expect(sessions).toHaveCount(65);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sessions).toHaveCount(0);
  await expect(page.locator('.account-pulls-list-head + div .load-on-scroll')).toHaveCount(0);
  await toggle.click();
  await expect(sessions).toHaveCount(20);
});

test('switching imported servers closes individual history and shows only the selected account', async ({ page }) => {
  await seed(page);
  const toggle = page.getByRole('button', { name: 'Every pull', exact: true });
  await toggle.click();
  await expect(page.locator('.account-pulls-session')).toHaveCount(20);
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('group', { name: 'Server', exact: true }).getByRole('button', { name: 'Korea', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Server', exact: true }).getByRole('button', { name: 'Korea', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Pull history', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.account-pulls-session')).toHaveCount(0);
  await expect(page.locator('.account-pulls-banner-name')).toHaveText('KR fixture banner');
  await expect(page.locator('.account-pulls-stats').getByText('12', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(page.locator('.account-pulls-session')).toHaveCount(3);
  await expect(page.locator('.account-pulls-sessions')).not.toContainText('EN fixture banner');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.account-pulls-session')).toHaveCount(0);
});
