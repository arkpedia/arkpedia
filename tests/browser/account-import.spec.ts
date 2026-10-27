import { expect, test, type Page } from '@playwright/test';
import { SERVERS, type ServerId } from '../../lib/account-import/yostar';
import { readOnly } from './census-routes';
import { BACKUP_STORES } from '../../lib/account/backup';
import { STORY_PROGRESS_KEY } from '../../lib/story/storyProgress';
import { markDocument, sameDocument, startMusic, stubYouTube } from './youtube-stub';

/* The previous email-code flow, with the Yostar email notice kept. All server answers are
 * fixtures: these checks never send a code or sign in to a real account. */

const EMAIL = 'player@example.invalid';
const VERSION = 'https://hv.example.invalid/Android/version';

test.beforeEach(async ({ page }, testInfo) => {
  // Arkpedia follows its stored theme, rather than the browser's colour-scheme preference.
  await page.addInitScript(theme => {
    if (performance.getEntriesByType('navigation')[0]?.toJSON().type !== 'reload') localStorage.setItem('theme', theme);
  }, testInfo.project.use.colorScheme === 'light' ? 'light' : 'dark');
});

/** The stand-in transport, answering as the servers do: the account at `level`, or the game's
 *  token exchange refusing the login (`level: null`). */
async function stubServers(page: Page, level: number | null, isNew = 0, networkFailures = 0, sendCodeRefused = false, cachedNetwork = false, server: ServerId = 'en', codeFailure: { count: number; message: string } | null = null) {
  await readOnly(page);
  // The relay is never opened: the page's transport is the stand-in.
  await page.routeWebSocket(/relay\.arkpedia\.net/, (socket) => socket.close());
  // A cache outage exercises the existing relay fallback in the older regression cases.
  await page.route('**/api/account-import/network?server=*', (route) => route.fulfill({
    status: cachedNetwork ? 200 : 503, contentType: 'application/json',
    body: JSON.stringify(cachedNetwork ? { content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network: {
      u8: 'https://u8.example.invalid', gs: 'https://gs.example.invalid', hv: 'https://hv.example.invalid/{0}/version',
    } } } }) } : { error: 'Public server list temporarily unavailable' }),
  }));
  // The game's version file is the one request the page makes itself (directTransport).
  await page.route(VERSION, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ resVersion: '00-00-00', clientVersion: '0.0.0' }) }));
  await page.addInitScript(({ level, isNew, networkFailures, sendCodeRefused, region, codeFailure }) => {
    const network = { u8: 'https://u8.example.invalid', gs: 'https://gs.example.invalid', hv: 'https://hv.example.invalid/{0}/version' };
    const answers: Record<string, { json: unknown; headers?: [string, string][] }> = {
      [region.networkConfig]: { json: { content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network } } }) } },
      [`${region.yostar}/yostar/send-code`]: { json: sendCodeRefused ? { Code: 1, Msg: '邮件发送频率上限,错误代码:1' } : { Code: 200, Data: {} } },
      [`${region.yostar}/yostar/get-auth`]: { json: { Code: 200, Data: { Token: 'code-token' } } },
      [`${region.yostar}/user/login`]: { json: { Code: 200, Data: { IsNew: isNew, UserInfo: { ID: 4242, Token: 'yostar-token' } } } },
      'https://u8.example.invalid/user/v1/getToken': { json: level === null ? { result: 2 } : { result: 0, token: 'u8-token', uid: '1' } },
      'https://gs.example.invalid/account/login': { json: { result: 0, secret: 'session', uid: '1' } },
      'https://gs.example.invalid/account/syncData': { json: { result: 0, user: { status: { level, nickName: level === 1 ? '' : 'Doctor', nickNumber: '0001' }, troop: { chars: {} } } } },
      [`${region.accountCenter}/api/user/login`]: { json: { code: 0 }, headers: [['Set-Cookie', 'YSSID=session-id; Path=/'], ['Set-Cookie', 'YSSID.sig=session-sig; Path=/']] },
      [`${region.accountCenter}/api/game/gachas?key=ark&index=1&size=50`]: { json: { code: 0, data: { rows: [] } } },
    };
    const asked: string[] = [];
    const requests: { url: string; body?: string; headers: Record<string, string> }[] = [];
    Object.assign(window, { __asked: asked, __requests: requests });
    window.__arkpediaImportTransport = async (url, request) => {
      asked.push(url);
      requests.push({ url, body: request.body, headers: request.headers });
      if (url.endsWith('/network_config') && networkFailures-- > 0) throw new Error('Request failed with error code 7: Could not connect to server');
      if (url.endsWith('/yostar/send-code') && codeFailure && codeFailure.count-- > 0) throw new Error(codeFailure.message);
      const answer = answers[url];
      return answer ? { status: 200, json: answer.json, headers: answer.headers ?? [] } : { status: 404, json: null, headers: [] };
    };
  }, { level, isNew, networkFailures, sendCodeRefused, region: SERVERS[server], codeFailure });
}

test('a failed email connection retries once even when game settings are unavailable', async ({ page }) => {
  await stubServers(page, 120, 0, 99, false, false, 'en', { count: 1, message: 'Request failed with error code 7: Could not connect to server' });
  const dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Retrying once');
  await expect(dialog.locator('.import-sent')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.locator('.import-steps')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Send again', exact: true })).toBeDisabled();
  await expect(dialog.getByPlaceholder('Code from the email')).toBeFocused();
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.filter(url => url.endsWith('/yostar/send-code'))).toHaveLength(2);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/code-retry-${test.info().project.name}.png` });
});

test('failed code requests stop retrying and the cooldown survives reopen, reload and expiry', async ({ page }) => {
  await page.clock.install();
  await stubServers(page, 120, 0, 0, false, true, 'en', { count: 99, message: 'Request failed with error code 7: Could not connect to server' });
  let dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('wait 1 minute');
  expect((await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).filter(url => url.endsWith('/yostar/send-code'))).toHaveLength(2);
  await page.keyboard.press('Escape');
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  dialog = page.locator('dialog.data-dialog');
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await expect(dialog.getByRole('button', { name: 'Send code', exact: true })).toBeDisabled();
  await page.reload();
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await expect(dialog.getByRole('button', { name: 'Send code', exact: true })).toBeDisabled();
  await dialog.getByPlaceholder('Code from the email').fill('123456');
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  await page.clock.fastForward(61_000);
  await expect(dialog.getByRole('button', { name: 'Send code', exact: true })).toBeEnabled();
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.some(url => url.endsWith('/yostar/send-code'))).toBe(false); // Reload resets fixtures, not the cooldown.
});

test('an unconfirmed email never resends automatically and keeps saved-token Import usable', async ({ page }) => {
  await page.clock.install();
  await stubServers(page, 120, 0, 0, false, true, 'en', { count: 99, message: 'Request failed with error code 28: Operation timed out' });
  await seedSavedLogin(page);
  const dialog = await openImport(page);
  const saved = await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'));
  await dialog.getByRole('button', { name: 'Request code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Check your email');
  await expect(dialog.getByRole('button', { name: 'Request code', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBe(saved);
  await page.clock.fastForward(61_000);
  expect((await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).filter(url => url.endsWith('/yostar/send-code'))).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
});

test('a code request updates the resend cooldown in another open tab', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'storage events are independent of viewport');
  await stubServers(page, 120, 0, 0, false, true);
  const other = await context.newPage();
  try {
    await stubServers(other, 120, 0, 0, false, true);
    const first = await openImport(page);
    const second = await openImport(other);
    await first.getByPlaceholder('Yostar email').fill(EMAIL);
    await second.getByPlaceholder('Yostar email').fill(EMAIL);
    await first.getByRole('button', { name: 'Send code', exact: true }).click();
    await expect(first.locator('.import-sent')).toBeVisible();
    await expect(second.getByRole('button', { name: 'Send code', exact: true })).toBeDisabled();
    await second.getByPlaceholder('Code from the email').fill('123456');
    await expect(second.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
    expect((await other.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).some(url => url.endsWith('/yostar/send-code'))).toBe(false);
  } finally { await other.close(); }
});

test('public settings use the website cache while account requests keep the encrypted transport', async ({ page }) => {
  await stubServers(page, 120, 0, 0, false, true);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/account-import/network')) requests.push(request.url()); });
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).search).toBe('?server=en');
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.some(url => url.includes('ak-conf.'))).toBe(false);
  expect(asked.filter(url => url.endsWith('/yostar/send-code'))).toHaveLength(1);
  expect(asked.filter(url => url.endsWith('/account/syncData'))).toHaveLength(1);
});

test('background settings recover independently of sending a code', async ({ page }) => {
  await stubServers(page, 120, 0, 2);
  const dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.locator('.import-sent')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.locator('.import-steps')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __asked: string[] }).__asked.filter(url => url.endsWith('/network_config')).length)).toBe(3);
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.filter(url => url.endsWith('/network_config'))).toHaveLength(3);
  expect(asked.filter((url) => url.endsWith('/yostar/send-code'))).toHaveLength(1);
});

test('an import settings failure can be retried without sending or spending a code', async ({ page }) => {
  await stubServers(page, 120, 0, 3);
  const dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByPlaceholder('Code from the email').fill('123456');
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('error code 7');
  expect(await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).toHaveLength(3);
  await dialog.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.locator('.import-step').first()).toHaveClass(/import-step-done/);
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked).toHaveLength(4);
  expect(asked.every((url) => url.endsWith('/network_config'))).toBe(true);
});

/** /account's Import / export, open on the sign-in. */
async function openImport(page: Page) {
  await page.goto('/account');
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.locator('dialog.data-dialog');
  await dialog.locator('.import-forms, .import-saved').first().waitFor();
  return dialog;
}

/** Email, code, Import: the whole sign-in. */
async function signIn(page: Page) {
  const dialog = page.locator('dialog.data-dialog');
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.locator('.import-sent')).toContainText('Yostar has emailed a code');
  await dialog.getByPlaceholder('Code from the email').fill('123456');
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
}

test('the import says, above the email field, which email to use and what any other does', async ({ page }) => {
  await stubServers(page, 120);
  const dialog = await openImport(page);
  const notice = dialog.locator('.import-yostar');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Use the email that is already the Yostar login of your Arknights account.');
  await expect(notice).toContainText('makes Yostar create a separate, empty account for it');
  await expect(notice).toContainText('Undoing that takes several steps in the game.');
  await expect(notice).toContainText('check in the game which login you use first (Settings → Account)');
  // Read before the field: above it, with nothing typed yet.
  const [noticeBox, fieldBox] = await Promise.all([notice.boundingBox(), dialog.getByPlaceholder('Yostar email').boundingBox()]);
  expect(noticeBox && fieldBox && noticeBox.y + noticeBox.height <= fieldBox.y).toBe(true);
});

test('a level-1 account imports through the previous flow', async ({ page }) => {
  await stubServers(page, 1);
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arkpediaAccount') ?? 'null'))).toMatchObject({ server: 'en' });
});

test('a successful Yostar login marked IsNew continues to the game as before', async ({ page }) => {
  await stubServers(page, 120, 1);
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('a refused game token keeps the previous error and does not import', async ({ page }) => {
  await stubServers(page, null);
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.getByRole('alert')).toHaveText('the game refused the Yostar sign-in (result 2)');
  await expect(dialog.locator('.import-step-failed')).toContainText('Get a game token');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBeNull();
});

test('the same sign-in with a linked account (level 120) imports it', async ({ page }) => {
  await stubServers(page, 120);
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arkpediaAccount') ?? 'null'))).toMatchObject({ server: 'en', doctor: 'Doctor#0001' });
});


test('a sign-in the reader asks to save reopens with saved sign-in actions', async ({ page }, testInfo) => {
  await stubServers(page, 120);
  let dialog = await openImport(page);
  await dialog.getByLabel('Save this sign-in on this browser').check();
  await signIn(page);
  await expect(dialog.locator('.import-saved')).toContainText('Global');
  await expect(dialog.locator('.import-forms')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Import again', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeFocused();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin') ?? 'null'))).toMatchObject({ server: 'en', email: EMAIL, token: 'yostar-token' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  dialog = await openImport(page);
  await expect(dialog.locator('.import-saved')).toBeVisible();
  await expect(dialog.locator('.import-steps')).toHaveCount(0);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/saved-${testInfo.project.name}.png` });
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.some(url => url.includes('sdk-api'))).toBe(false);
});

async function seedSavedLogin(page: Page, server: ServerId = 'en') {
  await page.goto('/account');
  await page.evaluate(({ email, server }) => {
    localStorage.setItem('arkpediaYostarLogin', JSON.stringify({ server, email, uid: '4242', token: 'yostar-token', authToken: 'code-token', deviceId: 'fixture-device' }));
  }, { email: EMAIL, server });
}

test('by default nothing is saved, and the email login stays for the next import', async ({ page }, testInfo) => {
  await stubServers(page, 120);
  let dialog = await openImport(page);
  await expect(dialog.getByLabel('Save this sign-in on this browser'), 'saving a sign-in is opt-in').not.toBeChecked();
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/email-${testInfo.project.name}.png` });
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBeNull();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  dialog = await openImport(page);
  await expect(dialog.getByPlaceholder('Yostar email')).toBeVisible();
  await expect(dialog.locator('.import-saved')).toHaveCount(0);
});

test('forgetting Yostar login keeps imported accounts, favourites and the document', async ({ page }) => {
  await stubServers(page, 120); await seedSavedLogin(page);
  const dialog = await openImport(page);
  await page.evaluate(() => { localStorage.setItem('musicFavorites', '["keep"]'); localStorage.setItem('private-import-data', 'keep'); });
  await markDocument(page);
  await dialog.getByRole('button', { name: 'Forget Yostar login', exact: true }).click();
  await expect(dialog.getByPlaceholder('Yostar email')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('["keep"]');
  expect(await page.evaluate(() => localStorage.getItem('private-import-data'))).toBe('keep');
  expect(await sameDocument(page)).toBe(true);
});

test('a refused Yostar-login removal keeps the saved identity visible and reports failure', async ({ page }) => {
  await stubServers(page, 120); await seedSavedLogin(page);
  const dialog = await openImport(page);
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      if (key === 'arkpediaYostarLogin') throw new DOMException('Blocked', 'SecurityError');
      return remove.call(this, key);
    };
  });
  await dialog.getByRole('button', { name: 'Forget Yostar login', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not forget the saved Yostar login');
  await expect(dialog.locator('.import-saved')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).not.toBeNull();
});

test('browser clearing has a separate scoped confirmation and cancelling keeps data', async ({ page }) => {
  await stubServers(page, 120);
  await seedSavedLogin(page);
  const dialog = await openImport(page);
  await expect(dialog.getByRole('button', { name: /^Forget/ })).toHaveCount(1);
  const before = await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'));
  await dialog.getByRole('tab', { name: 'Browser data', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear browser data', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Clear this browser?', exact: true });
  await expect(confirmation).toContainText('every imported game account and saved Yostar sign-in');
  await expect(confirmation).toContainText('planner edits, story progress, music playlists and preferences');
  await expect(confirmation).toContainText('Your Arkpedia account and cloud saves are kept.');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Game import', exact: true }).click();
  await expect(dialog.locator('.import-saved')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBe(before);
});

test('an expired saved sign-in returns to code login without sending a code', async ({ page }) => {
  await stubServers(page, null);
  await seedSavedLogin(page);
  const dialog = await openImport(page);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Your saved sign-in no longer works');
  await expect(dialog.getByPlaceholder('Yostar email')).toHaveValue(EMAIL);
  await expect(dialog.getByPlaceholder('Yostar email')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBeNull();
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.some(url => url.includes('sdk-api'))).toBe(false);
});

for (const server of ['jp', 'kr'] as const) {
  test(`a saved ${server} sign-in restores its region and cannot import into Global`, async ({ page }) => {
    await stubServers(page, 120, 0, 0, false, true, server);
    await seedSavedLogin(page, server);
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/account-import/network')) requests.push(request.url()); });
    const dialog = await openImport(page);
    await expect(dialog.getByRole('button', { name: SERVERS[server].label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Global', exact: true }).click();
    await expect(dialog.locator('.import-forms')).toBeVisible();
    await expect(dialog.locator('.import-saved')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: SERVERS[server].label, exact: true }).click();
    await expect(dialog.locator('.import-saved')).toContainText(SERVERS[server].label);
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arkpediaAccount') ?? 'null'))).toMatchObject({ server });
    const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
    expect(asked).toContain(`${SERVERS[server].accountCenter}/api/user/login`);
    expect(asked.some(url => url.includes('sdk-api') || url.includes('account.yo-star.com'))).toBe(false);
    expect(requests.some(url => new URL(url).search === `?server=${server}`)).toBe(true);
  });
}

test('clearing browser data removes all stored categories and returns to email login', async ({ page }) => {
  await stubServers(page, 120);
  let dialog = await openImport(page);
  await dialog.getByLabel('Save this sign-in on this browser').check();
  await signIn(page);
  await expect(dialog.locator('.import-saved')).toBeVisible();
  const keys = [...BACKUP_STORES.map(store => store.key), STORY_PROGRESS_KEY, 'theme', 'arkpediaYostarLogin', 'future-private-data'];
  await page.evaluate(keys => {
    // Include future data without a known key: resetting must not silently leave it behind.
    for (const key of keys) if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ private: true }));
    sessionStorage.setItem('private-session-data', 'private');
  }, keys);
  await dialog.getByRole('tab', { name: 'Browser data', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear browser data', exact: true }).click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.getByRole('dialog', { name: 'Clear this browser?', exact: true }).getByRole('button', { name: 'Clear browser data', exact: true }).click(),
  ]);
  expect(await page.evaluate(keys => keys.filter(key => localStorage.getItem(key) !== null), keys)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('private-session-data'))).toBeNull();
  dialog = await openImport(page);
  await expect(dialog.locator('.import-forms')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Forget Yostar login', exact: true })).toHaveCount(0);
});

test('browser clearing is available without a saved sign-in and reports refused storage', async ({ page }) => {
  await stubServers(page, 120);
  await page.addInitScript(() => {
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function () {
      if (this === localStorage) throw new DOMException('Blocked', 'SecurityError');
      return clear.call(this);
    };
  });
  const dialog = await openImport(page);
  await page.evaluate(() => localStorage.setItem('private-planner-data', 'keep until clearing succeeds'));
  await dialog.getByRole('tab', { name: 'Browser data', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear browser data', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Clear this browser?', exact: true });
  await confirmation.getByRole('button', { name: 'Clear browser data', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('could not clear all saved data');
  expect(await page.evaluate(() => localStorage.getItem('private-planner-data'))).toBe('keep until clearing succeeds');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Game import', exact: true }).click();
  await expect(dialog.locator('.import-forms')).toBeVisible();
});

test('browser clearing resets other open tabs and does not restore their playing music', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'the cross-tab reset is independent of viewport');
  await stubServers(page, 120);
  await seedSavedLogin(page);
  const other = await context.newPage();
  await stubServers(other, 120);
  await stubYouTube(other, 'allow', { dataSaver: false });
  await page.evaluate(() => localStorage.setItem('arkpediaMusicDataSaver', 'true'));
  await other.addInitScript(() => { if (performance.getEntriesByType('navigation')[0]?.toJSON().type !== 'reload') localStorage.setItem('arkpediaMusicDataSaver', 'true'); });
  await other.goto('/account');
  await startMusic(other);
  await markDocument(other);
  await other.evaluate(() => sessionStorage.setItem('private-other-tab', 'private'));
  const dialog = await openImport(page);
  await dialog.getByRole('tab', { name: 'Browser data', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear browser data', exact: true }).click();
  await markDocument(page);
  await page.getByRole('dialog', { name: 'Clear this browser?', exact: true }).getByRole('button', { name: 'Clear browser data', exact: true }).click();
  // Observe the resulting documents instead of the first provisional navigation:
  // cross-tab storage resets can supersede an in-flight navigation.
  for (const tab of [page, other]) {
    await expect.poll(async () => {
      try { return !(await sameDocument(tab)) && await tab.evaluate(() => document.readyState !== 'loading'); }
      catch { return false; } // The old execution context is being retired.
    }).toBe(true);
  }
  expect(await sameDocument(other)).toBe(false);
  for (const tab of [page, other]) {
    expect(await tab.evaluate(() => ({ login: localStorage.getItem('arkpediaYostarLogin'), resume: sessionStorage.getItem('arkpediaMusicResume'), other: sessionStorage.getItem('private-other-tab') }))).toEqual({ login: null, resume: null, other: null });
    await expect(tab.locator('.music-player').getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  }
  await other.close();
});

for (const server of ['en', 'jp', 'kr'] as const) {
  test(`Request code uses the saved ${server} address and region without importing`, async ({ page }, testInfo) => {
    await stubServers(page, 120, 0, 99, false, false, server);
    await seedSavedLogin(page, server);
    const dialog = await openImport(page);
    const before = await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'));
    await dialog.getByRole('button', { name: 'Request code', exact: true }).click();
    await expect(dialog.locator('.import-sent')).toContainText('emailed a code to your saved address');
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeFocused();
    await expect(dialog.locator('.import-forms, .import-steps')).toHaveCount(0);
    if (server === 'en' && process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/requested-code-${testInfo.project.name}.png` });
    const requests = await page.evaluate(() => (window as unknown as { __requests: { url: string; body: string; headers: Record<string, string> }[] }).__requests);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${SERVERS[server].yostar}/yostar/send-code`);
    expect(JSON.parse(requests[0].body).Account).toBe(EMAIL);
    expect(JSON.parse(requests[0].headers.Authorization).Head).toMatchObject({ PID: SERVERS[server].pid, DeviceID: 'fixture-device' });
    expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBeNull();
  });
}

test('a saved-sign-in code refusal keeps Import available without retrying or discarding the token', async ({ page }) => {
  await stubServers(page, 120, 0, 0, true, true);
  await seedSavedLogin(page);
  const dialog = await openImport(page);
  const before = await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'));
  await dialog.getByRole('button', { name: 'Request code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Yostar is limiting email-code requests');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBe(before);
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.filter(url => url.endsWith('/yostar/send-code'))).toHaveLength(1);
  expect(asked.some(url => url.endsWith('/yostar/get-auth'))).toBe(false);
});

test('a code already received imports without requesting another code', async ({ page }) => {
  await stubServers(page, 120);
  const dialog = await openImport(page);
  const submit = dialog.getByRole('button', { name: 'Import', exact: true });
  const code = dialog.getByPlaceholder('Code from the email');
  await expect(code).toBeEnabled();
  await code.fill('123456');
  await expect(submit).toBeDisabled();
  await dialog.getByPlaceholder('Yostar email').fill('not-an-email');
  await expect(submit).toBeDisabled();
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.some(url => url.endsWith('/yostar/send-code'))).toBe(false);
  expect(asked.filter(url => url.endsWith('/yostar/get-auth'))).toHaveLength(1);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arkpediaAccount') ?? 'null'))).toMatchObject({ server: 'en', doctor: 'Doctor#0001' });
});

test('a send-code refusal keeps existing-code import available without an automatic resend', async ({ page }, testInfo) => {
  await stubServers(page, 120, 0, 0, true);
  const dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Yostar is limiting email-code requests');
  await expect(dialog.getByRole('alert')).toContainText('already received for this account and server');
  if (process.env.ARKPEDIA_QA_CAPTURE) {
    await dialog.getByRole('alert').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/code-refusal-${testInfo.project.name}.png` });
  }
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBeNull();
  const code = dialog.getByPlaceholder('Code from the email');
  await expect(code).toBeEnabled();
  await code.fill('123456');
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.filter(url => url.endsWith('/yostar/send-code'))).toHaveLength(1);
  expect(asked.filter(url => url.endsWith('/yostar/get-auth'))).toHaveLength(1);
});
