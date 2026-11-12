import {expect,test,type Page} from '@playwright/test';
import {readOnly} from './census-routes';
import catalogue from '../../data/community-poll-catalogue.json';

async function prepare(page:Page,theme:string){
  await readOnly(page);await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.route('**/api/cloud-account',route=>route.fulfill({status:401,json:{providers:['google']}}));
  await page.route('**/api/community/sharing',route=>route.fulfill({json:{stats:false,shareTag:false,openRequests:false,revision:0}}));
  await page.route('**/api/cloud-account/polls/favourite-skins**',route=>route.fulfill({json:{version:2,raters:3,ratings:3,ranking:catalogue.skins.slice(0,3).map((skin,i)=>({skin:skin.id,total:10-i,ratings:1}))}}));
}
for(const theme of ['dark','light'])test(`poll overview artwork and public destinations (${theme})`,async({page},info)=>{
  await prepare(page,theme);await page.goto('/polls');
  await expect(page.getByRole('heading',{name:'Community polls',exact:true})).toBeVisible();
  const feature=page.getByRole('region',{name:'Arkpedia Drip Awards',exact:true});
  await expect(feature.getByText('A very serious poll, for serious poll testing',{exact:true})).toBeVisible();
  await expect(feature.getByRole('definition')).toHaveText(['1–10','Any skin','Any time']);
  const showcase=page.getByRole('group',{name:'Current skin leaders',exact:true});
  await expect(showcase.locator('img')).toHaveCount(3);
  await expect(showcase.locator('figcaption')).toHaveText([`#2${catalogue.skins[1].name}`,`#1${catalogue.skins[0].name}`,`#3${catalogue.skins[2].name}`]);
  const power=page.getByRole('group',{name:'Power Scale top three',exact:true});
  expect(await power.locator('figure').evaluateAll(figures=>figures.map(figure=>figure.getAttribute('data-rank')))).toEqual(['2','1','3']);
  await expect(power.locator('img')).toHaveCount(3);for(const image of await power.locator('img').all())await expect(image).toBeVisible();
  for(const group of [showcase,power])expect(await group.evaluate(root=>{const box=root.getBoundingClientRect();return [...root.querySelectorAll('figcaption')].every(caption=>{const rect=caption.getBoundingClientRect();return rect.top>=box.top&&rect.bottom<=box.bottom+1;});})).toBe(true);
  await showcase.locator('img').evaluateAll(async images=>{await Promise.all(images.map(image=>(image as HTMLImageElement).decode()));});
  expect(await showcase.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const vote=feature.getByRole('link',{name:'Rate skins',exact:true});await expect(vote).toBeInViewport();await vote.focus();await expect(vote).toBeFocused();
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/polls-overview-${theme}-${info.project.name}.png`,animations:'disabled',fullPage:true});
  await vote.press('Enter');await expect(page.getByRole('link',{name:'Sign in to Arkpedia to rate skins',exact:true})).toBeVisible();await expect(page.locator('.page-header > .back-btn')).toHaveAttribute('href','/polls');await page.locator('.page-header > .back-btn').click();
  await page.getByRole('link',{name:'Live ranking',exact:true}).click();await expect(page.getByRole('tab',{name:'Live ranking',exact:true})).toHaveAttribute('aria-selected','true');await page.goBack();
  await page.getByRole('link',{name:'Power Scale results',exact:true}).click();await expect(page.getByRole('heading',{name:'Community results',exact:true})).toBeVisible();await page.locator('.page-header > .back-btn').click();await expect(page.getByRole('heading',{name:'Community polls',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(page.getByRole('link',{name:'Rate skins',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('the overview never substitutes featured outfits for an empty live ranking',async({page})=>{
  await prepare(page,'dark');await page.route('**/api/cloud-account/polls/favourite-skins**',route=>route.fulfill({json:{version:2,raters:0,ratings:0,ranking:[]}}));
  await page.goto('/polls');const leaders=page.getByRole('group',{name:'Current skin leaders',exact:true});
  await expect(leaders).toContainText('No ratings yet.');await expect(leaders.locator('img')).toHaveCount(0);
});
