import { expect, test, type Page } from '@playwright/test';
import { SERVERS, type ServerId } from '../../lib/account-import/yostar';
import { readOnly } from './census-routes';

/* The previous email-code flow, with the Yostar email notice kept. All server answers are
 * fixtures: these checks never send a code or sign in to a real account. */

const EMAIL = 'player@example.invalid';
const VERSION = 'https://hv.example.invalid/Android/version';

test.beforeEach(async ({ page }, testInfo) => {
  // Arkpedia follows its stored theme, rather than the browser's colour-scheme preference.
  await page.addInitScript(theme => localStorage.setItem('theme', theme), testInfo.project.use.colorScheme === 'light' ? 'light' : 'dark');
});

/** The stand-in transport, answering as the servers do: the account at `level`, or the game's
 *  token exchange refusing the login (`level: null`). */
async function stubServers(page: Page, level: number | null, isNew = 0, networkFailures = 0, sendCodeRefused = false, cachedNetwork = false, server: ServerId = 'en') {
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
  await page.addInitScript(({ level, isNew, networkFailures, sendCodeRefused, region }) => {
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
    Object.assign(window, { __asked: asked });
    window.__arkpediaImportTransport = async (url) => {
      asked.push(url);
      if (url.endsWith('/network_config') && networkFailures-- > 0) throw new Error('Request failed with error code 7: Could not connect to server');
      const answer = answers[url];
      return answer ? { status: 200, json: answer.json, headers: answer.headers ?? [] } : { status: 404, json: null, headers: [] };
    };
  }, { level, isNew, networkFailures, sendCodeRefused, region: SERVERS[server] });
}

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

test('a temporary server-list connection failure recovers before sending a code', async ({ page }) => {
  await stubServers(page, 120, 0, 2);
  const dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.locator('.import-sent')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.slice(0, 3).every((url) => url.endsWith('/network_config'))).toBe(true);
  expect(asked.filter((url) => url.endsWith('/yostar/send-code'))).toHaveLength(1);
});

test('a failed connection can be retried without sending or spending a code', async ({ page }) => {
  await stubServers(page, 120, 0, 6);
  const dialog = await openImport(page);
  await dialog.getByPlaceholder('Yostar email').fill(EMAIL);
  await expect(dialog.getByRole('alert')).toContainText('error code 7');
  // Sending after the failed preflight attempts the connection again, before asking Yostar.
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('error code 7');
  expect(await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).toHaveLength(6);
  await dialog.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.locator('.import-step').first()).toHaveClass(/import-step-done/);
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked).toHaveLength(7);
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


test('successful sign-in saves by default and reopening offers only Import', async ({ page }, testInfo) => {
  await stubServers(page, 120);
  let dialog = await openImport(page);
  await expect(dialog.getByLabel('Don’t save this sign-in on this browser')).not.toBeChecked();
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
  await page.addInitScript(({ email, server }) => {
    // Seed once, so a later reload cannot silently restore forgotten credentials.
    if (!sessionStorage.getItem('seeded-sign-in')) {
      localStorage.setItem('arkpediaYostarLogin', JSON.stringify({ server, email, uid: '4242', token: 'yostar-token', authToken: 'code-token', deviceId: 'fixture-device' }));
      sessionStorage.setItem('seeded-sign-in', '1');
    }
  }, { email: EMAIL, server });
}

test('opting out leaves the email login available after a successful import', async ({ page }, testInfo) => {
  await stubServers(page, 120);
  let dialog = await openImport(page);
  await dialog.getByLabel('Don’t save this sign-in on this browser').check();
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/email-${testInfo.project.name}.png` });
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBeNull();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  dialog = await openImport(page);
  await expect(dialog.getByPlaceholder('Yostar email')).toBeVisible();
  await expect(dialog.locator('.import-saved')).toHaveCount(0);
});

test('forgetting a saved sign-in returns focus to an empty email login', async ({ page }) => {
  await stubServers(page, 120);
  await seedSavedLogin(page);
  let dialog = await openImport(page);
  await dialog.getByRole('button', { name: 'Forget sign-in', exact: true }).click();
  await expect(dialog.getByPlaceholder('Yostar email')).toBeFocused();
  await expect(dialog.getByPlaceholder('Yostar email')).toHaveValue('');
  await expect(dialog.getByLabel('Don’t save this sign-in on this browser')).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBeNull();
  dialog = await openImport(page);
  await expect(dialog.locator('.import-forms')).toBeVisible();
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

test('forgetting the imported account also removes its saved Import action', async ({ page }) => {
  await stubServers(page, 120);
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.locator('.import-saved')).toBeVisible();
  await dialog.getByRole('button', { name: 'Forget this account', exact: true }).click();
  await expect(dialog.locator('.import-saved')).toHaveCount(0);
  await expect(dialog.locator('.import-forms')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('arkpediaYostarLogin'))).toBeNull();
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
