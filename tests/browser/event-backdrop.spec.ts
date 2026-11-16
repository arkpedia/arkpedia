import { test, expect } from '@playwright/test';
const event='/events/'+encodeURIComponent("[Rerun] The Masses' Travels Rerun");
for (const theme of ['dark','light']) test(`event artwork fills the page behind readable controls (${theme})`,async({page})=>{
  await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.goto(event);
  const art=page.locator('.event-page-art'); await expect(art).toBeVisible();
  const box=(await art.boundingBox())!,width=await page.evaluate(()=>document.documentElement.getBoundingClientRect().width);
  expect(box.x).toBe(0); expect(box.y).toBe(0); expect(box.width).toBe(width); expect(box.height).toBe(page.viewportSize()!.height);
  expect(await art.evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
  await expect(page.locator('.event-detail-carousel')).toHaveCount(0);
  const header=page.locator('.event-page > .page-header');
  const headingBox=(await header.boundingBox())!;
  const operatorBox=(await page.locator('.event-section-card').first().boundingBox())!;
  const pageBox=(await page.locator('.event-page').boundingBox())!;
  expect(pageBox.y).toBeGreaterThan(0);
  expect(headingBox.y-pageBox.y).toBeLessThan(40);
  const back=(await header.locator('.back-btn').boundingBox())!;
  const trail=(await header.locator('.eyebrow').boundingBox())!;
  expect(Math.abs((back.y+back.height/2)-(trail.y+trail.height/2))).toBeLessThan(1);
  await expect(page.getByRole('heading',{level:1})).toHaveText("The Masses' Travels");
  await expect(page.locator('.event-detail-right.artwork-surface')).toHaveCount(0);
  const tabs=page.getByRole('tablist',{name:'Event sections'});
  const tabsBox=(await tabs.boundingBox())!;
  expect(await header.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await tabs.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('.artwork-page').evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('linear-gradient');
  const card=page.locator('.event-section-card').first();
  expect(await card.evaluate(el=>getComputedStyle(el).backgroundColor)).toContain('0.82');
  await page.getByRole('tab',{name:'Rewards',exact:true}).click();
  const rewardsBox=(await page.locator('.event-section-card').first().boundingBox())!;
  expect(rewardsBox.width).toBe(operatorBox.width);
  const nextTabs=(await tabs.boundingBox())!;
  expect(Math.abs(nextTabs.x-tabsBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(nextTabs.y-tabsBox.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button',{name:'View rewards image fullscreen',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View rewards image fullscreen',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await page.locator('.page-header .back-btn').click(); await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.locator('.event-page-art')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const theme of ['dark', 'light']) test(`limited banner lineups use horizontal rows (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/events/' + encodeURIComponent('[Side Story – Carnival] Till the Lands Become an Orange'));
  const card = page.locator('.event-banner-card');
  await expect(card.getByRole('heading', { name: 'Trails End Winds Rest', exact: true })).toBeVisible();
  for (const lineup of await card.locator('.event-detail-lineup').all()) {
    const tiles = await lineup.locator('.event-detail-featured-op').all();
    expect(tiles).toHaveLength(3);
    const boxes = await Promise.all(tiles.map(tile => tile.boundingBox()));
    expect(Math.max(...boxes.map(box => box!.y)) - Math.min(...boxes.map(box => box!.y))).toBeLessThan(1);
  }
  const operators = (await card.boundingBox())!;
  if (page.viewportSize()!.width >= 960) {
    expect(operators.width).toBeGreaterThan(1000);
    expect((await card.locator('.event-detail-banner-art-wrap').boundingBox())!.width).toBeGreaterThan(500);
  }
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  expect((await page.locator('.event-section-card').first().boundingBox())!.width).toBe(operators.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('glass remains composed while its contents reveal', async ({ page }) => {
  await page.goto(event);
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  const glass = page.locator('.artwork-glass').first();
  // Hold the real reveal mid-animation: filtering must be able to sample artwork,
  // without an opacity backdrop root on the card or any of its ancestors.
  await glass.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => {
    animation.pause(); animation.currentTime = 250;
  }));
  const contentsOpacity = await glass.locator(':scope > *').first().evaluate(el => +getComputedStyle(el).opacity);
  expect(contentsOpacity).toBeGreaterThan(0);
  expect(contentsOpacity).toBeLessThan(1);
  expect(await glass.evaluate(el => {
    for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).opacity !== '1') return false;
    }
    return true;
  })).toBe(true);
  await expect(glass).toHaveCSS('backdrop-filter', 'blur(5px)');
});
