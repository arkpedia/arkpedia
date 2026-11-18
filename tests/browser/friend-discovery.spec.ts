import { expect, test, type Page } from '@playwright/test';
import { makeFriendFile } from '../../lib/account/friendFile';
import { publicFriendFile } from '../../lib/friends/sharedProfile';
import type { AccountRecord } from '../../lib/account/accountStore';
import { readOnly } from './census-routes';

const id='c79bfde1-830c-41f4-bc12-5d8747bb70be';
const own:AccountRecord={version:1,server:'en',importedAt:'2026-11-17T00:00:00.000Z',doctor:'My Doctor#1111',operators:['Angelina'],skins:[],cleared:['private-stage'],wallet:{orundum:123,originitePrime:0,permits:0,yellowCerts:0,monthlyCardUntil:null},operatorBuilds:{Angelina:{elite:2,level:90,potential:6,skillLevel:7,masteries:{0:3}}},profile:{level:120,registeredAt:null,secretary:null,bio:'PRIVATE BIO',uid:'SECRET-UID',friendSlots:{used:47,limit:50}}};
const profile=publicFriendFile(makeFriendFile({...own,doctor:'Helpful#1234',operators:['Angelina','Kroos'],skins:['char_291_aglina@summer#5']},{Angelina:{elite:2,level:70,skillLevel:7,potential:1,masteries:{0:1,1:2,2:3}},Kroos:{elite:1,level:55,skillLevel:7,masteries:{}}}));
const player={id,friendTag:'Helpful#1234',server:'en',slots:3,importedAt:own.importedAt,fullReports:0,openReports:0,supports:[],appearance:{avatar:'avatar_def_01',avatarType:'ICON',secretary:null,secretarySkin:null,nameCard:null,nameCardVariant:0,level:120,operators:2,skins:1}};
async function fixture(page:Page,theme:string,operators?:string[]){
  await readOnly(page);
  await page.addInitScript(({own,theme})=>{
    localStorage.setItem('theme',theme);localStorage.setItem('arkpediaAccount',JSON.stringify(own));
    localStorage.setItem('plannerRoster',JSON.stringify({Angelina:{elite:2,level:90,potential:6,skillLevel:7,masteries:{0:3}},Thorns:{elite:2,level:90}}));
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{await (window as any).captureProfileLink(text);}}});
  },{own:operators?{...own,operators}:own,theme});
  await page.route('**/api/cloud-account',route=>route.fulfill({json:{user:{id:'test-user',name:'Private provider name'},profile:{username:'Community tester',friendTag:null,friendServer:null},linkedProviders:['google'],linkedAccounts:[{id:'g',providerId:'google'}],revision:0,syncReviewed:true,gameSync:false,personalSync:false,historySync:false,paused:false,data:{},providers:['google','discord']}}));
  const state={copiedLink:undefined as string|undefined,profile:structuredClone(profile),available:true,progressive:false,failPage:false,collection:true,supportsShared:true,publishWait:null as Promise<void>|null,enabled:false,revision:0,communityRevision:0,choices:{stats:false,shareTag:false,openRequests:false,allowFollowing:false,profileLink:false,profileAutoUpdate:false},accountImportedAt:own.importedAt,profileImportedAt:null as string|null,writes:[] as any[],searches:[] as URL[]};
  await page.exposeFunction('captureProfileLink',(text:string)=>{state.copiedLink=text;});
  await page.route('**/api/community/sharing',async route=>{
    if(route.request().method()!=='GET'){
      const body=route.request().postDataJSON();
      state.writes.push(body);
      if(state.publishWait)await state.publishWait;
      state.choices=body.choices;
      state.enabled=state.collection=body.choices.profileLink;
      state.accountImportedAt=body.snapshot?.importedAt??state.accountImportedAt;
      if(body.publicProfile){
        state.profile=body.publicProfile;
        state.profileImportedAt=body.publicProfile.account.importedAt;
      }
      if(!state.enabled)state.profileImportedAt=null;
      state.communityRevision++;
    }
    await route.fulfill({json:{...state.choices,revision:state.communityRevision,profileImportedAt:state.profileImportedAt,listed:state.choices.shareTag&&state.choices.openRequests,importedAt:state.accountImportedAt}});
  });
  await page.route('**/api/community/friends**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const mine=()=>({owner:'test-user',revision:state.revision,enabled:state.enabled,communityRevision:state.communityRevision,id,server:'en',importedAt:state.enabled?state.profileImportedAt:null,accountImportedAt:state.accountImportedAt,choices:state.choices});
    if(request.method()!=='GET'){
      const body=request.postDataJSON();state.writes.push(body);if(state.publishWait)await state.publishWait;state.enabled=request.method()==='PUT';state.revision++;
      return route.fulfill({json:mine()});
    }
    if(url.searchParams.has('mine'))return route.fulfill({json:mine()});
    const summary={player,supportsShared:state.supportsShared,followingAllowed:true,collectionShared:state.collection,profileUpdatedAt:state.profileImportedAt??own.importedAt};
    if(url.searchParams.has('ids'))return route.fulfill({json:{profiles:state.available?[summary]:[]}});
    if(url.searchParams.has('summary'))return route.fulfill(state.available&&state.collection?{json:summary}:{status:404,json:{error:'This player is no longer sharing this profile.'}});
    if(url.searchParams.has('id'))return route.fulfill(state.available&&(!url.searchParams.has('link')||state.collection)?{json:{...summary,profile:state.collection?state.profile:null}}:{status:404,json:{error:'This player is no longer sharing this profile.'}});
    state.searches.push(url);
    if(state.progressive){
      if(url.searchParams.get('cursor')==='50'){
        if(state.failPage){state.failPage=false;return route.fulfill({status:503,json:{error:'Search temporarily unavailable.'}});}
        return route.fulfill({json:{listings:[{...player,id:'d79bfde1-830c-41f4-bc12-5d8747bb70be',friendTag:'Second#3456',supportsShared:state.supportsShared,collectionShared:state.collection}],next:null}});
      }
      return route.fulfill({json:{listings:[{...player,supportsShared:state.supportsShared,collectionShared:state.collection}],next:50}});
    }
    return route.fulfill({json:{listings:state.available?[{...player,supportsShared:state.supportsShared,collectionShared:state.collection}]:[],next:null}});
  });
  return state;
}
for(const theme of ['dark','light']){
  test(`discover, save and inspect a friend's recorded collection (${theme})`,async({page})=>{
    const state=await fixture(page,theme);await page.goto('/friends');
    await page.getByRole('button',{name:'Find players',exact:true}).click();
    const directory=page.getByRole('dialog',{name:'Find players',exact:true});
    await expect(directory.getByText('Helpful#1234',{exact:true})).toBeVisible();
    await directory.getByRole('combobox',{name:'Operator or in-game friend tag',exact:true}).fill('Angel');
    await page.getByRole('option',{name:'Angelina',exact:true}).click();
    await expect.poll(()=>state.searches.at(-1)?.searchParams.get('operator')).toBe('Angelina');
    await directory.getByRole('button',{name:'Follow',exact:true}).click();
    await expect(directory.getByRole('button',{name:'Following',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpediaFriendLinks:v1')!))).toEqual([id]);
    await directory.getByRole('button',{name:'View profile',exact:true}).click();
    const shared=page.getByRole('dialog',{name:'Helpful#1234 · Shared profile',exact:true});
    await shared.getByRole('button',{name:/^Angelina:/}).click();
    const operator=page.getByRole('dialog',{name:'Angelina',exact:true});
    await expect(operator.getByRole('heading',{name:/Stats E2 Lv 70/})).toBeVisible();
    await expect(operator.getByRole('heading',{name:/Stats E2 Lv 90/})).toHaveCount(0);
    await page.keyboard.press('Escape');
    await shared.getByRole('tab',{name:'Skins',exact:true}).click();
    await expect(shared.getByRole('button',{name:/Angelina.*Summer Flower FA017/})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.reload();
    await expect(page.getByText('Helpful#1234',{exact:true}).last()).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('arkpediaFriendLinks:v1'))).not.toMatch(/Angelina|roster|profile/);
    state.available=false;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('This player is no longer sharing this profile.',{exact:true})).toHaveCount(0);
    await expect(page.getByText('Helpful#1234',{exact:true})).toHaveCount(0);
  });
  test(`direct profile link is an independent saved checkbox (${theme})`,async({page})=>{
    const state=await fixture(page,theme);await page.goto('/friends');
    await page.getByRole('button',{name:'Copy Profile Link',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Account settings',exact:true});
    const direct=dialog.getByRole('checkbox',{name:'Direct profile link',exact:true});
    const following=dialog.getByRole('checkbox',{name:'Allow following',exact:true});
    const supports=dialog.getByRole('checkbox',{name:'Share my friend tag and support units',exact:true});
    await expect(direct).not.toBeChecked();await expect(following).not.toBeChecked();
    await expect(dialog.getByRole('button',{name:'Public profile link',exact:true})).toHaveCount(0);
    await direct.check();expect(state.writes).toHaveLength(0);
    await expect(dialog.getByRole('checkbox',{name:'Update after each import',exact:true})).toBeChecked();
    await expect(following).not.toBeChecked();await expect(supports).not.toBeChecked();
    await dialog.getByRole('button',{name:'Save community choices',exact:true}).click();
    await expect.poll(()=>state.writes.length).toBe(1);
    const body=state.writes[0];expect(body.action).toBe('consent');expect(body.publicProfile.account.operators).toEqual(['Angelina']);
    expect(JSON.stringify(body.publicProfile)).not.toMatch(/SECRET-UID|PRIVATE BIO|orundum|private-stage|Thorns/);
    expect(state.choices).toEqual({stats:false,shareTag:false,openRequests:false,allowFollowing:false,profileLink:true,profileAutoUpdate:true});
    await dialog.getByRole('button',{name:'Copy link',exact:true}).click();
    await expect.poll(()=>state.copiedLink).toBe(`${new URL(page.url()).origin}/friends/profile?id=${id}`);
    await direct.uncheck();await dialog.getByRole('button',{name:'Save community choices',exact:true}).click();
    await expect.poll(()=>state.writes.length).toBe(2);expect(state.enabled).toBe(false);
    await expect(dialog.getByRole('button',{name:'Copy link',exact:true})).toHaveCount(0);
  });
  test(`an existing direct link can opt in to newer imports (${theme})`,async({page})=>{
    const state=await fixture(page,theme);
    state.enabled=true;
    state.choices.profileLink=true;
    state.profileImportedAt=own.importedAt;
    await page.goto('/account?settings=community');
    const dialog=page.getByRole('dialog',{name:'Account settings',exact:true});
    const automatic=dialog.getByRole('checkbox',{name:'Update after each import',exact:true});
    const save=dialog.getByRole('button',{name:'Save community choices',exact:true});
    const copy=dialog.getByRole('button',{name:'Copy link',exact:true});
    const help=dialog.getByRole('button',{name:'About direct profile links',exact:true});
    await expect(automatic).toBeVisible();
    await expect(automatic).not.toBeChecked();
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Enable Update after each import/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();
    await copy.click();
    await expect.poll(()=>state.copiedLink).toBe(`${new URL(page.url()).origin}/friends/profile?id=${id}`);
    const originalLink=state.copiedLink!;
    let finishSaving!:()=>void;
    state.publishWait=new Promise(resolve=>{finishSaving=resolve;});
    await automatic.check();
    await save.click();
    await expect.poll(()=>state.writes.length).toBe(1);
    expect(state.writes[0].choices.profileAutoUpdate).toBe(true);
    expect(state.writes[0].publicProfile).toBeUndefined();
    await expect(automatic).toBeChecked();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    const importedAt='2026-11-19T12:00:00.000Z';
    await page.evaluate(importedAt=>{
      const account=JSON.parse(localStorage.getItem('arkpediaAccount')!);
      account.importedAt=importedAt;
      account.operatorBuilds.Angelina.level=85;
      localStorage.setItem('arkpediaAccount',JSON.stringify(account));
      window.dispatchEvent(new Event('arkpediaAccountChanged'));
    },importedAt);
    state.publishWait=null;
    finishSaving();
    await expect.poll(()=>state.profileImportedAt).toBe(importedAt);
    expect(state.writes.map(write=>write.action)).toEqual(['consent','refresh']);
    expect(JSON.stringify(state.writes[1].publicProfile)).not.toMatch(/SECRET-UID|PRIVATE BIO|orundum|private-stage/);

    await page.goto(originalLink);
    const date=page.locator('header.page-header time');
    await expect(date).toBeVisible();
    await expect(date).toHaveAttribute('datetime',importedAt);
    await expect(date.locator('..')).toContainText('Last imported');
    await page.getByRole('tab',{name:'Operators',exact:true}).click();
    await expect(page.getByRole('button',{name:/^Angelina: E2 Level 85/})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
  test(`public collection withdrawal clears the open roster and supports remain separate (${theme})`,async({page})=>{
    const state=await fixture(page,theme);await page.goto(`/friends/profile?id=${id}`);
    await page.getByRole('tab',{name:'Operators',exact:true}).click();
    await expect(page.getByRole('button',{name:/^Angelina: E2 Level 70/})).toBeVisible();
    await page.getByRole('button',{name:'Follow',exact:true}).click();
    await expect(page.getByRole('button',{name:'Following',exact:true})).toBeDisabled();
    state.collection=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading',{name:'Profile unavailable',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/^Angelina: E2 Level 70/})).toHaveCount(0);
    state.available=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading',{name:'Profile unavailable',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('arkpediaFriendLinks:v1'))).not.toMatch(/Angelina|roster/);
  });
  test(`basic following does not require support sharing or a direct link (${theme})`,async({page})=>{
    const state=await fixture(page,theme);state.collection=false;state.supportsShared=false;
    await page.goto('/account?panel=following');await expect(page.getByRole('tab',{name:'Following',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('button',{name:'Find players',exact:true}).click();
    const directory=page.getByRole('dialog',{name:'Find players',exact:true});
    await directory.getByRole('button',{name:'Follow',exact:true}).click();
    await expect(directory.getByRole('button',{name:'Following',exact:true})).toBeDisabled();
    await directory.getByRole('button',{name:'View profile',exact:true}).click();
    const shared=page.getByRole('dialog',{name:'Helpful#1234 · Shared profile',exact:true});
    await expect(shared).toContainText('This player allows following.');
    await expect(shared.getByRole('button',{name:'View support builds',exact:true})).toHaveCount(0);
    await expect(shared).not.toContainText('open slots');
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Unfollow',exact:true}).click();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpediaFriendLinks:v1')!))).toEqual([]);
  });
}


test('scroll pagination preserves results and search filters across a failed next page',async({page})=>{
  const state=await fixture(page,'dark');state.progressive=true;state.failPage=true;
  await page.goto('/friends');await page.getByRole('button',{name:'Find players',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Find players',exact:true});
  await expect(dialog.getByRole('alert')).toContainText('Search temporarily unavailable.');
  await expect(dialog.getByText('Helpful#1234',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(dialog.getByText('Second#3456',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Helpful#1234',{exact:true})).toBeVisible();
  expect(state.searches.at(-1)?.searchParams.get('cursor')).toBe('50');
  expect(state.searches.every(url=>url.searchParams.get('server')==='en')).toBe(true);
});

const longRoster = "Angelina,Kroos,Amiya,Thorns,Surtr,SilverAsh,Exusiai,Texas,Lappland,Ifrit,Saria,Nightingale,Shining,Hoshiguma,Siege,Skadi,Suzuran,Eyjafjalla,Mostima,Blaze,Ceobe,Weedy,Phantom,W,Rosmontis,Mudrock,Mountain,Saga,Archetto,Passenger,Kal'tsit,Carnelian,Pallas,Saileach,Fartooth,Flametail,Gnosis,Goldenglow,Horn,Irene,Lumen,Ebenholz,Dorothy,Młynar,Penance,Reed the Flame Shadow,Chongyue,Lin,Qiubai,Ines,Ho'olheyak,Muelsyse,Typhon,Executor the Ex Foedere,Swire the Elegant Wit,Jessica the Liberated,Hoederer,Viviana,Virtuosa,Degenbrecher".split(',');
for (const theme of ['dark','light']) test(`personal and shared account tabs stay reachable through long collections (${theme})`, async ({page}) => {
  const state=await fixture(page,theme,longRoster);
  state.profile.account.operators=longRoster;
  for (const shared of [false,true]) {
    await page.goto(shared?`/friends/profile?id=${id}`:'/account?panel=operators');
    const tabs=page.getByRole('tablist',{name:shared?'Shared profile':'Account content',exact:true});
    await expect(tabs).toBeVisible();
    if (shared) {
      await expect(tabs.getByRole('tab')).toHaveText(['Profile','Operators','Skins']);
      await expect(tabs.getByRole('tab',{name:'Profile',exact:true})).toHaveAttribute('aria-selected','true');
      for (const name of ['Import / export','Account settings','Export my account','View medals']) await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
      await expect(page.getByRole('tab',{name:'Pull history',exact:true})).toHaveCount(0);
      await expect(page.getByRole('tab',{name:'Following',exact:true})).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText('SECRET-UID');
      await expect(page.locator('main')).not.toContainText('PRIVATE BIO');
      await tabs.getByRole('tab',{name:'Operators',exact:true}).click();
      await expect(page.getByRole('button',{name:/^Angelina: E2 Level 70/})).toBeVisible();
    }
    await expect(page.getByRole('button',{name:/^Angelina: E2 Level/})).toBeVisible();
    const bar=page.locator('.sticky-controls').filter({has:tabs});
    await expect(bar).toHaveAttribute('data-sticky','true');
    const start=await bar.evaluate(el=>el.getBoundingClientRect().top+scrollY);
    await page.evaluate(top=>window.scrollTo({top:top+600,behavior:'instant'}),start);
    await expect.poll(()=>bar.evaluate(el=>Math.abs(el.getBoundingClientRect().top-(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'))||60)))).toBeLessThan(2);
    await tabs.getByRole('tab',{name:'Skins',exact:true}).click();
    const search=page.getByRole('searchbox',{name:shared?'Search player skins':'Search your skins',exact:true});
    await expect(search).toBeInViewport();
    expect(await search.evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual((await bar.boundingBox())!.y+(await bar.boundingBox())!.height-1);
    await tabs.getByRole('tab',{name:'Profile',exact:true}).click();
    await expect(page.locator('.account-card').first()).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
});

for(const theme of ['dark','light'])test(`direct-link checks poll summaries without downloading the collection again (${theme})`,async({page})=>{
  await page.clock.install();
  await fixture(page,theme);
  const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/community/friends?'))requests.push(r.url());});
  await page.goto(`/friends/profile?id=${id}`);await expect(page.getByRole('tab',{name:'Operators',exact:true})).toBeVisible();
  const full=()=>requests.filter(url=>url.includes('id=')&&!url.includes('summary=1')).length;
  expect(full()).toBe(1);
  await page.clock.fastForward(31000);
  await expect.poll(()=>requests.filter(url=>url.includes('summary=1')).length).toBe(1);
  expect(full()).toBe(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>requests.filter(url=>url.includes('summary=1')).length).toBe(2);
  expect(full()).toBe(1);
});
