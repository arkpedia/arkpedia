import { expect, test } from '@playwright/test';
import { PLANNER_PLAN, seedPlanner, plannerPriced } from './census-routes';
import { stubYouTube, youtube } from './youtube-stub';

test.setTimeout(120000);
test('recruitment translations keep selections and font size through reload', async ({ page }) => {
  await page.goto('/recruitment');
  await page.getByRole('button', { name: 'Guard', exact: true }).click();
  await page.getByRole('button', { name: 'JP', exact: true }).click();
  await expect(page.getByRole('button', { name: '前衛タイプ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('slider', { name: 'Recruitment text size' }).fill('20');
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Recruitment text size' })).toHaveValue('20');
  await expect(page.getByRole('button', { name: 'JP', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'KR', exact: true }).click();
  await expect(page.getByRole('button', { name: '가드', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'CN', exact: true }).click();
  await expect(page.getByRole('button', { name: '近卫干员', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('skin events stay open with lazy artwork and a separate detail viewer', async ({ page }) => {
  await page.goto('/skin-planner');
  const cards = page.locator('.skin-plan-card');
  await expect.poll(() => cards.count()).toBeGreaterThan(0);
  await expect(page.locator('button.skin-plan-event')).toHaveCount(0);
  const grids = page.locator('.skin-plan-grid');
  for (const grid of await grids.all()) expect(await grid.locator('.skin-plan-card').count()).toBeLessThanOrEqual(12);
  await page.getByRole('button', { name: 'Fashion Review', exact: true }).click();
  for (const grid of await grids.all()) expect(await grid.locator('.skin-plan-card').count()).toBeLessThanOrEqual(12);
  await cards.first().getByRole('button', {name:/View/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Outfit details', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Close',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cards.first().locator('.skin-plan-card-foot')).toBeVisible();
});
test('artist and actor searches expand matching operator credits', async ({ page }) => {
  for (const route of ['/artists', '/voice-actors']) {
    await page.goto(route);
    await page.getByRole('searchbox').fill('Thorns');
    // Every person's operators show without opening anything; a search by operator keeps it.
    const person = page.locator('main .credit-person').first();
    await expect(person.locator('a[href="/operators/Thorns#artwork"], a[href="/operators/Thorns"], a[href="/operators/Thorns#voiceLines"]').first()).toBeVisible();
  }
});
test('simple materials can show only shortages and select a subset without editing saved goals', async ({ page }) => {
  await page.goto('/planner'); await seedPlanner(page, PLANNER_PLAN);
  await expect(page.getByRole('group', {name:'Which materials to show'})).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('plannerState'));
  await page.getByText('View materials for selected goals', {exact:true}).click();
  const filter = page.locator('details').filter({hasText:'View materials for selected goals'});
  await filter.getByRole('button',{name:'None',exact:true}).click();
  await expect(page.getByText('No goals set yet.',{exact:false})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('plannerState'))).toBe(before);
  await filter.getByRole('button',{name:'All',exact:true}).click();
  await plannerPriced(page);
  await page.getByRole('tab',{name:'Surtr',exact:true}).click();
  await expect(page.getByRole('group',{name:'Which operator materials to show'})).toBeVisible();
});
test('account server clocks follow imported JP and KR accounts, and banner CSV excludes other pools', async ({ page }) => {
  await page.goto('/account');
  const account = { version:1,server:'jp',importedAt:'2026-10-08T12:00Z',doctor:'Local test',operators:[],skins:[],cleared:[],pulls:{rows:[{at:1791460800,pool:'fixture_a',char:'char_002_amiya',star:5},{at:1791460700,pool:'fixture_b',char:'char_003_kalts',star:6}],pools:{fixture_a:'Fixture A',fixture_b:'Fixture B'},names:{},readAt:'2026-10-08T12:00Z',error:null}};
  await page.evaluate(value => localStorage.setItem('arkpediaAccount',JSON.stringify(value)),account);
  await page.reload();
  await expect(page.locator('[title*="JP daily reset"]:visible').first()).toBeVisible();
  const pulls = page.getByRole('tab',{name:/Pull history/});
  if(await pulls.count()) await pulls.click();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export Fixture A CSV',exact:true}).click();
  const path = await (await download).path();
  const fs = await import('node:fs/promises'); const csv = await fs.readFile(path!, 'utf8');
  expect(csv).toContain('Fixture A'); expect(csv).not.toContain('Fixture B');
  await page.evaluate(() => {const value=JSON.parse(localStorage.getItem('arkpediaAccount')!);value.server='kr';localStorage.setItem('arkpediaAccount',JSON.stringify(value));});
  await page.reload(); await expect(page.locator('[title*="KR daily reset"]:visible').first()).toBeVisible();
});
test('operator EP cold-starts playback and becomes first in the queue', async ({page}) => {
  await stubYouTube(page); await page.goto('/operators/Thorns');
  const id = await page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!).props.pageProps.epTrack.id);
  await page.getByRole('button',{name:'Play EP',exact:true}).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(id);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await expect.poll(async () => page.evaluate(() => { const raw=sessionStorage.getItem('arkpediaMusicResume');return raw ? JSON.parse(raw).queue[0] : null; })).toBe(id);
  await page.getByRole('button',{name:'Play EP',exact:true}).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(id);
});
test('World exposes all reference sections and source-linked community links', async ({page}) => {
  await page.goto('/community');
  for(const name of ['Offline Events','Web Events','YouTube','Twitch','Discord','Cosplayers','Fan-artists','Fan Musicians']) await expect(page.getByRole('tab',{name,exact:true})).toBeAttached();
  await page.getByRole('tab',{name:'Discord',exact:true}).click();
  await expect(page.getByRole('link',{name:/Cookie Squad/})).toHaveAttribute('href','https://discord.gg/kukkikaze');
  await page.getByRole('tab',{name:'Fan-artists',exact:true}).click();
  await expect(page.getByText(/No .*creators listed/)).toBeVisible();
});
test('yellow cert budgets persist per month and show skipped months without spending them', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-08T12:00Z'));
  await page.goto('/pulls');
  await page.getByRole('textbox',{name:'Yellow certs',exact:true}).fill('300');
  await page.getByRole('textbox',{name:'Until',exact:true}).fill('2027-01-15');
  await page.getByRole('checkbox',{name:'Yellow cert shop',exact:true}).check();
  await expect(page.getByRole('spinbutton',{name:/Yellow cert spending/})).toHaveCount(4);
  await page.getByRole('spinbutton',{name:'Yellow cert spending 2026-10'}).fill('258');
  await page.getByRole('spinbutton',{name:'Yellow cert spending 2026-12'}).fill('68');
  await expect(page.locator('.pulls-cert-months').getByText('258 certs → 38 pulls',{exact:true})).toBeVisible();
  await expect(page.locator('.pulls-cert-months').getByText('28 certs → 3 pulls · 40 certs short',{exact:true})).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')??'{}').certificateSpending?.['2026-12'])).toBe(68);
  await page.reload(); await expect(page.getByRole('spinbutton',{name:'Yellow cert spending 2026-11'})).toHaveValue('0');
  await expect(page.getByRole('spinbutton',{name:'Yellow cert spending 2026-12'})).toHaveValue('68');
});
test('fully uncompleted OP presentation uses temporary completion and restores saved progress',async({page})=>{
  await page.goto('/free-op');
  const saved=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  await page.getByRole('checkbox',{name:'Fully uncompleted view',exact:true}).click();
  await expect(page.getByText('Presentation view. Your saved completion stays unchanged.')).toBeVisible();
  const checkbox=page.getByRole('checkbox',{name:/claimed/}).first();
  if(await checkbox.count())await checkbox.check();
  expect(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))).toEqual(saved);
  await page.getByRole('checkbox',{name:'Fully uncompleted view',exact:true}).click();
  await expect(page.getByText('Presentation view. Your saved completion stays unchanged.')).toHaveCount(0);
});
test('summon stats follow promotion and level without mixing operator bonuses',async({page})=>{
  await page.goto('/operators/Kal%27tsit#stats');
  const panel=page.getByRole('region',{name:'Summon stats',exact:true});
  await expect(panel).toBeVisible();
  await expect(panel.getByText('5,433',{exact:true})).toBeVisible();
  await panel.getByRole('slider',{name:'Summon level'}).fill('1');
  await expect(panel.getByText('4,292',{exact:true})).toBeVisible();
  await expect(panel.getByText(/Base summon stats before/)).toBeVisible();
});

test('EP re-enters a shortened queue first while preserving the other songs',async({page})=>{
  await stubYouTube(page); await page.goto('/operators/Thorns');
  const id = await page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!).props.pageProps.epTrack.id);
  const catalogue = await (await page.request.get('/music-catalogue.json')).json();
  const other = catalogue.songs.filter((song:{videoId:string})=>song.videoId!==id).slice(0,2).map((song:{videoId:string})=>song.videoId);
  await page.evaluate(queue=>sessionStorage.setItem('arkpediaMusicResume',JSON.stringify({version:1,savedAt:Date.now(),left:true,videoId:queue[0],title:'Local test',seconds:10,duration:240,playing:false,queue,queueIndex:0,shuffle:false,shuffleOrder:null,shufflePosition:0,repeat:'off',volume:50})),other);
  await page.reload(); await expect.poll(async()=>(await youtube(page))?.videoId).toBe(other[0]);
  await page.getByRole('button',{name:'Play EP',exact:true}).click();
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('arkpediaMusicResume')??'{}').queue)).toEqual([id,...other]);
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
});
