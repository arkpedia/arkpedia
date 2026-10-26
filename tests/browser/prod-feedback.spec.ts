import { expect, test } from '@playwright/test';
import { PLANNER_PLAN, plannerExperimental } from './census-routes';
import fs from 'node:fs';

const captures = '/tmp/arkpedia-prod-feedback-qa';
test.beforeAll(() => fs.mkdirSync(captures, { recursive: true }));

test('Story list reports progress and continuation survives reload', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia.story-progress.v1', JSON.stringify({ main_0: [0, 1, 2, 3, 4, 5, 6] })));
  await page.goto('/story?chapter=main_0');
  const dialog = page.locator('.story-chapter-dialog');
  await expect(dialog.getByRole('link', { name: /Continue reading/ })).toHaveAttribute('href', /&7$/);
  await expect(dialog.getByRole('status')).toContainText('50% read');
  await page.screenshot({ path: `${captures}/story-${info.project.name}.png` });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /^Full List/ }).click();
  const chapter = page.locator('.story-list-card[href="/story?chapter=main_0"]');
  await expect(chapter).toContainText('50% read');
  await expect(page.locator('.story-list-card[href="/story?chapter=main_1"]')).toContainText('Unread');
  await chapter.click();
  // The card is a client-side link: reloading before it lands reloads the list without the
  // chapter (it failed that way once on a loaded runner, dev Check 38336857836).
  await expect(page).toHaveURL(/[?&]chapter=main_0(&|$)/);
  await expect(dialog).toBeVisible();
  await page.reload();
  await expect(dialog.getByRole('link', { name: /Continue reading/ })).toHaveAttribute('href', /&7$/);
});

test('Planner includes each operator before its portrait and mutes excluded rows without moving them', async ({ page }, info) => {
  await page.goto('/planner'); await plannerExperimental(page, PLANNER_PLAN);
  const row = page.locator('.plan-row').first();
  const check = row.getByRole('checkbox');
  const before = await row.boundingBox();
  const boxes = await row.evaluate(el => ({ check: el.querySelector('.plan-row-check')!.getBoundingClientRect().right, face: el.querySelector('.plan-face')!.getBoundingClientRect().left }));
  expect(boxes.check).toBeLessThan(boxes.face);
  await check.uncheck(); await expect(row).toHaveClass(/is-excluded/);
  expect(await row.locator('.plan-face').evaluate(el => getComputedStyle(el).filter)).toBe('grayscale(1)');
  expect(await row.boundingBox()).toEqual(before);
  await page.screenshot({ path: `${captures}/planner-${info.project.name}.png` });
  await check.check(); await expect(row).not.toHaveClass(/is-excluded/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('Reward Tracker lists Paradox, pinboard, beginner selector and sign-in claims with persistent ticks', async ({ page }, info) => {
  await page.goto("/reward-tracker");
  await page.getByRole('tab', { name: 'Paradox Simulations', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Paradox Simulations/ })).toBeVisible();
  const summary = page.locator('.free-op-summary');
  const before = await summary.innerText();
  const paradox = page.getByRole('checkbox', { name: '12F · Survivor: claimed', exact: true });
  await paradox.check(); expect(await summary.innerText()).not.toBe(before);
  await page.reload();
  await page.getByRole('tab', { name: 'Paradox Simulations', exact: true }).click();
  await expect(paradox).toBeChecked();
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  const free = page.locator('.free-rewards');
  await expect(page.getByRole('heading', { name: 'Reward Tracker', exact: true })).toBeVisible();
  const selector = free.getByRole('button', { name: /× Senior Operator Transfer Permit/ }).first();
  await expect(selector).toBeVisible();
  await selector.click(); await expect(page.getByRole('tooltip')).toContainText('Senior Operator Transfer Permit');
  await page.keyboard.press('Escape');
  await expect.poll(() => selector.locator('img').evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: `${captures}/free-rewards-${info.project.name}.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  if (viewport) await page.setViewportSize(viewport);
  await free.getByText('Pinboard missions', { exact: true }).click();
  await free.getByRole('searchbox', { name: 'Search free rewards' }).fill('Phase 1 Reward');
  await expect(free).toContainText('Phase 1 Reward');
  const tick = free.getByRole('checkbox', { name: 'Phase 1 Reward', exact: true });
  await tick.click(); await expect(tick).toHaveCount(0); // Unclaimed view removes fulfilled rewards.
  await free.getByRole('button', { name: 'Claimed', exact: true }).click();
  await expect(tick).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('An owned outfit is fulfilled across the gallery and shared plan', async ({ page }) => {
  await page.goto('/skins');
  const payload = await page.locator('#__NEXT_DATA__').textContent();
  const skin = JSON.parse(payload!).props.pageProps.skins.find((skin: { skinId?: string; model: string }) => skin.skinId && skin.model);
  await page.evaluate(skin => {
    localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-12T12:00:00Z', doctor: 'Test', operators: [], skins: [skin.skinId], cleared: [] }));
    localStorage.setItem('arkpediaSkinPlan', JSON.stringify([`${skin.model} / ${skin.name}`, 'Unknown / Preserved']));
  }, skin);
  await page.goto(`/skins?skin=${encodeURIComponent(skin.name)}`);
  await expect(page.locator('.skin-modal').getByRole('button', { name: '✓ Owned', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaSkinPlan')!))).toEqual(['Unknown / Preserved']);
});

test('Roaming chibi controls reveal on hover, touch and keyboard', async ({ page, isMobile }) => {
  await page.goto('/operators/Thorns');
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Chibi animation', exact: true })).toContainText('Idle');
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming');
  const controls = pet.locator('.chibi-roaming-controls');
  await page.mouse.move(0, 0);
  await expect(controls).toBeHidden();
  if (isMobile) await pet.locator('canvas').tap(); else await pet.hover();
  await expect(controls).toBeVisible();
  await pet.getByRole('button', { name: 'Pause walking', exact: true }).click();
  await expect(pet.getByRole('button', { name: 'Resume walking', exact: true })).toBeVisible();
  if (isMobile) {
    await expect(controls).toBeHidden({ timeout: 7000 });
    await pet.locator('canvas').tap();
    await expect(controls).toBeVisible();
  }
  await page.keyboard.press('Tab'); await pet.focus();
  await expect(controls).toBeVisible();
  await pet.press('Escape'); await expect(pet).toHaveCount(0);
});
