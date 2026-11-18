import { expect, test } from '@playwright/test';
import { STORY_PROGRESS_KEY } from '../../lib/story/storyProgress';
import type { Section, SectionTag } from '../../lib/story/storyChapters';
import review from '../../scripts/tests/fixtures/story-monster-hunter.json';

const title = 'Thunder in the Azure Dream';
const reader = 'https://arknights.timo.beer/story.html#side&act50side&';
const tags: Record<string, SectionTag> = { 'Before Operation': 'before', 'After Operation': 'after' };
const sections = review.act50side.infoUnlockDatas.map((row, index): Section =>
  [index, row.storyCode, row.storyName, tags[row.avgTag] ?? '']);

for (const theme of ['dark', 'light']) test(`Thunder opens the Timo chapter dialog (${theme})`, async ({ page }) => {
  await page.addInitScript(({ theme, key }) => {
    localStorage.setItem('theme', theme);
    localStorage.setItem(key, JSON.stringify({ native_act50side: [1] }));
  }, { theme, key: STORY_PROGRESS_KEY });

  // Exercise the current chapter alongside a stale fallback row from an older release.
  await page.route(/\/story\?/, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const html = await response.text();
    const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)!;
    const data = JSON.parse(match[1]);
    const props = data.props.pageProps;
    props.chapters = { ...props.chapters, act50side: sections };
    props.library = [
      ...props.library.filter((entry: { id: string }) => !['act50side', 'native_act50side'].includes(entry.id)),
      { id: 'act50side', title, category: 'side', url: reader + '0' },
      { id: 'native_act50side', title, category: 'side', url: '/story/read?chapter=act50side' },
    ];
    await route.fulfill({ response, body: html.replace(match[1], JSON.stringify(data).replace(/</g, '\\u003c')) });
  });

  await page.goto(`/story?view=list&q=${encodeURIComponent(title)}`);
  const card = page.getByRole('link', { name: new RegExp(title) });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Unread');
  await card.press('Enter');
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('8 stages · 18 parts');
  const next = dialog.getByRole('link', { name: 'Continue reading' });
  await expect(next).toHaveAttribute('href', reader + '0');
  const before = dialog.getByRole('link', { name: /TD-1 Shellbound Cowards, before/ });
  const after = dialog.getByRole('link', { name: /TD-1 Shellbound Cowards, after/ });
  await expect(before).toHaveAttribute('href', reader + '1');
  await expect(after).toHaveAttribute('href', reader + '2');
  await expect(after).toHaveAttribute('target', '_blank');
  await expect(dialog.getByRole('link', { name: /TD-ST-2 The Hunt Goes On/ })).toHaveAttribute('href', reader + '17');

  await dialog.getByRole('button', { name: 'Mark TD-ST-1 Sandstorm Rising as read' }).click();
  await expect(next).toHaveAttribute('href', reader + '1');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STORY_PROGRESS_KEY))
    .toMatchObject({ act50side: [0], native_act50side: [1] });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.goto('/story/read?chapter=act50side&part=2');
  expect(new URL(page.url()).pathname).toBe('/story');
  expect(new URL(page.url()).searchParams.get('view')).toBe('list');
  await expect(dialog).toBeVisible();
});
