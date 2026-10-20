import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { stageKindsOf, type StageKind } from '../../lib/pulls/stageKinds';
import { readOnly } from './census-routes';

/* The bundled data/pull-sources.json may predate stage kinds (they arrive with the content
   release scripts/build/build-pull-sources.ts compiles), so the page's props get them here the
   way the build writes them: from the site's stage records, by stageKindsOf. */
const kinds = new Map<string, StageKind[]>();
for (const file of fs.readdirSync(path.join(process.cwd(), 'data', 'stages'))) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'stages', file), 'utf8'));
  if (rec.id) kinds.set(rec.id, stageKindsOf(rec));
}

type Item = { stages?: string[]; stageKinds?: StageKind[][] };
let challengeStages = 0;
const welfareId = 'free:welfare:act51side:char_4223_botany';

async function serve(page: Page) {
  await readOnly(page);
  await page.route('**/free-op', async (route) => {
    const response = await route.fetch(); const html = await response.text();
    const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)!;
    const data = JSON.parse(match[1]); const props = data.props.pageProps;
    challengeStages = 0;
    for (const item of [...props.backlogSources.chapters, ...props.backlogSources.playable] as Item[]) {
      if (!item.stages) continue;
      item.stageKinds = item.stages.map((id) => kinds.get(id) ?? []);
      challengeStages += item.stageKinds.filter((list) => list.includes('challenge')).length;
    }
    /* A welfare operator open now, as build-free-rewards.mjs writes one. It opens after the
       first paint's clock, so that paint matches the server's markup (which never had it), and
       the reader's clock (to the minute: lib/time/readerClock.ts) brings it in on mount. */
    const opened = props.now - 120_000;
    props.now -= 300_000;
    props.freeRewards = [...props.freeRewards, { id: welfareId, group: 'Welfare operators', name: 'Botani',
      rewards: [{ id: 'char_4223_botany', rarity: 5, name: 'Botani', count: 1 }], startAt: opened, endAt: Date.now() + 5 * 86_400_000,
      event: 'People, A People', href: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', forecast: false }];
    await route.fulfill({ response, body: html.replace(match[1], JSON.stringify(data).replace(/</g, '\\u003c')) });
  });
}
const op = (page: Page) => page.locator('.free-op-summary div').filter({ hasText: 'Originite Prime' }).locator('dd');
const number = async (page: Page) => Number((await op(page).textContent())!.replace(/[^\d]/g, ''));

test('the stage toggles start off, leave their stages out of the totals when on, and are remembered', async ({ page }) => {
  await serve(page);
  await page.goto('/free-op');
  for (const label of ['Exclude Challenge Mode', 'Exclude H stages', 'Exclude Adverse Environment', 'Exclude S stages']) {
    await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
  }
  await expect(page.locator('.free-op-excluded')).toHaveText(/Every stage counts/);
  // The welfare operator comes in on mount; measure once the overview is whole.
  await expect(page.getByRole('button', { name: 'Botani: operator preview' })).toBeVisible();
  const before = await number(page);
  expect(challengeStages).toBeGreaterThan(100);
  // Where the toggles' block ends: the welfare list below it (whose art loads on its own time).
  const below = () => page.locator('.free-op-overview').evaluate((el) =>
    el.querySelector('.free-op-welfare')!.getBoundingClientRect().top - el.querySelector('.free-op-filters')!.getBoundingClientRect().top);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const height = await below();

  await page.getByRole('checkbox', { name: 'Exclude Challenge Mode', exact: true }).check();
  await expect.poll(() => number(page)).toBe(before - challengeStages);
  await expect(page.locator('.free-op-excluded')).toContainText(`${challengeStages.toLocaleString('en-US')} stages left out, ${challengeStages.toLocaleString('en-US')} OP.`);
  // A toggle changes numbers, never the toggles' block's height (the Anti-Page Jump rule).
  expect(await below()).toBe(height);
  expect(await page.evaluate(() => localStorage.getItem('arkpedia.reward-tracker-filters.v1'))).toBe('{"exclude":["challenge"]}');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Exclude Challenge Mode', exact: true })).toBeChecked();
  await expect.poll(() => number(page)).toBe(before - challengeStages);
  await page.getByRole('checkbox', { name: 'Exclude Challenge Mode', exact: true }).uncheck();
  await expect.poll(() => number(page)).toBe(before);
});

test('a welfare operator open now is listed with its event and end, opens the operator preview, and leaves once claimed', async ({ page }) => {
  await serve(page);
  await page.goto('/free-op');
  const list = page.getByRole('list', { name: 'Welfare operators to claim' });
  const row = list.getByRole('listitem').filter({ hasText: 'Botani' });
  await expect(row).toContainText('People, A People');
  await expect(row).toContainText('Until');
  await row.getByRole('button', { name: 'Botani: operator preview' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Botani' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Claimed in the Free rewards tab, it is no longer still to claim.
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await page.locator('summary', { hasText: 'Welfare operators' }).click();
  await expect(page.locator('.free-reward-row').filter({ hasText: 'From People, A People' })).toHaveCount(1);
  // Unclaimed is the filter: the ticked row leaves the list (so click, not check).
  await page.getByRole('checkbox', { name: 'Botani', exact: true }).click();
  await expect(page.locator('.free-op-welfare')).not.toContainText('Botani');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.past-rewards.v1')!).doneKeys)).toContain(welfareId);
});
