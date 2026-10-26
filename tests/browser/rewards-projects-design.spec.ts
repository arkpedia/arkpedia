import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { markDocument, sameDocument } from './youtube-stub';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() })));
});

for (const theme of ['dark', 'light']) {
  test(`reward totals, completion and shared import dialog (${theme})`, async ({ page }, info) => {
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/free-op');
    await expect(page.locator('.free-op-summary > div')).toHaveCount(4);
    const prime = page.locator('.free-op-summary > div').filter({ hasText: 'Originite Prime' });
    await expect(prime.locator('img')).toBeVisible();
    const before = await prime.locator('dd').textContent();
    const first = page.locator('.pulls-past-section .pulls-past-row input[type="checkbox"]').first();
    await first.check();
    await expect(prime.locator('dd')).not.toHaveText(before!);
    await page.getByRole('checkbox', { name: 'Exclude Challenge Mode', exact: true }).check();
    const importButton = page.locator('.page-header-actions').getByRole('button', { name: 'Import / export', exact: true });
    await importButton.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    const url = page.url();
    await markDocument(page);
    await importButton.click();
    const dialog = page.getByRole('dialog', { name: 'Import / export', exact: true });
    await expect(dialog.getByRole('tab', { name: 'Game import', exact: true })).toBeVisible();
    await dialog.getByRole('tab', { name: 'Backups', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(importButton).toBeFocused();
    await sameDocument(page);
    expect(page.url()).toBe(url);
    expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThanOrEqual(1);
    await expect(first).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Exclude Challenge Mode', exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fs.mkdir('.cache/rewards-projects-qa', { recursive: true });
    await page.screenshot({ path: `.cache/rewards-projects-qa/rewards-${info.project.name}-${theme}.png` });
  });

  test(`project cards, artwork and World navigation (${theme})`, async ({ page }, info) => {
    test.setTimeout(60000);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/community/projects');
    const cards = page.locator('.community-project');
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Timo’s Arknights Story Reader', exact: true })).toBeVisible();
    const reader = page.locator('.community-project-actions a').filter({ hasText: 'Read the stories' });
    await expect(reader).toHaveAttribute('href', 'https://arknights.timo.beer/');
    await expect(reader).toHaveAttribute('target', '_blank');
    for (const art of await page.locator('.community-project-art > img').all()) {
      await expect.poll(() => art.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fs.mkdir('.cache/rewards-projects-qa', { recursive: true });
    await page.screenshot({ path: `.cache/rewards-projects-qa/projects-${info.project.name}-${theme}.png`, fullPage: true });
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
      const community = page.getByRole('dialog', { name: 'Site navigation', exact: true }).getByRole('button', { name: 'Community', exact: true });
      await expect(community).toHaveAttribute('aria-expanded', 'true');
    } else await page.locator('[data-menu="community"]').click();
    const world = page.getByRole('link', { name: 'World', exact: true });
    const projects = page.getByRole('link', { name: 'Community projects', exact: true });
    await expect(world).toBeVisible(); await expect(projects).toBeVisible();
    expect(await world.locator('svg').innerHTML()).not.toBe(await projects.locator('svg').innerHTML());
    await world.click();
    await expect(page.getByRole('heading', { name: 'World', exact: true })).toBeVisible({ timeout: 30000 });
  });
}

test('planner and catalogue import controls open the same dialog in place', async ({ page }, info) => {
  test.setTimeout(90000);
  for (const path of ['/pulls', '/planner', '/operators', '/selector-tickets']) {
    await page.goto(path);
    if (path === '/operators' && info.project.name === 'mobile') await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const opener = page.locator('.data-link:visible').first();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Import / export', exact: true });
    await expect(dialog.getByRole('tab', { name: 'Game import', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});
