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
  await expect(page.getByRole('button', { name: 'Mute page music', exact: true })).toBeVisible();
  await expect.poll(async () => (await ambient(page))?.state).toBe(1);
  return (await ambient(page))!;
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
    const prompt = page.getByRole('region', { name: 'External media choice' });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByLabel('Allow autoplaying music')).not.toBeChecked();
    await expect(page.getByRole('region', { name: 'Usage statistics choice' })).toBeHidden();
    expect(await youtube(page)).toBeNull(); expect(await ambient(page)).toBeNull();
    const help = prompt.getByRole('button', { name: 'How automatic music works' });
    await help.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Page music stops when you leave', {exact:false})).toBeVisible();
    await expect(prompt).toBeVisible();
    expect(await page.locator('.action-popover').evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-media-help.png`});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(help).toBeFocused();
    await prompt.getByLabel('Allow autoplaying music').check();
    await prompt.getByRole('button', {name:'Allow external media',exact:true}).click();
    await expect(prompt).toBeHidden(); expect((await playing(page)).videoId).toBe('FnDnOnBqKg0');
    await expect(shell(page).getByRole('button', {name:'Expand player'})).toBeVisible();
    await expect(shell(page).getByRole('button', {name:'Audio settings',exact:true})).toHaveCount(0);
    await expect(page.getByRole('region', {name:'Usage statistics choice'})).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!))).toMatchObject({analytics:false,analyticsChosen:false,externalMedia:true,externalMediaChosen:true});
    await page.reload(); await expect(prompt).toBeHidden(); await playing(page);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-independent-page-music.png`});
  });
}
test('allowing media without autoplay leaves music stopped and denial persists', async ({page}) => {
  await stubYouTube(page,'allow',{mediaConsent:false}); await page.goto(event);
  const prompt=page.getByRole('region',{name:'External media choice'});
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
  await navigate(page,'/schedule'); await expect.poll(async()=>(await ambient(page))?.destroyed).toBe(true);
  expect(await page.evaluate(()=>({queue:localStorage.getItem('arkpediaMusicQueue'),volume:localStorage.getItem('musicVolume')}))).toEqual(saved);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
  await navigate(page,'/'); expect((await playing(page)).videoId).not.toBe(first.videoId);
});
test('page mute lasts for that page; a different event can play without claiming the player', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto(event); await playing(page);
  await page.getByRole('button',{name:'Mute page music',exact:true}).click();
  await expect.poll(async()=>(await ambient(page))?.state).toBe(2);
  await expect(page.getByRole('button',{name:'Play page music',exact:true})).toBeVisible();
  await navigate(page,'/events/'+encodeURIComponent('[Intermezzo] Babel')); await playing(page);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
});
test('browser-blocked page music has its own Play control', async ({page}) => {
  await stubYouTube(page,'refuse'); await enable(page); await page.goto(event);
  await expect(page.getByRole('button',{name:'Play page music',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play page music',exact:true}).click(); await playing(page);
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
  await page.goto(event); await expect.poll(()=>requested).toBe(true); await navigate(page,'/schedule'); release();
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
  await expect(page.getByRole('button',{name:'Play page music',exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Play page music',exact:true}).click(); await playing(page);
  expect((await youtube(page))?.players).toBe(0);
});
test('MSR-only page music uses a separate element and stops on departure', async ({page}) => {
  await stubYouTube(page); await enable(page); const siren=await stubMonsterSiren(page);
  await page.route('**/music-catalogue.json',route=>route.fulfill({json:{songs:[{cid:'232236',title:'Touch of the Law'}]}}));
  await page.goto(event);
  const play=page.getByRole('button',{name:'Play page music',exact:true});
  // Real Chromium may require a gesture even though the generated WAV is silent.
  await expect(page.getByRole('button',{name:'Mute page music',exact:true}).or(play)).toBeVisible();
  if(await play.isVisible()) await play.click();
  await expect.poll(()=>siren.files.length).toBeGreaterThan(0);
  await expect(page.getByRole('button',{name:'Mute page music',exact:true})).toHaveText('Mute page music');
  expect(await ambient(page)).toBeNull();
  await navigate(page,'/schedule'); await expect(page.locator('.page-audio-controls')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('musicVolume'))).toBe('42');
});
