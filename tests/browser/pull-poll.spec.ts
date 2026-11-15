import {expect,test,type Page} from '@playwright/test';
import {readOnly} from './census-routes';
import {PULL_POLL_DRAFT,type Ballot} from '../../lib/polls/pull-poll';

async function setup(page:Page,theme:string){
  await readOnly(page);await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.route('**/api/cloud-account',route=>route.fulfill({status:401,json:{providers:['google','discord']}}));
  const state={choices:{} as Ballot,revision:0,writes:[] as Ballot[]};
  await page.route('**/api/cloud-account/polls/pull-or-skip',async route=>{
    if(route.request().method()==='PUT'){
      const body=route.request().postDataJSON();state.writes.push(body.choices);state.choices=body.choices;state.revision++;
    }
    return route.fulfill({json:{owner:null,choices:state.choices,revision:state.revision}});
  });
  return state;
}
for(const theme of ['dark','light'])test(`draft, detailed choices, sharing and anonymous submission (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/pull-or-skip');
  const banner=page.getByRole('article').first();await expect(banner).toBeVisible();
  await banner.getByRole('button',{name:'Pull',exact:true}).click();
  await expect(banner.getByRole('button',{name:'Pull',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(state.writes).toHaveLength(0);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-compact-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Detailed',exact:true}).click();
  const want=banner.getByRole('combobox').first();await expect(want).toHaveText('Potential 1 · 1 copy');
  await want.click();await page.getByRole('option',{name:'Potential 4',exact:true}).click();await expect(want).toHaveText('Potential 4');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),PULL_POLL_DRAFT);expect(Object.values(Object.values(saved)[0] as object)).toContain(4);
  await page.getByRole('button',{name:'Compact',exact:true}).click();await page.getByRole('button',{name:'Detailed',exact:true}).click();await expect(want).toHaveText('Potential 4');
  await expect.poll(()=>new URL(page.url()).searchParams.get('view')).toBe('detailed');
  await page.reload();await expect(want).toHaveText('Potential 4');expect(state.writes).toHaveLength(0);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'Copy share link',exact:true}).click();await expect(page.getByText(/Share link copied/)).toBeVisible();
  const share=await page.evaluate(()=>navigator.clipboard.readText());expect(new URL(share).hash).toContain('#plan=');
  await page.evaluate(key=>localStorage.removeItem(key),PULL_POLL_DRAFT);await page.goto(share);await expect(want).toHaveText('Potential 4');expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/pull-poll-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Submit entry',exact:true}).click();await expect(page.getByRole('dialog',{name:'Create an Arkpedia account'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Discord',exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);
  await page.getByRole('button',{name:'Keep my entry anonymous',exact:true}).click();await expect(page.getByRole('button',{name:'Update entry',exact:true})).toBeDisabled();
});
test('Maybe is Good to have; planner imports are drafts and preserve the planner',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/pull-or-skip');const banner=page.getByRole('article').first();
  await banner.getByRole('button',{name:'Maybe',exact:true}).click();await page.getByRole('button',{name:'Detailed',exact:true}).click();await expect(banner.getByRole('combobox').first()).toHaveText('Good to have');
  await banner.getByRole('combobox').first().click();await page.getByRole('option',{name:'Not want',exact:true}).click();
  const data=await page.evaluate(()=>{const all=(window as any).__NEXT_DATA__.props.pageProps.banners;const now=Date.now();return all.filter((b:any)=>Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>now).sort((a:any,b:any)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id))[0];});
  const plan={version:1,orundum:'',originite:'',permits:'',reservedOP:'',until:'',manualEventDate:'',bannerName:'',monthlyCard:false,includeBacklog:false,annihilationDone:false,doneEvents:[],doneKeys:[],clearedReruns:[],future:{},goals:[{banner:data.name,pulls:100,spendOn:data.end,targets:[{name:data.operators[0],copies:5}]}]};
  await page.evaluate(plan=>localStorage.setItem('arkpedia.pull-plan.v1',JSON.stringify(plan)),plan);
  await page.getByRole('button',{name:'Import pull planner',exact:true}).click();await page.getByRole('button',{name:'Use this browser’s plan',exact:true}).click();
  await expect(banner.getByRole('combobox').first()).toHaveText('Potential 5');expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpedia.pull-plan.v1')!))).toEqual(plan);
});
