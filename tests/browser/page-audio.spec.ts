import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';
import { stubMonsterSiren } from './monster-siren-stub';
test.use({ storageState: { cookies: [], origins: [] } });
const shell = (page: Page) => page.locator('.music-player');
const event = '/events/' + encodeURIComponent("[Rerun] The Masses' Travels Rerun");
async function enable(page: Page, values: Record<string, unknown> = { eventMusic: true }) {
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
    await expect(prompt.getByLabel('Background Music', {exact:true})).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Usage statistics choice' })).toBeHidden();
    expect(await youtube(page)).toBeNull(); expect(await ambient(page)).toBeNull();
    const eventHelp = prompt.getByRole('button', { name: 'How event music works' });
    await eventHelp.click();
    await expect(page.getByText('Your personal music pauses during the event', {exact:false})).toBeVisible();
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
    await expect(menu.getByRole('checkbox',{name:'Background Music',exact:true})).toHaveCount(0);
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
  await navigate(page,'/schedule'); await expect(page.locator('[data-page-audio]')).toHaveCount(0);
  expect(await page.evaluate(()=>({queue:localStorage.getItem('arkpediaMusicQueue'),volume:localStorage.getItem('musicVolume')}))).toEqual(saved);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
  await navigate(page,'/'); await expect(page.locator('[data-page-audio]')).toHaveCount(0);
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
test('browser-blocked page music offers Play inside Settings', async ({page}) => {
  await stubYouTube(page,'refuse'); await enable(page); await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','blocked');
  const menu=await settings(page); await menu.getByRole('button',{name:'Play event music',exact:true}).click(); await playing(page);
  await expect(menu.getByRole('button',{name:'Play event music',exact:true})).toHaveCount(0);
  await expect(shell(page).getByRole('button',{name:'Expand player'})).toBeVisible();
});
test('page themes use official audio by default when a YouTube upload also exists', async ({page}) => {
  await stubYouTube(page,'allow',{dataSaver:false}); await enable(page);
  const siren = await stubMonsterSiren(page);
  await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio',/playing|blocked/);
  if(await page.locator('[data-page-audio]').getAttribute('data-page-audio')==='blocked') {
    const menu=await settings(page); await menu.getByRole('button',{name:'Play event music',exact:true}).click();
  }
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','playing');
  expect(siren.resolves).toContain('232236');
  expect(await ambient(page)).toBeNull();
});
test('legacy greetings and the previous manual-pause flag cannot block page music', async ({page}) => {
  await stubYouTube(page); await enable(page,{eventMusic:true,greeting:'chosen',greetingOperator:'Amiya'});
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
test('upcoming Global and crossover events play released themes with no player takeover', async ({page}) => {
  await stubYouTube(page,'allow',{dataSaver:true}); await enable(page);
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
  const menu=await settings(page); await menu.getByRole('button',{name:'Play event music',exact:true}).click(); await playing(page);
  expect((await youtube(page))?.players).toBe(0);
});
test('MSR-only page music uses a separate element and stops on departure', async ({page}) => {
  await stubYouTube(page); await enable(page, { eventMusic: true }); const siren=await stubMonsterSiren(page);
  await page.route('**/music-catalogue.json',route=>route.fulfill({json:{songs:[{cid:'232236',title:'Touch of the Law'}]}}));
  await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio',/playing|blocked/);
  if(await page.locator('[data-page-audio]').getAttribute('data-page-audio')==='blocked') {
    const menu=await settings(page); await menu.getByRole('button',{name:'Play event music',exact:true}).click();
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
    const menu=await settings(page); await menu.getByRole('button',{name:'Play event music',exact:true}).click();
  }
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','playing');
  expect(siren.files.some(url=>url.includes('306864'))).toBe(true);
  await expect(page.getByRole('button',{name:'Mute page music',exact:true})).toHaveCount(0);
});

test('blocked background music can be started from its mini-player row',async({page})=>{
  await stubYouTube(page,'refuse-silently'); await enable(page); await page.goto(event);
  await expect(page.locator('[data-page-audio]')).toHaveAttribute('data-page-audio','blocked',{timeout:15000}); await expand(page);
  const row=shell(page).getByRole('group',{name:'Event music'});
  await expect(row).toContainText('Ready to play',{timeout:15000});
  await row.getByRole('button',{name:'Play event music',exact:true}).click();
  await expect(row).toContainText('Event music · Playing');
});


for (const theme of ['dark', 'light']) test(`events pause and restore the personal song without changing its queue (${theme})`, async ({page}) => {
  await stubYouTube(page); await enable(page);
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await navigate(page,'/music?view=player');
  await page.getByRole('region',{name:'Player',exact:true}).getByRole('slider',{name:'Seek',exact:true}).press('PageUp');
  const before=(await youtube(page))!, queue=await page.evaluate(()=>localStorage.getItem('arkpediaMusicQueue'));
  await navigate(page,event); await playing(page);
  const paused=(await youtube(page))!;
  expect(paused.state).toBe(2); expect(paused.videoId).toBe(before.videoId);
  expect(Math.abs(paused.time-before.time)).toBeLessThan(2);
  await page.waitForTimeout(200);
  expect((await youtube(page))?.time).toBeCloseTo(paused.time,1);
  await navigate(page,'/schedule');
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  expect((await youtube(page))?.videoId).toBe(before.videoId);
  expect((await youtube(page))!.time).toBeGreaterThanOrEqual(paused.time);
  expect(await page.evaluate(()=>localStorage.getItem('arkpediaMusicQueue'))).toBe(queue);
  await expect(page.locator('[data-page-audio]')).toHaveCount(0);
  const menu=await settings(page);
  await expect(menu.getByRole('checkbox',{name:'Background Music',exact:true})).toHaveCount(0);
  await expect(menu.getByRole('button',{name:'Choose Background Music',exact:true})).toHaveCount(0);
});

test('leaving an event keeps an already paused player paused', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await navigate(page,'/music?view=player');
  await page.getByRole('region',{name:'Player',exact:true}).getByRole('button',{name:'Pause',exact:true}).click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(2);
  const before=(await youtube(page))!;
  await navigate(page,event); await playing(page); await navigate(page,'/schedule');
  expect((await youtube(page))?.state).toBe(2); expect((await youtube(page))?.videoId).toBe(before.videoId);
});

test('disabling Event Music resumes the interrupted song', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await navigate(page,event); await playing(page); expect((await youtube(page))?.state).toBe(2);
  const menu=await settings(page); await menu.getByRole('checkbox',{name:'Event Music',exact:true}).uncheck();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await expect(page.locator('[data-page-audio]')).toHaveCount(0);
});

test('a manual personal-player choice cancels the automatic resume', async ({page}) => {
  await stubYouTube(page); await enable(page); await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await navigate(page,event); await playing(page); await expand(page);
  await shell(page).getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(async()=>(await youtube(page))?.state).toBe(1);
  await expect.poll(async()=>(await ambient(page))?.state).toBe(2);
  await shell(page).getByRole('button',{name:'Pause',exact:true}).click(); await playing(page);
  await navigate(page,'/schedule'); expect((await youtube(page))?.state).toBe(2);
});

for (const readyBeforeLeaving of [true,false]) test(`event audio interrupts an initializing player and restores it (API ready before leaving: ${readyBeforeLeaving})`,async({page})=>{
  await stubYouTube(page,'allow',{dataSaver:false}); await stubMonsterSiren(page); await enable(page);
  let release!:()=>void; const gate=new Promise<void>(resolve=>{release=resolve});
  await page.route('https://www.youtube.com/iframe_api',async route=>{await gate;await route.fallback().catch(()=>{})});
  try {
    await page.goto('/music?view=library');
    await page.locator('.music-library-row .music-song-row-main').first().click();
    const audio=page.locator('audio[data-music-audio]');
    await expect.poll(()=>audio.evaluate(el=>(el as HTMLAudioElement).currentTime)).toBeGreaterThan(.1);
    const source=await audio.getAttribute('src');
    await navigate(page,'/schedule'); await navigate(page,event);
    await expect.poll(()=>audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(true);
    const seconds=await audio.evaluate(el=>(el as HTMLAudioElement).currentTime);
    if(readyBeforeLeaving) {
      release(); await expect.poll(async()=>(await youtube(page))?.players).toBe(1);
      await page.waitForTimeout(200);
      expect(await audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(true);
    }
    await navigate(page,'/schedule');
    await expect.poll(()=>audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(false);
    release(); await expect.poll(async()=>(await youtube(page))?.players).toBe(1);
    await expect.poll(()=>audio.evaluate(el=>(el as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(seconds);
    expect((await audio.getAttribute('src'))?.split('#')[0]).toBe(source?.split('#')[0]);
  } finally { release(); }
});
