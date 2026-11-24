import { expect, test } from '@playwright/test';
import { ENDFIELD_POLL, endfieldCards } from '../../lib/polls/endfield';
import { defaultPollSettings, publicPoll, type PollSettings } from '../../lib/polls/settings';

for (const theme of ['dark','light']) test(`unhide Endfield and submit artwork picks (${theme})`, async ({page}) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  const settings = defaultPollSettings();
  await page.addInitScript(() => {
    localStorage.setItem('arkpedia.pull-poll.v1', '{"sentinel":{}}');
    localStorage.setItem('arkpedia.pull-poll.sync.v1', '1');
  });
  const url = '/polls/endfield-pull-or-skip';
  const ballot = {owner:null, revision:0, choices:{}};
  let reads = 0;
  await page.route('**/_next/data/**/dashboard/campaigns.json*', route => route.fulfill({json:{pageProps:{catalog:null},__N_SSP:true}}));
  await page.route('**/api/dashboard/polls', route => {
    if (route.request().method() === 'GET') return route.fulfill({json:settings});
    const edit = route.request().postDataJSON() as PollSettings;
    expect(edit.id).toBe(ENDFIELD_POLL);
    Object.assign(settings.find(s => s.id === edit.id)!, edit, {revision:edit.revision + 1});
    return route.fulfill({json:settings.find(s => s.id === edit.id)});
  });
  await page.route('**/api/polls/settings', route => route.fulfill({json:Object.fromEntries(
    settings.filter(s => s.visible).map(s => [s.id, publicPoll(s, Date.now())])
  )}));
  await page.route('**/api/cloud-account/polls/endfield-pull-or-skip*', route => {
    reads++;
    if (route.request().url().includes('view=results')) return route.fulfill({json:{
      ballots:1, banners:[{id:endfieldCards[0].id,answers:1,pull:1,maybe:0,skip:0}], operators:[]
    }});
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON().choices).toEqual({[endfieldCards[0].id]:{$banner:1}});
      Object.assign(ballot, {choices:route.request().postDataJSON().choices,revision:1});
    }
    return route.fulfill({json:ballot});
  });
  await page.goto(url);
  await expect(page.getByText('This poll is unavailable.')).toBeVisible();
  expect(reads).toBe(0);
  await page.evaluate(() => (window as unknown as {next:{router:{push:(path:string)=>Promise<void>}}}).next.router.push('/dashboard/campaigns?tab=polls'));
  await page.getByRole('form',{name:'Pull or Skip – Endfield 1.7 & 2.0 Livestream'}).getByRole('button',{name:'Unhide poll'}).click();
  await expect(page.getByText('Poll is public.')).toBeVisible();
  await page.goto('/polls');
  const arknights = page.getByRole('region',{name:'Pull or Skip',exact:true});
  const endfield = page.getByRole('region',{name:'Pull or Skip – Endfield 1.7 & 2.0 Livestream'});
  await expect(endfield.getByRole('heading')).toBeVisible();
  const accent = (el:Element) => getComputedStyle(el).getPropertyValue('--teal-fill').trim().toLowerCase();
  expect(await endfield.evaluate(accent)).toBe('#ffeb23');
  expect(await arknights.evaluate(accent)).not.toBe('#ffeb23');
  const a = (await arknights.boundingBox())!, b = (await endfield.boundingBox())!;
  if (page.viewportSize()!.width >= 960) {
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x + a.width);
  } else {
    expect(b.y).toBeGreaterThan(a.y + a.height);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
  }
  await endfield.getByRole('link',{name:'Make your picks'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Pull or Skip – Endfield 1.7 & 2.0 Livestream');
  await expect(page.locator('main img[src*="Oroberyl.png"]')).toHaveCount(1);
  await expect(page.locator('main img[src*="Chartered_HH_Permit.png"]')).toHaveCount(10);
  const cards = page.getByRole('main').getByRole('article');
  await expect(cards).toHaveCount(9);
  await expect(cards.locator('a img')).toHaveCount(9);
  await expect(cards.getByRole('heading')).toHaveCount(0);
  await expect(cards.locator('.poll-portrait')).toHaveCount(0);
  await expect(page.getByText('Lineup still classified')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Import plan'})).toHaveCount(0);
  await expect(cards.first().getByRole('link')).toHaveAttribute('href', /name=orig$/);
  const pull = cards.first().getByRole('button',{name:'Pull',exact:true});
  await pull.focus();
  await pull.press('Enter');
  await expect(pull).toHaveAttribute('aria-pressed','true');
  await expect(cards.first().locator('.poll-stamp')).toBeVisible();
  await expect(cards.first().getByRole('button')).toHaveCount(3);
  await page.getByRole('button',{name:'Send it'}).click();
  await page.getByRole('button',{name:'Submit anonymously'}).click();
  await page.getByRole('dialog',{name:'Successfully submitted'}).getByRole('button',{name:'Done'}).click();
  expect(await page.evaluate(() => localStorage.getItem('arkpedia.pull-poll.v1'))).toBe('{"sentinel":{}}');
  await page.reload();
  await expect(pull).toHaveAttribute('aria-pressed','true');
  await page.getByRole('tab',{name:'Results'}).click();
  await expect(page.getByText(/1 player has shared/)).toBeVisible();
  await expect(cards.getByRole('heading')).toHaveCount(0);
  await page.getByRole('button',{name:'Detailed',exact:true}).click();
  await expect(cards.getByRole('heading')).toHaveCount(0);
  await expect(cards.first()).toContainText('100%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('Endfield results appear only once voting closes', async ({page}) => {
  const start = Date.UTC(2026, 10, 24, 12);
  const closesAt = start + 60_000;
  let now = start;
  const settings = {...defaultPollSettings().find(poll=>poll.id===ENDFIELD_POLL)!, visible:true, results:'closed' as const, closesAt};
  await page.clock.install({time:new Date(start)});
  await page.route('**/api/polls/settings', route=>route.fulfill({json:{[ENDFIELD_POLL]:publicPoll(settings,now)}}));
  let resultsReads = 0;
  await page.route('**/api/cloud-account/polls/endfield-pull-or-skip*', route=>{
    if (route.request().url().includes('view=results')) {
      resultsReads++;
      return route.fulfill({json:{ballots:0,banners:[],operators:[]}});
    }
    return route.fulfill({json:{owner:null,revision:0,choices:{}}});
  });
  await page.goto('/polls');
  await expect(page.locator('time')).toHaveAttribute('datetime',new Date(closesAt).toISOString());
  await expect(page.getByText(/Results will appear after voting closes/)).toBeVisible();
  await expect(page.getByRole('link',{name:'Make your picks'})).toBeVisible();
  await expect(page.getByRole('link',{name:/results/i})).toHaveCount(0);
  await page.goto('/polls/endfield-pull-or-skip?view=results');
  await expect(page.getByRole('button',{name:'Pull',exact:true}).first()).toBeVisible();
  await expect(page.getByRole('tab',{name:'Results'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Export results'})).toHaveCount(0);
  expect(resultsReads).toBe(0);
  now = closesAt;
  await page.clock.fastForward(60_000);
  await expect(page.getByText('Voting is closed.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Send it'})).toHaveCount(0);
  await expect(page.getByText(/0 players have shared/)).toBeVisible();
  await page.goto('/polls');
  await expect(page.getByRole('heading',{name:'Recent results',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'View results'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Make your picks'})).toHaveCount(0);
  now += 7*24*60*60*1000;
  await page.clock.fastForward(30_000);
  const archive = page.getByRole('region',{name:'Previous results'});
  await expect(archive.getByRole('link',{name:'View results'})).toBeVisible();
});
