import { expect, test } from '@playwright/test';
import { ENDFIELD_POLL, endfieldCards } from '../../lib/polls/endfield';
import { defaultPollSettings, publicPoll, type PollSettings } from '../../lib/polls/settings';

for (const theme of ['dark','light']) test(`unhide Endfield and submit artwork picks (${theme})`, async ({page}) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  const settings = defaultPollSettings();
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
  await page.getByRole('form',{name:'Pull or Skip · Endfield'}).getByRole('button',{name:'Unhide poll'}).click();
  await expect(page.getByText('Poll is public.')).toBeVisible();
  await page.goto('/polls');
  await page.getByRole('region',{name:'Pull or Skip · Endfield'}).getByRole('link',{name:'Make your picks'}).click();
  const cards = page.getByRole('main').getByRole('article');
  await expect(cards).toHaveCount(9);
  await expect(cards.locator('img')).toHaveCount(9);
  await expect(cards.first().getByRole('link')).toHaveAttribute('href', /name=orig$/);
  const pull = cards.first().getByRole('button',{name:'Pull',exact:true});
  await pull.focus();
  await pull.press('Enter');
  await expect(pull).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Submit anonymously'}).click();
  await expect(page.getByText('Picks saved.')).toBeVisible();
  await page.reload();
  await expect(pull).toHaveAttribute('aria-pressed','true');
  await page.getByRole('tab',{name:'Results'}).click();
  await expect(page.getByText('1 ballot submitted')).toBeVisible();
  await expect(cards.first()).toContainText('100%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
