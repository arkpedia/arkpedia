import { expect, test } from '@playwright/test';
import { readOnly } from './census-routes';
import relay from '../../config/relay.json';

test('a blocked real relay socket produces a login-free copyable report', async ({ page, context }) => {
  await readOnly(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/account-import/network?server=*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network: {
    u8: 'https://as.arknights.global', gs: 'https://gs.arknights.global:8443', hv: 'https://hv.example.invalid/{0}/version',
  } } } }) }) }));
  let sockets = 0;
  await page.routeWebSocket(url => [relay.url, relay.previewUrl].includes(url.href), socket => {
    sockets++;
    socket.close({ code: 1008, reason: 'Private fixture relay blocked' });
  });
  await page.goto('/account?importDiagnostics=1', { waitUntil: 'domcontentloaded' });
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.locator('dialog.data-dialog');
  await dialog.getByPlaceholder('Yostar email').fill('sensitive-address@example.invalid');
  await dialog.getByPlaceholder('Code from the email').fill('999999');
  await dialog.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Connection error 7', { timeout: 20000 });
  expect(sockets).toBe(2);
  await dialog.getByText('Connection diagnostics', { exact: true }).click();
  const raw = await dialog.getByLabel('Diagnostic report', { exact: true }).inputValue();
  const report = JSON.parse(raw);
  expect(report.attempts).toHaveLength(2);
  expect(report.attempts.every((a: { leg: string }) => a.leg === 'browser-to-relay')).toBe(true);
  for (const secret of ['sensitive-address', '999999', 'Authorization', 'DeviceID', 'https://', 'wss://', 'Private fixture']) expect(raw).not.toContain(secret);
  await dialog.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Copied');
  // The Windows clipboard normalizes line endings; the copied report must retain
  // the complete structured payload on every platform.
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(report);
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Send code', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => /diagnostic/i.test(k)))).toBe(false);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // Reload clears only the in-memory report; the normal code pacing survives.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  await expect(dialog.getByText('Connection diagnostics', { exact: true })).toHaveCount(0);
});

test('a real Wisp upstream refusal is distinguished from browser-to-relay loss', async ({ page }) => {
  await readOnly(page);
  await page.route('**/api/account-import/network?server=*', route => route.fulfill({ status: 503, body: '{}' }));
  // A protocol fixture terminates every tunnel before any TLS or login data can pass.
  await page.routeWebSocket(url => [relay.url, relay.previewUrl].includes(url.href), socket => {
    socket.send(Buffer.from([3, 0, 0, 0, 0, 8, 0, 0, 0]));
    socket.onMessage(data => {
      const packet = Buffer.from(data as Buffer);
      if (packet[0] !== 1) return;
      socket.send(Buffer.from([4, ...packet.subarray(1, 5), 68]));
    });
  });
  await page.goto('/account?importDiagnostics=1', { waitUntil: 'domcontentloaded' });
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.locator('dialog.data-dialog');
  // Focusing the email field reads only public settings; no code request is needed.
  await dialog.getByPlaceholder('Yostar email').focus();
  await dialog.getByText('Connection diagnostics', { exact: true }).waitFor();
  await dialog.getByText('Connection diagnostics', { exact: true }).click();
  const report = JSON.parse(await dialog.getByLabel('Diagnostic report', { exact: true }).inputValue());
  expect(report.attempts.at(-1)).toMatchObject({ leg: 'relay-to-upstream', wispReason: 68, relayHandshake: true });
});
