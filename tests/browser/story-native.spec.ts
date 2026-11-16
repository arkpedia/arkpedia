import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {STORY_PROGRESS_KEY} from '../../lib/story/storyProgress';
import review from '../../scripts/tests/fixtures/story-monster-hunter.json';

for(const theme of ['dark','light'])test(`new event discovery and text reading retain independent progress (${theme})`,async({page,context})=>{
  await context.addInitScript(({theme,key})=>{localStorage.setItem('theme',theme);localStorage.setItem('arkpedia:privacy:v1',JSON.stringify({version:1,analytics:false,externalMedia:false,externalMediaChosen:true,savedAt:Date.now()}));localStorage.setItem(key,JSON.stringify({act50side:[99]}));},{theme,key:STORY_PROGRESS_KEY});
  const chapter={title:'Thunder in the Azure Dream',category:'side',revision:'e0cd8f274ffbcf57ed0b0684cb681620478ffe0e',sections:review.act50side.infoUnlockDatas.slice(0,2).map(row=>({index:row.storySort,code:row.storyCode,title:row.storyName,path:row.storyTxt,tag:''}))};
  await context.route('**/en/gamedata/story/activities/act50side/*.txt',async route=>{
    const first=route.request().url().includes('_st01.txt');
    await route.fulfill({body:fs.readFileSync(path.resolve('tests/fixtures/story',first?'monster-hunter-prologue.txt':'monster-hunter-first-stage.txt')),contentType:'text/plain',headers:{'access-control-allow-origin':'*'}});
  });
  // A published content snapshot may predate the new fallback metadata.
  await context.route(/\/story(?:\/read)?(?:\?|$)/,async route=>{
    if(route.request().resourceType()!=='document')return route.continue();
    const response=await route.fetch(),html=await response.text();
    const match=/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)!;
    const data=JSON.parse(match[1]);
    if(data.page==='/story/read')data.props.pageProps.chapters={act50side:chapter};
    else data.props.pageProps.library=[...data.props.pageProps.library.filter((e:{id:string})=>e.id!=='native_act50side'),{id:'native_act50side',category:'side',title:chapter.title,url:'/story/read?chapter=act50side'}];
    await route.fulfill({response,body:html.replace(match[1],JSON.stringify(data).replace(/</g,'\\u003c'))});
  });
  await page.goto('/story?view=list&q=Thunder%20in%20the%20Azure%20Dream');
  const [reader]=await Promise.all([context.waitForEvent('page'),page.getByRole('link',{name:/Thunder in the Azure Dream/}).click()]);
  await expect(reader.getByRole('article',{name:'Story text'})).toContainText('Orchid');
  await reader.getByRole('button',{name:'Mark as read',exact:true}).click();
  await expect(reader.getByRole('button',{name:'Mark unread',exact:true})).toHaveAttribute('aria-pressed','true');
  await reader.getByRole('button',{name:'Next',exact:true}).click();
  await expect(reader).toHaveURL(/part=2$/);
  await expect(reader.getByRole('article',{name:'Story text'})).toBeVisible();
  await reader.goBack();
  await expect(reader.getByRole('button',{name:'Mark unread',exact:true})).toBeVisible();
  expect(await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await reader.evaluate(key=>JSON.parse(localStorage.getItem(key)??'{}').act50side,STORY_PROGRESS_KEY)).toEqual([99]);
  expect(await reader.evaluate(key=>JSON.parse(localStorage.getItem(key)??'{}').native_act50side,STORY_PROGRESS_KEY)).toContain(1);
  await reader.goto('/story/read?chapter=__proto__');
  await expect(reader.getByRole('heading',{name:'Choose a story from the library',exact:true})).toBeVisible();
});
