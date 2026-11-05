import {expect,test,type Page} from '@playwright/test';
import {readOnly} from './census-routes';

async function prepare(page:Page,theme:string){
  await readOnly(page);await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.route('**/api/cloud-account',route=>route.fulfill({status:401,json:{providers:['google']}}));
  await page.route('**/api/community/sharing',route=>route.fulfill({json:{stats:false,shareTag:false,openRequests:false,revision:0}}));
  await page.route('**/api/cloud-account/polls/favourite-skins**',route=>route.fulfill({json:{version:2,raters:0,ratings:0,ranking:[]}}));
}
for(const theme of ['dark','light'])test(`poll overview artwork and public destinations (${theme})`,async({page},info)=>{
  await prepare(page,theme);await page.goto('/polls');
  await expect(page.getByRole('heading',{name:'Community polls',exact:true})).toBeVisible();
  const feature=page.getByRole('region',{name:'Arkpedia Drip Awards',exact:true});
  await expect(feature.getByText('A very serious poll, for serious poll testing',{exact:true})).toBeVisible();
  await expect(feature.getByRole('definition')).toHaveText(['1–10','Any skin','Any time']);
  const showcase=page.getByRole('group',{name:'Outfit showcase',exact:true});
  await expect(showcase.locator('img')).toHaveCount(3);
  await showcase.locator('img').evaluateAll(async images=>{await Promise.all(images.map(image=>(image as HTMLImageElement).decode()));});
  expect(await showcase.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const vote=feature.getByRole('link',{name:'Rate skins',exact:true});await expect(vote).toBeInViewport();await vote.focus();await expect(vote).toBeFocused();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/polls-overview-${theme}-${info.project.name}.png`,animations:'disabled',fullPage:true});
  await vote.press('Enter');await expect(page.getByRole('link',{name:'Sign in to Arkpedia to rate skins',exact:true})).toBeVisible();await page.goBack();
  await page.getByRole('link',{name:'Live ranking',exact:true}).click();await expect(page.getByRole('tab',{name:'Live ranking',exact:true})).toHaveAttribute('aria-selected','true');await page.goBack();
  await page.getByRole('link',{name:'Power Scale results',exact:true}).click();await expect(page.getByRole('heading',{name:'Community results',exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'Community polls',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(page.getByRole('link',{name:'Rate skins',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
