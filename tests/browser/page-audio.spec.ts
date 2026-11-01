import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';
import { stubMonsterSiren } from './monster-siren-stub';

const shell = (page: Page) => page.locator('.music-player');
const event = '/events/' + encodeURIComponent('[Side Story – Celebration] Near Light');
async function enable(page: Page, values: Record<string, unknown> = { backgroundMusic: true }) {
  await page.addInitScript(values => {
    localStorage.setItem('arkpedia:settings', JSON.stringify({ version: 1, values }));
    localStorage.setItem('musicVolume', '42');
  }, values);
}
async function navigate(page: Page, path: string) {
  await page.evaluate(path => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } }).next.router.push(path), path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
async function playing(page: Page) {
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await expect(shell(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  return (await youtube(page))!;
}

test('off by default; audio settings are separate, accessible and persistent', async ({ page }, info) => {
  await stubYouTube(page);
  await page.goto(event);
  expect(await youtube(page)).toBeNull();
  await shell(page).getByRole('button', { name: 'Expand player' }).click();
  await shell(page).getByRole('button', { name: 'Audio settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Audio settings', exact: true });
  await expect(dialog.getByLabel('Enable background music')).not.toBeChecked();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.setAttribute('data-theme', theme); }, theme);
    await dialog.getByRole('combobox', { name: 'Greeting', exact: true }).click();
    await page.getByRole('option', { name: 'Random owned operator', exact: true }).click();
    await expect(dialog.getByText('Import your game roster', { exact: false })).toBeVisible();
    const path = process.env.ARKPEDIA_QA_CAPTURE;
    if (path) await page.screenshot({ path: `${path}/${info.project.name}-${theme}-audio-settings.png` });
  }
  await dialog.getByLabel('Enable background music').check();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await playing(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!).analytics)).toBe(false);
});

test('quiet lobby loops alone, leaves the queue and volume intact, stops on departure', async ({ page }) => {
  await stubYouTube(page); await enable(page);
  await page.goto(event);
  const first = await playing(page);
  expect(await page.evaluate(() => (window as unknown as { __yt: { volume: number } }).__yt.volume)).toBe(15);
  const queue = await page.evaluate(() => localStorage.getItem('arkpediaMusicQueue'));
  await page.evaluate(() => (window as unknown as { __yt: { finish: () => void } }).__yt.finish());
  await expect.poll(async () => (await youtube(page))?.calls.filter(([name]) => name === 'loadVideoById').length).toBeGreaterThan(1);
  expect((await youtube(page))?.videoId).toBe(first.videoId);
  await navigate(page, '/schedule');
  await expect.poll(async () => (await youtube(page))?.state).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('musicVolume'))).toBe('42');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaMusicQueue'))).toBe(queue);
  await navigate(page, '/');
  const home = await playing(page);
  expect(home.videoId).not.toBe(first.videoId);
});

test('manual pause takes ownership and suppresses further automatic music, including reload', async ({ page }) => {
  await stubYouTube(page); await enable(page); await page.goto(event);
  const first = await playing(page);
  await shell(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await navigate(page, '/');
  expect((await youtube(page))?.videoId).toBe(first.videoId);
  expect((await youtube(page))?.state).toBe(2);
  await page.reload();
  await expect(shell(page).getByRole('button', { name: 'Expand player' })).toBeVisible();
  expect((await youtube(page))?.state ?? 2).not.toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('arkpedia:audio-manual-visit'))).toBe('1');
});

test('blocked music offers Play; tapping it makes the theme manual across navigation', async ({ page }) => {
  await stubYouTube(page, 'refuse'); await enable(page); await page.goto(event);
  await expect(shell(page).getByText('Tap Play to start background music.')).toBeVisible();
  await expect(shell(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await shell(page).getByRole('button', { name: 'Play', exact: true }).click();
  const first = await playing(page);
  await navigate(page, '/');
  expect((await youtube(page))?.videoId).toBe(first.videoId);
  expect((await youtube(page))?.state).toBe(1);
});

test('no external-media consent leaves music waiting without opening a permission popup', async ({ page }) => {
  await stubYouTube(page, 'allow', { mediaConsent: false }); await enable(page); await page.goto(event);
  await expect(shell(page).getByText('Tap Play to allow external media and start music.')).toBeVisible();
  expect(await youtube(page)).toBeNull();
  await expect(page.getByRole('dialog', { name: /external media/i })).toBeHidden();
  await navigate(page, '/schedule');
  await expect(shell(page).getByText('Tap Play to allow external media and start music.')).toBeHidden();
  expect(await youtube(page)).toBeNull();
});

test('default Monster Siren audio is quiet and stops with the page', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false }); const audio = await stubMonsterSiren(page);
  await enable(page); await page.goto('/schedule'); await page.locator('h1').click(); await navigate(page, event);
  await expect.poll(() => audio.resolves.length).toBeGreaterThan(0);
  await expect.poll(() => page.locator('audio[data-music-audio]').evaluate((el: HTMLAudioElement) => el.volume)).toBe(0.15);
  await navigate(page, '/schedule');
  await expect.poll(() => page.locator('audio[data-music-audio]').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
});

test('chosen greeting waits for Play without consent and is offered once per visit', async ({ page }) => {
  await stubYouTube(page, 'allow', { mediaConsent: false });
  await enable(page, { greeting: 'chosen', greetingOperator: 'Amiya' });
  let calls = 0;
  await page.route('**/api/greeting?**', route => { calls++; return route.fulfill({ json: { name: 'Amiya', language: 'Japanese', url: 'https://assets.arkpedia.net/test-greeting.wav' } }); });
  await page.goto('/');
  await expect(shell(page).getByRole('button', { name: 'Play Amiya greeting' })).toBeVisible();
  expect(calls).toBe(1);
  await navigate(page, '/schedule');
  await expect(shell(page).getByRole('button', { name: 'Play Amiya greeting' })).toBeHidden();
  await navigate(page, '/');
  await expect(shell(page).getByRole('button', { name: 'Play Amiya greeting' })).toBeHidden();
  expect(calls).toBe(1);
});

test('random owned greeting does not use a planner-only roster', async ({ page }) => {
  await stubYouTube(page); await enable(page, { greeting: 'owned' });
  let calls = 0;
  await page.route('**/api/greeting?**', route => { calls++; return route.fulfill({ json: null }); });
  await page.goto('/');
  await shell(page).getByRole('button', { name: 'Expand player' }).click();
  await expect(shell(page).getByRole('button', { name: /greeting/i })).toHaveCount(0);
  expect(calls).toBe(0);
});

test('leaving while the catalogue loads cancels the pending automatic start', async ({ page }) => {
  await stubYouTube(page); await enable(page);
  let release!: () => void, requested = false, completed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/music-catalogue.json', async route => { requested = true; await gate; await route.continue(); completed = true; });
  await page.goto(event);
  await expect.poll(() => requested).toBe(true);
  await navigate(page, '/schedule');
  release();
  await expect.poll(() => completed).toBe(true);
  await expect(shell(page).getByRole('button', { name: 'Expand player' })).toBeVisible();
  expect(await youtube(page)).toBeNull();
});

test('switching events starts the new lobby, with no extra autoplay after an error', async ({ page }) => {
  await stubYouTube(page); await enable(page); await page.goto(event);
  const first = await playing(page);
  await navigate(page, '/events/' + encodeURIComponent('[Intermezzo] Babel'));
  await expect.poll(async () => (await youtube(page))?.videoId).not.toBe(first.videoId);
  await playing(page);
  const loads = (await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById').length;
  await page.evaluate(() => (window as unknown as { __yt: { fail: () => void } }).__yt.fail());
  await expect(shell(page).getByText('Couldn’t start this song. Tap Play to try again.')).toBeVisible();
  expect((await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById').length).toBe(loads);
});

test('an imported owned greeting uses that roster, and turning it off cancels a pending greeting', async ({ page }) => {
  await stubYouTube(page, 'allow', { mediaConsent: false }); await enable(page, { greeting: 'owned' });
  await page.addInitScript(() => localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-11-01T00:00:00Z', doctor: null, operators: ['Amiya'], skins: [], cleared: [] })));
  const operators: string[] = [];
  await page.route('**/api/greeting?**', route => { const name = new URL(route.request().url()).searchParams.get('operator')!; operators.push(name); return route.fulfill({ json: { name, language: 'Japanese', url: 'https://assets.arkpedia.net/test-greeting.wav' } }); });
  await page.goto('/');
  await expect(shell(page).getByRole('button', { name: 'Play Amiya greeting' })).toBeVisible();
  expect(operators).toEqual(['Amiya']);
  await shell(page).getByRole('button', { name: 'Audio settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Audio settings', exact: true });
  await dialog.getByRole('combobox', { name: 'Greeting', exact: true }).click();
  await page.getByRole('option', { name: 'Off', exact: true }).click();
  await page.keyboard.press('Escape');
  await shell(page).getByRole('button', { name: 'Expand player' }).click();
  await expect(shell(page).getByRole('button', { name: 'Play Amiya greeting' })).toBeHidden();
});

test('chosen operator picker works inside the audio dialog', async ({ page }, info) => {
  await stubYouTube(page); await page.goto('/schedule');
  await shell(page).getByRole('button', { name: 'Expand player' }).click();
  await shell(page).getByRole('button', { name: 'Audio settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Audio settings', exact: true });
  await dialog.getByRole('combobox', { name: 'Greeting', exact: true }).click();
  await page.getByRole('option', { name: 'Chosen operator', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Greeting operator', exact: true }).click();
  await page.getByRole('option', { name: 'Amiya', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Greeting operator', exact: true })).toHaveText('Amiya');
  const path = process.env.ARKPEDIA_QA_CAPTURE;
  if (path) await page.screenshot({ path: `${path}/${info.project.name}-chosen-operator.png` });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:settings')!).values.greetingOperator)).toBe('Amiya');
});

test('a greeting can play after a browser block and stops when music is chosen', async ({ page }) => {
  await stubYouTube(page); await stubMonsterSiren(page);
  await enable(page, { greeting: 'chosen', greetingOperator: 'Amiya' });
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.Audio = new Proxy(Original, { construct(target, args) { const element = Reflect.construct(target, args) as HTMLAudioElement; (window as unknown as { greetingAudio: HTMLAudioElement }).greetingAudio = element; return element; } });
  });
  await page.route('**/api/greeting?**', route => route.fulfill({ json: { name: 'Amiya', language: 'Japanese', url: '/__siren/greeting.wav' } }));
  await page.goto('/');
  const blocked = shell(page).getByRole('button', { name: 'Play Amiya greeting' });
  await expect(blocked).toBeVisible();
  await blocked.click();
  await expect(shell(page).getByRole('button', { name: 'Stop greeting' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { greetingAudio: HTMLAudioElement }).greetingAudio.volume)).toBe(0.3);
  await shell(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { greetingAudio: HTMLAudioElement }).greetingAudio.paused)).toBe(true);
});

test('manually selected music keeps its song and volume on event pages', async ({ page }) => {
  await stubYouTube(page); await enable(page);
  await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const first = (await youtube(page))!;
  await navigate(page, event);
  expect((await youtube(page))?.videoId).toBe(first.videoId);
  expect((await youtube(page))?.state).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __yt: { volume: number } }).__yt.volume)).toBe(42);
  expect(await page.evaluate(() => sessionStorage.getItem('arkpedia:audio-manual-visit'))).toBe('1');
});
