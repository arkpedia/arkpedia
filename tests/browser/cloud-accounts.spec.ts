import { expect, test } from '@playwright/test';
import { readOnly } from './census-routes';
import { markDocument, sameDocument, startMusic, stubYouTube, youtube } from './youtube-stub';

for (const theme of ['dark', 'light']) {
  test(`cloud saves preserve credential boundaries and resolve conflicts (${theme})`, async ({ page }) => {
    await readOnly(page);
    await stubYouTube(page);
    await page.addInitScript(theme => {
      if (localStorage.getItem('cloud-test-seeded')) return;
      localStorage.setItem('cloud-test-seeded', '1');
      localStorage.setItem('theme', theme);
      localStorage.setItem('musicFavorites', '["msr:local"]');
      localStorage.setItem('arkpediaYostarLogin', '{"email":"private@example.invalid","token":"PRIVATE-YOSTAR-TOKEN"}');
      localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-24T12:00:00Z', doctor: 'Test Doctor', operators: ['Amiya'], skins: [], cleared: [] }));
    }, theme);
    let remote = { user: { id: 'test-user', name: 'Test user' }, revision: 0, gameSync: false, data: {} as Record<string, unknown>, providers: ['google', 'discord'] };
    const uploads: string[] = [];
    await page.route('**/api/cloud-account', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: remote });
      const input = request.postDataJSON();
      if (input.revision !== remote.revision) return route.fulfill({ status: 409, json: { error: 'Cloud save changed.' } });
      if (request.method() === 'PUT') { uploads.push(request.postData()!); remote.data = input.data; }
      if (request.method() === 'PATCH') {
        remote.gameSync = input.gameSync;
        if (!remote.gameSync) delete remote.data.arkpediaAccount;
      }
      remote.revision++;
      await route.fulfill({ json: remote });
    });
    await page.goto('/account');
    const panel = page.getByRole('region', { name: 'Arkpedia account', exact: true });
    await expect(panel.getByText('Signed in as')).toBeVisible();
    await panel.getByRole('button', { name: 'Use this browser’s data' }).click();
    await expect(panel.getByRole('button', { name: 'Save now' })).toBeVisible();
    expect(uploads[0]).toContain('msr:local');
    expect(uploads[0]).not.toContain('arkpediaAccount');
    expect(uploads[0]).not.toContain('PRIVATE-YOSTAR-TOKEN');
    expect(uploads[0]).not.toContain('private@example.invalid');
    await panel.getByRole('checkbox', { name: 'Save imported game data to my Arkpedia account' }).check();
    await panel.getByRole('button', { name: 'Use this browser’s data' }).click();
    await expect(panel.getByRole('button', { name: 'Save now' })).toBeVisible();
    expect(uploads.at(-1)).toContain('arkpediaAccount');
    expect(uploads.at(-1)).not.toContain('PRIVATE-YOSTAR-TOKEN');
    // A concurrent edit must be presented, not overwritten by a stale automatic upload.
    remote = { ...remote, revision: remote.revision + 1, data: { ...remote.data, musicFavorites: ['msr:other-device'] } };
    const before = uploads.length;
    await panel.getByRole('button', { name: 'Save now' }).click();
    await expect(panel.getByRole('button', { name: 'Use cloud data' })).toBeVisible();
    expect(uploads.length).toBe(before);
    await expect(panel.getByRole('checkbox')).toBeChecked();
    const revokeDialog = page.waitForEvent('dialog').then(dialog => dialog.accept());
    await panel.getByRole('checkbox').uncheck();
    await revokeDialog;
    await expect.poll(() => remote.gameSync).toBe(false);
    expect(remote.data).not.toHaveProperty('arkpediaAccount');
    expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
    await panel.getByText('Account options', { exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Link Discord' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const playback = await startMusic(page);
    await markDocument(page);
    await panel.getByRole('button', { name: 'Use cloud data' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["msr:other-device"]');
    await expect(panel.getByRole('button', { name: 'Save now' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
    expect(await sameDocument(page)).toBe(true);
    const after = await youtube(page);
    expect(after?.players).toBe(playback.players);
    expect(after?.videoId).toBe(playback.videoId);
    expect(after?.state).toBe(1);
  });
}

test('unconfigured deployment keeps import and browser data available', async ({ page }) => {
  await readOnly(page);
  await page.route('**/api/cloud-account', route => route.fulfill({ status: 503, json: { error: 'Accounts unavailable' } }));
  await page.goto('/account');
  await expect(page.getByText('Cloud accounts are not available on this deployment yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import / export', exact: true })).toBeVisible();
});

test('signed-out account offers only configured providers', async ({ page }) => {
  await readOnly(page);
  await page.route('**/api/cloud-account', route => route.fulfill({ status: 401, json: { providers: ['google', 'discord'] } }));
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Discord' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Save imported game data to my Arkpedia account' })).toHaveCount(0);
});
