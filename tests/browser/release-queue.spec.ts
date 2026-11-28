import { expect, test } from '@playwright/test';
import type { ReleaseCommand, ReleaseEntry } from '@/lib/release-queue/types';
import { setTheme } from './overlay-checks';

test('review existing pages, save an optional major note, and approve a release', async ({ page }, info) => {
  const source = 'a'.repeat(40);
  let entry: ReleaseEntry = {
    source, base: 'b'.repeat(40), fingerprint: 'c'.repeat(64), pullRequest: 172,
    title: 'Planner and schedule update', paths: ['/pulls', '/schedule?view=calendar'],
    note: null, state: 'queued', target: null, revision: 1,
  };
  let confirmed = 0;
  let ready = false;
  await page.route('**/_next/data/**/dashboard/campaigns.json*', route => route.fulfill({ json: { pageProps: { catalog: null }, __N_SSP: true } }));
  await page.route('**/api/dashboard/releases', route => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON() as ReleaseCommand;
      if (command.action !== 'queue') expect(command.revision).toBe(entry.revision);
      if (command.action === 'save-note') entry = { ...entry, note: command.note, revision: entry.revision + 1 };
      if (command.action === 'publish') {
        confirmed++;
        entry = { ...entry, state: 'publishing', revision: entry.revision + 1 };
      }
      if (command.action === 'refresh') entry = { ...entry, state: 'published', revision: entry.revision + 1 };
    }
    return route.fulfill({ json: { entries: [entry], previewSource: source, readySource: ready ? source : null, publicationEnabled: true } });
  });
  await page.goto('/game-modes');
  await setTheme(page, info.project.name === 'mobile' ? 'light' : 'dark');
  await page.evaluate(() => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } })
    .next.router.push('/dashboard/campaigns?tab=releases'));
  const row = page.getByRole('button', { name: /Planner and schedule update/ });
  await row.focus();
  await row.press('Enter');
  const details = page.getByRole('region', { name: 'Release details' });
  await expect(details.getByRole('link', { name: 'Preview /pulls' })).toHaveAttribute('href', 'https://preview.arkpedia.net/pulls');
  await expect(details.getByRole('link', { name: 'Live /schedule?view=calendar' })).toHaveAttribute('href', 'https://www.arkpedia.net/schedule?view=calendar');
  await expect(details.getByRole('button', { name: 'Publish release' })).toHaveCount(0);
  await expect(details.getByText(/reusable full Check/)).toBeVisible();
  ready = true;
  await page.getByRole('button', { name: 'Refresh queue' }).click();
  await expect(details.getByRole('button', { name: 'Publish release' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await details.getByRole('checkbox', { name: 'Include an update note' }).check();
  await details.getByRole('textbox', { name: 'Note title' }).fill('The new planner');
  await details.getByRole('textbox', { name: 'Update notes' }).fill('Easier to plan pulls and look up dates.');
  await details.getByRole('checkbox', { name: 'Show as a major-update pop-up' }).check();
  await expect(details.getByRole('button', { name: 'Publish release' })).toBeDisabled();
  await details.getByRole('button', { name: 'Preview note' }).click();
  await expect(page.getByRole('dialog', { name: 'The new planner' })).toBeVisible();
  await page.keyboard.press('Escape');
  await details.getByRole('button', { name: 'Save note' }).click();
  await expect(details.getByRole('button', { name: 'Publish release' })).toBeEnabled();
  expect(confirmed).toBe(0);
  await details.getByRole('button', { name: 'Publish release' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Publish this release?' });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  expect(confirmed).toBe(0);
  await details.getByRole('button', { name: 'Publish release' }).click();
  await confirmation.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(details.getByRole('status')).toHaveText('Publishing');
  expect(confirmed).toBe(1);
  await details.getByRole('button', { name: 'Check status' }).click();
  await expect(details.getByRole('status')).toHaveText('Published');
  expect(entry.note?.major).toBe(true);
});
