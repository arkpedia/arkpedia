import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';
import { stubMonsterSiren } from './monster-siren-stub';
test.use({ storageState: { cookies: [], origins: [] } });
const shell = (page: Page) => page.locator('.music-player');
const event = '/events/' + encodeURIComponent("[Rerun] The Masses' Travels Rerun");
async function enable(page: Page, values: Record<string, unknown> = { backgroundMusic: true }) {
  await page.addInitScript(values => {
    localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 1, values }));
    localStorage.setItem('musicVolume', '42');
  }, values);
}
async function navigate(page: Page, path: string) {
  await page.evaluate(path => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } }).next.router.push(path), path);
}
async function ambient(page: Page) {
  return page.evaluate(() => {
    const player = (window as unknown as { __pageYt?: {state:number;videoId:string;volume:number;destroyed?:boolean;calls:unknown[]} }).__pageYt;
    return player ? { state:player.state, videoId:player.videoId, volume:player.volume, destroyed:player.destroyed, calls:player.calls } : null;
  });
}
async function playing(page: Page) {
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','playing');
  await expect(page.getByRole('button', { name: 'Mute page music', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await ambient(page))?.state).toBe(1);
  return (await ambient(page))!;
}
async function settings(page: Page) {
  const trigger=page.getByRole('button',{name:'Settings',exact:true});
  if(await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  return page.getByRole('region',{name:'Settings',exact:true});
}
async function expand(page: Page) {
  const button = shell(page).getByRole('button', { name: 'Expand player' });
  if (await button.isVisible()) await button.click();
}
for (const theme of ['dark', 'light']) {
  test(`first visit offers media and optional autoplay with accessible help (${theme})`, async ({ page }, info) => {
    await stubYouTube(page, 'allow', { mediaConsent: false });
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto(event);
    const prompt = page.getByRole('region', { name: 'Music playback choice' });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole('heading', { name: 'Allow music playback?', exact: true })).toBeVisible();
    await expect(prompt.getByLabel('Event Music', {exact:true})).not.toBeChecked();
    await expect(prompt.getByLabel('Background Music', {exact:true})).not.toBeChecked();
    await expect(page.getByRole('region', { name: 'Usage statistics choice' })).toBeHidden();
    expect(await youtube(page)).toBeNull(); expect(await ambient(page)).toBeNull();
    const help = prompt.getByRole('button', { name: 'How background music works' });
    await help.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Your chosen theme plays quietly as you browse, except on event pages.', {exact:false})).toBeVisible();
    await expect(prompt).toBeVisible();
    expect(await page.locator('.action-popover').evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-media-help.png`});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(help).toBeFocused();
    const eventHelp = prompt.getByRole('button', { name: 'How event music works' });
    await eventHelp.click();
    await expect(page.getByText('This works even when Background Music is off.', {exact:false})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-event-help.png`});
    await page.keyboard.press('Escape'); await expect(eventHelp).toBeFocused();
    await prompt.getByLabel('Event Music', {exact:true}).check();
    await prompt.getByRole('button', {name:'Allow music playback',exact:true}).click();
    await expect(prompt).toBeHidden(); expect((await playing(page)).videoId).toBe('FnDnOnBqKg0');
    await expect(shell(page).getByRole('button', {name:'Expand player'})).toBeVisible();
    await expect(shell(page).getByRole('button', {name:'Audio settings',exact:true})).toHaveCount(0);
    await expect(page.getByRole('region', {name:'Usage statistics choice'})).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!))).toMatchObject({analytics:false,analyticsChosen:false,externalMedia:true,externalMediaChosen:true});
    await page.reload(); await expect(prompt).toBeHidden(); await playing(page);
    const menu=await settings(page); await expect(menu.getByRole('checkbox',{name:'Event Music',exact:true})).toBeChecked();
    await expect(menu.getByRole('checkbox',{name:'Background Music',exact:true})).not.toBeChecked();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-music-setting.png`});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeFocused();
  });
}
test('allowing media without autoplay leaves music stopped and denial persists', async ({page}) => {
  await stubYouTube(page,'allow',{mediaConsent:false}); await page.goto(event);
  const prompt=page.getByRole('region',{name:'Music playback choice'});
  await prompt.getByRole('button',{name:'No thanks',exact:true}).click();
  await page.reload(); await expect(prompt).toBeHidden(); expect(await ambient(page)).toBeNull();
  await page.goto('/cookies'); await page.getByLabel('Allow external media',{exact:true}).check();
  await page.getByRole('button',{name:'Save privacy choices'}).click();
  await page.goto(event); await expect(prompt).toBeHidden(); expect(await ambient(page)).toBeNull();
});
test('page music loops quietly without touching the player and stops on departure', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto(event);
  const first=await playing(page); expect(first.volume).toBe(15);
  const saved=await page.evaluate(()=>({queue:localStorage.getItem('arkpediaMusicQueue'),volume:localStorage.getItem('musicVolume')}));
  await page.evaluate(()=>(window as unknown as {__pageYt:{finish:()=>void}}).__pageYt.finish());
  await expect.poll(async()=>(await ambient(page))?.calls.length).toBeGreaterThan(first.calls.length);
  await navigate(page,'/schedule'); expect((await playing(page)).videoId).toBe('Wi7ZotrFx0M');
  expect(await page.evaluate(()=>({queue:localStorage.getItem('arkpediaMusicQueue'),volume:localStorage.getItem('musicVolume')}))).toEqual(saved);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
  await navigate(page,'/'); expect((await playing(page)).videoId).not.toBe(first.videoId);
});
test('Event Music setting stops immediately and persists across pages and reloads', async ({page}) => {
  await stubYouTube(page); await page.goto(event);
  let menu=await settings(page); const setting=menu.getByRole('checkbox',{name:'Event Music',exact:true});
  await expect(setting).not.toBeChecked(); await setting.check(); await playing(page);
  await setting.uncheck(); await expect.poll(async()=>(await ambient(page))?.destroyed).toBe(true);
  await page.keyboard.press('Escape'); await navigate(page,'/events/'+encodeURIComponent('[Intermezzo] Babel'));
  await expect(page.locator('[data-page-audio]')).toHaveCount(0); await page.reload();
  menu=await settings(page); await expect(menu.getByRole('checkbox',{name:'Event Music',exact:true})).not.toBeChecked();
  await menu.getByRole('checkbox',{name:'Event Music',exact:true}).check(); await playing(page);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
});
for (const theme of ['dark', 'light']) test(`Background Music and Event Music work independently and survive reload (${theme})`, async ({page}, info) => {
  await stubYouTube(page);
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/schedule');
  const menu=await settings(page);
  const background=menu.getByRole('checkbox',{name:'Background Music',exact:true});
  const events=menu.getByRole('checkbox',{name:'Event Music',exact:true});
  await expect(background).not.toBeChecked(); await expect(events).not.toBeChecked();
  await background.focus(); await page.keyboard.press('Space');
  expect((await playing(page)).videoId).toBe('Wi7ZotrFx0M');
  await expect(events).not.toBeChecked();
  await page.keyboard.press('Escape'); await navigate(page,event);
  await expect(page.locator('[data-page-audio]')).toHaveCount(0);
  await settings(page); await expect(background).toBeChecked(); await expect(events).not.toBeChecked();
  await events.check(); expect((await playing(page)).videoId).toBe('FnDnOnBqKg0');
  await background.uncheck(); await playing(page); await expect(events).toBeChecked();
  if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-independent-music.png`});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape'); await navigate(page,'/schedule');
  await expect(page.locator('[data-page-audio]')).toHaveCount(0);
  await page.reload(); await settings(page);
  await expect(background).not.toBeChecked(); await expect(events).toBeChecked();
  await page.keyboard.press('Escape'); await navigate(page,event); await playing(page);
  await settings(page); await events.uncheck();
  await expect.poll(async()=>(await ambient(page))?.destroyed).toBe(true);
  await page.reload(); await settings(page);
  await expect(background).not.toBeChecked(); await expect(events).not.toBeChecked();
  await expect(page.locator('[data-page-audio]')).toHaveCount(0);
});
test('browser-blocked page music offers Play inside Settings', async ({page}) => {
  await stubYouTube(page,'refuse'); await enable(page); await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','blocked');
  const menu=await settings(page); await menu.getByRole('button',{name:'Play background music',exact:true}).click(); await playing(page);
  await expect(menu.getByRole('button',{name:'Play background music',exact:true})).toHaveCount(0);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
});
test('page themes prefer YouTube even when manual music prefers Monster Siren', async ({page}) => {
  await stubYouTube(page,'allow',{dataSaver:false}); await enable(page);
  const requests:string[]=[]; page.on('request',r=>{if(r.url().includes('/api/music-audio/'))requests.push(r.url());});
  await page.goto(event); await playing(page); expect(requests).toEqual([]);
});
test('legacy greetings and the previous manual-pause flag cannot block page music', async ({page}) => {
  await stubYouTube(page); await enable(page,{backgroundMusic:true,greeting:'chosen',greetingOperator:'Amiya'});
  await page.addInitScript(()=>sessionStorage.setItem('arkpedia:audio-manual-visit','1'));
  const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/greeting'))requests.push(r.url());});
  await page.goto(event); await playing(page); await expand(page);
  await expect(shell(page).getByRole('button',{name:/greeting|Audio settings/i})).toHaveCount(0); expect(requests).toEqual([]);
});
test('leaving while the catalogue loads cancels pending background playback', async ({page}) => {
  await stubYouTube(page); await enable(page);
  let release!:()=>void, requested=false, completed=false; const gate=new Promise<void>(r=>{release=r;});
  await page.route('**/music-catalogue.json',async route=>{requested=true;await gate;await route.continue().catch(()=>{});completed=true;});
  await page.goto(event); await expect.poll(()=>requested).toBe(true); await navigate(page,'/games/music-guesser'); release();
  await expect.poll(()=>completed).toBe(true); expect(await ambient(page)).toBeNull();
});
test('a paused player allows Masses Travels; resuming it silences the theme without losing its song or position', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await navigate(page,'/music?view=player');
  await page.getByRole('region',{name:'Player',exact:true}).getByRole('slider',{name:'Seek',exact:true}).press('PageUp');
  await page.getByRole('region',{name:'Player',exact:true}).getByRole('button',{name:'Pause',exact:true}).click();
  const paused=(await youtube(page))!; expect(paused.time).toBeGreaterThan(5);
  await navigate(page,event); await expand(page); expect((await playing(page)).videoId).toBe('FnDnOnBqKg0');
  expect((await youtube(page))?.videoId).toBe(paused.videoId); expect((await youtube(page))?.state).toBe(2);
  expect((await youtube(page))?.time).toBeCloseTo(paused.time,1);
  await shell(page).getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await expect.poll(async()=>(await ambient(page))?.state).toBe(2);
  await expect(page.getByRole('button',{name:'Mute page music',exact:true})).toBeHidden();
  await shell(page).getByRole('button',{name:'Pause',exact:true}).click(); await playing(page);
  expect((await youtube(page))?.videoId).toBe(paused.videoId); expect((await youtube(page))?.state).toBe(2);
});
test('actively playing music keeps priority on event pages', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);const first=(await youtube(page))!;
  await navigate(page,event); await expect.poll(async()=>(await ambient(page))?.state).toBe(5);
  expect((await youtube(page))?.videoId).toBe(first.videoId); expect((await youtube(page))?.state).toBe(1);
  expect((await ambient(page))?.state).not.toBe(1);
});
test('upcoming Global and crossover events play released themes with no player takeover', async ({page}) => {
  await stubYouTube(page,'allow',{dataSaver:false}); await enable(page);
  for(const [name,id] of [
    ['[Story Collection] Bolívar Diagnosed',null],['Contingency Contract Obliteration',null],
    ['[Side Story – Crossover] Thunder in the Azure Dream','ADn4S1ajMAI'],['[Rerun] A Flurry to the Flame Rerun','p1fEV6QbCww'],
  ]){
    await page.goto('/events/'+encodeURIComponent(name!));const song=await playing(page);if(id)expect(song.videoId).toBe(id);
    await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
  }
});

test('silent autoplay refusal eventually offers Play without loading the main player', async ({page}) => {
  await stubYouTube(page,'refuse-silently'); await enable(page); await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','blocked',{timeout:15000});
  const menu=await settings(page); await menu.getByRole('button',{name:'Play background music',exact:true}).click(); await playing(page);
  expect((await youtube(page))?.players).toBe(0);
});
test('MSR-only page music uses a separate element and stops on departure', async ({page}) => {
  await stubYouTube(page); await enable(page, { eventMusic: true }); const siren=await stubMonsterSiren(page);
  await page.route('**/music-catalogue.json',route=>route.fulfill({json:{songs:[{cid:'232236',title:'Touch of the Law'}]}}));
  await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio',/playing|blocked/);
  if(await page.locator('[data-page-audio]').getAttribute('data-page-audio')==='blocked') {
    const menu=await settings(page); await menu.getByRole('button',{name:'Play background music',exact:true}).click();
  }
  await expect.poll(()=>siren.files.length).toBeGreaterThan(0);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','playing');
  expect(await ambient(page)).toBeNull();
  await navigate(page,'/games/music-guesser'); await expect(page.locator('[data-page-audio]')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('musicVolume'))).toBe('42');
});

test('Yet Another Wave resolves its published Mirari recording', async ({page}) => {
  await stubYouTube(page); await enable(page, { eventMusic: true }); const siren=await stubMonsterSiren(page);
  const name='[side story] Yet Another Wave',path='/events/'+encodeURIComponent(name);
  // The pinned browser snapshot predates automatic lobby associations. Supply the
  // published table through a real client navigation, as a newer content release
  // does. Server-side association generation is covered by test-page-music-table.
  const response=await page.request.get(path);expect(response.ok()).toBe(true);
  const html=await response.text();
  const data=JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)![1]).props;
  expect(Array.isArray(data.pageProps.__contentTables['page-music'])).toBe(true);
  data.pageProps.__contentTables['page-music']=[{names:['Yet Another Wave','昨日海'],cid:'306864'}];
  await page.route(url=>url.pathname.startsWith('/_next/data/')&&decodeURIComponent(url.pathname).endsWith(`/events/${name}.json`),route=>route.fulfill({json:data}));
  await page.goto('/games/music-guesser');await navigate(page,path);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio',/playing|blocked/);
  if(await page.locator('[data-page-audio]').getAttribute('data-page-audio')==='blocked') {
    const menu=await settings(page); await menu.getByRole('button',{name:'Play background music',exact:true}).click();
  }
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','playing');
  expect(siren.files.some(url=>url.includes('306864'))).toBe(true);
  await expect(page.getByRole('button',{name:'Mute page music',exact:true})).toHaveCount(0);
});

for (const theme of ['dark', 'light']) test(`background now-playing stays separate from the personal player (${theme})`, async ({page}, info) => {
  await stubYouTube(page); await enable(page);
  await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.goto(event); await playing(page);
  const opener=shell(page).getByRole('button',{name:'Expand player'});
  await opener.click();
  const row=shell(page).getByRole('group',{name:'Background music'});
  await expect(row).toContainText('Background music · Playing');
  const themeTitle=await row.locator('.music-widget-title').innerText(); expect(themeTitle.length).toBeGreaterThan(0);
  await expect(shell(page).locator('.music-transport-song-link')).toContainText('Nothing playing yet');
  // Let opening the personal player's engine settle: inspection must not steal audio.
  await expect.poll(async()=>(await youtube(page))?.players).toBe(1);
  await page.waitForTimeout(250);
  await playing(page); await expect(row).toContainText('Background music · Playing');
  if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-background-playing.png`});
  await shell(page).getByRole('button',{name:'Minimize player',exact:true}).click(); await expect(opener).toBeVisible();
  await navigate(page,'/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  const personal=(await youtube(page))!.videoId;
  await navigate(page,event); await expand(page);
  await expect(row).toContainText('Background music · Paused');
  await expect(row).toContainText(themeTitle);
  expect((await youtube(page))?.videoId).toBe(personal);
  if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-background-paused.png`});
  await shell(page).locator('.music-play-btn').click(); await expect(row).toContainText('Background music · Playing');
  expect((await youtube(page))?.videoId).toBe(personal);
  const menu=await settings(page); await menu.getByRole('checkbox',{name:'Event Music',exact:true}).uncheck();
  await page.getByRole('button',{name:'Settings',exact:true}).click(); await expand(page);
  await expect(row).toHaveCount(0);
  await settings(page); await menu.getByRole('checkbox',{name:'Event Music',exact:true}).check();
  await page.getByRole('button',{name:'Settings',exact:true}).click(); await expand(page);
  await expect(row).toContainText('Background music · Playing');
  await navigate(page,'/schedule'); expect((await playing(page)).videoId).toBe('Wi7ZotrFx0M'); await expect(row).not.toContainText(themeTitle);
});

test('blocked background music can be started from its mini-player row',async({page})=>{
  await stubYouTube(page,'refuse-silently'); await enable(page); await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','blocked',{timeout:15000}); await expand(page);
  const row=shell(page).getByRole('group',{name:'Background music'});
  await expect(row).toContainText('Ready to play',{timeout:15000});
  await row.getByRole('button',{name:'Play background music',exact:true}).click();
  await expect(row).toContainText('Background music · Playing');
});

for (const theme of ['dark', 'light']) test(`menu theme continues between pages and yields to events (${theme})`, async ({page}, info) => {
  await stubYouTube(page); await enable(page);
  await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await page.goto('/operators'); expect((await playing(page)).videoId).toBe('Wi7ZotrFx0M');
  await page.evaluate(()=>{ const w=window as unknown as {__pageYt:unknown;__menuEngine:unknown}; w.__menuEngine=w.__pageYt; });
  const initial=(await ambient(page))!;
  for(const path of ['/schedule','/','/operators?search=Amiya']) {
    await navigate(page,path); expect((await playing(page)).videoId).toBe(initial.videoId);
    expect(await page.evaluate(()=>{const w=window as unknown as {__pageYt:unknown;__menuEngine:unknown};return w.__menuEngine===w.__pageYt;})).toBe(true);
    expect((await ambient(page))?.calls.filter(call=>(call as string[])[0]==='loadVideoById')).toHaveLength(1);
  }
  await expand(page);
  const row=shell(page).getByRole('group',{name:'Background music'});
  await expect(row).toContainText('Background music · Playing');
  if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-site-menu.png`});
  await navigate(page,event); expect((await playing(page)).videoId).toBe('FnDnOnBqKg0');
  expect(await page.evaluate(()=>(window as unknown as {__menuEngine:{destroyed:boolean}}).__menuEngine.destroyed)).toBe(true);
  await expect(page.locator('[data-page-audio]')).toHaveCount(1);
  await page.goBack(); await expect.poll(async()=>(await ambient(page))?.videoId).toBe('Wi7ZotrFx0M'); await playing(page);
  await page.goForward(); await expect.poll(async()=>(await ambient(page))?.videoId).toBe('FnDnOnBqKg0'); await playing(page);
  await navigate(page,'/games/music-guesser'); await expect(page.locator('[data-page-audio]')).toHaveCount(0);
  await navigate(page,'/operators'); expect((await playing(page)).videoId).toBe('Wi7ZotrFx0M');
  await navigate(page,'/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await expect.poll(async()=>(await ambient(page))?.state).toBe(2);
  await navigate(page,'/schedule'); await expand(page);
  await expect(row).toContainText('Background music · Paused');
  await shell(page).locator('.music-play-btn').click(); await playing(page);
  await page.goto('/operators'); expect((await playing(page)).videoId).toBe('Wi7ZotrFx0M');
});
