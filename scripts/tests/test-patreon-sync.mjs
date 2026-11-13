import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openTokens, sealTokens, syncPatreon, readSupporters, patreonSyncDiagnostic } from '../../lib/patreon/sync.mjs';
import { refreshDailyServices } from '../deploy/daily-refresh.mjs';

const now = Date.parse('2026-11-13T12:00:00Z');
function harness() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync('migrations/accounts/0019_patreon_supporters.sql', 'utf8'));
  const prepare = (sql, values = []) => ({ bind: (...args) => prepare(sql, args), first: async () => sqlite.prepare(sql).get(...values) ?? null, run: async () => ({ meta: sqlite.prepare(sql).run(...values) }) });
  const env = { ARKPEDIA_DEPLOYMENT_ROLE: 'production', ARKPEDIA_AUTH_URL: 'https://www.arkpedia.net', ARKPEDIA_ACCOUNTS_DB: { prepare }, PATREON_CAMPAIGN_ID: '123', PATREON_CLIENT_ID: 'fixture-client', PATREON_CLIENT_SECRET: 'fixture-client-secret-not-a-real-credential', PATREON_CREATOR_ACCESS_TOKEN: 'fixture-access', PATREON_CREATOR_REFRESH_TOKEN: 'fixture-refresh' };
  return { sqlite, env, state: () => sqlite.prepare('SELECT * FROM patreon_supporter_sync WHERE campaign_id = ?').get('123') };
}
const tiers = [{ type: 'tier', id: '10', attributes: { title: 'Cookies', amount_cents: 100 } }, { type: 'tier', id: '20', attributes: { title: 'Giant Cookies', amount_cents: 1000 } }];
const campaign = () => Response.json({ data: { type: 'campaign', id: '123' }, included: tiers });
const member = (id, name, status = 'active_patron', tierIds = ['10']) => ({ type: 'member', id, attributes: { full_name: name, patron_status: status, email: 'PRIVATE_EMAIL', note: 'PRIVATE_NOTE' }, relationships: { user: { data: { id: 'user-' + id, type: 'user' } }, currently_entitled_tiers: { data: tierIds.map(id => ({ id, type: 'tier' })) } } });
const user = (id, name, hidden = false) => ({ type: 'user', id: 'user-' + id, attributes: { full_name: name, hide_pledges: hidden, email: 'PRIVATE_EMAIL' } });
const page = (data, included, next = null, total = data.length) => Response.json({ data, included, meta: { pagination: { total, cursors: { next } } } });

test('first activation initializes only its own table, matching the additive migration', async () => {
  const h = harness();
  const columns = h.sqlite.prepare('PRAGMA table_info(patreon_supporter_sync)').all();
  h.sqlite.exec('DROP TABLE patreon_supporter_sync; CREATE TABLE existing_accounts (id TEXT); INSERT INTO existing_accounts VALUES (\'retained\')');
  assert.equal(await readSupporters(h.env), null);
  assert.deepEqual(h.sqlite.prepare('PRAGMA table_info(patreon_supporter_sync)').all(), columns);
  h.sqlite.exec(fs.readFileSync('migrations/accounts/0019_patreon_supporters.sql', 'utf8'));
  assert.equal(h.sqlite.prepare('SELECT id FROM existing_accounts').get().id, 'retained');
  h.sqlite.close();
});

test('complete paginated snapshots use the highest entitled tier and exclude masked, hidden, former and free members', async () => {
  const h = harness(); let calls = 0;
  const result = await syncPatreon(h.env, { now, fetch: async (input, options) => {
    const url = new URL(input); calls++;
    assert.equal(url.origin, 'https://www.patreon.com'); assert.match(options.headers.Authorization, /^Bearer fixture-access$/); assert.match(options.headers['User-Agent'], /Arkpedia/); assert.equal(options.redirect, 'manual');
    if (url.pathname.endsWith('/123')) return campaign();
    assert.equal(url.searchParams.get('fields[member]'), 'full_name,patron_status');
    if (!url.searchParams.has('page[cursor]')) return page([member('1', 'Alpha', 'active_patron', ['10', '20']), member('2', 'Private'), member('3', '')], [user('1', 'Alpha'), user('2', 'Private', true), user('3', '')], 'opaque-next', 5);
    assert.equal(url.searchParams.get('page[cursor]'), 'opaque-next');
    return page([member('4', 'Former', 'former_patron'), member('5', 'Free', null)], [user('4', 'Former'), user('5', 'Free')], null, 5);
  } });
  assert.equal(result.updated, true); assert.equal(calls, 3);
  const snapshot = await readSupporters(h.env);
  assert.deepEqual(snapshot['supporter-tier'].map(t => [t.name, t.supporters]), [['Giant Cookies', ['Alpha']], ['Cookies', []]]);
  assert(!JSON.stringify(snapshot).includes('PRIVATE')); assert(!JSON.stringify(snapshot).includes('user-'));
  assert(!h.state().token_envelope.includes('fixture-access'));
  let attempted = false; await syncPatreon(h.env, { now: now + 5000, fetch: () => { attempted = true; } }); assert.equal(attempted, false, 'same-day refresh is reused');
  h.sqlite.close();
});

test('token rotation is durable before a later failure, and the next attempt uses the new refresh pair', async () => {
  const h = harness(); let renewed = false;
  await assert.rejects(syncPatreon(h.env, { now, fetch: async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) { renewed = true; assert.equal(options.body.get('refresh_token'), 'fixture-refresh'); return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' }); }
    if (options.headers.Authorization === 'Bearer fixture-access') return new Response('', { status: 401 });
    assert.equal(options.headers.Authorization, 'Bearer rotated-access');
    if (url.pathname.endsWith('/123')) return campaign();
    return new Response('PRIVATE_BODY_MUST_NOT_BE_LOGGED', { status: 503 });
  } }), /HTTP 503/);
  assert(renewed); assert.equal(h.state().snapshot_json, null);
  assert.deepEqual(await openTokens(h.state().token_envelope, h.env), { access: 'rotated-access', refresh: 'rotated-refresh' });
  await syncPatreon(h.env, { now: now + 3600_001, fetch: async (input, options) => {
    assert.equal(options.headers.Authorization, 'Bearer rotated-access');
    return new URL(input).pathname.endsWith('/123') ? campaign() : page([], []);
  } });
  assert.equal((await readSupporters(h.env))['supporter-tier'][0].supporters.length, 0);
  h.sqlite.close();
});

test('provider failure keeps the last complete snapshot and applies a retry cooldown', async () => {
  const h = harness();
  const good = async input => new URL(input).pathname.endsWith('/123') ? campaign() : page([member('1', 'Alpha')], [user('1', 'Alpha')]);
  await syncPatreon(h.env, { now, fetch: good }); const before = h.state().snapshot_json;
  await assert.rejects(syncPatreon(h.env, { now: now + 86400_000, fetch: async () => new Response('PRIVATE_ERROR', { status: 429 }) }), /HTTP 429/);
  assert.equal(h.state().snapshot_json, before); assert.equal(h.state().lease_id, null);
  let called = false; await syncPatreon(h.env, { now: now + 86400_001, fetch: () => { called = true; } }); assert.equal(called, false);
  h.sqlite.close();
});

test('an incomplete page or privacy field cannot erase the previous acknowledgements', async () => {
  for (const bad of [() => page([], [], null, 10), () => page([member('1', 'Alpha')], [{ type: 'user', id: 'user-1', attributes: { full_name: 'Alpha' } }])]) {
    const h = harness();
    await assert.rejects(syncPatreon(h.env, { now, fetch: async input => new URL(input).pathname.endsWith('/123') ? campaign() : bad() }), /complete membership|privacy fields/);
    assert.equal(h.state().snapshot_json, null); h.sqlite.close();
  }
});

test('only one concurrent request owns the lease, and Preview never calls Patreon', async () => {
  const h = harness(); let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = syncPatreon(h.env, { now, fetch: async input => { calls++; if (new URL(input).pathname.endsWith('/123')) { await pending; return campaign(); } return page([], []); } });
  await new Promise(resolve => setImmediate(resolve));
  const second = await syncPatreon(h.env, { now, fetch: () => { throw Error('duplicate fetch'); } });
  assert(second.skipped); release(); await first; assert.equal(calls, 2);
  assert.deepEqual(await syncPatreon({ ...h.env, ARKPEDIA_DEPLOYMENT_ROLE: 'staging' }, { now, fetch: () => { throw Error('production access'); } }), { configured: false });
  h.sqlite.close();
});

test('encrypted credentials are authenticated and scoped to the campaign and client secret', async () => {
  const h = harness(); const tokens = { access: 'not-public-access', refresh: 'not-public-refresh' };
  const sealed = await sealTokens(tokens, h.env); assert(!sealed.includes(tokens.refresh)); assert.deepEqual(await openTokens(sealed, h.env), tokens);
  await assert.rejects(openTokens(sealed, { ...h.env, PATREON_CLIENT_SECRET: 'different-secret' }));
  await assert.rejects(openTokens(sealed, { ...h.env, PATREON_CAMPAIGN_ID: '999' }));
  h.sqlite.close();
});

test('daily statistics and Patreon refresh independently, with visible failures', async () => {
  const calls = [];
  await assert.rejects(refreshDailyServices({}, { statistics: async () => { calls.push('statistics'); throw Error('cohort failed'); }, patreon: async () => { calls.push('patreon'); } }), /Statistics: cohort failed/);
  assert.deepEqual(calls, ['statistics', 'patreon']);
  await assert.rejects(refreshDailyServices({}, { statistics: async () => {}, patreon: async () => { throw Error('HTTP 503'); } }), /Patreon: HTTP 503/);
});


test('failed bootstrap reports cooldown, stores only a safe code and recovers without losing tokens', async () => {
  const h = harness();
  const error = await syncPatreon(h.env, { now, bootstrapOnly: true, fetch: async () => new Response('PRIVATE_PROVIDER_BODY', { status: 403 }) }).catch(error => error);
  assert.equal(patreonSyncDiagnostic(error), 'CAMPAIGN_HTTP_403');
  assert.equal(h.state().retry_after, now + 300_000);
  await assert.rejects(readSupporters(h.env, { now: now + 1000 }), /cooling down/);
  const stored = h.sqlite.prepare('SELECT error_code, failed_at, recovered_at FROM patreon_sync_diagnostics').get();
  assert.equal(stored.error_code, 'CAMPAIGN_HTTP_403'); assert.equal(stored.failed_at, now); assert.equal(stored.recovered_at, null);
  assert(!JSON.stringify(stored).includes('PRIVATE')); assert(!JSON.stringify(stored).includes('fixture-access'));
  let calls = 0;
  await syncPatreon(h.env, { now: now + 299_999, bootstrapOnly: true, fetch: () => { calls++; } }); assert.equal(calls, 0);
  await syncPatreon(h.env, { now: now + 300_001, bootstrapOnly: true, fetch: async input => new URL(input).pathname.endsWith('/123') ? campaign() : page([], []) });
  assert((await readSupporters(h.env, { now: now + 300_001 })).updatedAt);
  assert.equal(h.sqlite.prepare('SELECT recovered_at FROM patreon_sync_diagnostics').get().recovered_at, now + 300_001);
  h.sqlite.close();
});

test('legacy first-sync cooldown is shortened once; last-good snapshots keep daily backoff', async () => {
  const h = harness();
  await assert.rejects(syncPatreon(h.env, { now, fetch: async () => new Response('', { status: 503 }) }));
  const encrypted = h.state().token_envelope;
  assert.equal(await readSupporters(h.env, { now: now + 300_001 }), null);
  assert.equal(h.state().retry_after, now + 300_000);
  assert.equal(h.state().token_envelope, encrypted);
  h.sqlite.prepare('UPDATE patreon_supporter_sync SET snapshot_json = ?, retry_after = ?').run(JSON.stringify({ updatedAt: new Date(now).toISOString(), 'supporter-tier': [] }), now + 3600_000);
  assert((await readSupporters(h.env, { now: now + 1000 })).updatedAt);
  assert.equal(h.state().retry_after, now + 3600_000);
  h.sqlite.close();
});

test('diagnostics never expose arbitrary errors or provider bodies', async () => {
  assert.equal(patreonSyncDiagnostic(Error('PRIVATE_CREDENTIAL_VALUE')), 'SYNC_FAILED');
  const h = harness();
  await assert.rejects(syncPatreon(h.env, { now, bootstrapOnly: true, fetch: async () => new Response('PRIVATE_HTML', { headers: { 'Content-Type': 'text/html' } }) }));
  assert.equal(h.sqlite.prepare('SELECT error_code FROM patreon_sync_diagnostics').get().error_code, 'RESPONSE_JSON_INVALID');
  h.sqlite.close();
});
