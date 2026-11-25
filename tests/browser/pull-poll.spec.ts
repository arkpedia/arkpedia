import {expect,test,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import {readOnly} from './census-routes';
import {type Ballot,type PullPollResults} from '../../lib/polls/pull-poll';
import {PULL_POLL_SUBMISSION} from '../../lib/polls/pull-poll-submission';
import {emptyPullPlan,PULL_PLAN_EVENT} from '../../lib/polls/pull-poll-sync';

async function setup(page:Page,theme:string){
  await readOnly(page);await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  const profile={username:'Poll Doctor',friendTag:null,friendServer:null,avatarId:null};
  const state={choices:{} as Ballot,revision:0,conflict:false,writes:[] as Ballot[],owners:[] as (string|null)[],signedIn:false,profile:profile as typeof profile|null,reviewed:true,cloudRevision:0,results:{ballots:0,banners:[],operators:[]} as PullPollResults};
  const remote=()=>({user:{id:'poll-user',name:'PRIVATE PROVIDER NAME'},profile:state.profile,linkedProviders:['google','discord'],linkedAccounts:[],syncReviewed:state.reviewed,revision:state.cloudRevision,archiveRevision:0,gameSync:false,personalSync:false,historySync:false,archives:[],paused:false,data:{},providers:['google','discord']});
  await page.route('**/api/cloud-account',async route=>{if(!state.signedIn)return route.fulfill({status:401,json:{providers:['google','discord']}});if(route.request().method()==='PATCH'){state.reviewed=route.request().postDataJSON().syncReviewed===true;state.cloudRevision++;}return route.fulfill({json:remote()});});
  await page.route('**/api/account-profile**',async route=>{if(route.request().method()==='GET')return route.fulfill({json:{available:true}});state.profile={...profile,username:route.request().postDataJSON().username};return route.fulfill({json:{profile:state.profile}});});
  await page.route('**/api/cloud-account/polls/pull-or-skip**',async route=>{
    if(new URL(route.request().url()).searchParams.get('view')==='results')return route.fulfill({json:state.results});
    if(route.request().method()==='PUT'){
      if(state.conflict){state.conflict=false;state.revision++;return route.fulfill({status:409,json:{error:'Your submitted choices changed on another device.'}});}
      const body=route.request().postDataJSON();expect(body.owner).toBe(state.signedIn?'poll-user':null);state.owners.push(body.owner);state.writes.push(body.choices);state.choices=body.choices;state.revision++;
    }
    return route.fulfill({json:{owner:state.signedIn?'poll-user':null,choices:state.choices,revision:state.revision}});
  });return state;
}
async function dismissSubmissionSuccess(page:Page){
  const success=page.getByRole('dialog',{name:'Successfully submitted',exact:true});await expect(success).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE){const theme=await page.locator('html').getAttribute('data-theme');await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/poll-success-${theme}-${page.viewportSize()?.width}.png`});}
  await success.getByRole('button',{name:'Done',exact:true}).click();await expect(success).toHaveCount(0);
}
const firstBanner=(page:Page)=>page.getByRole('article').first();
const expand=async(page:Page)=>{const banner=firstBanner(page),button=banner.getByRole('button',{name:/^Potentials for/});if(await button.getAttribute('aria-expanded')==='false')await button.click();return banner;};
const potential=(page:Page,n:number)=>firstBanner(page).getByRole('group',{name:/^Potential for/}).first().getByRole('button',{name:new RegExp(`^Potential ${n} for`)});
test('share image retains decoded artwork and remains downloadable when another image never settles',async({page})=>{
  test.setTimeout(45000);
  await setup(page,'dark');
  await page.route(/\.(png|jpe?g|webp)(\?|$)/,route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="red" d="M0 0h32v16H0z"/></svg>'}));
  await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});
  for(let i=0;i<2;i++)await page.getByRole('article').nth(i).getByRole('button',{name:'Pull',exact:true}).click();
  const stalled=await firstBanner(page).locator('img').first().evaluate(image=>(image as HTMLImageElement).src);
  await page.evaluate(stalled=>{
    const decode=HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode=function(){return new URL(this.src).pathname===new URL(stalled).pathname?new Promise<void>(()=>{}):decode.call(this);};
  },stalled);
  await page.getByRole('button',{name:'Save as image',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});
  await expect(dialog.getByRole('button',{name:'Download PNG',exact:true})).toBeEnabled({timeout:15000});
  await expect(dialog.getByRole('status')).toContainText('Your choices are still included.');
  await expect(dialog.getByRole('img')).toHaveAttribute('aria-label','Your pull plan share image with 2 answered banners');
  expect(await dialog.locator('canvas').evaluate(element=>[...(element as HTMLCanvasElement).getContext('2d')!.getImageData(100,450,1,1).data].slice(0,3))).toEqual([255,0,0]);
});
for(const theme of ['dark','light'])test(`mockup banner rows, inline potentials, drafts and anonymous submission (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/pull-or-skip?display=detailed#local-draft',{waitUntil:'domcontentloaded'});const banner=firstBanner(page);
  await banner.getByRole('button',{name:'Pull',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','pull');await expect(banner.getByText('Pulling!',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-compact-${theme}-${info.project.name}.png`,animations:'disabled'});
  const disclosure=banner.getByRole('button',{name:/^Potentials for/});
  await expect(disclosure).toHaveText('Potentials ▾');
  await expand(page);
  await expect(disclosure).toHaveText('Potentials ▴');
  await potential(page,4).click();await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');await expect(banner).toHaveAttribute('data-verdict','custom');await expect(banner.getByText('Whale!',{exact:true})).toBeVisible();
  await expect(banner.getByRole('button',{name:'Pull',exact:true})).toHaveAttribute('aria-pressed','true');
  await potential(page,6).click();const levi=banner.getByText('Leviathan!!',{exact:true});await expect(levi).toBeVisible();await expect.poll(()=>levi.evaluate(el=>{const stamp=el.getBoundingClientRect(),art=el.parentElement!.getBoundingClientRect();return stamp.left>=art.left&&stamp.right<=art.right&&stamp.top>=art.top&&stamp.bottom<=art.bottom;})).toBe(true);await potential(page,4).click();
  await banner.getByRole('button',{name:/^Potentials for/}).click();await expand(page);await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');
  await page.reload({waitUntil:'domcontentloaded'});await expand(page);await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');expect(state.writes).toHaveLength(0);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy poll link',exact:true}).click();await expect(page.getByText(/Poll link copied/)).toBeVisible();
  const share=await page.evaluate(()=>navigator.clipboard.readText());expect(share).toBe(new URL('/polls/pull-or-skip',page.url()).href);await page.goto(share,{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'domcontentloaded'});await expand(page);await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.getByRole('region',{name:'Your pull plan actions'})).toBeInViewport();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Send it',exact:true}).click();await expect(page.getByRole('dialog',{name:'Submit your pull plan'})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Discord',exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Submit anonymously',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);await dismissSubmissionSuccess(page);await expect(page.getByRole('button',{name:'Update entry',exact:true})).toBeDisabled();
});
test('Maybe, deselection, planner import and opt-in two-way sync',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banner=firstBanner(page);
  await banner.getByRole('button',{name:'Maybe',exact:true}).click();await expand(page);await expect(banner.getByRole('button',{name:'Nice to have',exact:true}).first()).toHaveAttribute('aria-pressed','true');await banner.getByRole('button',{name:"Don't Want",exact:true}).last().click();await expect(banner.getByText('Tempted…',{exact:true})).toBeVisible();await expect(banner.getByText('Picky',{exact:true})).toHaveCount(0);await banner.getByRole('button',{name:'Maybe',exact:true}).click();await banner.getByRole('button',{name:'Maybe',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','');
  const data=await page.evaluate(()=>{const all=(window as any).__NEXT_DATA__.props.pageProps.banners;return all.filter((b:any)=>Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>Date.now()).sort((a:any,b:any)=>a.start.localeCompare(b.start,'en')||a.id.localeCompare(b.id,'en'))[0];});
  const plan={...emptyPullPlan(),orundum:'12345',goals:[{banner:data.name,pulls:88,spendOn:data.end,targets:[{name:data.operators[0],copies:3}]}]};
  await page.evaluate(plan=>localStorage.setItem('arkpedia.pull-plan.v1',JSON.stringify(plan)),plan);
  await page.getByRole('button',{name:'Import plan',exact:true}).click();await page.getByRole('button',{name:'Use this browser’s plan',exact:true}).click();await expect(potential(page,3)).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!))).toEqual(plan);
  await page.getByRole('button',{name:'Yes, sync',exact:true}).click();await potential(page,5).click();
  const pull=banner.getByRole('button',{name:'Pull',exact:true});
  await expect(pull).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).goals[0].targets[0].copies)).toBe(5);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).orundum)).toBe('12345');
  await page.evaluate(event=>{const key='arkpedia.pull-plan.v1',plan=JSON.parse(localStorage.getItem(key)!);plan.goals[0].targets[0].copies=2;localStorage.setItem(key,JSON.stringify(plan));window.dispatchEvent(new Event(event));},PULL_PLAN_EVENT);
  await expect(potential(page,2)).toHaveAttribute('aria-pressed','true');
  await expect(pull).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Stop syncing',exact:true}).click();await potential(page,6).click();
  await expect(pull).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!).goals[0].targets[0].copies)).toBe(2);expect(state.writes).toHaveLength(0);
});
for(const theme of ['dark','light'])test(`higher potentials round-trip through the Pull Planner (${theme})`,async({page})=>{
  const state=await setup(page,theme);
  state.signedIn=true;
  await page.addInitScript(()=>{
    localStorage.setItem('arkpediaAccount',JSON.stringify({
      version:1,server:'en',importedAt:new Date().toISOString(),doctor:'Poll tester',operators:['Aphrissa'],skins:[],cleared:[],
      operatorBuilds:{Aphrissa:{elite:0,level:1,skillLevel:1,masteries:{},potential:1}},
    }));
  });
  await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});
  const banner=page.getByRole('article',{name:'Deterministic Chaos',exact:true});
  await banner.getByRole('button',{name:/^Potentials for/}).click();
  await expect(banner.getByRole('button',{name:'Potential 1 for Aphrissa',exact:true})).toBeDisabled();
  const pull=banner.getByRole('button',{name:'Pull',exact:true});
  const target=(potential:number)=>banner.getByRole('button',{name:`Potential ${potential} for Aphrissa`,exact:true});
  await target(6).click();
  await page.getByRole('button',{name:'Yes, sync',exact:true}).click();
  await expect(target(6)).toHaveAttribute('aria-pressed','true');
  await expect(pull).toHaveAttribute('aria-pressed','true');

  const planner=await page.context().newPage();
  try{
    await setup(planner,theme);
    await planner.goto('/pull-planner',{waitUntil:'domcontentloaded'});
    await planner.getByRole('button',{name:/^Edit .*Deterministic Chaos/}).click();
    const copies=planner.getByRole('combobox',{name:'Copies wanted of Aphrissa',exact:true});
    await expect(copies).toHaveText('5');
    await copies.click();
    await planner.getByRole('option',{name:'3',exact:true}).click();
    await expect(target(4)).toHaveAttribute('aria-pressed','true');
    await expect(pull).toHaveAttribute('aria-pressed','true');

    await target(6).click();
    await expect(copies).toHaveText('5');
    await planner.getByRole('button',{name:/^Aphrissa/}).click();
    await expect(copies).toHaveCount(0);
    await expect(target(6)).toHaveAttribute('aria-pressed','false');
    await expect(target(2)).toHaveAttribute('aria-pressed','false');
    await expect(pull).toHaveAttribute('aria-pressed','false');
    expect(state.writes).toHaveLength(0);
  }finally{await planner.close();}
});
for(const theme of ['dark','light'])test(`real result projections and a complete share PNG (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banner=firstBanner(page);await banner.getByRole('button',{name:'Pull',exact:true}).click();
  const data=await page.evaluate(()=>{const ballot=JSON.parse(localStorage.getItem('arkpedia.pull-poll.v1')!);const id=Object.keys(ballot)[0];return {id,name:Object.keys(ballot[id])[0]};});
  state.results={ballots:3,banners:[{id:data.id,answers:3,pull:2,maybe:0,skip:1}],operators:[{banner:data.id,name:data.name,answers:3,want:2,maybe:0,no:1,totalPotential:7,maxPotential:1}]};
  await page.getByRole('tab',{name:'Results',exact:true}).click();await expect(page.getByText(/3 Doctors have shared/)).toBeVisible();await expect(page.getByRole('img',{name:'Pull 67%, Maybe 0%, Skip 33%',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Detailed',exact:true}).click();await expect(page.getByRole('img',{name:'Pull 67%, Maybe 0%, Skip 33%',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Your pull plan actions'})).toHaveCount(0);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-results-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('tab',{name:'Your picks',exact:true}).click();await page.getByRole('button',{name:'Save as image',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});
  const bounds=await dialog.getByRole('img').boundingBox();expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeInViewport();
  const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Download PNG'}).click()]);const file=info.outputPath('pull-plan.png');await download.saveAs(file);const png=await fs.readFile(file);expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(Number(await dialog.locator('canvas').getAttribute('height')));expect(png.length).toBeGreaterThan(4000);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-share-${theme}-${info.project.name}.png`,animations:'disabled'});expect(state.writes).toHaveLength(0);
});
test('conflicting submissions refresh in place and keep the local draft',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banner=firstBanner(page);await banner.getByRole('button',{name:'Pull',exact:true}).click();state.conflict=true;await page.getByRole('button',{name:'Send it',exact:true}).click();await page.getByRole('button',{name:'Submit anonymously',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('another device');await expect(page.getByRole('dialog',{name:'Successfully submitted',exact:true})).toHaveCount(0);
  let navigations=0;page.on('framenavigated',()=>navigations++);await page.getByRole('button',{name:'Refresh entry'}).click();await expect(page.getByRole('button',{name:'Update entry'})).toBeEnabled();await expect(banner).toHaveAttribute('data-verdict','pull');expect(navigations).toBe(0);
});

for(const theme of ['dark','light'])test(`one share PNG includes every answered banner (${theme})`,async({page},info)=>{
  test.setTimeout(45000);await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banners=page.getByRole('article');await expect.poll(()=>banners.count()).toBeGreaterThanOrEqual(7);
  for(let i=0;i<7;i++)await banners.nth(i).getByRole('button',{name:i===1?'Maybe':'Pull',exact:true}).click();await expand(page);await potential(page,6).click();
  await page.getByRole('button',{name:'Save as image',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});
  const image=dialog.getByRole('img');await expect(image).toHaveAttribute('aria-label','Your pull plan share image with 7 answered banners');await expect(dialog.getByRole('button',{name:/Next page|Previous page/})).toHaveCount(0);
  expect(await image.evaluate(element=>{const canvas=element as HTMLCanvasElement,c=canvas.getContext('2d')!;return [...c.getImageData(1199,canvas.height-60,1,1).data].join(',')!==[...c.getImageData(10,10,1,1).data].join(',');})).toBe(true);
  await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeInViewport();await expect(image).toBeInViewport({ratio:1});
  const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Download PNG'}).click()]);expect(download.suggestedFilename()).toBe('arkpedia-pull-plan.png');const file=info.outputPath('complete-plan.png');await download.saveAs(file);const png=await fs.readFile(file);expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(Number(await image.getAttribute('height')));
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-complete-${theme}-${info.project.name}.png`,animations:'disabled'});
  const imageHash=()=>image.evaluate(async element=>{const canvas=element as HTMLCanvasElement,pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels.buffer as ArrayBuffer))).join(',');});const tabsBox=await dialog.getByRole('group',{name:'Share image display'}).boundingBox(),imageBox=await image.boundingBox();expect(imageBox!.y-(tabsBox!.y+tabsBox!.height)).toBeGreaterThanOrEqual(9);const simple=await imageHash();await dialog.getByRole('checkbox',{name:'Banner art with stamps',exact:true}).check();await expect(image).toHaveAttribute('data-display','stamps');await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect(dialog.locator('p.visually-hidden')).toContainText('Leviathan!!');await expect.poll(imageHash,{timeout:20000}).not.toBe(simple);expect(await image.getAttribute('width')).toBe('1200');await dialog.getByRole('button',{name:'Detailed',exact:true}).click();await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect(image).toHaveAttribute('data-display','detailed-stamps');
  const legend=dialog.getByRole('checkbox',{name:'Show legend',exact:true}),legendPixel=()=>image.evaluate(el=>{const c=(el as HTMLCanvasElement).getContext('2d')!;return [...c.getImageData(802,54,1,1).data].join(',')!==[...c.getImageData(10,10,1,1).data].join(',');});await expect(legend).toBeChecked();await expect.poll(legendPixel).toBe(true);await legend.uncheck();await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect.poll(legendPixel).toBe(false);await legend.check();await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect.poll(legendPixel).toBe(true);
  await expect(dialog.locator('p.visually-hidden')).toContainText('6×');await expect(dialog.locator('p.visually-hidden')).toContainText('Maybe Yato');await expect(dialog.locator('p.visually-hidden')).not.toContainText('Owned');await expect(dialog.locator('p.visually-hidden')).not.toContainText('P6');await expect.poll(imageHash,{timeout:20000}).not.toBe(simple);await expect(image).toBeInViewport({ratio:1});await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeInViewport({ratio:1});await expect(dialog.getByRole('button',{name:'Copy image',exact:true})).toBeInViewport({ratio:1});
});
for(const theme of ['dark','light'])test(`limited Pull selects featured operators only (${theme})`,async({page})=>{
  await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});
  const data=await page.evaluate(()=>{const b=(window as any).__NEXT_DATA__.props.pageProps.banners.find((b:any)=>b.returningOperators?.length&&Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>Date.now());return b?{name:b.name,featured:b.operators.filter((name:string)=>!b.returningOperators.includes(name)),returning:b.returningOperators}:null;});
  expect(data,'the catalogue includes an upcoming limited banner with returning operators').not.toBeNull();const banner=page.getByRole('article',{name:data!.name,exact:true});
  await banner.getByRole('button',{name:'Maybe',exact:true}).click();await banner.getByRole('button',{name:'Pull',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','pull');await expect(banner.getByRole('button',{name:'Pull',exact:true})).toHaveAttribute('aria-pressed','true');await expect(banner.getByText('Pulling!',{exact:true})).toBeVisible();
  await banner.getByRole('button',{name:/^Potentials for/}).click();
  for(const name of data!.featured)await expect(banner.getByRole('button',{name:`Potential 1 for ${name}`,exact:true})).toHaveAttribute('aria-pressed','true');
  for(const name of data!.returning)await expect(banner.getByRole('group',{name:new RegExp(`^Interest in ${name} on`)}).getByRole('button',{name:"Don't Want",exact:true})).toHaveAttribute('aria-pressed','true');
  await banner.getByRole('button',{name:`Potential 2 for ${data!.returning[0]}`,exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','custom');
  await page.getByRole('button',{name:'Save as image',exact:true}).click();const imageDialog=page.getByRole('dialog',{name:'My pull plan',exact:true});await imageDialog.getByRole('button',{name:'Detailed',exact:true}).click();await expect(imageDialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});
  const returningName=data!.returning[0].split(' the ')[0],description=imageDialog.locator('p.visually-hidden');await expect(description).toContainText(`2× ${returningName}`);
  await imageDialog.getByRole('checkbox',{name:'Include off-banner limited operators',exact:true}).uncheck();await expect(description).not.toContainText(`2× ${returningName}`);await expect(imageDialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});
  await expect(imageDialog.getByRole('checkbox',{name:'Show banner stamps',exact:true})).toHaveCount(0);await expect(imageDialog.getByRole('img')).toHaveAttribute('data-display','detailed-stamps');await expect(imageDialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect(description).toContainText('Dolphin');await expect(description).not.toContainText(': pull');
  await expect(imageDialog.getByRole('checkbox')).toHaveCount(2);await expect(imageDialog.getByRole('img')).toHaveAttribute('data-display','detailed-stamps');await imageDialog.getByRole('checkbox',{name:'Include off-banner limited operators',exact:true}).check();await expect(description).toContainText(`2× ${returningName}`);await imageDialog.getByRole('button',{name:'Close',exact:true}).click();await expect(banner.getByRole('button',{name:`Potential 2 for ${data!.returning[0]}`,exact:true})).toHaveAttribute('aria-pressed','true');
  await banner.getByRole('button',{name:'Pull',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','pull');await expect(banner.getByRole('button',{name:`Potential 2 for ${data!.returning[0]}`,exact:true})).toHaveAttribute('aria-pressed','false');
  await banner.getByRole('button',{name:'Pull',exact:true}).click();await expect(banner).toHaveAttribute('data-verdict','');
});

for(const theme of ['dark','light'])test(`results default to simple banners with an optional detailed table (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banner=await expand(page);await potential(page,4).click();
  const data=await page.evaluate(()=>{const ballot=JSON.parse(localStorage.getItem('arkpedia.pull-poll.v1')!);return {id:Object.keys(ballot)[0],name:Object.keys(Object.values(ballot)[0] as object)[0]};});
  state.results={ballots:2,banners:[{id:data.id,answers:2,pull:1,maybe:0,skip:1}],operators:[{banner:data.id,name:data.name,answers:2,want:1,maybe:0,no:1,totalPotential:4,maxPotential:0,potentials:[0,0,0,1,0,0]}]};
  await page.getByRole('tab',{name:'Results',exact:true}).click();await expect(page.getByRole('button',{name:'Simple',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.poll-banner-tag,.poll-portrait,.poll-result-split,.poll-want-meter')).toHaveCount(0);await expect(page.getByText('pull 50%',{exact:true})).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-simple-results-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Detailed',exact:true}).click();await expect(page.getByRole('img',{name:'Pull 50%, Maybe 0%, Skip 50%',exact:true}).first()).toBeVisible();await expect(page.getByText(/avg P4\.0/)).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-detailed-results-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Simple',exact:true}).click();await expect(page.locator('.poll-portrait,.poll-result-split')).toHaveCount(0);await page.getByRole('tab',{name:'Your picks',exact:true}).click();await expect(potential(page,4)).toHaveAttribute('aria-pressed','true');await expect(banner).toHaveAttribute('data-verdict','custom');await expect(page.getByRole('group',{name:'Results display'})).toHaveCount(0);
});

for(const theme of ['dark','light'])test(`ownership, new operators, and potential distribution (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);
  await page.addInitScript(()=>{const operatorBuilds={Aphrissa:{elite:0,level:1,skillLevel:1,masteries:{},potential:5}};localStorage.setItem('plannerRoster',JSON.stringify(operatorBuilds));localStorage.setItem('arkpediaAccount',JSON.stringify({version:1,server:'en',importedAt:new Date().toISOString(),doctor:'Poll tester',operators:['Aphrissa'],skins:[],cleared:[],operatorBuilds}));});
  await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});await expect(page.getByRole('article',{name:/Kernel|Standard Pool|Joint Operation|Locating|Orienteering/})).toHaveCount(0);
  const banner=page.getByRole('article',{name:'Deterministic Chaos',exact:true});await expect(banner.getByText('Owned',{exact:true})).toBeVisible();await expect(banner.locator('.poll-potential[data-want=owned]')).toHaveText('P5');
  await banner.getByRole('button',{name:/^Potentials for/}).click();
  for(let p=1;p<=5;p++)await expect(banner.getByRole('button',{name:`Potential ${p} for Aphrissa`,exact:true})).toBeDisabled();
  await banner.getByRole('button',{name:'Pull',exact:true}).click();await expect(banner.getByRole('button',{name:'Potential 6 for Aphrissa',exact:true})).toHaveAttribute('aria-pressed','true');await expect(banner.getByRole('button',{name:'Potential 1 for Pedro',exact:true})).toHaveAttribute('aria-pressed','true');await expect(banner.getByRole('group',{name:/^Interest in Wulfenite/}).getByRole('button',{name:'Nice to have',exact:true})).toHaveAttribute('aria-pressed','true');await expect(banner.getByText('Pulling!',{exact:true})).toBeVisible();await expect(banner.locator('.poll-potential[data-want=pull]').filter({hasText:'P6'})).toHaveCount(2);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/poll-owned-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Save as image',exact:true}).click();const shareImage=page.getByRole('dialog',{name:'My pull plan',exact:true});await shareImage.getByRole('button',{name:'Detailed',exact:true}).click();await expect(shareImage.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});await expect(shareImage.locator('p.visually-hidden')).toContainText('1× Aphrissa');await expect(shareImage.locator('p.visually-hidden')).not.toContainText('6× Aphrissa');await expect(shareImage.locator('p.visually-hidden')).not.toContainText('Owned');if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/poll-copies-${theme}-${info.project.name}.png`,animations:'disabled'});await shareImage.getByRole('button',{name:'Close',exact:true}).click();
  const id=await page.evaluate(()=>((window as any).__NEXT_DATA__.props.pageProps.banners as any[]).find(b=>b.name==='Deterministic Chaos').id);
  state.results={ballots:10,banners:[{id,answers:10,pull:7,maybe:2,skip:1}],operators:[{banner:id,name:'Aphrissa',answers:10,want:7,maybe:2,no:1,totalPotential:27,maxPotential:2,potentials:[1,1,1,1,1,2]}]};
  await page.getByRole('tab',{name:'Results',exact:true}).click();await page.getByRole('button',{name:'Detailed',exact:true}).click();await page.getByRole('button',{name:'View pull results for Aphrissa on Deterministic Chaos',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Aphrissa · Pull plans',exact:true});await expect(dialog.getByRole('img',{name:/potential distribution, 10 included/})).toBeVisible();
  await dialog.getByRole('checkbox',{name:'Include Skip',exact:true}).uncheck();await dialog.getByRole('checkbox',{name:'Include Maybe',exact:true}).uncheck();await expect(dialog.getByRole('img',{name:/potential distribution, 7 included/})).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/poll-distribution-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await page.getByRole('tab',{name:'Your picks',exact:true}).click();await page.evaluate(()=>{const key='arkpediaAccount',account=JSON.parse(localStorage.getItem(key)!);account.operatorBuilds.Aphrissa.potential=6;localStorage.setItem(key,JSON.stringify(account));window.dispatchEvent(new Event('arkpediaAccountChanged'));});await expect(banner.getByRole('button',{name:'Potential 6 for Aphrissa',exact:true})).toBeDisabled();await page.evaluate(()=>{localStorage.removeItem('arkpediaAccount');window.dispatchEvent(new Event('arkpediaAccountChanged'));});await expect(banner.getByRole('button',{name:'Potential 1 for Aphrissa',exact:true})).toBeEnabled();await expect(banner.getByText('Owned',{exact:true})).toHaveCount(0);
});

for(const provider of ['google','discord'] as const)test(`choose ${provider} before submitting, then resume the same draft once`,async({page},info)=>{
  const state=await setup(page,provider==='google'?'dark':'light'),firstTime=provider==='discord';if(firstTime){state.profile=null;state.reviewed=false;}
  await page.route('**/api/auth/sign-in/social',async route=>{const body=route.request().postDataJSON();expect(body.provider).toBe(provider);expect(body.callbackURL).toContain('pollSubmit=');expect(state.writes).toHaveLength(0);state.signedIn=true;await route.fulfill({json:{url:new URL(body.callbackURL,route.request().url()).href,redirect:true}});});
  await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});await expand(page);await potential(page,4).click();await page.getByRole('button',{name:'Send it',exact:true}).click();
  const choice=page.getByRole('dialog',{name:'Submit your pull plan',exact:true});await expect(choice).toBeVisible();expect(state.writes).toHaveLength(0);await choice.getByRole('button',{name:`Continue with ${provider==='google'?'Google':'Discord'}`,exact:true}).click();
  if(firstTime){const profile=page.getByRole('dialog',{name:'Create your account',exact:true});await expect(profile).toBeVisible();expect(state.writes).toHaveLength(0);await profile.getByLabel('Arkpedia username',{exact:true}).fill('Poll Doctor');await expect(profile.getByText('Username available',{exact:true})).toBeVisible();await profile.getByRole('button',{name:'Continue',exact:true}).click();const saving=page.getByRole('dialog',{name:'Choose what to save',exact:true});await expect(saving).toBeVisible();expect(state.writes).toHaveLength(0);await saving.getByRole('button',{name:'Save choices',exact:true}).click();}
  await expect.poll(()=>state.writes.length).toBe(1);await dismissSubmissionSuccess(page);expect(state.owners).toEqual(['poll-user']);expect(Object.values(state.writes[0]).flatMap(Object.values)).toContain(4);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).not.toHaveURL(/pollSubmit=|account=welcome/);await expect(page.getByText('Your poll entry has been submitted with your Arkpedia account.',{exact:true})).toBeVisible();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),PULL_POLL_SUBMISSION)).toBeNull();await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('button',{name:'Update entry',exact:true})).toBeDisabled();expect(state.writes).toHaveLength(1);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/poll-submit-${provider}-${info.project.name}.png`,animations:'disabled'});
});
test('anonymous choice is confirmed before writing and cancelling writes nothing',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});await firstBanner(page).getByRole('button',{name:'Pull',exact:true}).click();await page.getByRole('button',{name:'Send it',exact:true}).click();await expect(page.getByRole('dialog',{name:'Submit your pull plan'})).toBeVisible();expect(state.writes).toHaveLength(0);await page.keyboard.press('Escape');expect(state.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Send it',exact:true}).click();await page.getByRole('button',{name:'Submit anonymously',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await expect.poll(()=>state.writes.length).toBe(1);await dismissSubmissionSuccess(page);expect(state.owners).toEqual([null]);await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('signed-in users submit directly; an ordinary or unarmed login never auto-submits',async({page})=>{
  const state=await setup(page,'light');state.signedIn=true;await page.goto('/polls/pull-or-skip?pollSubmit=00000000-0000-0000-0000-000000000000',{waitUntil:'domcontentloaded'});await firstBanner(page).getByRole('button',{name:'Pull',exact:true}).click();expect(state.writes).toHaveLength(0);await page.getByRole('button',{name:'Send it',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);await dismissSubmissionSuccess(page);expect(state.owners).toEqual(['poll-user']);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('failed sign-in keeps the choice open and permits anonymous confirmation',async({page})=>{
  const state=await setup(page,'dark');await page.route('**/api/auth/sign-in/social',route=>route.fulfill({status:400,json:{message:'Provider unavailable'}}));await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});await firstBanner(page).getByRole('button',{name:'Pull',exact:true}).click();await page.getByRole('button',{name:'Send it',exact:true}).click();const choice=page.getByRole('dialog',{name:'Submit your pull plan',exact:true});await choice.getByRole('button',{name:'Continue with Google',exact:true}).click();await expect(choice.getByRole('alert')).toContainText('Sign-in could not start');expect(state.writes).toHaveLength(0);expect(await page.evaluate(key=>sessionStorage.getItem(key),PULL_POLL_SUBMISSION)).toBeNull();await choice.getByRole('button',{name:'Submit anonymously',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);await dismissSubmissionSuccess(page);expect(state.owners).toEqual([null]);
});
test('cancelling account creation disarms the pending submission',async({page})=>{
  const state=await setup(page,'light');state.profile=null;state.reviewed=false;await page.route('**/api/auth/sign-in/social',async route=>{state.signedIn=true;await route.fulfill({json:{url:new URL(route.request().postDataJSON().callbackURL,route.request().url()).href,redirect:true}});});await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});await firstBanner(page).getByRole('button',{name:'Pull',exact:true}).click();await page.getByRole('button',{name:'Send it',exact:true}).click();await page.getByRole('button',{name:'Continue with Google',exact:true}).click();const onboarding=page.getByRole('dialog',{name:'Create your account',exact:true});await expect(onboarding).toBeVisible();await onboarding.getByRole('button',{name:'Close',exact:true}).click();await expect(onboarding).toHaveCount(0);await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),PULL_POLL_SUBMISSION)).toBeNull();expect(state.writes).toHaveLength(0);state.profile={username:'Later Doctor',friendTag:null,friendServer:null,avatarId:null};state.reviewed=true;await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('button',{name:'Send it',exact:true})).toBeEnabled();expect(state.writes).toHaveLength(0);
});

for(const theme of ['dark','light'])test(`skipped artwork stays coloured beside X and becomes grey only with stamps (${theme})`,async({page})=>{
  await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banner=firstBanner(page);
  const chroma=async(mode='simple')=>{await page.getByRole('button',{name:'Save as image',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});if(mode.startsWith('detailed'))await dialog.getByRole('button',{name:'Detailed',exact:true}).click();if(mode==='stamps')await dialog.getByRole('checkbox',{name:'Banner art with stamps',exact:true}).check();await expect(dialog.getByRole('button',{name:'Download PNG'})).toBeEnabled({timeout:20000});const value=await dialog.locator('canvas').evaluate(el=>{const data=(el as HTMLCanvasElement).getContext('2d')!.getImageData(20,170,550,140).data;let sum=0;for(let i=0;i<data.length;i+=4)sum+=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2]);return sum/(data.length/4);});await dialog.getByRole('button',{name:'Close',exact:true}).click();return value;};
  await banner.getByRole('button',{name:'Pull',exact:true}).click();const color=await chroma();expect(color).toBeGreaterThan(15);await banner.getByRole('button',{name:'Skip',exact:true}).click();expect(await chroma()).toBeGreaterThan(color*.95);expect(await chroma('detailed')).toBeLessThan(color*.6);expect(await chroma('stamps')).toBeLessThan(color*.6);expect(await chroma('detailed-stamps')).toBeLessThan(color*.6);await expect(banner.getByRole('button',{name:'Skip',exact:true})).toHaveAttribute('aria-pressed','true');
});

for(const theme of ['dark','light'])test(`your results badge matches the pull, mixed-Maybe and skip stamp colours (${theme})`,async({page},info)=>{
  await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banners=page.getByRole('article'),expected=[];
  for(const [i,choice] of ['Pull','Maybe','Skip'].entries()){
    const banner=banners.nth(i);await banner.getByRole('button',{name:choice,exact:true}).click();
    if(choice==='Maybe'){await banner.getByRole('button',{name:/^Potentials for/}).click();await banner.getByRole('button',{name:"Don't Want",exact:true}).last().click();}
    expected.push({title:await banner.getByRole('heading').textContent(),stamp:choice.toLowerCase(),color:await banner.locator('.poll-stamp').evaluate(el=>getComputedStyle(el).color)});
  }
  await page.getByRole('tab',{name:'Results',exact:true}).click();await page.getByRole('button',{name:'Detailed',exact:true}).click();
  for(const row of expected){const badge=page.getByRole('article',{name:`${row.title} results`,exact:true}).locator('.poll-your-choice');await expect(badge).toHaveAttribute('data-stamp',row.stamp);await expect(badge).toHaveText(`You: ${row.stamp}`);expect(await badge.evaluate(el=>getComputedStyle(el).color)).toBe(row.color);expect(await badge.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe(row.color);if(process.env.ARKPEDIA_QA_CAPTURE)await badge.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/you-${row.stamp}-${theme}-${info.project.name}.png`});}
});

for(const theme of ['dark','light'])test(`simple symbols and default detailed stamps are independent of the square legend (${theme})`,async({page},info)=>{
  await setup(page,theme);await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});const banners=page.getByRole('article');await banners.nth(0).getByRole('button',{name:'Maybe',exact:true}).click();await banners.nth(1).getByRole('button',{name:'Skip',exact:true}).click();await page.getByRole('button',{name:'Save as image',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My pull plan',exact:true});await expect(dialog.getByRole('button',{name:'Download PNG',exact:true})).toBeEnabled({timeout:20000});const canvas=dialog.locator('canvas');
  const symbols=()=>canvas.evaluate(element=>{const el=element as HTMLCanvasElement,c=el.getContext('2d')!,ink=getComputedStyle(document.documentElement),rgb=(token:string)=>{const paint=document.createElement('canvas').getContext('2d')!;paint.fillStyle=ink.getPropertyValue(token).trim();paint.fillRect(0,0,1,1);return [...paint.getImageData(0,0,1,1).data].slice(0,3);},amber=rgb('--amber'),red=rgb('--danger'),data=c.getImageData(800,150,200,el.height-202).data;let wave=0,cross=0;for(let i=0;i<data.length;i+=4){if(amber.every((v,j)=>data[i+j]===v))wave++;if(red.every((v,j)=>data[i+j]===v))cross++;}return {wave,cross};});
  await expect.poll(async()=>{const s=await symbols();return s.wave>100&&s.cross>600;}).toBe(true);const before=await symbols();await dialog.getByRole('checkbox',{name:'Show legend',exact:true}).uncheck();await expect(dialog.getByRole('button',{name:'Download PNG',exact:true})).toBeEnabled({timeout:20000});await expect.poll(symbols).toEqual(before);await dialog.getByRole('button',{name:'Detailed',exact:true}).click();await expect(canvas).toHaveAttribute('data-display','detailed-stamps');await expect(dialog.getByRole('checkbox')).toHaveCount(2);await expect(dialog.getByRole('checkbox',{name:'Show banner stamps',exact:true})).toHaveCount(0);await dialog.getByRole('checkbox',{name:'Show legend',exact:true}).check();await expect(canvas).toHaveAttribute('data-legend','visible');await expect(dialog.getByRole('button',{name:'Download PNG',exact:true})).toBeEnabled({timeout:20000});await expect(canvas).toBeInViewport({ratio:1});await expect(dialog.getByRole('button',{name:'Download PNG',exact:true})).toBeInViewport({ratio:1});
  if(process.env.ARKPEDIA_QA_CAPTURE){await fs.mkdir(process.env.ARKPEDIA_QA_CAPTURE,{recursive:true});const png=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL().split(',')[1]);await fs.writeFile(`${process.env.ARKPEDIA_QA_CAPTURE}/restored-symbols-${theme}-${info.project.name}.png`,Buffer.from(png,'base64'));await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/restored-dialog-${theme}-${info.project.name}.png`,animations:'disabled'});}
});

for(const theme of ['dark','light'])test(`export community results with banner and operator percentages (${theme})`,async({page},info)=>{
  test.setTimeout(70000);
  const state=await setup(page,theme);
  // An identifiable portrait colour lets the download test distinguish icons from the initials fallback.
  await page.route(/-star-icons\//,route=>route.fulfill({
    contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><rect width="52" height="52" fill="#e1169f"/></svg>',
  }));
  await page.goto('/polls/pull-or-skip',{waitUntil:'domcontentloaded'});
  const resultsTab=page.getByRole('tab',{name:'Results',exact:true});
  await resultsTab.click();
  const exportButton=page.getByRole('button',{name:'Export results',exact:true});
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText('No entries yet.',{exact:false})).toBeVisible();
  await page.getByRole('tab',{name:'Your picks',exact:true}).click();
  const banner=page.getByRole('article').filter({has:page.getByRole('button',{name:/^Potentials for/})}).first();
  const title=await banner.getAttribute('aria-label');
  const catalogue=await page.evaluate(()=>JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!).props.pageProps.banners as {id:string;name:string;operators:string[]}[]);
  const entry=catalogue.find(b=>b.name===title)!;
  expect(entry.operators.length).toBeGreaterThan(0);
  const name=entry.operators[0];
  state.results={ballots:10,banners:[{id:entry.id,answers:8,pull:5,maybe:2,skip:1}],operators:[{banner:entry.id,name,answers:3,want:2,maybe:1,no:0,totalPotential:2,maxPotential:0,potentials:[2,0,0,0,0,0]}]};
  await resultsTab.click();
  await exportButton.click();
  const dialog=page.getByRole('dialog',{name:'Community poll results'});
  const image=dialog.getByRole('img',{name:'Community poll results image'});
  await expect(image).toHaveAccessibleDescription(/8 answers, Pull 63%, Maybe 25%, Skip 13%/);
  const portraitPixels=()=>image.evaluate(element=>{
    const canvas=element as HTMLCanvasElement;
    const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]===225&&pixels[i+1]===22&&pixels[i+2]===159)count++;
    return count;
  });
  const download=dialog.getByRole('button',{name:'Download PNG'});
  for(const format of ['simple','detailed']){
    if(format==='detailed'){
      await dialog.getByRole('button',{name:'Detailed'}).click();
      await expect(image).toHaveAccessibleDescription(new RegExp(name+' want a copy 67%'));
    }
    await expect(download).toBeEnabled({timeout:20000});
    if(format==='detailed')await expect.poll(portraitPixels,{timeout:20000}).toBeGreaterThan(1000);
    await expect(download).toBeInViewport();
    const [file]=await Promise.all([page.waitForEvent('download'),download.click()]);
    expect(file.suggestedFilename()).toBe('arkpedia-pull-or-skip-results-'+format+'.png');
    const dest=info.outputPath(format+'.png');
    await file.saveAs(dest);
    const png=await fs.readFile(dest);
    expect(png.subarray(1,4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(Number(await image.getAttribute('height')));
  }
  await dialog.getByRole('button',{name:'Single Banner'}).click();
  await expect(download).toBeEnabled({timeout:20000});
  await expect.poll(portraitPixels,{timeout:20000}).toBeGreaterThan(2000);
  const [square]=await Promise.all([page.waitForEvent('download'),download.click()]);
  const squarePath=info.outputPath('social-square.png');
  await square.saveAs(squarePath);
  const squarePng=await fs.readFile(squarePath);
  expect([squarePng.readUInt32BE(16),squarePng.readUInt32BE(20)]).toEqual([1080,1080]);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await expect(exportButton).toBeFocused();
  expect(state.writes).toHaveLength(0);
});
