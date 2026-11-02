import { expect, test, type Page } from '@playwright/test';
import { stubYouTube } from './youtube-stub';
import { stubMonsterSiren } from './monster-siren-stub';

test.use({ storageState: { cookies: [], origins: [] } });
const current = (page: Page) => page.evaluate(() => (window as unknown as { __pageYt?: { videoId: string } }).__pageYt?.videoId);
async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Menu theme', exact: true }).click();
  return page.getByRole('dialog', { name: 'Menu theme', exact: true });
}
async function chooseSource(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Menu theme source' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
for (const theme of ['dark', 'light']) {
  test(`custom Endfield menu survives navigation/reload, yields to events, and leaves the queue alone (${theme})`, async ({page}, info) => {
    await stubYouTube(page); await stubMonsterSiren(page);
    await page.addInitScript(theme => {
      if (window !== window.top) return;
      if (!localStorage.getItem('arkpedia:settings')) localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 1, values: { backgroundMusic: true } }));
      localStorage.setItem('theme', theme);
    }, theme);
    await page.goto('/');
    const before = await page.evaluate(() => localStorage.getItem('arkpediaMusicQueue'));
    const dialog = await openMenu(page);
    await chooseSource(page, 'Custom song');
    await dialog.getByRole('combobox', { name: 'Choose menu song' }).fill('endfield');
    const option = page.getByRole('option').filter({ hasText: 'Endfield' }).nth(5);
    await expect(option).toBeVisible();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-menu-picker.png`,animations:'disabled'});
    await option.click();
    await expect(dialog.getByRole('status')).toContainText('Selected:');
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:settings')!).values.menuMusicTrack);
    await expect.poll(() => current(page)).toBe(id);
    expect(await page.evaluate(() => localStorage.getItem('musicIncludeEndfield'))).not.toBe('true');
    expect(await page.evaluate(() => localStorage.getItem('arkpediaMusicQueue'))).toBe(before);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', {name:'Settings',exact:true})).toBeFocused();
    await page.evaluate(() => (window as any).next.router.push('/schedule'));
    await expect.poll(() => current(page)).toBe(id);
    await page.reload(); await expect.poll(() => current(page)).toBe(id);
    await page.evaluate(() => (window as any).next.router.push('/events/'+encodeURIComponent("[Rerun] The Masses' Travels Rerun")));
    await expect.poll(() => current(page)).toBe('FnDnOnBqKg0');
    await page.evaluate(() => (window as any).next.router.push('/'));
    await expect.poll(() => current(page)).toBe(id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`account menu follows imported background and explains older imports (${theme})`, async ({page}, info) => {
    await stubYouTube(page); await stubMonsterSiren(page);
    await page.addInitScript(theme => {
      if (window !== window.top) return;
      localStorage.setItem('theme',theme);
      localStorage.setItem('arkpedia:settings',JSON.stringify({version:1,values:{backgroundMusic:true,menuMusicSource:'account'}}));
      localStorage.setItem('arkpediaAccount',JSON.stringify({version:1,server:'en',importedAt:'2026-11-02T00:00:00Z',doctor:null,operators:[],skins:[],cleared:[],homeBackground:'bg_yan_1'}));
    },theme);
    await page.goto('/');
    const catalogue = await (await page.request.get('/music-catalogue.json')).json();
    const accountTheme = catalogue.songs.find((song:any) => song.cid === '125094');
    await expect.poll(() => current(page)).toBe(accountTheme.videoId);
    const dialog=await openMenu(page);
    await expect(dialog.getByRole('status')).not.toContainText('Import your game account');
    await page.evaluate(() => { const a=JSON.parse(localStorage.getItem('arkpediaAccount')!); delete a.homeBackground; localStorage.setItem('arkpediaAccount',JSON.stringify(a)); window.dispatchEvent(new Event('arkpediaAccountChanged')); });
    await expect(dialog.getByRole('status')).toContainText('Import your game account');
    await expect.poll(() => current(page)).toBe('Wi7ZotrFx0M');
    if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-account-menu.png`,animations:'disabled'});
    await chooseSource(page,'Default theme');
    await expect(dialog.getByRole('status')).toHaveCount(0);
  });
}
test('Endfield is searchable within albums and artists as well as songs', async ({page}) => {
  await stubYouTube(page);
  await page.addInitScript(() => localStorage.setItem('musicIncludeEndfield','true'));
  await page.goto('/music/discover?browse=albums');
  await page.getByRole('searchbox',{name:'Filter albums'}).fill('endfield');
  const albums=page.locator('#discover-albums .music-discover-album-tile');
  await expect(albums.first()).toBeVisible();
  const expected=await page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!).props.pageProps.albums.filter((a:any)=>a.game==='endfield').map((a:any)=>a.albumAltName));
  await expect.poll(()=>albums.locator('.music-discover-album-tile-name').allTextContents()).toEqual(expected);
  await page.goto('/music/discover?browse=artists');
  await page.getByRole('searchbox',{name:'Filter artists'}).fill('endfield');
  await expect(page.locator('#discover-artists .music-discover-artist-card').first()).toBeVisible();
  await page.getByRole('searchbox',{name:'Filter artists'}).fill('endfield zzzzz');
  await expect(page.locator('#discover-artists .music-discover-artist-card')).toHaveCount(0);
});

test('album and artist filters reveal hidden Endfield matches', async ({page}) => {
  await stubYouTube(page);
  await page.goto('/music/discover?browse=albums');
  await page.getByRole('searchbox',{name:'Filter albums'}).fill('endfield');
  await expect(page.locator('.music-hidden-endfield-hint')).toContainText('Endfield albums');
  await page.getByRole('button',{name:'Include Endfield music'}).click();
  await expect(page.locator('#discover-albums .music-discover-album-tile').first()).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('musicIncludeEndfield'));
  await page.goto('/music/discover?browse=artists');
  await page.getByRole('searchbox',{name:'Filter artists'}).fill('endfield');
  await expect(page.getByRole('button',{name:'Include Endfield music'})).toBeVisible();
  await page.getByRole('button',{name:'Include Endfield music'}).click();
  await expect(page.locator('#discover-artists .music-discover-artist-card').first()).toBeVisible();
});
