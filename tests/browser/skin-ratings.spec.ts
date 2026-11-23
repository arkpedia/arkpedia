import {expect,test,type Locator,type Page} from '@playwright/test';
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

async function expectStickyTierHandoff(first:Locator,next:Locator){
  const scrollToPinnedHeader=(header:Locator)=>header.evaluate(element=>{
    const offset=parseFloat(getComputedStyle(element).top);
    window.scrollBy(0,element.getBoundingClientRect().top-offset+32);
    return offset;
  });
  const firstOffset=await scrollToPinnedHeader(first);
  await expect.poll(async()=>(await first.boundingBox())!.y).toBeCloseTo(firstOffset,0);
  const nextOffset=await scrollToPinnedHeader(next);
  await expect.poll(async()=>(await next.boundingBox())!.y).toBeCloseTo(nextOffset,0);
  const firstHeader=(await first.boundingBox())!;
  expect(firstHeader.y+firstHeader.height).toBeLessThanOrEqual(nextOffset);
}

async function expectScoreBesideArt(score:Locator,art:Locator){
  const [scoreBox,artBox]=await Promise.all([score.boundingBox(),art.boundingBox()]);
  expect(scoreBox!.x+scoreBox!.width).toBeLessThanOrEqual(artBox!.x);
}

for(const theme of ['dark','light'])test(`rated skins tier list groups saved scores and supports re-rating (${theme})`,async({page},info)=>{
  const state=await setup(page,theme);
  await page.goto('/polls/favourite-skins');
  const skins=await page.evaluate(()=>((window as any).__NEXT_DATA__.props.pageProps.skins as {id:string;name:string;operator:string}[]).slice(0,37));
  const [low,high,alsoHigh,communityOnly,...middle]=skins;
  const own=[low,high,alsoHigh,...middle].map((skin,i)=>[skin.id,{skin:skin.id,rating:[1,10,10][i]??5,revision:1}] as const);
  state.ratings.set('rater',new Map(own));
  state.ratings.set('community',new Map([[communityOnly.id,{skin:communityOnly.id,rating:10,revision:1}]]));
  await page.reload();

  const filters=page.getByRole('group',{name:'Show skins',exact:true});
  const order=page.getByRole('group',{name:'Rating order',exact:true});
  const highest=order.getByRole('button',{name:'Highest first',exact:true});
  const lowest=order.getByRole('button',{name:'Lowest first',exact:true});
  const compact=page.getByRole('checkbox',{name:'Compact tier list',exact:true});
  const tierList=page.getByRole('group',{name:'Your ratings tier list',exact:true});
  const row=(score:number)=>tierList.getByRole('region',{name:`Your rating ${score} out of 10`,exact:true});
  const rate=(skin:typeof high)=>page.getByRole('button',{name:`Rate ${skin.name} by ${skin.operator}`,exact:true});
  const search=page.getByRole('searchbox',{name:'Search by operator or skin name'});
  const [allFilter,unratedFilter,ratedFilter]=['All','Unrated','Rated'].map(name=>filters.getByRole('button',{name,exact:true}));
  const progress=page.getByText(/rated · Saved to your account/);
  const layout=async()=>({
    controls:await Promise.all([search,allFilter,unratedFilter,ratedFilter,progress].map(control=>control.boundingBox())),
    galleryTop:(await cards(page).first().boundingBox())?.y,
  });

  await expect(order).toHaveCount(0);
  await expect(progress).toBeVisible();
  const allLayout=await layout();
  const artSize=()=>rate(high).evaluate(card=>{
    const {width,height}=card.firstElementChild!.getBoundingClientRect();
    return {width,height};
  });
  const mobile=(page.viewportSize()?.width??1440)<=720;
  await ratedFilter.click();
  await expect(highest).toHaveAttribute('aria-pressed','true');
  expect(await layout()).toEqual(allLayout);
  await unratedFilter.click();
  await expect(order).toHaveCount(0);
  expect(await layout()).toEqual(allLayout);
  await ratedFilter.click();
  await expect(highest).toHaveAttribute('aria-pressed','true');
  await expect(compact).not.toBeChecked();
  await expect(tierList.getByRole('region').first()).toHaveAttribute('aria-label','Your rating 10 out of 10');
  await expect(row(10).getByRole('button')).toHaveCount(2);
  await expect(row(5)).toBeVisible();
  await expect(rate(communityOnly)).toHaveCount(0);
  await expect.poll(async()=>(await artSize()).height).toBe(mobile?190:220);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);

  const header=(score:number)=>row(score).getByText(`${score}/10`,{exact:true});
  await expectScoreBesideArt(header(10),rate(high));
  await expectStickyTierHandoff(header(10),header(5));
  if(process.env.ARKPEDIA_QA_CAPTURE){
    await page.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{});
    await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/rated-skins-tier-list-${theme}-${info.project.name}.png`,animations:'disabled'});
  }

  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(row(1)).toBeVisible();
  await expect(tierList.getByRole('region')).toHaveCount(3);
  await expect(tierList.getByRole('region').last()).toHaveAttribute('aria-label','Your rating 1 out of 10');
  await row(1).getByRole('button').click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'Next skin',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Previous skin',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'5 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await lowest.focus();
  await lowest.press('Enter');
  await expect(lowest).toBeFocused();
  await expect(tierList.getByRole('region').first()).toHaveAttribute('aria-label','Your rating 1 out of 10');
  await compact.check();

  await search.fill('skin-with-no-matches');
  await expect(page.getByText('No skins match these filters.',{exact:true})).toBeVisible();
  await search.fill(high.name);
  await expect(rate(high)).toBeVisible();
  expect(await artSize()).toMatchObject({height:mobile?88:104});
  expect((await artSize()).width).toBeLessThan(100);
  await expectScoreBesideArt(header(10),rate(high));
  await expect(row(5)).toHaveCount(0);
  await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe(high.name);
  await page.reload();
  await expect(lowest).toHaveAttribute('aria-pressed','true');
  await expect(compact).toBeChecked();
  await expect(search).toHaveValue(high.name);
  await expect(rate(high)).toBeVisible();

  await rate(high).focus();
  await rate(high).press('Enter');
  await expect(dialog.getByRole('button',{name:'10 out of 10',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'2 out of 10',exact:true}).click();
  await expect(dialog.getByText('Saved to your account.',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(2).getByRole('button',{name:`Rate ${high.name} by ${high.operator}`,exact:true})).toBeFocused();
  await rate(high).press('Enter');
  await dialog.getByRole('button',{name:'Clear my rating',exact:true}).click();
  await expect(dialog.getByText('Rating cleared.',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(2)).toHaveCount(0);
  await expect(search).toBeFocused();

  await search.fill('');
  await filters.getByRole('button',{name:'Unrated',exact:true}).click();
  await expect(order).toHaveCount(0);
  await expect(compact).toHaveCount(0);
  await expect(tierList).toHaveCount(0);
  await filters.getByRole('button',{name:'Rated',exact:true}).click();
  await expect(lowest).toHaveAttribute('aria-pressed','true');
  await highest.click();
  await expect(tierList.getByRole('region').first()).toHaveAttribute('aria-label','Your rating 10 out of 10');
  expect(state.writes).toHaveLength(2);
});

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
  await page.getByRole('tab',{name:'Live ranking',exact:true}).click();await page.getByRole('checkbox',{name:'Weighted Rating',exact:true}).uncheck();await expect(page.getByRole('list',{name:'Top three results',exact:true}).getByRole('listitem').first()).toContainText('10.00/10');await expect(page.getByRole('table',{name:'Rankings from fourth place',exact:true}).locator('tbody tr')).toHaveCount(2);expect(state.writes).toHaveLength(0);
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
  await page.goto('/polls/favourite-skins?view=results&display=tierlist&weighted=off');await expect(page.getByRole('region',{name:'Average 5.5 out of 10',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Tier list',exact:true})).toHaveAttribute('aria-pressed','true');
  const header=(score:string)=>page.getByRole('region',{name:`Average ${score} out of 10`,exact:true}).getByText(score,{exact:true});
  await expectStickyTierHandoff(header('10.0'),header('8.0'));
  const art=page.getByRole('button',{name:`View full artwork of ${skins[0].name}`,exact:true});
  const mobile=(page.viewportSize()?.width??1440)<=720;
  await expect(art).toHaveCSS('height',mobile?'190px':'220px');
  await expectScoreBesideArt(header('5.5'),art);
  const compact=page.getByRole('checkbox',{name:'Compact tier list',exact:true});
  await compact.check();
  await expect(art).toHaveCSS('width',mobile?'72px':'88px');
  await expect(art).toHaveCSS('height',mobile?'88px':'104px');
  await expectScoreBesideArt(header('5.5'),art);
  await art.focus();
  await art.press('Enter');
  const viewer=page.getByRole('dialog',{name:`${skins[0].name} artwork`,exact:true});
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button',{name:'Back to ranking',exact:true}).click();
  await expect(art).toBeFocused();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-tierlist-${theme}-${info.project.name}.png`,animations:'disabled'});
  const tile=page.getByRole('button',{name:`${skins[0].name} by ${skins[0].operator}: show rating statistics`,exact:true});await tile.focus();await tile.press('Enter');let dialog=page.getByRole('dialog',{name:skins[0].name,exact:true});
  await expect(dialog.getByText('5.50/10 average',{exact:true})).toBeVisible();await expect(dialog.getByRole('img',{name:/rating distribution from 1 to 10/})).toBeVisible();await expect(dialog.getByText('Small sample — results may change quickly.',{exact:true})).toBeVisible();
  await dialog.getByText('Counts and percentages',{exact:true}).click();const counts=dialog.getByRole('table',{name:'Rating counts and percentages',exact:true});await expect(counts.locator('tbody tr')).toHaveCount(10);await expect(counts.locator('tbody tr').first()).toContainText('50%');await expect(counts.locator('tbody tr').last()).toContainText('50%');
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-distribution-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(tile).toBeFocused();await expect.poll(()=>new URL(page.url()).searchParams.get('detail')).toBeNull();
  await page.getByRole('button',{name:'Detailed',exact:true}).click();const table=page.getByRole('table',{name:'Detailed rating statistics',exact:true});await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(compact).toHaveCount(0);
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

for(const theme of ['dark','light'])test(`weighted rankings resist a lone ten and show only the current account’s own scores (${theme})`,async({page},info)=>{
  test.setTimeout(60000);const state=await setup(page,theme);await page.goto('/polls/favourite-skins',{waitUntil:'domcontentloaded'});await expect(page.getByText(/Saved to your account/)).toBeVisible();
  const [rare,trusted,baseline]=await page.evaluate(()=>{const groups=new Map<string,any[]>();for(const skin of (window as any).__NEXT_DATA__.props.pageProps.skins){const rows=groups.get(skin.operator)??[];rows.push(skin);groups.set(skin.operator,rows);}return [...groups.values()].find(rows=>rows.length>=3)!.slice(0,3).map(({id,name,operator})=>({id,name,operator}));});
  state.ratings.set('lone',new Map([[rare.id,{skin:rare.id,rating:10,revision:1}]]));
  for(let i=0;i<100;i++)state.ratings.set(`regular-${i}`,new Map([[trusted.id,{skin:trusted.id,rating:i<90?10:9,revision:1}]]));
  for(let i=0;i<1000;i++)state.ratings.set(`baseline-${i}`,new Map([[baseline.id,{skin:baseline.id,rating:6,revision:1}]]));
  state.ratings.set('rater',new Map([[trusted.id,{skin:trusted.id,rating:9,revision:1}],[baseline.id,{skin:baseline.id,rating:5,revision:1}]]));
  await page.goto('/polls/favourite-skins?view=results',{waitUntil:'domcontentloaded'});const weighted=page.getByRole('checkbox',{name:'Weighted Rating',exact:true}),podium=page.getByRole('list',{name:'Top three results',exact:true});await expect(weighted).toBeChecked();await expect(podium.getByRole('listitem').first()).toContainText(trusted.name);await expect(podium.getByText('Your score 9/10',{exact:true})).toBeVisible();
  await weighted.uncheck();await expect(podium.getByRole('listitem').first()).toContainText(rare.name);await expect(podium.getByRole('listitem').first()).toContainText('10.00/10');await expect(podium.getByText('Your score 9/10',{exact:true})).toBeVisible();await expect.poll(()=>new URL(page.url()).searchParams.get('weighted')).toBe('off');await page.reload({waitUntil:'domcontentloaded'});await expect(weighted).not.toBeChecked();
  await weighted.check();await page.getByRole('button',{name:'Detailed',exact:true}).click();const table=page.getByRole('table',{name:'Detailed rating statistics',exact:true});await expect(table.getByRole('columnheader',{name:/Weighted Rating/})).toBeVisible();await expect(table.getByRole('columnheader',{name:'Your score',exact:true})).toBeVisible();const ownRow=table.locator('tbody tr').filter({has:page.getByRole('button',{name:`${trusted.name}: show rating statistics`,exact:true})});await expect(ownRow.getByText('9/10',{exact:true})).toBeVisible();
  await expect(ownRow.getByText(/vs average/)).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/skin-weighted-personal-${theme}-${info.project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Tier list',exact:true}).click();
  await page.getByRole('checkbox',{name:'Compact tier list',exact:true}).check();
  await expect(page.getByText('Your score 9/10',{exact:true})).toBeVisible();
  await expect(page.getByText(/vs average|Matches average/)).toHaveCount(0);
  await page.getByRole('group',{name:'Results by',exact:true}).getByRole('button',{name:'Operators',exact:true}).click();
  await expect(page.getByText('Your score 7/10',{exact:true})).toBeVisible();
  await expect(page.getByText(/vs average|Matches average/)).toHaveCount(0);
  await page.getByRole('button',{name:'Podium',exact:true}).click();
  await expect(podium.getByText('Your score 7/10',{exact:true})).toBeVisible();
  await expect(podium.getByText(/vs average/)).not.toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await expect.poll(()=>new URL(page.url()).searchParams.get('group')).toBe('operators');await expect.poll(()=>new URL(page.url()).searchParams.get('display')).toBeNull();state.owner='other';await page.reload({waitUntil:'domcontentloaded'});await expect(podium.getByText('Your score —',{exact:true})).toBeVisible();await expect(page.getByText('Your score 7/10',{exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});
