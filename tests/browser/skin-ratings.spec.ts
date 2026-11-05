import {expect,test,type Page} from '@playwright/test';
import {readOnly} from './census-routes';
async function setup(page:Page,theme:string){
  await readOnly(page);await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  const state={owner:'rater' as string|null,ratings:new Map<string,Map<string,{skin:string;rating:number|null;revision:number}>>(),writes:[] as any[],fail:false,conflict:false,profile:false};
  await page.route('**/api/cloud-account',route=>route.fulfill(state.owner?{json:{user:{id:state.owner,name:'Private name'},profile:{username:'Poll tester',friendTag:null,friendServer:null},linkedProviders:['google'],linkedAccounts:[{id:'g',providerId:'google'}],revision:0,syncReviewed:true,gameSync:false,personalSync:false,historySync:false,paused:false,data:{},providers:['google','discord']}}:{status:401,json:{providers:['google']}}));
  await page.route('**/api/community/sharing',route=>route.fulfill({json:{stats:false,shareTag:false,openRequests:false,revision:0}}));
  await page.route('**/api/cloud-account/polls/favourite-skins?**',async route=>{
    const req=route.request(),owner=state.owner,mine=state.ratings.get(owner??'')??new Map();if(owner)state.ratings.set(owner,mine);
    if(req.method()==='GET'){
      const ranking=new Map<string,{skin:string;total:number;ratings:number;histogram:number[]}>();let raters=0,ratings=0;
      for(const rows of state.ratings.values()){let has=false;for(const row of rows.values())if(row.rating!==null){has=true;ratings++;const prev=ranking.get(row.skin)??{skin:row.skin,total:0,ratings:0,histogram:Array(10).fill(0)};prev.total+=row.rating;prev.ratings++;prev.histogram[row.rating-1]++;ranking.set(row.skin,prev);}if(has)raters++;}
      return route.fulfill({json:{version:2,raters,ratings,ranking:[...ranking.values()],...(owner?{mine:[...mine.values()]}:{})}});
    }
    const body=req.postDataJSON();state.writes.push(body);
    if(state.profile)return route.fulfill({status:428,json:{error:'Choose your Arkpedia username before rating.'}});
    if(state.fail){state.fail=false;return route.fulfill({status:503,json:{error:'Could not save. Please retry.'}});}
    if(state.conflict){state.conflict=false;const current={skin:body.skin,rating:3,revision:(mine.get(body.skin)?.revision??0)+1};mine.set(body.skin,current);return route.fulfill({status:409,json:{error:'This rating changed on another device.',current}});}
    const row={skin:body.skin,rating:req.method()==='DELETE'?null:body.rating,revision:(mine.get(body.skin)?.revision??0)+1};mine.set(body.skin,row);return route.fulfill({json:row});
  });
  return state;
}
const cards=(page:Page)=>page.getByRole('button',{name:/^Rate .+ by /});
for(const theme of ['dark','light'])test(`ratings autosave, resume, edit and clear (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/favourite-skins');await expect(page.getByText(/0 \/ \d+ rated · Saved to your account/)).toBeVisible();
  await cards(page).first().click();let dialog=page.getByRole('dialog');await expect(dialog.getByRole('group',{name:'Rate this skin from 1 to 10',exact:true}).getByRole('button')).toHaveCount(10);
  const clear=()=>dialog.getByRole('button',{name:'Clear my rating',exact:true});await expect(clear()).toBeVisible();await expect(clear()).toBeDisabled();await page.evaluate(()=>document.fonts.ready);
  if((page.viewportSize()?.width??1440)<=720){
    const grid=dialog.getByRole('group',{name:'Rate this skin from 1 to 10',exact:true}),bounds=await grid.boundingBox(),scores=await grid.getByRole('button').evaluateAll(buttons=>buttons.map(button=>({left:button.getBoundingClientRect().left,right:button.getBoundingClientRect().right,width:button.getBoundingClientRect().width})));
    expect(Math.abs(scores[4].right-(bounds!.x+bounds!.width))).toBeLessThan(1);expect(Math.abs(scores[0].width-scores[4].width)).toBeLessThan(1);
    const previous=await dialog.getByRole('button',{name:'Previous skin',exact:true}).boundingBox(),next=await dialog.getByRole('button',{name:'Next skin',exact:true}).boundingBox();expect(Math.abs(previous!.width-next!.width)).toBeLessThan(1);
  }
  const positions=()=>Promise.all([dialog.getByRole('group',{name:'Rate this skin from 1 to 10',exact:true}),dialog.getByRole('button',{name:'Next skin',exact:true}),clear()].map(control=>control.boundingBox()));const initialPositions=await positions();
  for(let i=0;i<6;i++){await dialog.getByRole('button',{name:'9 out of 10',exact:true}).click();await expect(dialog.getByText('Saved to your account.',{exact:true})).toBeVisible();if(i===0){await expect(clear()).toBeEnabled();expect(await positions()).toEqual(initialPositions);}if(i<5)await dialog.getByRole('button',{name:'Next skin',exact:true}).click();}
  expect(state.writes).toHaveLength(6);await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect.poll(()=>new URL(page.url()).searchParams.get('skin')).toBeNull();await expect(page.getByText(/6 \/ \d+ rated/)).toBeVisible();await page.reload();await expect(page.getByText(/6 \/ \d+ rated/)).toBeVisible();
  await page.getByRole('group',{name:'Show skins',exact:true}).getByRole('button',{name:'Rated',exact:true}).click();await expect(cards(page)).toHaveCount(6);await cards(page).first().click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'9 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'2 out of 10',exact:true}).click();await expect(dialog.getByText('Saved to your account.',{exact:true})).toBeVisible();await expect.poll(()=>new URL(page.url()).searchParams.get('skin')).toBe(state.writes.at(-1).skin);await page.reload();dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'2 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(dialog.locator('img')).toHaveCount(1);await dialog.locator('img').evaluateAll(async images=>{await Promise.all(images.map(image=>(image as HTMLImageElement).decode()));});expect(await dialog.locator('img').evaluate(image=>(image as HTMLImageElement).naturalWidth>0)).toBe(true);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-rating-${theme}-${info.project.name}.png`,animations:'disabled'});
  const ratedPositions=await positions();await clear().focus();await page.keyboard.press('Enter');await expect(dialog.getByText('Rating cleared.',{exact:true})).toBeVisible();await expect(clear()).toBeVisible();await expect(clear()).toBeDisabled();expect(await positions()).toEqual(ratedPositions);await page.keyboard.press('Escape');await expect(cards(page)).toHaveCount(5);
  await expect.poll(()=>new URL(page.url()).searchParams.get('skin')).toBeNull();state.owner='other';await page.reload();await expect(page.getByText(/0 \/ \d+ rated/)).toBeVisible();await expect(cards(page)).toHaveCount(0);
  await page.getByRole('group',{name:'Show skins',exact:true}).getByRole('button',{name:'All',exact:true}).click();await expect(cards(page).first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('failed and conflicting ratings retain the unsaved choice and offer recovery',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/favourite-skins');await expect(page.getByText(/Saved to your account/)).toBeVisible();await cards(page).first().click();const dialog=page.getByRole('dialog');
  state.fail=true;await dialog.getByRole('button',{name:'7 out of 10',exact:true}).click();await expect(dialog.getByText('Not saved',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'7 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');await dialog.getByRole('button',{name:'Retry saving',exact:true}).click();await expect(dialog.getByText('Saved to your account.',{exact:true})).toBeVisible();
  state.conflict=true;await dialog.getByRole('button',{name:'10 out of 10',exact:true}).click();await expect(dialog.getByText('Not saved',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'10 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');await dialog.getByRole('button',{name:'Reload saved rating',exact:true}).click();await expect(dialog.getByRole('button',{name:'3 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('guests can browse public average rankings but cannot rate',async({page},info)=>{
  const state=await setup(page,'dark');state.owner=null;await page.goto('/polls/favourite-skins');await expect(page.getByRole('link',{name:'Sign in to Arkpedia to rate skins',exact:true})).toBeVisible();const skins=await page.evaluate(()=>((window as any).__NEXT_DATA__.props.pageProps.skins as {id:string}[]).slice(0,5));
  state.ratings.set('contributor',new Map(skins.map((skin,i)=>[skin.id,{skin:skin.id,rating:10-i,revision:1}])));await page.reload();await cards(page).first().click();await expect(page.getByRole('group',{name:'Rate this skin from 1 to 10',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Live ranking',exact:true}).click();await expect(page.getByRole('list',{name:'Top three results',exact:true}).getByRole('listitem').first()).toContainText('10.00/10');await expect(page.getByRole('table',{name:'Rankings from fourth place',exact:true}).locator('tbody tr')).toHaveCount(2);expect(state.writes).toHaveLength(0);
  const help=page.getByRole('button',{name:'How poll results work',exact:true});await help.click();await expect(page.getByRole('region',{name:'How poll results work',exact:true})).toContainText('average score');await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-rating-public-${info.project.name}.png`,animations:'disabled'});
});

test('profile completion keeps the chosen score available to retry',async({page})=>{
  const state=await setup(page,'dark');await page.goto('/polls/favourite-skins');await expect(page.getByText(/Saved to your account/)).toBeVisible();await cards(page).first().click();const dialog=page.getByRole('dialog');
  state.profile=true;await dialog.getByRole('button',{name:'7 out of 10',exact:true}).click();await expect(dialog.getByRole('link',{name:'Complete your profile',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'7 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');
  state.profile=false;await dialog.getByRole('button',{name:'Retry saving',exact:true}).click();await expect(dialog.getByText('Saved to your account.',{exact:true})).toBeVisible();
});

for(const theme of ['dark','light'])test(`public tier list, detailed statistics and distributions (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);state.owner=null;await page.goto('/polls/favourite-skins');
  const skins=await page.evaluate(()=>((window as any).__NEXT_DATA__.props.pageProps.skins as {id:string;name:string;operator:string}[]).slice(0,4));
  state.ratings.set('alice',new Map(skins.map((skin,i)=>[skin.id,{skin:skin.id,rating:[1,6,10,8][i],revision:1}])));state.ratings.set('bob',new Map(skins.slice(0,2).map((skin,i)=>[skin.id,{skin:skin.id,rating:[10,6][i],revision:1}])));
  await page.goto('/polls/favourite-skins?view=results&display=tierlist');await expect(page.getByRole('region',{name:'Average 5.5 out of 10',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Tier list',exact:true})).toHaveAttribute('aria-pressed','true');
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-tierlist-${theme}-${info.project.name}.png`,animations:'disabled'});
  const tile=page.getByRole('button',{name:`${skins[0].name} by ${skins[0].operator}: show rating statistics`,exact:true});await tile.focus();await tile.press('Enter');let dialog=page.getByRole('dialog',{name:skins[0].name,exact:true});
  await expect(dialog.getByText('5.50/10 average',{exact:true})).toBeVisible();await expect(dialog.getByRole('img',{name:/rating distribution from 1 to 10/})).toBeVisible();await expect(dialog.getByText('Small sample — results may change quickly.',{exact:true})).toBeVisible();
  await dialog.getByText('Counts and percentages',{exact:true}).click();const counts=dialog.getByRole('table',{name:'Rating counts and percentages',exact:true});await expect(counts.locator('tbody tr')).toHaveCount(10);await expect(counts.locator('tbody tr').first()).toContainText('50%');await expect(counts.locator('tbody tr').last()).toContainText('50%');
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-distribution-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(tile).toBeFocused();await expect.poll(()=>new URL(page.url()).searchParams.get('detail')).toBeNull();
  await page.getByRole('button',{name:'Detailed',exact:true}).click();const table=page.getByRole('table',{name:'Detailed rating statistics',exact:true});await expect(table.locator('tbody tr')).toHaveCount(4);
  await table.getByRole('button',{name:'Average',exact:false}).click();await expect(table.locator('thead th').nth(1)).toHaveAttribute('aria-sort','ascending');await expect(table.locator('tbody tr').first()).toContainText(skins[0].name);await expect(table.locator('tbody tr').first()).toContainText('3.25 – 7.75');
  if(info.project.name==='mobile'){const region=page.getByRole('region',{name:'Detailed rating statistics',exact:true});await page.getByRole('button',{name:'Scroll on through Detailed rating statistics',exact:true}).click();await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);}
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-detailed-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('group',{name:'Results by',exact:true}).getByRole('button',{name:'Operators',exact:true}).click();await expect(table.locator('tbody tr')).toHaveCount(3);await table.getByRole('button',{name:`${skins[0].operator}: show rating statistics`,exact:true}).click();dialog=page.getByRole('dialog',{name:skins[0].operator,exact:true});await expect(dialog.getByText('5.75/10 average',{exact:true})).toBeVisible();await expect(dialog.getByText(/4 ratings across this operator’s skins/)).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await page.getByRole('searchbox',{name:'Search results by operator or skin name',exact:true}).fill('no matching outfit');await expect(page.getByText('No results match your search.',{exact:true})).toBeVisible();await page.getByRole('searchbox',{name:'Search results by operator or skin name',exact:true}).fill(skins[0].operator);await expect(table.locator('tbody tr')).toHaveCount(1);await expect.poll(()=>new URL(page.url()).searchParams.get('display')).toBe('detailed');await expect.poll(()=>new URL(page.url()).searchParams.get('resultsQ')).toBe(skins[0].operator);await page.reload();await expect(page.getByRole('button',{name:'Detailed',exact:true})).toHaveAttribute('aria-pressed','true');await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Podium',exact:true}).click();await expect(page.getByRole('table',{name:'Matching rankings',exact:true}).locator('tbody tr')).toHaveCount(1);await expect(page.getByRole('list',{name:'Top three results',exact:true})).toHaveCount(0);
  const help=page.getByRole('button',{name:'How poll results work',exact:true});await help.click();await expect(page.getByRole('region',{name:'How poll results work',exact:true})).toContainText('linear interpolation');await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(state.writes).toHaveLength(0);
});

for(const theme of ['dark','light'])test(`rating artwork opens the shared animated viewer and returns without losing the score (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);await page.goto('/polls/favourite-skins');
  const skin=await page.evaluate(()=>((window as any).__NEXT_DATA__.props.pageProps.skins as {id:string;name:string;dynamic?:string|null}[]).find(skin=>skin.dynamic)!);
  expect(skin?.dynamic).toBeTruthy();await page.goto(`/polls/favourite-skins?skin=${encodeURIComponent(skin.id)}`);
  const rating=page.getByRole('dialog',{name:skin.name,exact:true});await rating.getByRole('button',{name:'8 out of 10',exact:true}).click();await expect(rating.getByText('Saved to your account.',{exact:true})).toBeVisible();
  const art=rating.getByRole('button',{name:`View full artwork of ${skin.name}`,exact:true});await art.focus();await art.press('Enter');
  let viewer=page.getByRole('dialog',{name:`${skin.name} artwork`,exact:true});await expect(viewer).toBeVisible();await expect(viewer.getByRole('button',{name:'Animated',exact:true})).toBeVisible();
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});await page.route('**/model.json*',async route=>{await held;await route.abort().catch(()=>{});});
  try{
    const requested=page.waitForRequest(request=>request.url().includes('/model.json'));
    await viewer.getByRole('button',{name:'Animated',exact:true}).click();await requested;
    await expect(viewer.getByRole('button',{name:'Animated',exact:true})).toHaveAttribute('aria-pressed','true');
    await viewer.getByRole('button',{name:'Back to rating',exact:true}).click();
  }finally{release();}
  await expect(viewer).toHaveCount(0);await expect(rating).toBeVisible();await expect(art).toBeFocused();await expect(rating.getByRole('button',{name:'8 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');expect(state.writes).toHaveLength(1);
  await art.click();viewer=page.getByRole('dialog',{name:`${skin.name} artwork`,exact:true});await expect(viewer).toBeVisible();await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);await expect(rating).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/rating-art-return-${theme}-${info.project.name}.png`,animations:'disabled'});
  await rating.getByRole('button',{name:'Back to skins',exact:true}).click();await expect(rating).toHaveCount(0);await expect.poll(()=>new URL(page.url()).searchParams.get('skin')).toBeNull();
});

for(const theme of ['dark','light'])test(`live ranking artwork opens full screen in every view and returns to its context (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);state.owner=null;await page.goto('/polls/favourite-skins');
  const skins=await page.evaluate(()=>{const rows=(window as any).__NEXT_DATA__.props.pageProps.skins as {id:string;name:string;operator:string;dynamic?:string|null}[];const animated=rows.find(skin=>skin.dynamic)!;return [animated,...rows.filter(skin=>skin.id!==animated.id).slice(0,4)];});
  state.ratings.set('community',new Map(skins.map((skin,i)=>[skin.id,{skin:skin.id,rating:10-i,revision:1}])));
  await page.goto('/polls/favourite-skins?view=results');await page.evaluate(()=>document.fonts.ready);
  const art=()=>page.getByRole('button',{name:`View full artwork of ${skins[0].name}`,exact:true});
  await art().focus();const before=await page.evaluate(()=>scrollY),url=page.url();await art().press('Enter');
  let viewer=page.getByRole('dialog',{name:`${skins[0].name} artwork`,exact:true});await expect(viewer).toBeVisible();await expect(viewer.getByRole('button',{name:'Animated',exact:true})).toBeVisible();await viewer.getByRole('img',{name:skins[0].name,exact:true}).evaluate((image:HTMLImageElement)=>image.decode());
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/ranking-full-art-${theme}-${info.project.name}.png`,animations:'disabled'});
  await viewer.getByRole('button',{name:'Back to ranking',exact:true}).click();await expect(viewer).toHaveCount(0);await expect(art()).toBeFocused();expect(page.url()).toBe(url);expect(await page.evaluate(()=>scrollY)).toBe(before);
  await page.getByRole('button',{name:`${skins[0].name}: show rating statistics`,exact:true}).click();const detail=page.getByRole('dialog',{name:skins[0].name,exact:true});await detail.getByRole('button',{name:`View full artwork of ${skins[0].name}`,exact:true}).click();
  viewer=page.getByRole('dialog',{name:`${skins[0].name} artwork`,exact:true});await expect(viewer).toBeVisible();await expect(viewer.getByRole('button',{name:'Back to statistics',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);await expect(detail).toBeVisible();await expect.poll(()=>new URL(page.url()).searchParams.get('detail')).toBe(skins[0].id);await detail.getByRole('button',{name:'Back to ranking',exact:true}).click();
  const fourth=page.getByRole('table',{name:'Rankings from fourth place',exact:true}).getByRole('button',{name:`View full artwork of ${skins[3].name}`,exact:true});await fourth.click();viewer=page.getByRole('dialog',{name:`${skins[3].name} artwork`,exact:true});await expect(viewer).toBeVisible();await viewer.getByRole('button',{name:'Back to ranking',exact:true}).click();await expect(fourth).toBeFocused();
  for(const display of ['Tier list','Detailed']){await page.getByRole('button',{name:display,exact:true}).click();await art().click();viewer=page.getByRole('dialog',{name:`${skins[0].name} artwork`,exact:true});await expect(viewer).toBeVisible();await viewer.getByRole('button',{name:'Back to ranking',exact:true}).click();await expect(page.getByRole('button',{name:display,exact:true})).toHaveAttribute('aria-pressed','true');await expect(art()).toBeFocused();}
  await page.getByRole('group',{name:'Results by',exact:true}).getByRole('button',{name:'Operators',exact:true}).click();await page.getByRole('button',{name:`View full artwork of ${skins[0].operator}`,exact:true}).click();viewer=page.getByRole('dialog',{name:`${skins[0].name} artwork`,exact:true});await expect(viewer).toBeVisible();await viewer.getByRole('button',{name:'Back to ranking',exact:true}).click();await expect(page.getByRole('button',{name:'Operators',exact:true})).toHaveAttribute('aria-pressed','true');expect(state.writes).toHaveLength(0);
});
