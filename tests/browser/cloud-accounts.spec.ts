import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readOnly } from './census-routes';
import { markDocument, sameDocument, startMusic, stubYouTube, youtube } from './youtube-stub';

const profile = { username: 'Doctor#1234', friendTag: null as string | null, friendServer: null as string | null };
async function mockAccount(page: Page, firstTime = false, data: Record<string, unknown> = {}) {
  await readOnly(page);
  const state = {
    remote: { user: { id: 'test-user', name: 'PRIVATE REAL GOOGLE NAME' }, profile: firstTime ? null : { ...profile },
      linkedProviders: ['google'], linkedAccounts: [{ id: 'google-id', providerId: 'google' }],
      revision: 0, gameSync: false, paused: false, data, providers: ['google', 'discord'] },
    signedIn: true, uploads: [] as string[], profileWrites: [] as Record<string, unknown>[], deletes: 0,
  };
  await page.route('**/api/cloud-account', async route => {
    if (!state.signedIn) return route.fulfill({ status: 401, json: { providers: ['google', 'discord'] } });
    const request = route.request(), remote = state.remote;
    if (request.method() === 'GET') return route.fulfill({ json: remote });
    const input = request.postDataJSON();
    if (input.owner !== remote.user.id || input.revision !== remote.revision) return route.fulfill({ status: 409, json: { error: 'Cloud save changed.' } });
    if (request.method() === 'PUT') { state.uploads.push(request.postData()!); remote.data = input.data; remote.paused = false; }
    if (request.method() === 'PATCH') { remote.gameSync = input.gameSync; if (!remote.gameSync) delete remote.data.arkpediaAccount; }
    if (request.method() === 'DELETE') { state.deletes++; remote.data = {}; remote.gameSync = false; remote.paused = true; }
    remote.revision++;
    await route.fulfill({ json: remote });
  });
  await page.route('**/api/account-profile**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: new URL(request.url()).searchParams.get('username') !== 'Taken#1234' } });
    const input = request.postDataJSON(); state.profileWrites.push(input);
    if (request.method() === 'DELETE') { state.signedIn = false; return route.fulfill({ json: { deleted: true } }); }
    state.remote.profile = { username: input.username, friendTag: input.friendTag || null, friendServer: input.friendServer || null };
    await route.fulfill({ json: { profile: state.remote.profile } });
  });
  await page.route('**/api/auth/sign-out', async route => { state.signedIn = false; await route.fulfill({ json: { success: true } }); });
  return state;
}
async function seed(page: Page, theme: string) {
  await page.addInitScript(theme => {
    if (localStorage.getItem('cloud-test-seeded')) return;
    localStorage.setItem('cloud-test-seeded', '1'); localStorage.setItem('theme', theme);
    localStorage.setItem('musicFavorites', '["msr:local"]');
    localStorage.setItem('arkpediaYostarLogin', '{"email":"private@example.invalid","token":"PRIVATE-YOSTAR-TOKEN"}');
    localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-24T12:00:00Z', doctor: 'Doctor#1234', operators: ['Amiya'], skins: [], cleared: [] }));
  }, theme);
}
async function capture(page: Page, name: string, info: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/${name}-${info.project.name}.png`, fullPage: await page.getByRole('dialog').count() === 0 });
}

for (const theme of ['dark', 'light']) {
  test(`data menus separate imports, backups and browser clearing (${theme})`, async ({ page }, info) => {
    await mockAccount(page); await seed(page, theme);
    await page.goto('/account'); await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
    await page.getByRole('button', { name: 'Import / export' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import / export', exact: true });
    await expect(dialog.getByRole('tab', { name: 'Game import', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByPlaceholder('Yostar email')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export everything' })).toHaveCount(0);
    await capture(page, `import-${theme}`, info);
    await dialog.getByRole('tab', { name: 'Game import', exact: true }).press('ArrowRight');
    await expect(dialog.getByRole('tab', { name: 'Backups', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('button', { name: 'Export everything' })).toBeVisible();
    await expect(dialog.getByPlaceholder('Yostar email')).toBeHidden();
    await capture(page, `backups-${theme}`, info);
    await dialog.getByRole('tab', { name: 'Browser data', exact: true }).click();
    await dialog.getByRole('button', { name: 'Clear browser data', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Clear this browser?', exact: true });
    await expect(confirmation).toContainText('Your Arkpedia account and cloud saves are kept.');
    await capture(page, `clear-browser-${theme}`, info);
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.press('Escape');
    await expect(page.getByRole('button', { name: 'Import / export' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`first-time setup chooses a unique name and preserves private local imports (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page, true); await seed(page, theme);
    await page.goto('/account');
    await expect(page.getByText('PRIVATE REAL GOOGLE NAME')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Choose your Arkpedia username' })).toBeVisible();
    expect(state.uploads).toHaveLength(0);
    await page.getByLabel('Arkpedia username', { exact: true }).fill('Taken#1234');
    await expect(page.getByText('That username is taken. Try another name or number.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish setup' })).toBeDisabled();
    await page.getByRole('button', { name: 'Use Doctor#1234', exact: true }).click();
    await expect(page.getByText('Username available', { exact: true })).toBeVisible();
    await capture(page, `setup-${theme}`, info);
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
    expect(state.profileWrites[0]).toMatchObject({ owner: 'test-user', username: 'Doctor#1234', friendTag: '', friendServer: null });
    expect(state.uploads[0]).toContain('msr:local');
    for (const value of ['arkpediaAccount', 'PRIVATE-YOSTAR-TOKEN', 'private@example.invalid']) expect(state.uploads[0]).not.toContain(value);
    await expect(page.getByRole('button', { name: 'Use this browser’s data' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose your Arkpedia username' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Account settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Account settings' });
    await settings.getByText('Arknights friend tag (optional)', { exact: true }).click();
    await settings.getByRole('button', { name: 'Use imported friend tag' }).click();
    await expect(settings.getByLabel('Arknights name and #number', { exact: true })).toHaveValue('Doctor#1234');
    await expect(settings.getByText('Username available', { exact: true })).toBeVisible();
    await settings.getByRole('button', { name: 'Save profile' }).click();
    await expect(settings.getByText('Profile saved.', { exact: true })).toBeVisible();
    expect(state.profileWrites.at(-1)).toMatchObject({ friendTag: 'Doctor#1234', friendServer: 'en' });
    expect(state.remote.gameSync).toBe(false);
  });

  test(`saving settings, real conflicts and restore keep credentials and playback safe (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page); await seed(page, theme); await stubYouTube(page);
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
    await page.getByRole('button', { name: 'Account settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Account settings' });
    await settings.getByRole('tab', { name: 'Logins', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Link Discord' })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Unlink Google' })).toBeDisabled();
    await settings.getByRole('tab', { name: 'Saving', exact: true }).click();
    const consent = settings.getByRole('checkbox', { name: 'Save imported game data to my Arkpedia account' });
    await consent.check();
    await expect.poll(() => state.uploads.at(-1)).toContain('arkpediaAccount');
    expect(state.uploads.at(-1)).not.toContain('PRIVATE-YOSTAR-TOKEN');
    await capture(page, `saving-${theme}`, info);
    await consent.click();
    const revoke = page.getByRole('dialog', { name: 'Stop saving imported game data?' });
    await revoke.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(consent).toBeChecked();
    await consent.click();
    await revoke.getByRole('button', { name: 'Stop saving game data', exact: true }).click();
    await expect.poll(() => state.remote.gameSync).toBe(false);
    expect(state.remote.data).not.toHaveProperty('arkpediaAccount');
    await settings.getByRole('button', { name: 'Close', exact: true }).click();
    // Both locations changed: a deliberate choice is required instead of silent replacement.
    await page.evaluate(() => localStorage.setItem('musicFavorites', '["msr:edited-here"]'));
    state.remote.revision++; state.remote.data.musicFavorites = ['msr:other-device'];
    const before = state.uploads.length;
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByRole('button', { name: 'Use cloud data' })).toBeVisible();
    expect(state.uploads.length).toBe(before);
    const playback = await startMusic(page); await markDocument(page);
    await page.getByRole('button', { name: 'Use cloud data' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["msr:other-device"]');
    await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
    expect(await sameDocument(page)).toBe(true);
    const after = await youtube(page);
    expect(after?.players).toBe(playback.players); expect(after?.videoId).toBe(playback.videoId); expect(after?.state).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a new device restores existing saves without a redundant copy choice', async ({ page }) => {
  const state = await mockAccount(page, false, { musicFavorites: ['msr:cloud'] }); state.remote.revision = 7;
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["msr:cloud"]');
  expect(state.uploads).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Use cloud data' })).toHaveCount(0);
});

test('linked-login confirmation returns to settings and cannot remove the last login', async ({ page }) => {
  const state = await mockAccount(page);
  state.remote.linkedProviders.push('discord'); state.remote.linkedAccounts.push({ id: 'discord-id', providerId: 'discord' });
  let confirmed = false;
  await page.route('**/api/auth/unlink-account', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ accountId: 'discord-id' });
    if (!confirmed) return route.fulfill({ status: 403, json: { code: 'SESSION_NOT_FRESH', message: 'Confirm your login' } });
    state.remote.linkedProviders = ['google']; state.remote.linkedAccounts = [{ id: 'google-id', providerId: 'google' }];
    await route.fulfill({ json: { status: true } });
  });
  await page.route('**/api/auth/sign-in/social', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ provider: 'google', callbackURL: '/account?settings=logins' });
    confirmed = true; await route.fulfill({ json: { url: new URL('/account?settings=logins', route.request().url()).href, redirect: true } });
  });
  await page.goto('/account?settings=logins');
  let settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByRole('button', { name: 'Unlink Discord' }).click();
  await expect(settings.getByRole('button', { name: 'Confirm with Google' })).toBeVisible();
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), settings.getByRole('button', { name: 'Confirm with Google' }).click()]);
  await expect.poll(() => confirmed).toBe(true);
  settings = page.getByRole('dialog', { name: 'Account settings' });
  await expect(settings.getByRole('tab', { name: 'Logins', exact: true })).toHaveAttribute('aria-selected', 'true');
  await settings.getByRole('button', { name: 'Unlink Discord' }).click();
  await expect(settings.getByRole('button', { name: 'Link Discord' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Unlink Google' })).toBeDisabled();
});

test('deleting cloud saves pauses saving across reload and keeps browser data', async ({ page }, info) => {
  const state = await mockAccount(page); await seed(page, 'dark');
  await page.goto('/account'); await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
  await page.getByRole('button', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByRole('tab', { name: 'Delete data', exact: true }).click();
  await settings.getByRole('button', { name: 'Delete cloud saves', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete cloud saves?' });
  await capture(page, 'delete-cloud', info);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(state.deletes).toBe(0);
  await settings.getByRole('button', { name: 'Delete cloud saves', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Delete cloud saves', exact: true }).click();
  await expect.poll(() => state.deletes).toBe(1);
  const count = state.uploads.length;
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume cloud saving' })).toBeVisible();
  expect(state.uploads.length).toBe(count);
  expect(await page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["msr:local"]');
  await page.getByRole('button', { name: 'Resume cloud saving' }).click();
  await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible(); expect(state.remote.paused).toBe(false);
});

test('account deletion requires typed confirmation and keeps game data in this browser', async ({ page }) => {
  const state = await mockAccount(page); await seed(page, 'dark');
  await page.goto('/account'); await expect(page.getByRole('button', { name: 'Save now' })).toBeVisible();
  await page.getByRole('button', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByRole('tab', { name: 'Delete data', exact: true }).click();
  await settings.getByRole('button', { name: 'Delete Arkpedia account', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete Arkpedia account?' });
  await expect(confirmation.getByRole('button', { name: 'Delete Arkpedia account', exact: true })).toBeDisabled();
  await confirmation.getByLabel('Type Doctor#1234 to confirm').fill('Doctor#1234');
  await confirmation.getByRole('button', { name: 'Delete Arkpedia account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  expect(state.profileWrites.at(-1)).toMatchObject({ owner: 'test-user', confirmation: 'Doctor#1234' });
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toContain('Doctor#1234');
});

test('unconfigured deployment keeps import and browser data available', async ({ page }) => {
  await readOnly(page); await page.route('**/api/cloud-account', route => route.fulfill({ status: 503, json: { error: 'Accounts unavailable' } }));
  await page.goto('/account');
  await expect(page.getByText('Cloud accounts are not available on this deployment.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import / export', exact: true })).toBeVisible();
});
test('signed-out account offers only configured providers', async ({ page }) => {
  await readOnly(page); await page.route('**/api/cloud-account', route => route.fulfill({ status: 401, json: { providers: ['google', 'discord'] } }));
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Discord' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});
