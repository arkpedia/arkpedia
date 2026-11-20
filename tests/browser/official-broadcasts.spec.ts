import {expect,test} from '@playwright/test';
for(const theme of ['dark','light']) test(`official broadcasts roll over regionally and retain live until end (${theme})`,async({page})=>{
  await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('arkpedia:privacy:v1',JSON.stringify({version:1,analytics:false,externalMedia:false,externalMediaChosen:true,savedAt:Date.now()}));},theme);
  const now=Date.now(),start=new Date(now+3600000).toISOString(),later=new Date(now+7200000).toISOString();
  const broadcast=(region:string,id:string,startsAt:string,status='upcoming')=>({id,source:region,game:'arknights',region,title:`6th Anniversary Livestream · ${region}`,url:`https://www.youtube.com/watch?v=${id}`,thumbnail:'https://i.ytimg.com/vi/en000000001/hqdefault.jpg',startsAt,status,verifiedAt:new Date().toISOString(),groupKey:'anniversary6'});
  let records=[broadcast('jp','jp000000001',start),broadcast('global','en000000001',later),broadcast('kr','kr000000001',later)];
  await page.route('**/api/home/broadcasts',route=>route.fulfill({json:{checkedAt:new Date().toISOString(),degraded:false,broadcasts:records}}));
  await page.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#17383c"/><text x="640" y="330" text-anchor="middle" fill="#fff" font-size="64">ARKNIGHTS</text><text x="640" y="420" text-anchor="middle" fill="#68d6c5" font-size="40">ANNIVERSARY BROADCAST</text></svg>'}));
  await page.goto('/');
  const panel=page.locator('.front-events-panel');
  const dots=panel.locator('.front-events-dots');
  const slide=panel.locator('.front-events-slide[data-current]');
  const hero=panel.locator('.front-events-slide[data-current] .front-events-main');
  await expect(hero).toHaveAttribute('href',/jp000000001/);
  await expect(panel.getByLabel('Other regional broadcasts').getByRole('link',{name:'Global',exact:true})).toBeVisible();
  await expect(panel.locator('time').first()).toHaveAttribute('datetime',start);
  // Switching between a regional broadcast and ordinary event must not move the controls.
  const position=await dots.evaluate(el=>el.getBoundingClientRect().top+scrollY);
  const timezones=slide.getByRole('button',{name:/^Show Timezones for /});
  await expect(timezones).toHaveText('Show Timezones');
  const anchor=()=>timezones.evaluate(button=>{
    const rect=button.getBoundingClientRect();
    const art=button.closest('.front-events-slide')!.querySelector('.front-events-poster-wrap')!.getBoundingClientRect();
    return {x:rect.right+scrollX,y:rect.bottom+scrollY,belowPoster:rect.top>art.bottom};
  });
  const broadcastAnchor=await anchor();
  expect(broadcastAnchor.belowPoster).toBe(true);
  const eventDot=panel.locator('.front-events-dot').last();
  await eventDot.click();
  await expect(hero).toHaveAttribute('href',/^\/events\//);
  expect(await dots.evaluate(el=>el.getBoundingClientRect().top+scrollY)).toBeCloseTo(position, 0);
  if ((await eventDot.getAttribute('aria-label'))?.endsWith(', upcoming')) {
    const eventAnchor=await anchor();
    expect(eventAnchor.belowPoster).toBe(true);
    expect(eventAnchor.x).toBeCloseTo(broadcastAnchor.x,0);
    expect(eventAnchor.y).toBeCloseTo(broadcastAnchor.y,0);
  }
  await panel.locator('.front-events-dot').first().click();
  await expect(hero).toHaveAttribute('href',/jp000000001/);
  expect(await dots.evaluate(el=>el.getBoundingClientRect().top+scrollY)).toBeCloseTo(position, 0);
  records=[{...records[0],status:'live'}, {...records[1],status:'live'},{...records[2],status:'live'}];
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(panel.getByText('Live now',{exact:true})).toBeVisible();
  await expect(hero).toHaveAttribute('href',/jp000000001/);
  await expect(timezones).toHaveCount(0);
  records=[{...records[0],status:'ended'},records[1],records[2]];
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(hero).toHaveAttribute('href',/en000000001/);
  await expect(panel.getByRole('link',{name:'JP replay',exact:true})).toBeVisible();
  await expect(hero.locator('img')).toHaveJSProperty('naturalWidth',1280);
  await page.screenshot({path:`/tmp/arkpedia-broadcast-${test.info().project.name}-${theme}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // A late provider Live flag must not steal an already featured stream.
  records=[{...records[0],status:'ended'},{...records[1],status:'upcoming'},records[2]];
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(hero).toHaveAttribute('href',/kr000000001/);
  records=[records[0],{...records[1],status:'live'},records[2]];
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(hero).toHaveAttribute('href',/kr000000001/);
  await expect(panel.getByRole('link',{name:'Global · Live now',exact:true})).toBeVisible();
  records=records.map(record=>({...record,status:'ended'}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(hero).toHaveAttribute('href',/^\/events\//);
  await expect(panel.getByText('Live now',{exact:true})).toHaveCount(0);
});
