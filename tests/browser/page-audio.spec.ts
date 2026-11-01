import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';


test.use({ storageState: { cookies: [], origins: [] } });

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

for (const theme of ['dark', 'light']) {
  test(`first visit offers media and optional autoplay with accessible help (${theme})`, async ({ page }, info) => {
    await stubYouTube(page, 'allow', { mediaConsent: false });
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto(event);
    const prompt = page.getByRole('region', { name: 'External media choice' });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByLabel('Allow autoplaying music')).not.toBeChecked();
    await expect(page.getByRole('region', { name: 'Usage statistics choice' })).toBeHidden();
    expect(await youtube(page)).toBeNull();
    const help = prompt.getByRole('button', { name: 'How automatic music works' });
    await help.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Page-started music stops when you leave.', { exact: false })).toBeVisible();
    await expect(prompt).toBeVisible();
    expect(await page.locator('.action-popover').evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-media-help.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(help).toBeFocused();
    await prompt.getByLabel('Allow autoplaying music').check();
    await prompt.getByRole('button', { name: 'Allow external media', exact: true }).click();
    await expect(prompt).toBeHidden(); await playing(page);
    await expect(shell(page).getByRole('button', { name: 'Audio settings', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Usage statistics choice' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!))).toMatchObject({ analytics: false, analyticsChosen: false, externalMedia: true, externalMediaChosen: true });
    await page.reload(); await expect(prompt).toBeHidden(); await playing(page);
  });
}

test('allowing media without autoplay leaves music stopped and denial persists', async ({ page }) => {
  await stubYouTube(page, 'allow', { mediaConsent: false }); await page.goto(event);
  const prompt = page.getByRole('region', { name: 'External media choice' });
  await prompt.getByRole('button', { name: 'No thanks', exact: true }).click();
  await page.reload(); await expect(prompt).toBeHidden(); expect(await youtube(page)).toBeNull();
  await page.goto('/cookies');
  await page.getByLabel('Allow external media', { exact: true }).check();
  await page.getByRole('button', { name: 'Save privacy choices' }).click();
  await page.goto(event); await expect(prompt).toBeHidden(); expect(await youtube(page)).toBeNull();
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

test('page themes prefer YouTube even when manual music prefers Monster Siren', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/music-stream')) requests.push(request.url()); });
  await enable(page); await page.goto(event); await playing(page);
  expect(requests).toEqual([]);
});

test('legacy greeting preferences never request or offer operator voices', async ({ page }) => {
  await stubYouTube(page); await enable(page, { greeting: 'chosen', greetingOperator: 'Amiya' });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/greeting')) requests.push(request.url()); });
  await page.goto('/');
  await shell(page).getByRole('button', { name: 'Expand player' }).click();
  await expect(shell(page).getByRole('button', { name: /greeting|Audio settings/i })).toHaveCount(0);
  expect(requests).toEqual([]);
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

test('upcoming Global event plays its already-released CN lobby', async ({ page }) => {
  await stubYouTube(page); await enable(page);
  await page.goto('/events/' + encodeURIComponent('[Story Collection] Bolívar Diagnosed'));
  await playing(page);
  await navigate(page, '/events/' + encodeURIComponent('Contingency Contract Obliteration'));
  await playing(page);
});

test('both Monster Hunter lobbies use their correct YouTube recording before Global release', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false }); await enable(page);
  await page.goto('/events/' + encodeURIComponent('[Side Story – Crossover] Thunder in the Azure Dream'));
  expect((await playing(page)).videoId).toBe('ADn4S1ajMAI');
  await expect(shell(page).getByText('Proof of a Hero — Rise Version', {exact:true})).toBeVisible();
  await navigate(page, '/events/' + encodeURIComponent('[Rerun] A Flurry to the Flame Rerun'));
  await expect.poll(async () => (await youtube(page))?.videoId).toBe('p1fEV6QbCww');
  await playing(page);
});
