import { test, expect } from '@playwright/test';
import regional from '../../data/regional-schedules.json';
const NAME = '[Celebration] Sealed With Time';
const EVENT = '[Celebration] Critical Phase Transition';
test.beforeEach(async ({ page }) => {
  // These scenarios deliberately move the reader clock, including into 2030.
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() })));
});
async function expectClock(page: import('@playwright/test').Page, text: string) {
  const clock = page.locator('.site-nav-clock:visible').first();
  const inDrawer = !await clock.isVisible();
  if (inDrawer) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await expect(clock).toContainText(text);
  if (inDrawer) await page.keyboard.press('Escape');
}
async function account(page: import('@playwright/test').Page, server: string) {
  await page.evaluate(server => { localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server, importedAt: '2026-10-16T00:00:00Z', doctor: 'Regional QA', operators: [], skins: [], cleared: [] }));window.dispatchEvent(new Event('arkpediaAccountChanged')); }, server);
}

test('regional banner closes before Global and same-page account changes update live status', async ({ page }) => {
  const closing = new Date(regional.servers.jp.banners[NAME].endAt);
  await page.clock.setFixedTime(new Date(closing.getTime() - 60_000));
  await page.goto("/gacha-simulator");await account(page, 'jp');
  // Use the real record's stable name, independently of translated visible lineup text.
  const sidebar = page.locator('.gacha-banner-sidebar');
  await expect(sidebar).toContainText('LIVE NOW');
  expect(await page.locator('#__NEXT_DATA__').evaluate(el => JSON.parse(el.textContent!).props.pageProps.__contentTables['regional-schedules'].servers.jp.banners['[Celebration] Sealed With Time'].endAt)).toBe(closing.toISOString());
  await page.clock.setFixedTime(closing);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(sidebar.getByTitle(NAME,{exact:true})).toHaveCount(0);
  await account(page, 'en');
  await expect(sidebar.getByTitle(NAME,{exact:true})).toBeVisible();
  await account(page, 'kr');
  await expect(sidebar.getByTitle(NAME,{exact:true})).toHaveCount(0);
});

/* The owner's report (2026-10-21): in JP and KR mode the upcoming events, the CN predictions and
   Global's banner order were gone. JP and KR list Global's items in Global's order, on their own
   dates where they have them (lib/time/regional.ts). */
test('JP and KR list the same events and banners as Global, in the same order', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  const names = (selector: string, attribute?: string) => page.locator(selector).evaluateAll((nodes, attribute) => nodes.map(node => attribute ? node.getAttribute(attribute) : node.textContent?.trim()), attribute);
  await page.goto('/schedule');await account(page, 'en');
  await expect(page.locator('.events-row-name').first()).toBeVisible();
  const global = await names('.events-row-name');
  expect(global.length).toBeGreaterThan(5);
  // A CN-based prediction is among them, and stays one on JP and KR.
  const predicted = page.locator('.events-row').filter({ hasText: 'Predicted' }).first();
  await expect(predicted).toBeVisible();
  const predictedName = (await predicted.locator('.events-row-name').textContent())!;
  for (const server of ['jp', 'kr']) {
    await account(page, server);
    await expect(page.locator('html')).toHaveAttribute('data-site-server', server);
    await expect.poll(() => names('.events-row-name')).toEqual(global);
    await expect(page.locator('.events-row').filter({ has: page.locator('.events-row-name', { hasText: predictedName }) }).first()).toContainText('Predicted');
  }
  await page.goto("/gacha-simulator");await account(page, 'en');
  const sidebar = '.gacha-banner-sidebar-item';
  await expect(page.locator(sidebar).first()).toBeVisible();
  // Compare the measured virtual window, rather than its initial SSR batch.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
  const banners = await names(sidebar, 'title');
  expect(banners.length).toBeGreaterThan(3);
  for (const server of ['jp', 'kr']) {
    await account(page, server);
    await expect(page.locator('html')).toHaveAttribute('data-site-server', server);
    await expect.poll(() => names(sidebar, 'title')).toEqual(banners);
  }
});

test('selected-server Supplies use the reset weekday and actual sniper-chip rotation', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T18:59:00Z')); // JP Saturday 03:59 Sunday wall clock.
  await page.goto('/stages/supplies');await account(page,'jp');
  await expect(page.getByRole('button',{name:'Saturday, today',exact:true})).toHaveAttribute('aria-pressed','true');
  const sniper = page.locator('a.supply-card[href="/stages/content/weekly_2"]');
  await expect(sniper).toHaveClass(/open/);
  await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button',{name:'Sunday, today',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sniper).toHaveClass(/shut/);
  await account(page,'en');
  await expect(page.getByRole('button',{name:'Saturday, today',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sniper).toHaveClass(/open/);
});

test('regional event and shop deadlines stay distinct on schedule and skin planner', async ({page})=>{
  const closing = new Date(regional.servers.jp.events[EVENT].endAt);
  await page.clock.setFixedTime(new Date(closing.getTime()-60_000));
  await page.goto('/schedule');await account(page,'jp');
  const event = page.locator('.events-row').filter({hasText:EVENT});await expect(event).toBeVisible();
  await page.clock.setFixedTime(closing);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(event).toHaveCount(0);
  await account(page,'en');await expect(event).toBeVisible();
  const shop = regional.servers.kr.skinWindows.find(window=>window.event===EVENT && window.label==='New outfits')!;
  await page.clock.setFixedTime(new Date(Date.parse(shop.endAt)-60_000));await page.goto('/skin-planner');await account(page,'kr');
  // Global's own collection (its CN-projected main shop), moved onto KR's sale of the same outfits.
  const collection=page.getByRole('region',{name:`${EVENT.replace(/^\[[^\]]*\]\s*/, '')} · Main shop`,exact:true});await expect(collection).toBeVisible();
  await page.clock.setFixedTime(new Date(shop.endAt));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(collection).toHaveCount(0);
});


test('a saved Global deadline cannot keep a JP/KR goal reserved after its regional close', async ({ page }) => {
  const close = new Date(regional.servers.jp.banners[NAME].endAt);
  const plan = { version: 1, orundum: '12345', originite: '60', permits: '10', reservedOP: '42', until: '2026-10-28', manualEventDate: '', bannerName: '', monthlyCard: true, includeBacklog: false, annihilationDone: false, doneEvents: [], doneKeys: [], clearedReruns: [], future: {}, goals: [{ banner: NAME, spendOn: '2026-10-28', bannerEndAt: '2026-10-28T11:00:00.000Z', pulls: 80, ticketUsed: true, targets: [{ name: 'Amiya', copies: 2 }] }] };
  await page.addInitScript(plan => localStorage.setItem('arkpedia.pull-plan.v1', JSON.stringify(plan)), plan);
  await page.clock.setFixedTime(new Date(close.getTime() - 60_000));
  await page.goto("/pull-planner");await account(page,'jp');
  await expect(page.getByRole('heading',{name:/Your banners 1/})).toBeVisible();
  await expectClock(page, '03:59');
  const before = await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!));
  await page.clock.setFixedTime(close);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Closed',{exact:true})).toBeVisible();
  await account(page,'en');await expect(page.getByText('Closed',{exact:true})).toHaveCount(0);
  await account(page,'kr');await expect(page.getByText('Closed',{exact:true})).toBeVisible();
  const after = await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!));
  for (const key of ['orundum','originite','permits','reservedOP','until','goals']) expect(after[key]).toEqual(before[key]);
});

test('regional reward labels use the server calendar and manual claims survive closing and switching', async ({ page }) => {
  const id = 'free:regional-browser-fixture';
  const close = new Date('2030-10-31T19:00:00Z');
  // The server retires expired monthly rewards. Inject this isolated catalogue
  // through real client navigation, so the regression survives October ending
  // without changing SSR markup or depending on the current upstream month.
  const response = await page.request.get("/reward-tracker");
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  const data = JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)![1]).props;
  const props = data.pageProps;
  props.freeRewards = [...props.freeRewards.filter((reward: { startAt?: number; endAt?: number }) => !reward.startAt && !reward.endAt), {
    id, group: 'Monthly sign-in', name: 'Regional monthly claim', forecast: false,
    startAt: Date.parse('2030-10-01T11:00:00Z'), endAt: close.getTime() + 16 * 3600000,
    rewards: [{ id: '4003', name: 'Orundum', count: 100, orundum: 100 }],
  }];
  for (const server of ['jp', 'kr']) props.__contentTables['regional-schedules'].servers[server].rewardWindows[id] = {
    startAt: '2030-09-30T19:00:00Z', endAt: close.toISOString(), timingSource: 'https://example.test/regional-monthly-fixture',
  };
  await page.route('**/_next/data/**/reward-tracker.json*', route => route.fulfill({ json: data }));
  const progress = { doneKeys: [id, 'manual:regional-qa'], doneEvents: ['manual:event'], annihilationDone: true, ticksFrom: '2026-10-16T00:00:00Z', importedDoneKeys: [] };
  await page.addInitScript(progress => localStorage.setItem('arkpedia.past-rewards.v1', JSON.stringify(progress)), progress);
  await page.clock.setFixedTime(new Date(close.getTime() - 60_000));
  await page.addInitScript(savedAt => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt })), close.getTime() - 60_000);
  await page.goto('/stages/supplies');await account(page, 'jp');
  await expect(page.locator('html')).toHaveAttribute('data-site-server', 'jp');
  const mobileMenu = page.getByRole('button', { name: 'Open navigation menu', exact: true });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  const planner = page.getByRole('button', { name: 'Planner', exact: true });
  if (await planner.getAttribute('aria-expanded') !== 'true') await planner.click();
  await page.locator('a[href="/reward-tracker"]:visible').click();
  await expectClock(page, '03:59');
  await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
  await page.getByRole('group', { name: 'Free rewards status' }).getByRole('button', { name: 'Claimed', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search free rewards' }).fill('Regional monthly claim');
  await page.getByText('Monthly sign-in', { exact: true }).click();
  const reward = page.getByRole('checkbox', { name: 'Regional monthly claim', exact: true });
  await expect(reward).toBeChecked();
  await expect(page.locator('.free-reward-meta')).toHaveText('Until 2030-11-01');
  await page.clock.setFixedTime(close);await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(reward).toHaveCount(0);
  await account(page, 'en');
  await expect(reward).toBeChecked();
  await account(page, 'kr');await expect(reward).toHaveCount(0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.past-rewards.v1')!));
  for (const key of ['doneKeys', 'doneEvents', 'annihilationDone']) expect(after[key]).toEqual(progress[key as keyof typeof progress]);
});
