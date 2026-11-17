import { expect, test, type Page } from '@playwright/test';
import { makeFriendFile } from '../../lib/account/friendFile';
import { publicFriendFile } from '../../lib/friends/sharedProfile';
import type { AccountRecord } from '../../lib/account/accountStore';
import { readOnly } from './census-routes';

const id='c79bfde1-830c-41f4-bc12-5d8747bb70be';
const own:AccountRecord={version:1,server:'en',importedAt:'2026-11-17T00:00:00.000Z',doctor:'My Doctor#1111',operators:['Angelina'],skins:[],cleared:['private-stage'],wallet:{orundum:123,originitePrime:0,permits:0,yellowCerts:0,monthlyCardUntil:null},operatorBuilds:{Angelina:{elite:2,level:90,potential:6,skillLevel:7,masteries:{0:3}}},profile:{level:120,registeredAt:null,secretary:null,bio:'PRIVATE BIO',uid:'SECRET-UID',friendSlots:{used:47,limit:50}}};
const profile=publicFriendFile(makeFriendFile({...own,doctor:'Helpful#1234',operators:['Angelina','Kroos'],skins:['char_291_aglina@summer#5']},{Angelina:{elite:2,level:70,skillLevel:7,potential:1,masteries:{0:1,1:2,2:3}},Kroos:{elite:1,level:55,skillLevel:7,masteries:{}}}));
const player={id,friendTag:'Helpful#1234',server:'en',slots:3,importedAt:own.importedAt,fullReports:0,openReports:0,supports:[],appearance:{avatar:'avatar_def_01',avatarType:'ICON',secretary:null,secretarySkin:null,nameCard:null,nameCardVariant:0,level:120,operators:2,skins:1}};
async function fixture(page:Page,theme:string){
  await readOnly(page);
  await page.addInitScript(({own,theme})=>{
    localStorage.setItem('theme',theme);localStorage.setItem('arkpediaAccount',JSON.stringify(own));
    localStorage.setItem('plannerRoster',JSON.stringify({Angelina:{elite:2,level:90,potential:6,skillLevel:7,masteries:{0:3}},Thorns:{elite:2,level:90}}));
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copiedProfile=text;}}});
  },{own,theme});
  await page.route('**/api/cloud-account',route=>route.fulfill({json:{user:{id:'test-user',name:'Private provider name'},profile:{username:'Community tester',friendTag:null,friendServer:null},linkedProviders:['google'],linkedAccounts:[{id:'g',providerId:'google'}],revision:0,syncReviewed:true,gameSync:false,personalSync:false,historySync:false,paused:false,data:{},providers:['google','discord']}}));
  const state={available:true,progressive:false,failPage:false,collection:true,publishWait:null as Promise<void>|null,enabled:false,revision:0,communityRevision:0,choices:{stats:false,shareTag:false,openRequests:false},writes:[] as any[],searches:[] as URL[]};
  await page.route('**/api/community/sharing',async route=>{
    if(route.request().method()!=='GET'){const body=route.request().postDataJSON();state.choices=body.choices;state.communityRevision++;}
    await route.fulfill({json:{...state.choices,revision:state.communityRevision,listed:state.choices.shareTag&&state.choices.openRequests,importedAt:own.importedAt}});
  });
  await page.route('**/api/community/friends**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const mine=()=>({owner:'test-user',revision:state.revision,enabled:state.enabled,communityRevision:state.communityRevision,id,server:'en',importedAt:state.enabled?own.importedAt:null,accountImportedAt:own.importedAt,choices:state.choices});
    if(request.method()!=='GET'){
      const body=request.postDataJSON();state.writes.push(body);if(state.publishWait)await state.publishWait;state.enabled=request.method()==='PUT';state.revision++;
      return route.fulfill({json:mine()});
    }
    if(url.searchParams.has('mine'))return route.fulfill({json:mine()});
    const summary={player,collectionShared:state.collection,profileUpdatedAt:own.importedAt};
    if(url.searchParams.has('ids'))return route.fulfill({json:{profiles:state.available?[summary]:[]}});
    if(url.searchParams.has('id'))return route.fulfill(state.available?{json:{...summary,profile:state.collection?profile:null}}:{status:404,json:{error:'This player is no longer sharing this profile.'}});
    state.searches.push(url);
    if(state.progressive){
      if(url.searchParams.get('cursor')==='50'){
        if(state.failPage){state.failPage=false;return route.fulfill({status:503,json:{error:'Search temporarily unavailable.'}});}
        return route.fulfill({json:{listings:[{...player,id:'d79bfde1-830c-41f4-bc12-5d8747bb70be',friendTag:'Second#3456',collectionShared:true}],next:null}});
      }
      return route.fulfill({json:{listings:[{...player,collectionShared:true}],next:50}});
    }
    return route.fulfill({json:{listings:state.available?[{...player,collectionShared:true}]:[],next:null}});
  });
  return state;
}
for(const theme of ['dark','light']){
  test(`discover, save and inspect a friend's recorded collection (${theme})`,async({page})=>{
    const state=await fixture(page,theme);await page.goto('/friends');
    await page.getByRole('button',{name:'Find Friends',exact:true}).click();
    const directory=page.getByRole('dialog',{name:'Find Friends',exact:true});
    await expect(directory.getByText('Helpful#1234',{exact:true})).toBeVisible();
    await directory.getByRole('combobox',{name:'Operator or in-game friend tag',exact:true}).fill('Angel');
    await page.getByRole('option',{name:'Angelina',exact:true}).click();
    await expect.poll(()=>state.searches.at(-1)?.searchParams.get('operator')).toBe('Angelina');
    await directory.getByRole('button',{name:'Add friend',exact:true}).click();
    await expect(directory.getByRole('button',{name:'Added',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpediaFriendLinks:v1')!))).toEqual([id]);
    await directory.getByRole('button',{name:'View profile',exact:true}).click();
    const shared=page.getByRole('dialog',{name:'Helpful#1234 · Shared profile',exact:true});
    await shared.getByRole('button',{name:/^Angelina:/}).click();
    const operator=page.getByRole('dialog',{name:'Angelina',exact:true});
    await expect(operator.getByRole('heading',{name:/Stats E2 Lv 70/})).toBeVisible();
    await expect(operator.getByRole('heading',{name:/Stats E2 Lv 90/})).toHaveCount(0);
    await page.keyboard.press('Escape');
    await shared.getByRole('button',{name:/^Skins/}).click();
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
  test(`public link requires separate explicit collection consent (${theme})`,async({page})=>{
    const state=await fixture(page,theme);await page.goto('/friends');
    await page.getByRole('button',{name:'Copy Profile Link',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Public profile link',exact:true});
    await expect(dialog).toContainText('Anyone with the link can view them.');
    const publish=dialog.getByRole('button',{name:'Publish and copy link',exact:true});
    await expect(publish).toBeDisabled();expect(state.writes).toHaveLength(0);
    await dialog.getByRole('checkbox',{name:'Make this collection public',exact:true}).check();
    await publish.click();
    await expect.poll(()=>state.writes.length).toBe(1);
    await expect.poll(()=>page.evaluate(()=>(window as any).__copiedProfile)).toBe(`${new URL(page.url()).origin}/friends/profile?id=${id}`);
    const body=state.writes[0];expect(body.action).toBe('consent');expect(body.profile.account.operators).toEqual(['Angelina']);
    expect(JSON.stringify(body.profile)).not.toMatch(/SECRET-UID|PRIVATE BIO|orundum|private-stage|Thorns/);
    expect(state.choices).toEqual({stats:false,shareTag:true,openRequests:true});
    await page.getByRole('button',{name:'Copy Profile Link',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Public profile link',exact:true})).toHaveCount(0);
    expect(state.writes).toHaveLength(1);
  });
  test(`public collection withdrawal clears the open roster and supports remain separate (${theme})`,async({page})=>{
    const state=await fixture(page,theme);await page.goto(`/friends/profile?id=${id}`);
    await expect(page.getByRole('button',{name:/^Angelina: E2 Level 70/})).toBeVisible();
    await page.getByRole('button',{name:'Add friend',exact:true}).click();
    await expect(page.getByRole('button',{name:'Added to Friends',exact:true})).toBeDisabled();
    state.collection=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('This player shares their equipped supports. Their full collection is not public.',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/^Angelina: E2 Level 70/})).toHaveCount(0);
    state.available=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading',{name:'Profile unavailable',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('arkpediaFriendLinks:v1'))).not.toMatch(/Angelina|roster/);
  });
  test(`changing imported accounts ignores a late publish response (${theme})`,async({page})=>{
    const state=await fixture(page,theme);let finish!:()=>void;
    state.publishWait=new Promise<void>(resolve=>{finish=resolve;});
    await page.goto('/friends');await page.getByRole('button',{name:'Copy Profile Link',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Public profile link',exact:true});
    await dialog.getByRole('checkbox',{name:'Make this collection public',exact:true}).check();
    await dialog.getByRole('button',{name:'Publish and copy link',exact:true}).click();
    await expect.poll(()=>state.writes.length).toBe(1);
    await page.evaluate(own=>{
      localStorage.setItem('arkpediaAccount',JSON.stringify({...own,doctor:'Other Doctor#2222',importedAt:'2026-11-17T01:00:00.000Z',profile:{...own.profile,uid:'OTHER-UID'}}));
      window.dispatchEvent(new StorageEvent('storage',{key:'arkpediaAccount'}));
    },own);
    await expect(dialog).toHaveCount(0);
    const response=page.waitForResponse(response=>response.url().includes('/api/community/friends')&&response.request().method()==='PUT');
    finish();await response;state.publishWait=null;
    await page.getByRole('button',{name:'Copy Profile Link',exact:true}).click();
    await expect(dialog.getByRole('checkbox',{name:'Make this collection public',exact:true})).not.toBeChecked();
    expect(await page.evaluate(()=>(window as any).__copiedProfile)).toBeUndefined();
  });
}


test('scroll pagination preserves results and search filters across a failed next page',async({page})=>{
  const state=await fixture(page,'dark');state.progressive=true;state.failPage=true;
  await page.goto('/friends');await page.getByRole('button',{name:'Find Friends',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Find Friends',exact:true});
  await expect(dialog.getByRole('alert')).toContainText('Search temporarily unavailable.');
  await expect(dialog.getByText('Helpful#1234',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(dialog.getByText('Second#3456',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Helpful#1234',{exact:true})).toBeVisible();
  expect(state.searches.at(-1)?.searchParams.get('cursor')).toBe('50');
  expect(state.searches.every(url=>url.searchParams.get('server')==='en')).toBe(true);
});
