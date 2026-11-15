import {expect,test,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import {readOnly} from './census-routes';
import {PULL_POLL_DRAFT,type Ballot,type PullPollResults} from '../../lib/polls/pull-poll';
import {emptyPullPlan,PULL_PLAN_EVENT} from '../../lib/polls/pull-poll-sync';

async function setup(page:Page,theme:string){
  await readOnly(page);await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.route('**/api/cloud-account',route=>route.fulfill({status:401,json:{providers:['google','discord']}}));
  const state={choices:{} as Ballot,revision:0,conflict:false,writes:[] as Ballot[],results:{ballots:0,banners:[],operators:[]} as PullPollResults};
  await page.route('**/api/cloud-account/polls/pull-or-skip**',async route=>{
    if(new URL(route.request().url()).searchParams.get('view')==='results')return route.fulfill({json:state.results});
    if(route.request().method()==='PUT'){
      if(state.conflict){state.conflict=false;state.revision++;return route.fulfill({status:409,json:{error:'Your submitted choices changed on another device.'}});}
      const body=route.request().postDataJSON();state.writes.push(body.choices);state.choices=body.choices;state.revision++;
    }
    return route.fulfill({json:{owner:null,choices:state.choices,revision:state.revision}});
  });return state;
}
const firstBanner=(page:Page)=>page.getByRole('article').first();
const expand=async(page:Page)=>{const banner=firstBanner(page),button=banner.getByRole('button',{name:/^(Choose|Hide) per operator/});if(await button.getAttribute('aria-expanded')==='false')await button.click();return banner;};
const potential=(page:Page,n:number)=>firstBanner(page).getByRole('group',{name:/^Potential for/}).first().getByRole('button',{name:new RegExp(`^Potential ${n} for`)});
for(const theme of ['dark','light'])test(`mockup banner rows, inline potentials, drafts and anonymous submission (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/pull-or-skip');const banner=firstBanner(page);
  await banner.getByRole('button',{name:'Pull',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','pull');await expect(banner.getByText('Pulling!',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-compact-${theme}-${info.project.name}.png`,animations:'disabled'});
  await expand(page);await potential(page,4).click();await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');await expect(banner).toHaveAttribute('data-verdict','custom');await expect(banner.getByText('Whale!',{exact:true})).toBeVisible();
  await potential(page,6).click();await expect(banner.getByText('Leviathan!!',{exact:true})).toBeVisible();await potential(page,4).click();
  await banner.getByRole('button',{name:/^Hide per operator/}).click();await expand(page);await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');
  await page.reload();await expand(page);await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');expect(state.writes).toHaveLength(0);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy share link',exact:true}).click();await expect(page.getByText(/Share link copied/)).toBeVisible();
  const share=await page.evaluate(()=>navigator.clipboard.readText());expect(new URL(share).hash).toContain('#plan=');await page.evaluate(key=>localStorage.removeItem(key),PULL_POLL_DRAFT);await page.goto(share);await page.reload();await expand(page);await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.getByRole('region',{name:'Your pull plan actions'})).toBeInViewport();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Send it',exact:true}).click();await expect(page.getByRole('dialog',{name:'Create an Arkpedia account'})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Discord',exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);
  await page.getByRole('button',{name:'Keep my entry anonymous',exact:true}).click();await expect(page.getByRole('button',{name:'Update entry',exact:true})).toBeDisabled();
});
test('Maybe, deselection, planner import and opt-in two-way sync',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/pull-or-skip');const banner=firstBanner(page);
  await banner.getByRole('button',{name:'Maybe',exact:true}).click();await expand(page);await expect(banner.getByRole('button',{name:'Nice to have',exact:true}).first()).toHaveAttribute('aria-pressed','true');await banner.getByRole('button',{name:'Maybe',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','');
  const data=await page.evaluate(()=>{const all=(window as any).__NEXT_DATA__.props.pageProps.banners;return all.filter((b:any)=>Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>Date.now()).sort((a:any,b:any)=>a.start.localeCompare(b.start,'en')||a.id.localeCompare(b.id,'en'))[0];});
  const plan={...emptyPullPlan(),orundum:'12345',goals:[{banner:data.name,pulls:88,spendOn:data.end,targets:[{name:data.operators[0],copies:3}]}]};
  await page.evaluate(plan=>localStorage.setItem('arkpedia.pull-plan.v1',JSON.stringify(plan)),plan);
  await page.getByRole('button',{name:'Import plan',exact:true}).click();await page.getByRole('button',{name:'Use this browser’s plan',exact:true}).click();await expect(potential(page,3)).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!))).toEqual(plan);
  await page.getByRole('button',{name:'Yes, sync',exact:true}).click();await potential(page,5).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).goals[0].targets[0].copies)).toBe(5);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).orundum)).toBe('12345');
  await page.evaluate(event=>{const key='arkpedia.pull-plan.v1',plan=JSON.parse(localStorage.getItem(key)!);plan.goals[0].targets[0].copies=2;localStorage.setItem(key,JSON.stringify(plan));window.dispatchEvent(new Event(event));},PULL_PLAN_EVENT);
  await expect(potential(page,2)).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Stop syncing',exact:true}).click();await potential(page,6).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).goals[0].targets[0].copies)).toBe(2);expect(state.writes).toHaveLength(0);
});
for(const theme of ['dark','light'])test(`real result projections and a complete share PNG (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/pull-or-skip');const banner=firstBanner(page);await banner.getByRole('button',{name:'Pull',exact:true}).click();
  const data=await page.evaluate(()=>{const ballot=JSON.parse(localStorage.getItem('arkpedia.pull-poll.v1')!);const id=Object.keys(ballot)[0];return {id,name:Object.keys(ballot[id])[0]};});
  state.results={ballots:3,banners:[{id:data.id,answers:3,pull:2,maybe:0,skip:1}],operators:[{banner:data.id,name:data.name,answers:3,want:2,maybe:0,no:1,totalPotential:7,maxPotential:1}]};
  await page.getByRole('tab',{name:'Results',exact:true}).click();await expect(page.getByText(/3 Doctors have shared/)).toBeVisible();await expect(page.getByRole('img',{name:'Pull 67%, Maybe 0%, Skip 33%'})).toBeVisible();await expect(page.getByRole('region',{name:'Your pull plan actions'})).toHaveCount(0);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-results-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('tab',{name:'Your picks',exact:true}).click();await page.getByRole('button',{name:'Save as image',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});
  const bounds=await dialog.getByRole('img').boundingBox();expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeInViewport();
  const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Download PNG'}).click()]);const file=info.outputPath('pull-plan.png');await download.saveAs(file);const png=await fs.readFile(file);expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(675);expect(png.length).toBeGreaterThan(4000);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-share-${theme}-${info.project.name}.png`,animations:'disabled'});expect(state.writes).toHaveLength(0);
});
test('conflicting submissions refresh in place and keep the local draft',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/pull-or-skip');const banner=firstBanner(page);await banner.getByRole('button',{name:'Pull',exact:true}).click();state.conflict=true;await page.getByRole('button',{name:'Send it',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('another device');
  let navigations=0;page.on('framenavigated',()=>navigations++);await page.getByRole('button',{name:'Refresh entry'}).click();await expect(page.getByRole('button',{name:'Update entry'})).toBeEnabled();await expect(banner).toHaveAttribute('data-verdict','pull');expect(navigations).toBe(0);
});

test('share images paginate without dropping answered banners',async({page})=>{
  test.setTimeout(45000);await setup(page,'dark');await page.goto('/polls/pull-or-skip');const banners=page.getByRole('article');await expect.poll(()=>banners.count()).toBeGreaterThanOrEqual(7);
  for(let i=0;i<7;i++)await banners.nth(i).getByRole('button',{name:'Pull',exact:true}).click();
  await page.getByRole('button',{name:'Save as image',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});
  await expect(dialog.getByRole('img')).toHaveAttribute('aria-label','Your pull plan share image, page 1 of 2');await dialog.getByRole('button',{name:'Next page'}).click();await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect(dialog.getByRole('img')).toHaveAttribute('aria-label','Your pull plan share image, page 2 of 2');
});
