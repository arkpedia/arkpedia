import { expect, test, type Page } from '@playwright/test';
import { readOnly } from './census-routes';

/*
 * The sign-in from the game (components/account-import/GameSignIn) in the Account page's
 * Import / export, driven end to end with every answer made up here: Yostar, the game and the
 * Account Center are a stand-in transport the page reads in place of the relay
 * (window.__arkpediaImportTransport, lib/account-import/relay.ts), so nothing reaches Yostar,
 * the game or relay.arkpedia.net. People who play through Google typed their Gmail, and Yostar's
 * email code made it a new Yostar account with a new, empty game account (level 1), which the
 * import then wrote over theirs (2026-10). The notice says first which email to use and what
 * any other does; a level-1 account, or a game that gives the login no account, imports nothing
 * and says how to undo it.
 */

const EMAIL = 'player@example.invalid';
const VERSION = 'https://hv.example.invalid/Android/version';

/** The stand-in transport, answering as the servers do: the account at `level`, or the game's
 *  token exchange refusing the login (`level: null`). */
async function stubServers(page: Page, level: number | null) {
  await readOnly(page);
  // The relay is never opened: the page's transport is the stand-in.
  await page.routeWebSocket(/relay\.arkpedia\.net/, (socket) => socket.close());
  // The game's version file is the one request the page makes itself (directTransport).
  await page.route(VERSION, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ resVersion: '00-00-00', clientVersion: '0.0.0' }) }));
  await page.addInitScript((level) => {
    const network = { u8: 'https://u8.example.invalid', gs: 'https://gs.example.invalid', hv: 'https://hv.example.invalid/{0}/version' };
    const answers: Record<string, { json: unknown; headers?: [string, string][] }> = {
      'https://ak-conf.arknights.global/config/prod/official/network_config': { json: { content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network } } }) } },
      'https://en-sdk-api.yostarplat.com/yostar/send-code': { json: { Code: 200, Data: {} } },
      'https://en-sdk-api.yostarplat.com/yostar/get-auth': { json: { Code: 200, Data: { Token: 'code-token' } } },
      'https://en-sdk-api.yostarplat.com/user/login': { json: { Code: 200, Data: { UserInfo: { ID: 4242, Token: 'yostar-token' } } } },
      'https://u8.example.invalid/user/v1/getToken': { json: level === null ? { result: 2 } : { result: 0, token: 'u8-token', uid: '1' } },
      'https://gs.example.invalid/account/login': { json: { result: 0, secret: 'session', uid: '1' } },
      'https://gs.example.invalid/account/syncData': { json: { result: 0, user: { status: { level, nickName: level === 1 ? '' : 'Doctor', nickNumber: '0001' }, troop: { chars: {} } } } },
      'https://account.yo-star.com/api/user/login': { json: { code: 0 }, headers: [['Set-Cookie', 'YSSID=session-id; Path=/'], ['Set-Cookie', 'YSSID.sig=session-sig; Path=/']] },
      'https://account.yo-star.com/api/game/gachas?key=ark&index=1&size=50': { json: { code: 0, data: { rows: [] } } },
    };
    const asked: string[] = [];
    Object.assign(window, { __asked: asked });
    window.__arkpediaImportTransport = async (url) => {
      asked.push(url);
      const answer = answers[url];
      return answer ? { status: 200, json: answer.json, headers: answer.headers ?? [] } : { status: 404, json: null, headers: [] };
    };
  }, level);
}

/** /account's Import / export, open on the sign-in. */
async function openImport(page: Page) {
  await page.goto('/account');
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.locator('dialog.data-dialog');
  await dialog.locator('.import-forms').waitFor();
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
  await expect(notice).toContainText('makes Yostar create a separate, empty account for it, and nothing is imported');
  await expect(notice).toContainText('Undoing that takes several steps in the game.');
  await expect(notice).toContainText('check in the game which login you use first (Settings → Account)');
  // Read before the field: above it, with nothing typed yet.
  const [noticeBox, fieldBox] = await Promise.all([notice.boundingBox(), dialog.getByPlaceholder('Yostar email').boundingBox()]);
  expect(noticeBox && fieldBox && noticeBox.y + noticeBox.height <= fieldBox.y).toBe(true);
});

/** The way back, as the failure lists it, and that nothing was imported. */
async function expectNothingImported(page: Page, step: RegExp) {
  const dialog = page.locator('dialog.data-dialog');
  const error = dialog.getByRole('alert');
  await expect(error).toContainText('no Arknights account, so nothing was imported');
  await expect(error).toContainText('It may have just been created by this login');
  await expect(error.locator('ol > li')).toHaveText([
    'Sign in to Arknights with this email. This makes a game account on it.',
    'Play until the game lets you delete that account, then delete it.',
    'Sign back in to the game with Google or Apple, your real account.',
    'Link this email to it as its Yostar login (Settings → Account), then import here with it.',
  ]);
  await expect(dialog.locator('.import-step-failed')).toHaveText(step);
  // Nothing written over the reader's: no account, no import line, the pull history never asked for.
  await expect(dialog.locator('.import-note[role="status"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBeNull();
  const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
  expect(asked.some((url) => url.startsWith('https://account.yo-star.com/'))).toBe(false);
  return { error, asked };
}

test('a Yostar login the game opens a new, empty account for (level 1) imports nothing and says how to undo it', async ({ page }) => {
  await stubServers(page, 1);
  await openImport(page);
  await signIn(page);
  const { error, asked } = await expectNothingImported(page, /Read the account/);
  await expect(error).toContainText('This Yostar account has no Arknights account');
  await expect(error).toContainText('What the game said: the game opened a new, empty level-1 account for this login.');
  await expect(error).not.toContainText('the game was most likely unavailable');
  expect(asked).toContain('https://gs.example.invalid/account/syncData');
});

test('a Yostar login the game gives no account imports nothing and says the same, as a likelihood', async ({ page }) => {
  await stubServers(page, null);
  await openImport(page);
  await signIn(page);
  const { error, asked } = await expectNothingImported(page, /Get a game token/);
  await expect(error).toContainText('This Yostar account may have no Arknights account');
  // A refusal may be the game being down for a real login: the steps, which delete an account,
  // are only for an email that is not the game's login.
  await expect(error).toContainText('If this email is the login you already use in the game, the game was most likely unavailable: try again later.');
  await expect(error).toContainText('What the game said: the game refused the Yostar sign-in (result 2).');
  expect(asked).not.toContain('https://gs.example.invalid/account/login');
});

test('the same sign-in with a linked account (level 120) imports it', async ({ page }) => {
  await stubServers(page, 120);
  const dialog = await openImport(page);
  await signIn(page);
  await expect(dialog.locator('.import-note[role="status"]')).toContainText('Imported:');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arkpediaAccount') ?? 'null'))).toMatchObject({ server: 'en', doctor: 'Doctor#0001' });
});
