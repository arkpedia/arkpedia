import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readOnly } from './census-routes';
import { markDocument, sameDocument, startMusic, stubYouTube, youtube } from './youtube-stub';
import { mergePullArchives, type PullArchive } from '@/lib/account/pullArchive';

const profile = { username: 'Doctor#1234', friendTag: null as string | null, friendServer: null as string | null, avatarId: null as string | null };
async function mockAccount(page: Page, firstTime = false, data: Record<string, unknown> = {}) {
  await readOnly(page);
  const state = {
    remote: { user: { id: 'test-user', name: 'PRIVATE REAL GOOGLE NAME' }, profile: firstTime ? null : { ...profile },
      linkedProviders: ['google'], linkedAccounts: [{ id: 'google-id', providerId: 'google' }],
      syncReviewed: !firstTime, revision: 0, archiveRevision: 0, gameSync: false, personalSync: !firstTime, historySync: false, archives: [] as PullArchive[], paused: false, data, providers: ['google', 'discord'] },
    signedIn: true, failAvatar: false, uploads: [] as string[], archiveWrites: [] as string[], cachedArchiveReads: 0, profileWrites: [] as Record<string, unknown>[], deletes: 0,
  };
  await page.route('**/api/cloud-account', async route => {
    if (!state.signedIn) return route.fulfill({ status: 401, json: { providers: ['google', 'discord'] } });
    const request = route.request(), remote = state.remote;
    if (request.method() === 'GET') {
      const headers = request.headers();
      if (headers['x-arkpedia-archive-owner'] === remote.user.id && headers['x-arkpedia-archive-revision'] === String(remote.archiveRevision)) {
        state.cachedArchiveReads++; return route.fulfill({ json: { ...remote, archives: undefined, archivesUnchanged: true } });
      }
      return route.fulfill({ json: remote });
    }
    const input = request.postDataJSON();
    if (input.owner !== remote.user.id || input.revision !== remote.revision) return route.fulfill({ status: 409, json: { error: 'Cloud save changed.' } });
    if (!remote.syncReviewed && input.syncReviewed !== true && request.method() !== 'DELETE') return route.fulfill({ status: 428, json: { error: 'Choose what to sync first.' } });
    if (request.method() === 'PUT') { state.uploads.push(request.postData()!); remote.data = input.data; remote.paused = false; }
    if (request.method() === 'POST') { state.archiveWrites.push(request.postData()!); remote.archives = mergePullArchives(remote.archives, input.archives).map(archive => ({ ...archive, savedAt: '2026-10-24T12:01:00Z' })); remote.archiveRevision++; }
    if (request.method() === 'PATCH') {
      if (input.syncReviewed === true) remote.syncReviewed = true;
      if (input.historySync !== undefined && input.historySync !== remote.historySync) remote.archiveRevision++;
      for (const key of ['gameSync', 'historySync', 'personalSync'] as const) if (input[key] !== undefined) remote[key] = input[key];
      if (!remote.gameSync) delete remote.data.arkpediaAccount;
      if (!remote.historySync) remote.archives = [];
      if (!remote.personalSync) for (const key of Object.keys(remote.data)) if (key !== 'arkpediaAccount') delete remote.data[key];
    }
    if (request.method() === 'DELETE') { state.deletes++; remote.data = {}; remote.gameSync = false; remote.historySync = false; remote.archives = []; remote.archiveRevision++; remote.paused = true; }
    remote.revision++;
    await route.fulfill({ json: remote });
  });
  await page.route('**/api/account-profile**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { available: new URL(request.url()).searchParams.get('username') !== 'Taken#1234' } });
    const input = request.postDataJSON(); state.profileWrites.push(input);
    if (request.method() === 'DELETE') { state.signedIn = false; return route.fulfill({ json: { deleted: true } }); }
    if (request.method() === 'PATCH') {
      if (state.failAvatar) return route.fulfill({ status: 503, json: { error: 'Your picture could not be saved. Try again.' } });
      state.remote.profile!.avatarId = input.avatarId;
    } else state.remote.profile = { username: input.username, friendTag: input.friendTag || null, friendServer: input.friendServer || null, avatarId: state.remote.profile?.avatarId ?? null };
    await route.fulfill({ json: { profile: state.remote.profile } });
  });
  await page.route('**/api/auth/sign-out', async route => { state.signedIn = false; await route.fulfill({ json: { success: true } }); });
  return state;
}
async function seed(page: Page, theme: string, favorite = 'msr:local') {
  await page.addInitScript(({ theme, favorite }) => {
    if (localStorage.getItem('cloud-test-seeded')) return;
    localStorage.setItem('cloud-test-seeded', '1'); localStorage.setItem('theme', theme);
    localStorage.setItem('musicFavorites', JSON.stringify([favorite]));
    localStorage.setItem('arkpediaYostarLogin', '{"email":"private@example.invalid","token":"PRIVATE-YOSTAR-TOKEN"}');
    localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-24T12:00:00Z', doctor: 'Doctor#1234', operators: ['Amiya'], skins: [], cleared: [] }));
  }, { theme, favorite });
}
async function capture(page: Page, name: string, info: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/${name}-${info.project.name}.png`, fullPage: await page.getByRole('dialog').count() === 0 });
}

for (const theme of ['dark', 'light']) {
  test(`pull archive saves independently and survives choosing another device's snapshot (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page, false, { musicFavorites: ['msr:cloud'] }); await seed(page, theme);
    const history = { rows: [{ at: 1750000000, pool: 'pool1', char: 'char_002_amiya', star: 5 }], pools: { pool1: 'Archive fixture' }, names: {}, readAt: '2026-10-24T12:00:00Z', error: null };
    await page.addInitScript(history => {
      const record = JSON.parse(localStorage.getItem('arkpediaAccount')!); record.profile = { uid: '123' }; record.pulls = history;
      localStorage.setItem('arkpediaAccount', JSON.stringify(record));
    }, history);
    state.remote.revision = 8; state.remote.historySync = true; state.remote.data.theme = theme;
    state.remote.archives = [{ server: 'en', uid: '123', doctor: 'Doctor#1234', history: { ...history, rows: [{ ...history.rows[0], at: 1792800000 }] } }];
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Use cloud data' })).toBeVisible();
    await expect.poll(() => state.remote.archives[0].history.rows.length).toBe(2);
    expect(state.remote.gameSync).toBe(false); expect(state.remote.data).not.toHaveProperty('arkpediaAccount');
    expect(state.archiveWrites.join('')).not.toContain('PRIVATE-YOSTAR-TOKEN');
    expect(state.archiveWrites.join('')).not.toContain('operators');
    await page.getByRole('button', { name: 'Use cloud data' }).click();
    await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
    await page.getByRole('tab', { name: 'Pull history', exact: true }).click();
    await expect(page.getByText('2 pulls archived', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Pull archive details' }).click();
    await expect(page.getByText('2 pulls saved to cloud', { exact: false })).toBeVisible();
    await expect(page.getByText('Last saved to cloud', { exact: false })).toBeVisible();
    expect(state.cachedArchiveReads).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaPullArchives')!)[0].history.rows.length)).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["msr:cloud"]');
    await page.keyboard.press('Escape');
    await capture(page, `archive-${theme}`, info);
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Account settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Account settings' });
    await settings.getByRole('tab', { name: 'Saving & sharing', exact: true }).click();
    await expect(settings.getByRole('checkbox', { name: 'Save settings and plans' })).toBeChecked();
    await expect(settings.getByRole('checkbox', { name: 'Save imported game data' })).not.toBeChecked();
    const historyToggle = settings.getByRole('checkbox', { name: 'Save pull history' });
    await expect(historyToggle).toBeChecked(); await capture(page, `archive-saving-${theme}`, info);
    await historyToggle.click();
    await page.getByRole('dialog', { name: 'Delete cloud pull archive?', exact: true }).getByRole('button', { name: 'Delete cloud pull archive', exact: true }).click();
    await expect(historyToggle).not.toBeChecked();
    expect(state.remote.archives).toHaveLength(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaPullArchives')!)[0].history.rows.length)).toBe(2);
    expect(state.remote.data.musicFavorites).toEqual(['msr:cloud']);
    await settings.getByRole('checkbox', { name: 'Save settings and plans' }).click();
    await page.getByRole('dialog', { name: 'Stop saving personal data?', exact: true }).getByRole('button', { name: 'Stop saving personal data', exact: true }).click();
    await expect(settings.getByRole('checkbox', { name: 'Save settings and plans' })).not.toBeChecked();
    expect(state.remote.data).toEqual({});
    await historyToggle.check();
    await expect.poll(() => state.remote.archives[0]?.history.rows.length).toBe(2);
    expect(state.remote.gameSync).toBe(false); expect(state.remote.personalSync).toBe(false);
  });

  test(`data menus separate imports, backups and browser clearing (${theme})`, async ({ page }, info) => {
    await mockAccount(page); await seed(page, theme);
    await page.goto('/account'); await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
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

  test(`cloud archives are readable without a game snapshot and switch accounts by keyboard (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page, false, { theme });
    state.remote.revision = 7; state.remote.historySync = true;
    const history = { rows: [{ at: 1750000000, pool: 'pool1', char: 'char_002_amiya', star: 5 }], pools: { pool1: 'Archive fixture' }, names: {}, readAt: '2026-10-24T12:00:00Z', error: null };
    state.remote.archives = [
      { server: 'en', uid: '111', doctor: 'Doctor Alpha', history },
      { server: 'jp', uid: '222', doctor: 'Doctor Beta with a longer imported display name', history: { ...history, rows: [...history.rows, { ...history.rows[0], at: 1792800000 }] } },
    ];
    await page.goto('/account');
    await page.getByRole('tab', { name: 'Pull history', exact: true }).click();
    await expect(page.getByText('1 pull archived', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Every pull', exact: true }).click();
    const selector = page.getByRole('combobox', { name: 'Pull archive account', exact: true });
    await selector.focus(); await selector.press('ArrowDown'); await selector.press('End'); await selector.press('Enter');
    await expect(page.getByText('2 pulls archived', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Every pull', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(selector).toBeFocused();
    expect(state.remote.gameSync).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBeNull();
    await capture(page, `archive-without-snapshot-${theme}`, info);
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
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Use game name: Doctor#1234', exact: true }).click();
    await expect(page.getByText('Username available', { exact: true })).toBeVisible();
    await capture(page, `setup-${theme}`, info);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const saving = page.getByRole('dialog', { name: 'Choose what to save' });
    await expect(saving).toBeVisible();
    await expect(saving.getByRole('button', { name: 'Save choices', exact: true })).toBeVisible();
    await expect(saving.getByLabel('Save settings and plans', { exact: true })).not.toBeChecked();
    await expect(saving.getByLabel('Save pull history', { exact: true })).not.toBeChecked();
    await expect(saving.getByLabel('Save imported game data', { exact: true })).not.toBeChecked();
    await expect(saving.getByRole('tab')).toHaveCount(0);
    await capture(page, `setup-saving-${theme}`, info);
    await page.keyboard.press('Escape');
    await expect(saving).toBeVisible();
    await expect(saving.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await page.mouse.click(2, 2); await expect(saving).toBeVisible();
    expect(state.uploads).toHaveLength(0); expect(state.archiveWrites).toHaveLength(0);
    await saving.getByLabel('Save settings and plans', { exact: true }).check();
    expect(state.uploads).toHaveLength(0);
    await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
    await expect(saving).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
    expect(state.profileWrites[0]).toMatchObject({ owner: 'test-user', username: 'Doctor#1234', friendTag: 'Doctor#1234', friendServer: 'en' });
    await expect.poll(() => state.uploads[0]).toContain('msr:local');
    for (const value of ['arkpediaAccount', 'PRIVATE-YOSTAR-TOKEN', 'private@example.invalid']) expect(state.uploads[0]).not.toContain(value);
    await expect(page.getByRole('button', { name: 'Use this browser’s data' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Account settings' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Choose your Arkpedia username' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Account settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Account settings' });
    await expect(settings.getByText('Doctor#1234', { exact: true })).toBeVisible();
    await expect(settings.getByLabel('Arknights name and #number', { exact: true })).toHaveCount(0);
    await expect(settings.getByText('Username available', { exact: true })).toHaveCount(0);
    await settings.getByRole('button', { name: 'Save profile' }).click();
    await expect(settings.getByText('Profile saved.', { exact: true })).toBeVisible();
    expect(state.profileWrites.at(-1)).toMatchObject({ friendTag: 'Doctor#1234', friendServer: 'en' });
    expect(state.remote.gameSync).toBe(false);
  });

  test(`profile help and account pictures survive reloads without adopting guest choices (${theme})`, async ({ page, browser, baseURL }, info) => {
    const state = await mockAccount(page); await seed(page, theme);
    state.remote.personalSync = false; state.remote.paused = true;
    state.remote.profile!.friendTag = 'Doctor#1234'; state.remote.profile!.friendServer = 'en';
    await page.addInitScript(() => localStorage.setItem('arkpedia:profile-avatar-v1', 'six-star-icons/Surtr - Base.webp'));
    await page.goto('/account?settings=profile');
    const settings = page.getByRole('dialog', { name: 'Account settings', exact: true });
    await expect(settings.getByText('Username available', { exact: true })).toHaveCount(0);
    await expect(settings.getByRole('button', { name: 'Use game name:', exact: false })).toHaveCount(0);
    for (const [label, text] of [['Username rules', 'Use 3–40 characters:'], ['About your friend tag', 'Read from your latest game import.']]) {
      const help = settings.getByRole('button', { name: label, exact: true });
      await help.focus(); await page.keyboard.press('Enter');
      await expect(page.getByText(text, { exact: false })).toBeVisible();
      await capture(page, `profile-help-${label}-${theme}`, info);
      await page.keyboard.press('Escape'); await expect(help).toBeFocused();
    }
    await capture(page, `profile-polish-${theme}`, info);
    expect(await settings.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    const pictureTab = settings.getByRole('tab', { name: 'Profile picture', exact: true });
    await pictureTab.click();
    await expect(settings.locator('.account-profile-summary img')).toHaveCount(0);
    const help = settings.getByRole('button', { name: 'About your profile picture' });
    await help.click(); await expect(page.getByText('Your picture saves when you select it', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(help).toBeFocused();
    const search = settings.getByRole('searchbox', { name: 'Search profile icons' });
    await search.fill('Suzuran - Base');
    state.failAvatar = true;
    await settings.getByRole('button', { name: 'Suzuran - Base', exact: true }).click();
    await expect(settings.getByRole('alert')).toHaveText('Your picture could not be saved. Try again.');
    await expect(settings.locator('.account-profile-summary img')).toHaveCount(0);
    state.failAvatar = false;
    await settings.getByRole('button', { name: 'Suzuran - Base', exact: true }).click();
    await expect(settings.getByRole('status')).toHaveText('Profile picture saved to your account.');
    await expect(settings.locator('.account-profile-summary img')).toHaveAttribute('src', /Suzuran/);
    expect(state.remote.profile!.avatarId).toBe('six-star-icons/Suzuran - Base.webp');
    expect(state.uploads).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('arkpedia:profile-avatar-v1'))).toBe('six-star-icons/Surtr - Base.webp');
    await capture(page, `profile-picture-saved-${theme}`, info);
    const otherContext = await browser.newContext({ baseURL });
    try {
      const otherPage = await otherContext.newPage();
      const sameAccount = await mockAccount(otherPage);
      sameAccount.remote.profile = { ...state.remote.profile! };
      await otherPage.goto('/account?settings=profile');
      const otherSettings = otherPage.getByRole('dialog', { name: 'Account settings', exact: true });
      await expect(otherSettings.getByText('Doctor#1234', { exact: true })).toBeVisible();
      await otherSettings.getByLabel('Arkpedia username', { exact: true }).fill('Fresh#1234');
      await expect(otherSettings.getByText('Username available', { exact: true })).toBeVisible();
      await otherSettings.getByRole('button', { name: 'Save profile', exact: true }).click();
      await expect(otherSettings.getByText('Profile saved.', { exact: true })).toBeVisible();
      expect(sameAccount.profileWrites.at(-1)).toMatchObject({ friendTag: 'Doctor#1234', friendServer: 'en' });
      await otherSettings.getByRole('tab', { name: 'Profile picture', exact: true }).click();
      await expect(otherSettings.locator('.account-profile-summary img')).toHaveAttribute('src', /Suzuran/);
      expect(await otherPage.evaluate(() => localStorage.getItem('arkpedia:profile-avatar-v1'))).toBeNull();
    } finally { await otherContext.close(); }

    await page.reload();
    await settings.getByRole('tab', { name: 'Profile picture', exact: true }).click();
    await expect(settings.locator('.account-profile-summary img')).toHaveAttribute('src', /Suzuran/);
    await settings.getByRole('button', { name: 'Use default', exact: true }).click();
    await expect(settings.getByRole('status')).toHaveText('Profile picture saved to your account.');
    expect(state.remote.profile!.avatarId).toBeNull();
    await page.reload(); await settings.getByRole('tab', { name: 'Profile picture', exact: true }).click();
    await expect(settings.locator('.account-profile-summary img')).toHaveCount(0);
    state.remote.user.id = 'other-user'; state.remote.profile = { ...profile, username: 'Another Doctor' };
    await page.reload(); await settings.getByRole('tab', { name: 'Profile picture', exact: true }).click();
    await expect(settings.locator('.account-profile-summary img')).toHaveCount(0);
    expect(state.profileWrites.filter(w => w.avatarId !== undefined)).toHaveLength(3);
  });

  test(`profile tabs preserve drafts and icon categories keep search width (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page); await seed(page, theme);
    await page.goto('/account');
    await page.getByRole('button', { name: 'Account settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Account settings', exact: true });
    const username = settings.getByLabel('Arkpedia username', { exact: true });
    await username.fill('Draft#1234');
    await expect(settings.getByRole('searchbox', { name: 'Search profile icons' })).toHaveCount(0);
    await settings.getByRole('tab', { name: 'Profile', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(settings.getByRole('tab', { name: 'Profile picture', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(username).not.toBeVisible();
    const search = settings.getByRole('searchbox', { name: 'Search profile icons' });
    await expect(settings.locator('.avatar-choice').first()).toBeVisible();
    const before = await search.boundingBox();
    for (const category of ['Enemies', 'Factions', 'Base Skill', 'Items', 'Others', 'All icons', 'Operators']) {
      await settings.getByRole('combobox', { name: 'Icon category' }).click();
      await page.getByRole('option', { name: category, exact: true }).click();
      const after = await search.boundingBox(); expect(Math.abs(after!.width-before!.width)).toBeLessThan(1);
      expect(await settings.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
      if (category === 'Base Skill') {
        await expect(settings.getByRole('heading', { name: 'Factory', exact: true })).toBeVisible();
        await search.fill('Aak');
        await expect(settings.getByRole('region', { name: 'Control Center', exact: true }).getByRole('button', { name: 'Aak - Neuroticism', exact: true })).toBeVisible();
        await expect(settings.getByRole('region', { name: 'Training Room', exact: true }).getByRole('button', { name: 'Aak - Surgical Precision', exact: true })).toBeVisible();
        await capture(page, `base-skills-${theme}`, info);
        await search.clear();
      }
    }
    await search.fill('Suzuran - Base'); await settings.getByRole('button', { name: 'Suzuran - Base', exact: true }).click();
    await expect(settings.getByRole('status')).toHaveText('Profile picture saved to your account.');
    await expect.poll(() => settings.locator('.avatar-choice img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await capture(page, `picture-tabs-${theme}`, info);
    await settings.getByRole('tab', { name: 'Profile', exact: true }).click();
    await expect(username).toHaveValue('Draft#1234'); await expect(search).toHaveCount(0);
    await settings.getByRole('button', { name: 'Save profile' }).click();
    await expect(settings.getByText('Profile saved.', { exact: true })).toBeVisible();
    expect(state.profileWrites.at(-1)).toMatchObject({ username: 'Draft#1234' });
    await capture(page, `username-tabs-${theme}`, info);
  });

  test(`saving settings, real conflicts and restore keep credentials and playback safe (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page); await seed(page, theme); await stubYouTube(page);
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
    await page.getByRole('button', { name: 'Account settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Account settings' });
    await settings.getByRole('tab', { name: 'Logins', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Link Discord' })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Unlink Google' })).toBeDisabled();
    await settings.getByRole('tab', { name: 'Saving & sharing', exact: true }).click();
    const consent = settings.getByRole('checkbox', { name: 'Save imported game data' });
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
    await page.getByRole('button', { name: 'Cloud saving details' }).click();
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Use cloud data' })).toBeVisible();
    expect(state.uploads.length).toBe(before);
    const playback = await startMusic(page); await markDocument(page);
    await page.getByRole('button', { name: 'Use cloud data' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["msr:other-device"]');
    await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
    expect(await sameDocument(page)).toBe(true);
    const after = await youtube(page);
    expect(after?.players).toBe(playback.players); expect(after?.videoId).toBe(playback.videoId); expect(after?.state).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('choosing cloud after switching Arkpedia accounts keeps foreign browser history private on later syncs', async ({ page }) => {
  const state = await mockAccount(page); await seed(page, 'dark');
  state.remote.historySync = true; state.remote.revision = 8;
  await page.addInitScript(() => {
    const account = JSON.parse(localStorage.getItem('arkpediaAccount')!);
    account.profile = { uid: '123' }; account.pulls = { rows: [{ at: 1750000000, pool: 'p', char: 'char_002_amiya', star: 5 }], pools: {}, names: {}, readAt: null, error: null };
    localStorage.setItem('arkpediaAccount', JSON.stringify(account));
    localStorage.setItem('arkpedia:cloud-sync-v1', JSON.stringify({ userId: 'previous-user', revision: 3, fingerprint: '{}' }));
  });
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Use cloud data' })).toBeVisible();
  expect(state.archiveWrites).toHaveLength(0);
  await page.getByRole('button', { name: 'Use cloud data' }).click();
  await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
  await page.getByRole('button', { name: 'Cloud saving details' }).click();
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
  expect(state.archiveWrites).toHaveLength(0); expect(state.remote.archives).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaPullArchives')!)[0].history.rows.length)).toBe(1);
});

test('setup requires saving choices after profile creation and before resolving conflicting data', async ({ page }) => {
  const state = await mockAccount(page, true, { musicFavorites: ['msr:cloud'] });
  state.remote.revision = 7; state.remote.historySync = true;
  await seed(page, 'dark');
  let rejectProfile = true;
  await page.route('**/api/account-profile', route => rejectProfile && route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { error: 'Profile could not be saved. Try again.' } }) : route.fallback());
  await page.goto('/account');
  await page.getByLabel('Arkpedia username', { exact: true }).fill('Doctor#1234');
  await expect(page.getByText('Username available', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Profile could not be saved. Try again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toHaveCount(0);
  rejectProfile = false;
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const saving = page.getByRole('dialog', { name: 'Choose what to save' });
  await expect(saving).toBeVisible();
  expect(state.uploads).toHaveLength(0); expect(state.archiveWrites).toHaveLength(0);
  await saving.getByLabel('Save settings and plans', { exact: true }).check();
  await saving.getByLabel('Save pull history', { exact: true }).check();
  await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
  const conflict = page.getByRole('dialog', { name: 'Choose a save' });
  await expect(conflict).toBeVisible();
  expect(state.remote.syncReviewed).toBe(true);
  await conflict.getByRole('button', { name: 'Use cloud data' }).click();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cloud saving details' }).click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toHaveCount(0);
});

test('a new device restores existing saves without a redundant copy choice', async ({ page }) => {
  const state = await mockAccount(page, false, { musicFavorites: ['msr:cloud'] }); state.remote.revision = 7;
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
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
  await page.goto('/account'); await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible(); expect(state.remote.paused).toBe(false);
});

test('account deletion requires typed confirmation and keeps game data in this browser', async ({ page }) => {
  const state = await mockAccount(page); await seed(page, 'dark');
  await page.goto('/account'); await expect(page.getByRole('button', { name: 'Cloud saving details' })).toBeVisible();
  await page.getByRole('button', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByRole('tab', { name: 'Delete data', exact: true }).click();
  await settings.getByRole('button', { name: 'Delete Arkpedia account', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete Arkpedia account?' });
  await expect(confirmation.getByRole('button', { name: 'Delete Arkpedia account', exact: true })).toBeDisabled();
  await confirmation.getByLabel('Type Doctor#1234 to confirm').fill('Doctor#1234');
  await confirmation.getByRole('button', { name: 'Delete Arkpedia account', exact: true }).click();
  await page.getByRole('region', { name: 'Arkpedia account', exact: true }).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Log in to Arkpedia' }).getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  expect(state.profileWrites.at(-1)).toMatchObject({ owner: 'test-user', confirmation: 'Doctor#1234' });
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toContain('Doctor#1234');
});

test('unconfigured deployment keeps import and browser data available', async ({ page }) => {
  await readOnly(page); await page.route('**/api/cloud-account', route => route.fulfill({ status: 503, json: { error: 'Accounts unavailable' } }));
  await page.goto('/account');
  await expect(page.getByRole('region', { name: 'Arkpedia account', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import / export', exact: true })).toBeVisible();
});
test('signed-out account offers only configured providers', async ({ page }) => {
  await readOnly(page); await page.route('**/api/cloud-account', route => route.fulfill({ status: 401, json: { providers: ['google', 'discord'] } }));
  await page.goto('/account');
  await page.getByRole('region', { name: 'Arkpedia account', exact: true }).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Log in to Arkpedia' }).getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Discord' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

for (const theme of ['dark', 'light']) {
  test(`linking another provider asks for recent confirmation (${theme})`, async ({ page }, info) => {
    await mockAccount(page); await seed(page,theme);
    await page.route('**/api/auth/link-social',route=>route.fulfill({status:403,json:{code:'SESSION_NOT_FRESH',message:'Confirm your login'}}));
    await page.goto('/account?settings=logins');
    const settings=page.getByRole('dialog',{name:'Account settings'});
    await settings.getByRole('button',{name:'Link Discord',exact:true}).click();
    await expect(settings.getByRole('button',{name:'Confirm with Google'})).toBeVisible();
    await expect(settings.getByRole('button',{name:'Confirm with Discord'})).toHaveCount(0);
    await expect(settings.getByRole('alert')).toContainText('Confirm with an existing login');
    await expect(settings.getByRole('button',{name:'Unlink Google'})).toBeDisabled();
    await capture(page,`link-confirm-${theme}`,info);
  });
  test(`signing out other devices preserves this browser and requires confirmation (${theme})`, async ({ page }, info) => {
    await mockAccount(page); await seed(page,theme);
    let recent=false,revoked=0;
    await page.route('**/api/auth/revoke-other-sessions',async route=>{
      if(!recent)return route.fulfill({status:403,json:{code:'SESSION_NOT_FRESH',message:'Confirm your login'}});
      revoked++; await route.fulfill({json:{status:true}});
    });
    await page.route('**/api/auth/sign-in/social',async route=>{
      expect(route.request().postDataJSON()).toMatchObject({provider:'google',callbackURL:'/account?settings=logins'});
      recent=true; await route.fulfill({json:{url:new URL('/account?settings=logins',route.request().url()).href,redirect:true}});
    });
    await page.goto('/account?settings=logins');
    let settings=page.getByRole('dialog',{name:'Account settings'});
    await settings.getByRole('button',{name:'Sign out other devices',exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect(settings.getByRole('button',{name:'Confirm with Google'})).toBeVisible();
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),settings.getByRole('button',{name:'Confirm with Google'}).click()]);
    settings=page.getByRole('dialog',{name:'Account settings'});
    await settings.getByRole('button',{name:'Sign out other devices',exact:true}).click();
    await expect(settings.getByRole('status')).toHaveText('Other devices signed out.');
    expect(revoked).toBe(1);
    expect(await page.evaluate(()=>localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
    await expect(settings.getByRole('button',{name:'Unlink Google'})).toBeDisabled();
    await capture(page,`other-devices-${theme}`,info);
  });
}

test('cloud throttling backs off without retrying writes or clearing local data',async({page})=>{
  await mockAccount(page);await seed(page,'dark');
  let reads=0;
  await page.route('**/api/cloud-account',route=>{
    reads++;return route.fulfill({status:429,headers:{'retry-after':'60'},json:{error:'Please wait before syncing.'}});
  });
  await page.clock.install();
  await page.goto('/account');
  await expect(page.getByRole('button',{name:'Retry sync',exact:true})).toBeVisible();
  expect(reads).toBe(1);
  await page.clock.fastForward(30000);
  expect(reads).toBe(1);
  await page.clock.fastForward(31000);
  await expect.poll(()=>reads).toBe(2);
  expect(await page.evaluate(()=>localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
});


for (const provider of ['google', 'discord'] as const) {
  test(`${provider} sign-in returns to the same page and completes onboarding in one popup`, async ({ page }, info) => {
    const state = await mockAccount(page, true); state.signedIn = false;
    await page.addInitScript(theme => localStorage.setItem('theme', theme), provider === 'google' ? 'dark' : 'light');
    await page.route('**/api/auth/sign-in/social', async route => {
      const body = route.request().postDataJSON();
      expect(body.provider).toBe(provider);
      expect(body.callbackURL).toBe('/music?view=library&account=welcome#collection');
      state.signedIn = true;
      await route.fulfill({ json: { url: new URL(body.callbackURL, route.request().url()).href, redirect: true } });
    });
    await page.goto('/music?view=library#collection');
    const trigger = page.getByRole('button', { name: 'Log in', exact: true }).first();
    await trigger.click();
    await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
    const login = page.getByRole('dialog', { name: 'Log in to Arkpedia' });
    await expect(login).toBeVisible();
    await expect(login).toHaveJSProperty('open', true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await expect.poll(() => login.locator('img').evaluateAll(images => images.length === 2 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await capture(page, `login-${provider}`, info);
    await login.getByRole('button', { name: `Continue with ${provider === 'google' ? 'Google' : 'Discord'}` }).click();
    const setup = page.getByRole('dialog', { name: 'Create your account' });
    await expect(setup).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page).toHaveURL(/\/music\?view=library&account=welcome#collection$/);
    await setup.getByLabel('Arkpedia username', { exact: true }).fill('Doctor#1234');
    await expect(setup.getByText('Username available', { exact: true })).toBeVisible();
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    const saving = page.getByRole('dialog', { name: 'Choose what to save' });
    await expect(saving).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(saving).toBeVisible();
    expect(state.uploads).toHaveLength(0); expect(state.archiveWrites).toHaveLength(0);
    await saving.getByRole('button', { name: 'How cloud saving works', exact: true }).click();
    await expect(saving.getByText('Selected data saves while Arkpedia is open.', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(saving).toBeVisible();
    await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/music\?view=library#collection$/);
    await page.reload(); await expect(page.getByRole('button', { name: 'My account', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('returning login and failed provider callbacks use the popup without restarting setup', async ({ page }) => {
  const state = await mockAccount(page);
  await page.goto('/music?view=library&account=welcome');
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Create your account' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/music\?view=library$/);
  state.signedIn = false;
  await page.goto('/music?view=library&account=welcome&signin=failed');
  const login = page.getByRole('dialog', { name: 'Log in to Arkpedia' });
  await expect(login.getByRole('alert')).toContainText('Sign-in could not finish');
  await expect(login.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await login.getByRole('button', { name: 'Keep browsing' }).click();
  await expect(page).toHaveURL(/\/music\?view=library$/);
});


test('unfinished profile stays in the popup and can resume without restarting paused saving', async ({ page }) => {
  const state = await mockAccount(page, true); state.remote.paused = true;
  await seed(page, 'dark'); await page.goto('/account');
  let setup = page.getByRole('dialog', { name: 'Create your account' });
  await expect(setup).toBeVisible();
  expect(await setup.evaluate(dialog => dialog.matches(':modal'))).toBe(true);
  await setup.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue account setup', exact: true }).click();
  setup = page.getByRole('dialog', { name: 'Create your account' });
  await setup.getByLabel('Arkpedia username', { exact: true }).fill('Doctor#1234');
  await expect(setup.getByText('Username available', { exact: true })).toBeVisible();
  await setup.getByRole('button', { name: 'Continue', exact: true }).click();
  const saving = page.getByRole('dialog', { name: 'Choose what to save' });
  await expect(saving.getByText('Cloud saving is paused.', { exact: false })).toBeVisible();
  await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
  expect(state.remote.paused).toBe(true); expect(state.uploads).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
});

test('pending sync choices survive a fresh visit and failed confirmation, with an explicit sync-nothing option', async ({ page }) => {
  const state = await mockAccount(page); state.remote.syncReviewed = false; state.remote.personalSync = false;
  await seed(page, 'dark', 'msr:123456');
  let fail = true;
  await page.route('**/api/cloud-account', async route => {
    if (route.request().method() === 'PATCH' && fail) {
      fail = false; return route.fulfill({ status: 400, json: { error: 'Could not save these choices. Try again.' } });
    }
    await route.fallback();
  });
  await page.goto('/music');
  const saving = page.getByRole('dialog', { name: 'Choose what to save' });
  await expect(saving).toBeVisible();
  await expect(saving.getByRole('checkbox')).toHaveCount(3);
  await saving.getByLabel('Save settings and plans', { exact: true }).check();
  expect(state.uploads).toHaveLength(0); expect(state.archiveWrites).toHaveLength(0);
  await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
  await expect(saving.getByRole('alert')).toContainText('Could not save');
  expect(state.remote.syncReviewed).toBe(false); expect(state.uploads).toHaveLength(0);
  await expect(saving.getByLabel('Save settings and plans', { exact: true })).toBeChecked();
  await saving.getByLabel('Save settings and plans', { exact: true }).uncheck();
  await page.keyboard.press('Escape'); await expect(saving).toBeVisible();
  await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
  await expect(saving).toHaveCount(0);
  expect(state.remote.syncReviewed).toBe(true); expect(state.remote.personalSync).toBe(false);
  expect(state.uploads).toHaveLength(0); expect(state.archiveWrites).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('musicFavorites'))).toContain('msr:123456');
  await page.reload(); await expect(page.getByRole('button', { name: 'My account', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const theme of ['dark', 'light']) {
  test(`audio choices are available in Account settings and saved as personal preferences (${theme})`, async ({ page }, info) => {
    // Three changes are uploaded by the real 15-second polling cycle.
    test.setTimeout(90_000);
    await stubYouTube(page);
    const state = await mockAccount(page); await seed(page, theme);
    await page.goto('/account?settings=profile');
    const settings = page.getByRole('dialog', { name: 'Account settings', exact: true });
    await settings.getByRole('tab', { name: 'Audio', exact: true }).click();
    await expect(settings.getByLabel('Background Music', {exact:true})).toHaveCount(0);
    await expect(settings.getByLabel('Event Music', {exact:true})).not.toBeChecked();
    await settings.getByLabel('Event Music', {exact:true}).check();
    await expect.poll(() => state.remote.data['arkpedia:settings'], { timeout: 25000 }).toEqual({ version: 3, values: { eventMusic: true } });
    await settings.getByLabel('Event Music', {exact:true}).uncheck();
    await expect.poll(() => state.remote.data['arkpedia:settings'], { timeout: 25000 }).toEqual({ version: 3, values: { eventMusic: false } });
    await capture(page, `account-audio-${theme}`, info);
    await settings.getByRole('tab', { name: 'Saving & sharing', exact: true }).click();
    await expect(settings.getByText('Private cloud saving')).toBeVisible();
  });
}

for (const theme of ['dark', 'light']) {
  test(`unfinished setup can retry sign-out and choose another login without uploading (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page, true); await seed(page, theme);
    let attempts = 0;
    await page.route('**/api/auth/sign-out', async route => {
      if (++attempts === 1) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Try again.' } });
      state.signedIn = false; await route.fulfill({ json: { success: true } });
    });
    await page.goto('/account');
    const setup = page.getByRole('dialog', { name: 'Create your account', exact: true });
    await setup.getByRole('button', { name: 'Use another account', exact: true }).click();
    await expect(setup.getByRole('alert')).toContainText('Sign-out could not finish');
    await expect(setup.getByRole('button', { name: 'Use another account', exact: true })).toBeEnabled();
    await capture(page, `switch-account-${theme}`, info);
    await setup.getByRole('button', { name: 'Use another account', exact: true }).click();
    const login = page.getByRole('dialog', { name: 'Log in to Arkpedia', exact: true });
    await expect(login.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
    await expect(login.getByRole('button', { name: 'Continue with Discord', exact: true })).toBeVisible();
    expect(state.profileWrites).toHaveLength(0); expect(state.uploads).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toContain('PRIVATE-YOSTAR-TOKEN');
  });

  test(`each saving choice has keyboard and touch help without changing consent (${theme})`, async ({ page }, info) => {
    const state = await mockAccount(page, true); await seed(page, theme);
    await page.goto('/account');
    await page.getByLabel('Arkpedia username', { exact: true }).fill('Doctor#1234');
    await expect(page.getByText('Username available', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const saving = page.getByRole('dialog', { name: 'Choose what to save', exact: true });
    for (const [label, help, detail] of [
      ['Save settings and plans', 'About saving settings and plans', 'your browser copy stays'],
      ['Save pull history', 'About saving pull history', 'your browser history stays'],
      ['Save imported game data', 'About saving imported game data', 'cloud auto-deploys'],
    ]) {
      const trigger = saving.getByRole('button', { name: help, exact: true });
      await trigger.focus(); await trigger.press('Enter');
      await expect(saving.getByText(detail, { exact: false })).toBeVisible();
      await expect(saving.getByLabel(label, { exact: true })).not.toBeChecked();
      await capture(page, `choice-help-${label.replaceAll(' ', '-')}-${theme}`, info);
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
      await trigger.click(); await expect(saving.getByText(detail, { exact: false })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape'); await expect(saving).toBeVisible();
    await capture(page, `compact-saving-${theme}`, info);
    expect(state.uploads).toHaveLength(0);
    await saving.getByRole('button', { name: 'Save choices', exact: true }).click();
    await expect(saving).toBeHidden(); expect(state.remote.syncReviewed).toBe(true);
    expect(state.remote.personalSync || state.remote.historySync || state.remote.gameSync).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`autoplay explains denied media permission and links to its controls (${theme})`, async ({ page }, info) => {
    await stubYouTube(page, 'allow', { mediaConsent: false });
    await mockAccount(page); await seed(page, theme);
    await page.addInitScript(() => {
      if (localStorage.getItem('media-test-seeded')) return;
      localStorage.setItem('media-test-seeded', '1');
      localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() }));
    });
    await page.goto('/account?settings=profile');
    const settings = page.getByRole('dialog', { name: 'Account settings', exact: true });
    await settings.getByRole('tab', { name: 'Audio', exact: true }).click();
    await expect(settings.getByLabel('Background Music', {exact:true})).toHaveCount(0);
    await expect(settings.getByLabel('Event Music', {exact:true})).toBeDisabled();
    await expect(settings.getByRole('status')).toContainText('External media permission required');
    await capture(page, `audio-permission-${theme}`, info);
    await settings.getByRole('link', { name: 'Manage media permission', exact: true }).click();
    await expect(page).toHaveURL(/\/cookies$/);
    await page.getByLabel('Allow external media', { exact: true }).check();
    await page.getByRole('button', { name: 'Save privacy choices', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!).externalMedia)).toBe(true);
    await page.goto('/account?settings=profile');
    await settings.getByRole('tab', { name: 'Audio', exact: true }).click();
    await expect(settings.getByLabel('Event Music', {exact:true})).toBeEnabled();
    await expect(settings.getByRole('status')).toContainText('External media is allowed');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!).analytics)).toBe(false);
  });
}


for (const provider of ['google', 'discord'] as const) test(`native ${provider} sign-in recovers from cancellation and authenticates the existing app document`, async ({ page, baseURL }, info) => {
  await page.route('https://www.arkpedia.net/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` }) });
  });
  const state = await mockAccount(page, true); state.signedIn = false;
  let opens = 0, cancels = 0;
  await page.exposeBinding('__nativeAuthCall', async (_, method: string, options?: { state: string }) => {
    if (method === 'prepare') return { challenge: 'c'.repeat(43) };
    if (method === 'cancel') { cancels++; return {}; }
    expect(options?.state).toBe('s'.repeat(43));
    if (++opens === 1) throw new Error('Sign-in cancelled.');
    state.signedIn = true;
    return { returnPath: '/music?view=library&account=welcome#collection' };
  });
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    const target = window as unknown as { __nativeAuthCall: (method: string, options?: unknown) => Promise<unknown>; Capacitor: unknown };
    target.Capacitor = { Plugins: { ArkpediaAuth: {
      prepare: () => target.__nativeAuthCall('prepare'), open: (options: unknown) => target.__nativeAuthCall('open', options), cancel: () => target.__nativeAuthCall('cancel'),
    } } };
  }, provider === 'google' ? 'dark' : 'light');
  await page.route('**/api/native-auth/begin', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ challenge: 'c'.repeat(43), provider, mode: 'sign-in' });
    expect(route.request().postDataJSON()).not.toHaveProperty('verifier');
    await route.fulfill({ json: { state: 's'.repeat(43) } });
  });
  await page.goto('https://www.arkpedia.net/music?view=library#collection');
  await markDocument(page);
  await page.getByRole('button', { name: 'Log in', exact: true }).first().click();
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  const login = page.getByRole('dialog', { name: 'Log in to Arkpedia' });
  const button = login.getByRole('button', { name: `Continue with ${provider === 'google' ? 'Google' : 'Discord'}` });
  await button.click();
  await expect(login.getByText('Sign-in cancelled.', { exact: true })).toBeVisible();
  expect(cancels).toBe(1);
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Create your account' })).toBeVisible();
  await expect(page).toHaveURL('https://www.arkpedia.net/music?view=library&account=welcome#collection');
  await sameDocument(page);
  await page.screenshot({ path: info.outputPath('native-sign-in-return.png') });
});
