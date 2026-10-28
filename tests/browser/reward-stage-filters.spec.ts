import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { stageKindsOf, type StageKind } from '../../lib/pulls/stageKinds';
import { readOnly } from './census-routes';
import { uncolouredLinks } from './layout-checks';

/* The bundled data/pull-sources.json may predate stage kinds (they arrive with the content
   release scripts/build/build-pull-sources.ts compiles), so the page's props get them here the
   way the build writes them: from the site's stage records, by stageKindsOf. */
const kinds = new Map<string, StageKind[]>();
for (const file of fs.readdirSync(path.join(process.cwd(), 'data', 'stages'))) {
  if (!file.endsWith('.json')) continue;
  const rec = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'stages', file), 'utf8'));
  if (rec.id) kinds.set(rec.id, stageKindsOf(rec));
}

type Item = { stages?: string[]; stageCodes?: string[]; stageKinds?: StageKind[][] };
let challengeStages = 0;
/* Adverse Environment stages, the six-star ones (EP15 on, "17-10 Adverse Combat") among them: by kind, or
   for a stage the records here predate, by the label the build gives it (lib/pulls/stageKinds.ts). */
let adverseStages = 0;
let sixStarStages = 0;
const welfareId = 'free:welfare:act51side:char_4223_botany';
const DAY = 86_400_000;
const trailId = 'free:trail:permanent_sidestory_4_Twilight_Of_Wolumonde:trailReward_sub_1_1';
/* One welfare row of each source, as build-free-rewards.mjs writes them (the bundled data/
   predates them), and an operator sign-in day, which is not a welfare operator. */
const welfareRows = (now: number, opened: number) => [
  { id: welfareId, group: 'Welfare operators', name: 'Botani · Event missions: Clear PA-4', rewards: [{ id: 'char_4223_botany', rarity: 5, name: 'Botani', count: 1 }],
    startAt: opened, endAt: now + 5 * DAY, event: 'People, A People', href: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', source: 'event', forecast: false },
  { id: 'free:act4mainssPermanent_5', group: 'Welfare operators', name: 'Viy · Event missions (permanent): Clear 17-13', rewards: [{ id: 'char_4226_veen', rarity: 6, name: 'Viy', count: 1 }],
    startAt: opened, eventEndAt: now + 7 * DAY, event: 'Critical Phase Transition', href: '/events/%5BCelebration%5D%20Critical%20Phase%20Transition', source: 'retro', forecast: false },
  { id: trailId, group: 'Welfare operators', name: 'Folinic · Record Restoration: 12 stars', rewards: [{ id: 'char_345_folnic', rarity: 5, name: 'Folinic', count: 1 }],
    startAt: opened, event: 'Twilight of Wolumonde', href: '/events/%5BSide%20Story%5D%20Twilight%20of%20Wolumonde', source: 'trail', forecast: false },
  { id: 'free:trail:permanent_sidestory_25_Here_A_People_Sows:trailReward_sub_25_1', group: 'Welfare operators', name: 'Wanqing · Record Restoration: 15 stars', rewards: [{ id: 'char_4119_wanqin', rarity: 5, name: 'Wanqing', count: 1 }],
    startAt: opened, event: 'Here A People Sows', source: 'trail', forecast: false },
  // A collab's operator, its event over: not obtainable (the server's projection drops it; the list must too).
  { id: 'free:36sideActivity_4', group: 'Welfare operators', name: 'Senshi · Event missions: Clear DT-4', rewards: [{ id: 'char_4144_senshi', rarity: 5, name: 'Senshi', count: 1 }],
    startAt: now - 400 * DAY, endAt: now - 380 * DAY, event: 'Delicious On Terra', source: 'event', forecast: false },
  // Viy's permanent mission kind for an event that has closed (still claimable: listed), and a
  // sign-in day's operator. It opens with the others, after the first paint (serve).
  { id: 'free:actXmainssPermanent_5', group: 'Welfare operators', name: 'Past · Event missions (permanent)', rewards: [{ id: 'char_x_past', rarity: 5, name: 'Pastoperator', count: 1 }],
    startAt: opened, eventEndAt: now - 16 * DAY, event: 'A closed event', source: 'retro', forecast: false },
  // An event's own operator whose row has no end of its own: not obtainable (the overview leaves
  // it out), and still in the Free rewards tab, for ticking, as no longer obtainable.
  { id: 'free:actYside_4', group: 'Welfare operators', name: 'Gone · Event missions: Clear GO-4', rewards: [{ id: 'char_y_gone', rarity: 4, name: 'Goneoperator', count: 1 }],
    startAt: opened, event: 'A finished event', source: 'event', forecast: false },
  { id: 'free:act59sign:2', group: 'Event sign-in and gifts', name: 'Celebration Login Event · Day 2', rewards: [{ id: 'char_4227_gallus', rarity: 1, name: 'GALLUS²', count: 1 }],
    startAt: opened, endAt: now + 7 * DAY, forecast: false },
];

async function serve(page: Page) {
  await readOnly(page);
  await page.route("**/reward-tracker", async (route) => {
    const response = await route.fetch(); const html = await response.text();
    const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)!;
    const data = JSON.parse(match[1]); const props = data.props.pageProps;
    challengeStages = 0; adverseStages = 0; sixStarStages = 0;
    for (const item of [...props.backlogSources.chapters, ...props.backlogSources.playable] as Item[]) {
      if (!item.stages) continue;
      item.stageKinds = item.stages.map((id) => kinds.get(id) ?? []);
      challengeStages += item.stageKinds.filter((list) => list.includes('challenge')).length;
      const sixStar = item.stages.map((id, index) => id.endsWith('#s') || / (?:Adverse Combat|6★)$/.test(item.stageCodes?.[index] ?? ''));
      sixStarStages += sixStar.filter(Boolean).length;
      adverseStages += item.stageKinds.filter((list, index) => list.includes('adverse') || sixStar[index]).length;
    }
    /* A welfare operator open now, as build-free-rewards.mjs writes one. It opens after the
       first paint's clock, so that paint matches the server's markup (which never had it), and
       the reader's clock (to the minute: lib/time/readerClock.ts) brings it in on mount. */
    const opened = props.now - 120_000;
    props.now -= 300_000;
    props.freeRewards = [...props.freeRewards.filter((reward: { group: string; id: string }) => reward.group !== 'Welfare operators' && reward.id !== 'free:act59sign:2'), ...welfareRows(Date.now(), opened)];
    props.rewardIcons = { ...props.rewardIcons, char_4223_botany: '/five-star-icons/Botani - Base.webp', char_4226_veen: '/six-star-icons/Viy - Base.webp',
      char_345_folnic: '/five-star-icons/Folinic - Base.webp', char_4119_wanqin: '/five-star-icons/Wanqing - Base.webp' };
    await route.fulfill({ response, body: html.replace(match[1], JSON.stringify(data).replace(/</g, '\\u003c')) });
  });
}
const op = (page: Page) => page.locator('.free-op-summary div').filter({ hasText: 'Originite Prime' }).locator('dd');
const number = async (page: Page) => Number((await op(page).textContent())!.replace(/[^\d]/g, ''));

test('the stage toggles start off, leave their stages out of the totals when on, and are remembered', async ({ page }) => {
  await serve(page);
  await page.goto("/reward-tracker");
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
  await page.goto("/reward-tracker");
  const list = page.getByRole('list', { name: 'Welfare operators to claim' });
  const row = list.getByRole('listitem').filter({ hasText: 'Botani' });
  await expect(row).toContainText('People, A People');
  await expect(row).toContainText('until');
  await row.getByRole('button', { name: 'Botani: operator preview' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Botani' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Claimed in the Free rewards tab, it is no longer still to claim.
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await page.locator('summary', { hasText: 'Welfare operators' }).click();
  const tab = page.getByRole('list', { name: 'Welfare operators: claimed' });
  await expect(tab.getByRole('listitem').filter({ hasText: 'People, A People' })).toHaveCount(1);
  // The cards' "Event page" links, and every other link on the tab, have a colour of their own
  // (layout-checks uncolouredLinks: the census's check, which its data has no such row for).
  await expect(tab.getByRole('link', { name: 'Event page' }).first()).toBeVisible();
  expect(await uncolouredLinks(page)).toEqual([]);
  // Unclaimed is the filter: the ticked row leaves the list (so click, not check).
  await page.getByRole('checkbox', { name: 'Botani · Event missions: Clear PA-4', exact: true }).click();
  await expect(page.locator('.free-op-welfare')).not.toContainText('Botani');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.past-rewards.v1')!).doneKeys)).toContain(welfareId);
});

test('Adverse Environment takes the six-star stages out too', async ({ page }) => {
  await serve(page);
  await page.goto("/reward-tracker");
  await expect(page.getByRole('button', { name: 'Botani: operator preview' })).toBeVisible();
  const before = await number(page);
  expect(sixStarStages).toBeGreaterThanOrEqual(31);
  await page.getByRole('checkbox', { name: 'Exclude Adverse Environment', exact: true }).check();
  await expect.poll(() => number(page)).toBe(before - adverseStages);
  await expect(page.locator('.free-op-excluded')).toContainText(`${adverseStages.toLocaleString('en-US')} stages left out`);
  await page.getByRole('checkbox', { name: 'Exclude Adverse Environment', exact: true }).uncheck();
  await expect.poll(() => number(page)).toBe(before);
});

test('the welfare panel is as tall as its cards once an import trims the list: no leftover hold', async ({ page }) => {
  await serve(page);
  // Every welfare row ticked by an import except Viy's: the first paint listed them all.
  const roster = { version: 1, server: 'en', importedAt: '2026-10-21T00:00:00.000Z', doctor: null, operators: ['Botani', 'Folinic', 'Wanqing', 'Pastoperator'],
    operatorIds: ['char_4223_botany', 'char_345_folnic', 'char_4119_wanqin', 'char_x_past'], skins: [], cleared: [], rewardClaims: { known: [], claimed: [] } };
  await page.addInitScript((value) => { localStorage.setItem('arkpediaAccount', JSON.stringify(value)); }, roster);
  await page.goto("/reward-tracker");
  const list = page.getByRole('list', { name: 'Welfare operators to claim' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  const panel = page.locator('.free-op-welfare');
  const { minHeight, height, content } = await panel.evaluate((el) => {
    const last = el.lastElementChild as HTMLElement;
    return { minHeight: (el as HTMLElement).style.minHeight, height: el.getBoundingClientRect().height, content: last.getBoundingClientRect().bottom - el.getBoundingClientRect().top };
  });
  expect(height, `held at ${minHeight || 'nothing'}: no taller than its cards`).toBeLessThanOrEqual(content + 2);
});

test('the welfare list holds only what is obtainable now, as cards, and an imported roster ticks its operators', async ({ page }) => {
  await serve(page);
  const roster = { version: 1, server: 'en', importedAt: '2026-10-21T00:00:00.000Z', doctor: null, operators: ['Wanqing'], operatorIds: ['char_4119_wanqin'],
    skins: [], cleared: [], rewardClaims: { known: [], claimed: [] } };
  await page.addInitScript((value) => { localStorage.setItem('arkpediaAccount', JSON.stringify(value)); }, roster);
  await page.goto("/reward-tracker");
  const list = page.getByRole('list', { name: 'Welfare operators to claim' });
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await page.getByRole('button', { name: 'Availability', exact: true }).click();
  // Soonest to close first, then the permanent ones (a main-story event's missions, Record Restoration).
  await expect(list.getByRole('listitem').nth(0)).toContainText('Botani');
  await expect(list.getByRole('listitem').filter({ hasText: 'Viy' })).toContainText('Critical Phase Transition · permanent');
  await expect(list.getByRole('listitem').filter({ hasText: 'Folinic' })).toContainText('Record Restoration · Twilight of Wolumonde');
  await expect(list.getByRole('listitem').filter({ hasText: 'Pastoperator' })).toContainText('A closed event · permanent');
  for (const gone of ['Senshi', 'GALLUS²', 'Wanqing', 'Goneoperator']) await expect(list).not.toContainText(gone);
  // A main-story event's permanent missions stay claimable after it, with the stage to clear.
  await expect(list.getByRole('listitem').filter({ hasText: 'Viy' })).toContainText('Clear 17-13');
  // Equal cards: every card the same width.
  const widths = await list.getByRole('listitem').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  // The card opens the preview; the event page is its own link.
  await expect(list.getByRole('listitem').filter({ hasText: 'Folinic' }).getByRole('link', { name: 'Event page' })).toHaveAttribute('href', /Twilight/);
  // Wanqing, in the roster: claimed in Free rewards, and not for unticking.
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.locator('summary', { hasText: 'Welfare operators' }).click();
  const wanqing = page.getByRole('checkbox', { name: 'Wanqing · Record Restoration: 15 stars', exact: true });
  await expect(wanqing).toBeChecked();
  await expect(wanqing).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Folinic · Record Restoration: 12 stars', exact: true })).not.toBeChecked();
});

const ROSTER = { version: 1, server: 'en', importedAt: '2026-10-21T00:00:00.000Z', doctor: null, operators: ['Wanqing'], operatorIds: ['char_4119_wanqin'],
  skins: [], cleared: [], rewardClaims: { known: [], claimed: [] } };
async function openWelfareTab(page: Page, show: 'All' | 'Unclaimed') {
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await page.getByRole('button', { name: show, exact: true }).click();
  await page.locator('summary', { hasText: 'Welfare operators' }).click();
  return page.getByRole('list', { name: 'Welfare operators: claimed' });
}

test('the Free rewards tab shows its welfare operators as the overview\'s cards, each ticked by its own checkbox, the import\'s locked', async ({ page }) => {
  await serve(page);
  await page.addInitScript((value) => { localStorage.setItem('arkpediaAccount', JSON.stringify(value)); }, ROSTER);
  await page.goto("/reward-tracker");
  await expect(page.getByRole('button', { name: 'Botani: operator preview' })).toBeVisible();
  const cards = await openWelfareTab(page, 'All');
  const card = (name: string) => cards.getByRole('listitem').filter({ hasText: name });
  // Every row the tab lists, the one no longer obtainable too (Senshi's, its end passed, the tab never listed).
  await expect(cards.getByRole('listitem')).toHaveCount(6);
  await expect(page.locator('.free-reward-row').filter({ hasText: 'Viy' })).toHaveCount(0);
  await expect(cards).not.toContainText('Senshi');
  // The overview's text, from the same helper: the task, the source, the end.
  await expect(card('Viy')).toContainText('Clear 17-13');
  await expect(card('Viy')).toContainText('Critical Phase Transition · permanent');
  await expect(card('Folinic')).toContainText('Record Restoration · Twilight of Wolumonde');
  await expect(card('Botani')).toContainText('until');
  await expect(card('Goneoperator')).toContainText('No longer obtainable');
  await expect(card('Goneoperator')).not.toContainText('until');
  await expect(card('Folinic').getByRole('link', { name: 'Event page' })).toHaveAttribute('href', /Twilight/);
  // Wanqing, in the roster: ticked, disabled, and saying why.
  const wanqing = page.getByRole('checkbox', { name: 'Wanqing · Record Restoration: 15 stars', exact: true });
  await expect(wanqing).toBeChecked();
  await expect(wanqing).toBeDisabled();
  await expect(card('Wanqing')).toContainText('In your roster');
  // A card's checkbox ticks and unticks its row, the overview following, and the card moves nothing.
  const botani = page.getByRole('checkbox', { name: 'Botani · Event missions: Clear PA-4', exact: true });
  await expect(botani).toBeEnabled();
  // Keep the card's position within its list and its size. Claiming also updates the
  // separate overview above this list, whose reflow is not movement within the card grid.
  const place = () => card('Botani').evaluate((el) => { const r = el.getBoundingClientRect(); const list = el.closest('ul')!.getBoundingClientRect(); return [r.left - list.left, r.top - list.top, r.width, r.height].map(Math.round); });
  // Measured once the faces have settled: on a slow runner the webfonts swapped in between the
  // two measurements and moved the card 3px with no tick involved (CI, 2026-10-22).
  await page.evaluate(() => document.fonts.ready);
  const before = await place();
  await botani.check();
  await expect(botani).toBeChecked();
  await expect(card('Botani')).toHaveClass(/is-claimed/);
  await expect(page.locator('.free-op-welfare')).not.toContainText('Botani');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.past-rewards.v1')!).doneKeys)).toContain(welfareId);
  // The tick draws text the page had not shown, which can fetch another font subset on a slow
  // runner (the 2px the card moved in CI, 2026-10-28): settled again before the second measure.
  await page.evaluate(() => document.fonts.ready);
  // To the pixel's rounding: a phone's fractional layout can land a box 1px either way.
  const after = await place();
  after.forEach((value, i) => expect(Math.abs(value - before[i]), `box ${i}: ${before[i]} -> ${value}`).toBeLessThanOrEqual(1));
  await botani.uncheck();
  await expect(botani).not.toBeChecked();
  await expect(page.locator('.free-op-welfare')).toContainText('Botani');
  // The card still opens the operator's preview.
  await card('Viy').getByRole('button', { name: 'Viy: operator preview' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Viy' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  // All claimed ticks every card; None claimed leaves the import's tick.
  const boxes = cards.getByRole('checkbox');
  await page.getByRole('button', { name: 'All claimed', exact: true }).click();
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'None claimed', exact: true }).click();
  await expect(wanqing).toBeChecked();
  await expect(cards.getByRole('checkbox', { checked: true })).toHaveCount(1);
  // Equal cards, in the overview's grid, inside the page.
  const widths = await cards.getByRole('listitem').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('"All claimed" under the Unclaimed filter empties the welfare group without moving the page (the Anti-Page Jump rule)', async ({ page }) => {
  await serve(page);
  await page.goto("/reward-tracker");
  await expect(page.getByRole('button', { name: 'Botani: operator preview' })).toBeVisible();
  const cards = await openWelfareTab(page, 'Unclaimed');
  await expect(cards.getByRole('listitem')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Read from as far down as still shows the button (the foot of the page at 1440; on a phone,
  // the six cards stacked, the button at the top of the screen), where losing the cards would
  // leave the document shorter than the reader's position needs, and the browser would clamp.
  const button = page.getByRole('button', { name: 'All claimed', exact: true });
  await button.evaluate((el) => {
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60;
    const toolbar = document.querySelector('.sticky-controls[data-sticky="true"]')?.getBoundingClientRect().height ?? 0;
    // Read with the action below both navigation layers, where a person can press it.
    window.scrollTo(0, Math.min(document.documentElement.scrollHeight, el.getBoundingClientRect().top + scrollY - Math.max(80, nav + toolbar + 12)));
  });
  await page.waitForTimeout(300);
  const at = () => page.evaluate(() => ({ y: Math.round(scrollY), top: Math.round(document.getElementById('free-rewards-title')!.getBoundingClientRect().top) }));
  const start = await at();
  expect(start.y).toBeGreaterThan(0);
  expect(await cards.evaluate((list) => document.documentElement.scrollHeight - list.getBoundingClientRect().height < scrollY + innerHeight), 'the cards going would clamp the scroll').toBe(true);
  await page.getByRole('button', { name: 'All claimed', exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await at()).toEqual(start);
});

for (const theme of ['dark', 'light'] as const) for (const width of [390, 1440]) {
  test(`the Free rewards tab's welfare cards at ${width}px, ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one capture per width, from the desktop project');
    await page.setViewportSize({ width, height: 900 });
    await serve(page);
    await page.addInitScript(({ theme, roster }) => { localStorage.setItem('theme', theme); localStorage.setItem('arkpediaAccount', JSON.stringify(roster)); }, { theme, roster: ROSTER });
    await page.goto("/reward-tracker");
    await expect(page.getByRole('button', { name: 'Botani: operator preview' })).toBeVisible();
    const cards = await openWelfareTab(page, 'All');
    await expect(cards.getByRole('listitem')).toHaveCount(6);
    await page.getByRole('checkbox', { name: 'Viy · Event missions (permanent): Clear 17-13', exact: true }).check();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.locator('.free-rewards details[open]').screenshot({ path: `test-results/welfare-tab-${width}-${theme}.png` });
  });
}

for (const theme of ['dark', 'light'] as const) for (const width of [390, 1440]) {
  test(`the welfare cards at ${width}px, ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one capture per width, from the desktop project');
    await page.setViewportSize({ width, height: 900 });
    await serve(page);
    await page.addInitScript((value) => { localStorage.setItem('theme', value); }, theme);
    await page.goto("/reward-tracker");
    const welfare = page.locator('.free-op-welfare');
    await expect(welfare.getByRole('listitem')).toHaveCount(5);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.locator('.free-op-overview').screenshot({ path: `test-results/welfare-cards-${width}-${theme}.png` });
  });
}

test('leaving Fully uncompleted view releases the expanded welfare height', async ({ page }) => {
  await serve(page);
  await page.addInitScript(() => localStorage.setItem('arkpediaAccount', JSON.stringify({
    version: 1, server: 'en', importedAt: '2026-10-26T00:00:00Z', doctor: null,
    operators: ['Wanqing', 'Folinic', 'Botani', 'Viy'], operatorIds: ['char_4119_wanqin', 'char_345_folnic', 'char_4223_botany', 'char_4226_veen'], skins: [], cleared: [],
  })));
  await page.goto("/reward-tracker");
  const welfare = page.locator('.free-op-welfare');
  await expect(welfare.getByRole('listitem')).toHaveCount(1);
  const height = () => welfare.evaluate(element => element.getBoundingClientRect().height);
  const before = await height();
  const demo = page.getByRole('checkbox', { name: 'Fully uncompleted view' });
  await demo.check();
  await expect(welfare.getByRole('listitem')).toHaveCount(5);
  expect(await height()).toBeGreaterThan(before);
  await demo.uncheck();
  await expect(welfare.getByRole('listitem')).toHaveCount(1);
  await expect.poll(height).toBeLessThanOrEqual(before + 2);
});
