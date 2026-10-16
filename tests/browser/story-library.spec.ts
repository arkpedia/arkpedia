import { expect, test } from '@playwright/test';
import { rowCensus } from './row-census';
import libraryData from '../../data/story-library.json';
import mapData from '../../data/story-map.json';
import { STORY_CATEGORIES } from '../../lib/story/storyLibrary';

test('list content mounts in batches; full search, category counts and portraits stay available', async ({ page }) => {
  // Hold intersections to verify that off-screen content is absent from the DOM.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { value: class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        if (target.classList.contains('load-on-scroll') && target.closest('.story-library')) Object.defineProperty(window, 'storyNextBatch', { configurable: true, value: () => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) });
      }
      disconnect() {} unobserve() {}
    }, configurable: true });
  });
  await page.goto('/story?view=list');
  const cards = page.locator('.story-library .story-list-card');
  await expect(cards).toHaveCount(48);
  const total = libraryData.entries.length + mapData.manga.length;
  await expect(page.locator('.story-library-count')).toHaveText(`${total} stories`);
  await page.evaluate(() => (window as unknown as { storyNextBatch: () => void }).storyNextBatch());
  await expect(cards).toHaveCount(96);
  await page.getByRole('combobox', { name: 'Story category' }).click();
  const options = page.getByRole('option');
  await expect(options).toHaveText([`All categories (${total})`, ...STORY_CATEGORIES.map(([id, label]) => `${label} (${id === 'manga' ? mapData.manga.length : libraryData.entries.filter(entry => entry.category === id).length})`)]);
  await page.getByRole('option', { name: 'Operator Records (372)', exact: true }).click();
  await expect(cards).toHaveCount(48);
  await page.getByRole('searchbox', { name: 'Search stories' }).fill('Ling');
  const ling = cards.filter({ hasText: /^Ling \[/ }).first();
  await expect(ling).toBeVisible();
  await expect(ling.locator('img')).toHaveAttribute('src', /star-icons\/Ling/);
  await expect(ling.locator('img')).toHaveAttribute('loading', 'lazy');
  await ling.click();
  await expect(page.locator('.story-chapter-dialog')).toBeVisible();
});

test('approaching the end loads another batch without changing the full category count', async ({ page }) => {
  await page.goto('/story?view=list&category=record');
  const cards = page.locator('.story-library .story-list-card');
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();
  const records = libraryData.entries.filter(entry => entry.category === 'record').length;
  expect(before).toBeLessThan(records);
  await cards.last().focus();
  await cards.last().scrollIntoViewIfNeeded();
  await expect.poll(() => cards.count()).toBeGreaterThan(before);
  await expect(page.locator('.story-library-count')).toHaveText(`${records} stories`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the complete library navigates categories and opens an off-canvas module', async ({ page }) => {
  await page.goto('/story?view=list&category=module&q=Ling');
  await expect(page.locator('.page-header h1')).toBeVisible();
  await expect(page.locator('.page-header-actions')).toBeVisible();
  const title = await page.locator('.page-header h1').boundingBox();
  const actions = await page.locator('.page-header-actions').boundingBox();
  expect(title && actions).toBeTruthy();
  expect(title!.x + title!.width <= actions!.x + 1 || title!.y + title!.height <= actions!.y + 1, 'the compact header actions do not overlap the title').toBe(true);
  const library = page.locator('.story-library');
  await expect(library.getByRole('heading', { name: /Modules/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(rowCensus, { centre: 2, height: 1 })).toEqual([]);
  const card = library.getByRole('link', { name: /Ling, SUM Y/ });
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.locator('.story-chapter-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toContainText('Ling, SUM Y');
  const link = dialog.getByRole('link', { name: /Continue reading/ });
  await expect(link).toHaveAttribute('href', 'https://arknights.timo.beer/story.html#module&uniequip_002_ling&0');
  await dialog.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Read');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toContainText('Read');
  await expect(page.getByRole('searchbox', { name: 'Search stories' })).toHaveValue('Ling');
  await expect(page).toHaveURL(/chapter=uniequip_002_ling|q=Ling/);
  // A saved mark survives leaving and returning, without opening the external reader.
  await page.reload();
  await expect(library.getByRole('link', { name: /Ling, SUM Y/ })).toContainText('Read');
  await page.getByRole('searchbox', { name: 'Search stories' }).fill('');
  await page.getByRole('combobox', { name: 'Story category' }).click();
  await page.getByRole('option', { name: /^Vignettes/ }).click();
  await expect(library.getByRole('heading', { name: /Vignettes/ })).toBeVisible();
  await expect(library.getByRole('heading', { name: /Modules/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search, keyboard navigation, missing chapters and map/list transitions stay usable', async ({ page }) => {
  await page.goto('/story?view=list&category=main');
  const library = page.locator('.story-library');
  const category = page.getByRole('combobox', { name: 'Story category' });
  await category.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(library.getByRole('heading', { name: /Side Stories/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search stories' }).fill('no-such-story-zzzz');
  await expect(library.getByText('No stories match these filters.')).toBeVisible();
  await library.getByRole('button', { name: 'Clear filters' }).click();
  await expect(library.getByRole('heading', { name: /^Main Story \d+$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('.story-map-viewport')).toBeVisible();
  await page.getByRole('button', { name: /^List/ }).click();
  await expect(library).toBeVisible();
  await page.goto('/story?view=list&chapter=missing-chapter');
  await expect(page.getByText('This chapter is not available in the current catalogue.')).toBeVisible();
  await expect(page.getByText('This chapter is not available in the current catalogue.')).toBeInViewport();
  await expect(page.locator('.story-chapter-dialog')).toHaveCount(0);
});
