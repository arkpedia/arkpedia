import {expect,test} from '@playwright/test';
import {defaultPollSettings, publicPoll, type PollSettings} from '../../lib/polls/settings';

for(const theme of ['dark','light']) test(`edit poll visibility, deadline and results (${theme})`,async({page})=>{
  const settings=defaultPollSettings();
  await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.route('**/_next/data/**/dashboard/campaigns.json*',r=>r.fulfill({json:{pageProps:{catalog:null},__N_SSP:true}}));
  await page.route('**/api/dashboard/polls',r=>{
    if(r.request().method()==='GET')return r.fulfill({json:settings});
    const edit=r.request().postDataJSON() as PollSettings;
    const i=settings.findIndex(p=>p.id===edit.id);
    settings[i]={...edit,revision:edit.revision+1};
    return r.fulfill({json:settings[i]});
  });
  await page.route('**/api/polls/settings',r=>r.fulfill({json:Object.fromEntries(settings.filter(p=>p.visible).map(p=>[p.id,publicPoll(p,Date.now())]))}));
  await page.goto('/polls');
  await expect(page.getByRole('heading',{name:'Pull or Skip'})).toBeVisible();
  await page.evaluate(()=> (window as unknown as {next:{router:{push:(path:string)=>Promise<void>}}}).next.router.push('/dashboard/campaigns?tab=polls'));
  const editor=page.getByRole('form',{name:'Pull or Skip'});
  const select=async(label:string,value:string)=>{
    await editor.getByRole('combobox',{name:label}).click();
    await page.getByRole('option',{name:value,exact:true}).click();
  };
  await select('Results','Show after voting closes');await select('Voting closes','At a set time');
  await editor.getByLabel('Closing time (UTC)').fill('2020-01-01T12:00');
  await editor.getByRole('button',{name:'Save settings'}).click();await expect(editor.getByRole('status')).toHaveText('Saved.');
  expect(settings[0].closesAt).toBe(Date.UTC(2020,0,1,12));
  await select('Voting closes','Never');await select('Poll visibility','Hidden');
  await editor.getByRole('button',{name:'Save settings'}).click();
  await expect(editor.getByRole('button',{name:'Save settings'})).toBeDisabled();expect(settings[0].closesAt).toBeNull();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.goto('/polls');await expect(page.getByText('Rate skins',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Pull or Skip'})).toHaveCount(0);
  await page.goto('/polls/pull-or-skip?view=results');await expect(page.getByText('This poll is unavailable.')).toBeVisible();
});
