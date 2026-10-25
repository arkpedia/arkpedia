import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
// Runtime is Node 24; the application's older @types/node does not declare this module.
// @ts-expect-error node:sqlite is available in the supported CI runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import { makeSignature } from 'better-auth/crypto';
import { getAuthTables } from 'better-auth/db';
import { collectCloudData, fingerprint, personalData, restoreCloudData, validateCloudData } from '../../lib/cloud-account/data';
import { accountAuth, type AccountsEnv } from '../../lib/cloud-account/server';
import { createCloudAccountHandler } from '../../lib/cloud-account/api';
import { createAccountProfileHandler } from '../../lib/cloud-account/profile-api';
import { normalizeUsername, validateProfile } from '../../lib/cloud-account/profile';
import { syncDecision } from '../../lib/cloud-account/sync-policy';
import { archiveUploadChunks, mergePullArchives, parsePullArchives, type PullArchive } from '../../lib/account/pullArchive';
import { collectPullArchives, restorePullArchives } from '../../lib/account/pullArchiveStore';

const account = { version: 1, server: 'en', importedAt: '2026-10-24T12:00:00Z', doctor: 'Doctor', operators: ['Amiya'], skins: [], cleared: [] };
const archive = (uid = '123', rows = [{ at: 1000, pool: 'pool1', char: 'char_002_amiya', star: 5 }]): PullArchive =>
  ({ server: 'en', uid, doctor: 'Doctor#1234', history: { rows, pools: { pool1: 'Banner' }, names: { char_002_amiya: 'Amiya' }, readAt: '2026-10-24T12:00:00Z', error: null } });
function storage(entries: Record<string, string> = {}) {
  return { entries, getItem: (k: string) => entries[k] ?? null, setItem: (k: string, v: string) => { entries[k] = v; }, removeItem: (k: string) => { delete entries[k]; } } as Storage & { entries: Record<string, string> };
}

test('archive union keeps old draws, repeated operators and isolated game accounts without duplicating overlap', () => {
  const first = archive(); first.history.rows.push({ ...first.history.rows[0] });
  const partial = archive(); partial.history.rows.push({ at: 2000, pool: 'pool1', char: 'char_1', star: 6 });
  const merged = mergePullArchives([first], [partial]);
  assert.equal(merged[0].history.rows.length, 3);
  assert.deepEqual(mergePullArchives(merged, [partial]), merged);
  assert.equal(mergePullArchives(merged, [archive('456')]).length, 2);
  assert.equal(mergePullArchives(merged, [{ ...archive(), server: 'jp' }]).length, 2);
  const chunks = archiveUploadChunks(merged, [partial]);
  assert.equal(chunks[0][0].history.rows.length, 2, 'send full known multiplicity, not just one missing duplicate');
  assert.deepEqual(archiveUploadChunks(merged, merged), []);
  assert.throws(() => parsePullArchives([{ ...archive(), uid: 'email@example.invalid' }]));
});

test('archive restore unions both devices before a snapshot restore and never changes Yostar credentials', () => {
  const old = archive(), newer = archive(); newer.history.rows[0].at = 2000;
  const local = storage({ arkpediaAccount: JSON.stringify({ ...account, profile: { uid: '123' }, pulls: old.history }), arkpediaYostarLogin: 'PRIVATE' });
  restorePullArchives([newer], local);
  restoreCloudData({ musicFavorites: ['other-device'] }, false, local);
  assert.equal(collectPullArchives(local)[0].history.rows.length, 2);
  assert.equal(local.getItem('arkpediaYostarLogin'), 'PRIVATE');
  assert.equal(collectCloudData(local, false, false).arkpediaPullArchives, undefined);
  assert.deepEqual(collectCloudData(local, false, false), {});
  const snapshot = validateCloudData({ arkpediaAccount: { ...account, pulls: old.history } }, true, false);
  assert.equal((snapshot.arkpediaAccount as Record<string, unknown>).pulls, undefined);
});

test('large histories are independent of the snapshot budget and upload in bounded batches without trimming old pulls', () => {
  const large = archive();
  large.history.rows = Array.from({ length: 20_000 }, (_, index) => ({ at: 1750000000 + index, pool: 'pool1', char: 'char_002_amiya', star: 5 }));
  const raw = JSON.stringify({ ...account, profile: { uid: '123' }, pulls: large.history });
  assert.ok(new TextEncoder().encode(raw).length > 900_000);
  const local = storage({ arkpediaAccount: raw });
  const snapshot = collectCloudData(local, true);
  assert.equal((snapshot.arkpediaAccount as Record<string, unknown>).pulls, undefined);
  const archives = collectPullArchives(local), chunks = archiveUploadChunks(archives, []);
  assert.equal(archives[0].history.rows.length, 20_000);
  assert.equal(chunks.flatMap(chunk => chunk.flatMap(a => a.history.rows)).length, 20_000);
  assert.ok(chunks.every(chunk => new TextEncoder().encode(JSON.stringify(chunk)).length < 900_000));
  assert.equal(local.getItem('arkpediaAccount'), raw);
});

test('collector never reads Yostar credentials, even with game-data permission', () => {
  for (const optedIn of [false, true]) {
    const asked: string[] = [];
    const result = collectCloudData({ getItem: key => {
      asked.push(key);
      if (key === 'arkpediaYostarLogin') throw new Error('Credentials must never be read');
      return key === 'arkpediaAccount' ? JSON.stringify(account) : key === 'musicFavorites' ? '["msr:1"]' : null;
    } }, optedIn);
    assert.ok(!asked.includes('arkpediaYostarLogin'));
    assert.equal('arkpediaAccount' in result, optedIn);
    assert.deepEqual(result.musicFavorites, ['msr:1']);
  }
});

test('server rejects unsupported stores, nested credentials and game snapshots without permission', () => {
  assert.throws(() => validateCloudData({ arkpediaYostarLogin: { token: 'secret' } }, true));
  assert.throws(() => validateCloudData({ baseSetup_v2: { nested: { authToken: 'secret' } } }, true));
  assert.throws(() => validateCloudData({ arkpediaAccount: account }, false), /permission/);
  assert.throws(() => validateCloudData({ musicFavorites: 'not a list' }, false));
  assert.throws(() => validateCloudData({ musicFavorites: ['x'.repeat(900001)] }, false), /900 KB/);
});

test('personal saves strip imported planner starting builds and reward provenance', () => {
  const result = validateCloudData({
    plannerState: { selectedNames: ['Amiya'], builderStates: { Amiya: { elite: 2, level: 90, masteryTargets: { 0: 3 }, startingElite: 1, startingMasteryLevels: { 0: 1 } } } },
    'arkpedia.past-rewards.v1': { doneKeys: ['manual', 'imported'], doneEvents: [], annihilationDone: false, ticksFrom: '2026-10-24', importedDoneKeys: ['imported'], importedAccount: { server: 'en', uid: '1' } },
  }, false);
  assert.deepEqual(result.plannerState, { selectedNames: ['Amiya'], builderStates: { Amiya: { elite: 2, level: 90, masteryTargets: { 0: 3 } } } });
  assert.deepEqual(result['arkpedia.past-rewards.v1'], { doneKeys: ['manual'], doneEvents: [], annihilationDone: false, ticksFrom: '' });
  assert.equal(fingerprint(result), fingerprint(validateCloudData(result, false)));
});

test('withdrawing game-data permission keeps personal saves and removes game stores', () => {
  assert.deepEqual(personalData({ arkpediaAccount: account, musicFavorites: ['msr:1'], plannerRoster: {} }), { musicFavorites: ['msr:1'] });
});

test('music volume uses the existing player percentage scale', () => {
  assert.deepEqual(collectCloudData(storage({ musicVolume: '50' }), false), { musicVolume: 50 });
  assert.throws(() => validateCloudData({ musicVolume: 101 }, false));
});

test('restore propagates deletions, preserves local-only game data and never replaces credentials', () => {
  const local = storage({ musicFavorites: '["old"]', arkpediaSkinPlan: '["old"]', arkpediaAccount: JSON.stringify(account), arkpediaYostarLogin: 'private' });
  restoreCloudData({ musicFavorites: ['new'] }, false, local);
  assert.equal(local.getItem('musicFavorites'), '["new"]');
  assert.equal(local.getItem('arkpediaSkinPlan'), null);
  assert.equal(local.getItem('arkpediaYostarLogin'), 'private');
  assert.equal(local.getItem('arkpediaAccount'), JSON.stringify(account));
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of fs.readdirSync('migrations/accounts').filter(name => name.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(`migrations/accounts/${migration}`, 'utf8'));
  const prepare = (sql: string, values: unknown[] = []) => ({
    bind: (...bound: unknown[]) => prepare(sql, bound),
    all: async () => {
      const statement = sqlite.prepare(sql);
      const rows = statement.columns().length ? statement.all(...values as never[]) : (statement.run(...values as never[]), []);
      const stats = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
      return { results: rows, meta: stats, success: true };
    },
    first: async () => sqlite.prepare(sql).get(...values as never[]) ?? null,
    run: async () => ({ meta: sqlite.prepare(sql).run(...values as never[]) }),
  });
  let queue = Promise.resolve<unknown>(null);
  const db = { prepare, exec: async (sql: string) => sqlite.exec(sql), batch: (statements: ReturnType<typeof prepare>[]) => {
    const next = queue.then(async () => {
      sqlite.exec('BEGIN');
      try { const rows = []; for (const statement of statements) rows.push(await statement.all()); sqlite.exec('COMMIT'); return rows; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    queue = next.catch(() => null); return next;
  } } as unknown as D1Database;
  return { sqlite, db };
}
const envFor = (db: D1Database): AccountsEnv => ({ ARKPEDIA_ACCOUNTS_DB: db, ARKPEDIA_AUTH_URL: 'https://accounts.example.invalid',
  BETTER_AUTH_SECRET: 'test-only-a-long-random-secret-0123456789', GOOGLE_CLIENT_ID: 'google-test', GOOGLE_CLIENT_SECRET: 'test', DISCORD_CLIENT_ID: 'discord-test', DISCORD_CLIENT_SECRET: 'test' });

test('migration matches the installed Better Auth tables', () => {
  const { sqlite } = database();
  for (const table of Object.values(getAuthTables({ rateLimit: { storage: 'database' } }))) {
    const columns = sqlite.prepare(`PRAGMA table_info("${table.modelName}")`).all().map((c: { name: string }) => c.name);
    for (const field of ['id', ...Object.keys(table.fields)]) assert.ok(columns.includes(field), `${table.modelName}.${field}`);
  }
  sqlite.close();
});

test('archive migration preserves opted-in legacy histories and duplicates, including UID-less imports', () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_accounts.sql', '0002_account_profiles.sql']) sqlite.exec(fs.readFileSync(`migrations/accounts/${name}`, 'utf8'));
  sqlite.exec(`INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u','User','u@example.invalid','2026-01-01','2026-01-01'),('private','User','p@example.invalid','2026-01-01','2026-01-01');`);
  const old = archive(); old.history.rows.push({ ...old.history.rows[0] });
  const legacy = { ...account, pulls: old.history };
  const payload = JSON.stringify({ arkpediaAccount: { ...legacy, profile: { uid: '123' } }, arkpediaOtherAccounts: { jp: { ...legacy, server: 'jp' } }, musicFavorites: ['keep'] });
  sqlite.prepare('INSERT INTO cloud_save (userId, revision, gameSync, payload, updatedAt) VALUES (?, 9, ?, ?, ?)').run('u', 1, payload, '2026-01-01');
  sqlite.prepare('INSERT INTO cloud_save (userId, revision, gameSync, payload, updatedAt) VALUES (?, 9, ?, ?, ?)').run('private', 0, payload, '2026-01-01');
  sqlite.exec(fs.readFileSync('migrations/accounts/0003_pull_archives.sql', 'utf8'));
  assert.equal(sqlite.prepare('SELECT sum(count) AS n FROM pull_archive_row WHERE userId = ?').get('u')?.n, 4);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM pull_archive_account WHERE uid = ?').get('unknown')?.n, 1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM pull_archive_row WHERE userId = ?').get('private')?.n, 0);
  assert.match(sqlite.prepare('SELECT updatedAt FROM pull_archive_account LIMIT 1').get()?.updatedAt, /Z$/);
  assert.deepEqual({ ...sqlite.prepare('SELECT revision, personalSync, historySync, gameSync, payload FROM cloud_save WHERE userId = ?').get('u') }, { revision: 9, personalSync: 1, historySync: 1, gameSync: 1, payload });
  sqlite.close();
});

test('profile migration keeps existing identities, provider links and saves without adopting real names', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(fs.readFileSync('migrations/accounts/0001_accounts.sql', 'utf8'));
  sqlite.exec(`INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('existing', 'Private Real Name', 'private@example.invalid', '2026-01-01', '2026-01-01');
    INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('google-link', 'provider-id', 'google', 'existing', '2026-01-01', '2026-01-01');
    INSERT INTO cloud_save (userId, revision, gameSync, payload, updatedAt) VALUES ('existing', 12, 1, '{"musicFavorites":["kept"]}', '2026-01-01');`);
  sqlite.exec(fs.readFileSync('migrations/accounts/0002_account_profiles.sql', 'utf8'));
  assert.deepEqual({ ...sqlite.prepare('SELECT id, name FROM "user"').get() }, { id: 'existing', name: 'Arkpedia user' });
  assert.equal(sqlite.prepare('SELECT userId FROM account').get()?.userId, 'existing');
  assert.deepEqual({ ...sqlite.prepare('SELECT revision, gameSync, paused, payload FROM cloud_save').get() }, { revision: 12, gameSync: 1, paused: 0, payload: '{"musicFavorites":["kept"]}' });
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM arkpedia_profile').get()?.n, 0);
  sqlite.close();
});

test('authenticated API enforces isolation, origin, consent, revisions and cascading deletion', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env);
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: 'Test', email: 'arkpedia@example.invalid', emailVerified: true }, { method: 'oauth' });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  const handler = createCloudAccountHandler(() => env);
  async function call(method: string, body?: unknown, headers: Record<string, string> = {}) {
    let status = 200, result: Record<string, unknown> = {};
    const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; }, json: (value: Record<string, unknown>) => { result = value; }, end: () => {} };
    await handler({ method, headers: { cookie, origin: env.ARKPEDIA_AUTH_URL, 'content-type': 'application/json', ...headers }, body: body ? { owner: user.id, ...body } : body } as NextApiRequest, res as unknown as NextApiResponse);
    return { status, result };
  }
  assert.equal((await call('GET', undefined, { cookie: '' })).status, 401);
  assert.equal((await call('PUT', { revision: 0, data: {} }, { origin: 'https://evil.invalid' })).status, 403);
  const initial = await call('GET');
  assert.equal(initial.status, 200);
  assert.equal(initial.result.gameSync, false);
  assert.equal(initial.result.profile, null);
  assert.ok(!JSON.stringify(initial.result).includes('arkpedia@example.invalid'));
  assert.equal((await call('PUT', { revision: 0, data: {} })).status, 428);
  sqlite.prepare('INSERT INTO arkpedia_profile (userId, username, usernameKey, updatedAt) VALUES (?, ?, ?, ?)').run(user.id, 'Test#1234', 'test#1234', new Date().toISOString());
  assert.equal((await call('PUT', { owner: 'previous-user', revision: 0, data: { musicFavorites: ['private'] } })).status, 409);
  assert.equal((await call('PUT', { revision: 0, data: { arkpediaAccount: account } })).status, 400);
  assert.equal((await call('PUT', { revision: 0, userId: 'someone-else', data: { musicFavorites: ['msr:1'] } })).status, 200);
  assert.equal((await call('PUT', { revision: 0, data: {} })).status, 409);
  assert.equal((await call('PATCH', { revision: 1, gameSync: true })).status, 200);
  assert.equal((await call('PUT', { revision: 2, data: { arkpediaAccount: account, musicFavorites: ['msr:1'] } })).status, 200);
  const disabled = await call('PATCH', { revision: 3, gameSync: false });
  assert.deepEqual(disabled.result.data, { musicFavorites: ['msr:1'] });
  assert.equal((await call('PUT', { revision: 3, data: { arkpediaAccount: account } })).status, 409);
  assert.equal((await call('PUT', { revision: 4, data: { arkpediaAccount: account } })).status, 400);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save WHERE userId = ?').get(user.id)?.n, 1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save WHERE userId = ?').get('someone-else')?.n, 0);
  assert.equal((await call('DELETE', { revision: 4 })).status, 200);
  assert.equal((await call('GET')).result.paused, true);
  assert.equal((await call('PUT', { revision: 4, data: { musicFavorites: ['old'] } })).status, 409);
  assert.equal((await call('PUT', { revision: 5, data: { musicFavorites: ['resumed'] } })).status, 200);
  assert.equal((await call('GET')).result.paused, false);
  sqlite.prepare('DELETE FROM "user" WHERE id = ?').run(user.id);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save').get()?.n, 0);
  assert.equal((await call('GET')).status, 401);
  sqlite.close();
});

test('pull archive API preserves both devices through races, snapshot replacement, consent changes and deletion', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env), context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: 'Test', email: 'archive@example.invalid', emailVerified: true }, { method: 'oauth' });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  sqlite.prepare('INSERT INTO arkpedia_profile (userId, username, usernameKey, updatedAt) VALUES (?, ?, ?, ?)').run(user.id, 'Archive#1234', 'archive#1234', new Date().toISOString());
  const handler = createCloudAccountHandler(() => env);
  async function call(method: string, body: Record<string, unknown> = {}, extraHeaders: Record<string, string> = {}) {
    let status = 200, result: any;
    const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { result = value; }, end: () => {} };
    await handler({ method, headers: { cookie, origin: env.ARKPEDIA_AUTH_URL, 'content-type': 'application/json', ...extraHeaders }, body: { owner: user.id, ...body } } as NextApiRequest, res as unknown as NextApiResponse);
    return { status, result };
  }
  await call('GET');
  assert.equal((await call('POST', { revision: 0, archives: [archive()] })).status, 403);
  assert.equal((await call('PATCH', { revision: 0, historySync: true })).status, 200);
  const older = archive(); older.history.rows.push({ ...older.history.rows[0] });
  const newer = archive(); newer.history.rows[0].at = 2000;
  const race = await Promise.all([call('POST', { revision: 1, archives: [older] }), call('POST', { revision: 1, archives: [newer] })]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const retry = await call('POST', { revision: 2, archives: [newer, older] });
  assert.equal(retry.status, 200); assert.equal(retry.result.archives[0].history.rows.length, 3);
  const cacheHeaders = { 'x-arkpedia-archive-owner': user.id, 'x-arkpedia-archive-revision': String(retry.result.archiveRevision) };
  const unchanged = await call('GET', {}, cacheHeaders);
  assert.equal(unchanged.result.archivesUnchanged, true); assert.equal(unchanged.result.archives, undefined);
  assert.equal((await call('GET', {}, { ...cacheHeaders, 'x-arkpedia-archive-owner': 'another-user' })).result.archives[0].history.rows.length, 3);
  const otherSettings = await call('PUT', { revision: 3, data: { musicFavorites: ['other-device'] } });
  assert.equal(otherSettings.status, 200); assert.equal(otherSettings.result.archiveRevision, retry.result.archiveRevision, 'settings writes do not invalidate the archive');
  assert.equal((await call('GET')).result.archives[0].history.rows.length, 3, 'snapshot choice cannot clear the archive');
  const partial = await call('POST', { revision: 4, archives: [archive()] });
  assert.equal(partial.result.archives[0].history.rows.length, 3, 'partial overlap cannot shrink a ten-pull');
  assert.equal((await call('GET', {}, cacheHeaders)).result.archives[0].history.rows.length, 3, 'archive changes invalidate the browser copy');
  assert.equal((await call('POST', { revision: 5, archives: [{ ...archive(), history: { ...archive().history, token: 'PRIVATE' } }] })).status, 400);
  assert.equal((await call('POST', { owner: 'other-user', revision: 5, archives: [archive()] })).status, 409);
  const personalOff = await call('PATCH', { revision: 5, personalSync: false });
  assert.deepEqual(personalOff.result.data, {}); assert.equal(personalOff.result.archives[0].history.rows.length, 3);
  assert.equal((await call('PUT', { revision: 6, data: { musicFavorites: ['forbidden'] } })).status, 400);
  const revoked = await call('PATCH', { revision: 6, historySync: false });
  assert.deepEqual(revoked.result.archives, []);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM pull_archive_row').get()?.n, 0);
  assert.equal((await call('POST', { revision: 6, archives: [older] })).status, 409, 'stale device cannot resurrect a deletion');
  assert.equal((await call('POST', { revision: 7, archives: [older] })).status, 403);
  const oldTab = await call('PATCH', { revision: 7, gameSync: true });
  assert.equal(oldTab.result.historySync, true, 'old combined choice included history');
  const oldUpload = await call('PUT', { revision: 8, data: { arkpediaAccount: { ...account, profile: { uid: '123' }, pulls: older.history } } });
  assert.equal(oldUpload.status, 200); assert.equal(oldUpload.result.archives[0].history.rows.length, 2);
  assert.equal(oldUpload.result.data.arkpediaAccount.pulls, undefined, 'history is never left in a replaceable snapshot');
  const newTab = await call('PATCH', { revision: 9, savingVersion: 2, gameSync: false });
  assert.equal(newTab.result.historySync, true); assert.equal(newTab.result.archives[0].history.rows.length, 2);
  const oldRevoke = await call('PATCH', { revision: 10, gameSync: false });
  assert.equal(oldRevoke.result.historySync, false); assert.deepEqual(oldRevoke.result.archives, []);
  await call('PATCH', { revision: 11, historySync: true });
  await call('POST', { revision: 12, archives: [older] });
  assert.equal((await call('DELETE', { revision: 13 })).status, 200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM pull_archive_account').get()?.n, 0);
  assert.equal((await call('GET')).result.paused, true);
  // Simulate the old Worker serving an import during the migration/deployment window.
  const rolloutPayload = JSON.stringify({ arkpediaAccount: { ...account, profile: { uid: '123' }, pulls: older.history } });
  sqlite.prepare('UPDATE cloud_save SET payload = ?, gameSync = 1, paused = 0, revision = revision + 1 WHERE userId = ?').run(rolloutPayload, user.id);
  const bridged = await call('GET');
  assert.equal(bridged.status, 200); assert.equal(bridged.result.historySync, true);
  assert.equal(bridged.result.archives[0].history.rows.length, 2);
  assert.equal(bridged.result.data.arkpediaAccount.pulls, undefined);
  sqlite.prepare('UPDATE cloud_save SET payload = ?, gameSync = 0, revision = revision + 1 WHERE userId = ?').run('{}', user.id);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM pull_archive_account').get()?.n, 0, 'old Worker consent withdrawal removes its combined history too');
  assert.equal((await call('GET')).result.historySync, false);
  sqlite.close();
});

test('username and optional friend tag validation support normalized multilingual names', () => {
  assert.deepEqual(normalizeUsername('  Ｄｏｃｔｏｒ#1234 '), { username: 'Doctor#1234', key: 'doctor#1234' });
  assert.equal(normalizeUsername('ドクター#1234').username, 'ドクター#1234');
  assert.equal(normalizeUsername('박사님#1234').username, '박사님#1234');
  assert.equal(normalizeUsername('Dr.  Amiya').username, 'Dr. Amiya');
  for (const name of ['ab', 'admin', 'ADMIN#1234', 'name@example.com', 'doctor\u202etest', '<script>', 'Doctor#text']) assert.throws(() => normalizeUsername(name));
  assert.throws(() => validateProfile({ username: 'Doctor', friendTag: 'Doctor#1234' }), /server/);
  assert.throws(() => validateProfile({ username: 'Doctor', friendTag: '', friendServer: 'en' }), /both/);
  assert.deepEqual(validateProfile({ username: 'Doctor', friendTag: 'Doctor#1234', friendServer: 'jp' }), { username: 'Doctor', key: 'doctor', friendTag: 'Doctor#1234', friendServer: 'jp' });
});

test('profile claims are authenticated, unique under races, owner-bound and preserve existing saves', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env), context = await auth.$context;
  const userA = await context.internalAdapter.createUser({ name: 'Private Real Name', email: 'a@example.invalid', emailVerified: true }, { method: 'oauth' });
  const userB = await context.internalAdapter.createUser({ name: 'Other Private Name', email: 'b@example.invalid', emailVerified: true }, { method: 'oauth' });
  assert.equal(userA.name, 'Arkpedia user');
  const sessionA = await context.internalAdapter.createSession(userA.id, false), sessionB = await context.internalAdapter.createSession(userB.id, false);
  const cookieFor = async (session: typeof sessionA) => `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  const cookieA = await cookieFor(sessionA), cookieB = await cookieFor(sessionB);
  const handler = createAccountProfileHandler(() => env);
  async function call(owner = userA.id, cookie = cookieA, method = 'PUT', body: Record<string, unknown> = {}, origin = env.ARKPEDIA_AUTH_URL) {
    let status = 200, result: Record<string, unknown> = {};
    const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; }, json: (value: Record<string, unknown>) => { result = value; }, end: () => {} };
    await handler({ method, headers: { cookie, origin, 'content-type': 'application/json' }, query: { username: body.username }, body: { owner, ...body } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return { status, result };
  }
  sqlite.prepare('INSERT INTO cloud_save (userId, revision, payload, updatedAt) VALUES (?, 4, ?, ?)').run(userA.id, '{"musicFavorites":["kept"]}', new Date().toISOString());
  assert.equal((await call(userA.id, '', 'GET', { username: 'Doctor#1234' })).status, 401);
  assert.equal((await call(userA.id, cookieA, 'PUT', { username: 'Doctor#1234' }, 'https://evil.invalid')).status, 403);
  assert.equal((await call(userB.id, cookieA, 'PUT', { username: 'Doctor#1234' })).status, 409);
  const race = await Promise.all([call(userA.id, cookieA, 'PUT', { username: 'Doctor#1234' }), call(userB.id, cookieB, 'PUT', { username: 'ＤＯＣＴＯＲ#1234' })]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  assert.equal((await call(userB.id, cookieB, 'GET', { username: 'doctor#1234' })).result.available, false);
  assert.equal((await call(userA.id, cookieA, 'GET', { username: 'doctor#1234' })).result.available, true);
  assert.equal(sqlite.prepare('SELECT payload FROM cloud_save WHERE userId = ?').get(userA.id)?.payload, '{"musicFavorites":["kept"]}');
  assert.equal(sqlite.prepare('SELECT revision FROM cloud_save WHERE userId = ?').get(userA.id)?.revision, 4);
  assert.equal((await call(userB.id, cookieA, 'DELETE', { confirmation: 'Doctor#1234' })).status, 409);
  assert.equal((await call(userA.id, cookieA, 'DELETE', { confirmation: 'wrong' })).status, 400);
  sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(new Date(Date.now() - 600_000).toISOString(), sessionA.id);
  assert.equal((await call(userA.id, cookieA, 'DELETE', { confirmation: 'Doctor#1234' })).status, 403);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "user" WHERE id = ?').get(userA.id)?.n, 1);
  sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(new Date().toISOString(), sessionA.id);
  assert.equal((await call(userA.id, cookieA, 'DELETE', { confirmation: 'Doctor#1234' })).status, 200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save').get()?.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM arkpedia_profile').get()?.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "user" WHERE id = ?').get(userB.id)?.n, 1);
  sqlite.close();
});

test('sync asks only for divergent saves and never silently seeds a different account or resurrects deletion', () => {
  const cloud = { user: { id: 'a' }, revision: 2, data: { musicFavorites: ['cloud'] } };
  const local = { musicFavorites: ['local'] };
  const marker = { userId: 'a', revision: 1, fingerprint: fingerprint(local) };
  assert.equal(syncDecision({ ...cloud, revision: 0, data: {} }, local, null), 'upload');
  assert.equal(syncDecision(cloud, { theme: 'light' }, null), 'restore');
  assert.equal(syncDecision(cloud, cloud.data, null), 'ready');
  assert.equal(syncDecision(cloud, local, marker), 'restore');
  assert.equal(syncDecision({ ...cloud, revision: 0 }, local, marker), 'choice');
  assert.equal(syncDecision(cloud, { musicFavorites: ['changed too'] }, marker), 'choice');
  assert.equal(syncDecision({ ...cloud, user: { id: 'b' }, revision: 0, data: {} }, local, marker), 'choice');
  assert.equal(syncDecision({ ...cloud, data: {}, paused: true }, local, null), 'paused');
});

test('an existing account can withdraw game-data consent before choosing a username', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env), context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: 'Old provider name', email: 'existing@example.invalid', emailVerified: true }, { method: 'oauth' });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  sqlite.prepare('INSERT INTO cloud_save (userId, revision, gameSync, payload, updatedAt) VALUES (?, 3, 1, ?, ?)')
    .run(user.id, JSON.stringify({ arkpediaAccount: account, musicFavorites: ['kept'] }), new Date().toISOString());
  let status = 200, result: Record<string, unknown> = {};
  const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; }, json: (value: Record<string, unknown>) => { result = value; }, end: () => {} };
  await createCloudAccountHandler(() => env)({ method: 'PATCH', headers: { cookie, origin: env.ARKPEDIA_AUTH_URL, 'content-type': 'application/json' },
    body: { owner: user.id, revision: 3, gameSync: false } } as NextApiRequest, res as unknown as NextApiResponse);
  assert.equal(status, 200); assert.equal(result.gameSync, false); assert.deepEqual(result.data, { musicFavorites: ['kept'] });
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM arkpedia_profile').get()?.n, 0);
  sqlite.close();
});

test('OAuth requires state and keeps password signup disabled', async () => {
  const { sqlite, db } = database(), auth = accountAuth(envFor(db));
  const start = await auth.handler(new Request('https://accounts.example.invalid/api/auth/sign-in/social', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://accounts.example.invalid', 'cf-connecting-ip': '192.0.2.10' },
    body: JSON.stringify({ provider: 'google', callbackURL: '/account' }) }));
  assert.equal(start.status, 200);
  const body = await start.json();
  const redirect = new URL(body.url);
  assert.equal(redirect.hostname, 'accounts.google.com');
  assert.ok(redirect.searchParams.get('state'));
  assert.equal(redirect.searchParams.get('redirect_uri'), 'https://accounts.example.invalid/api/auth/callback/google');
  const callback = await auth.handler(new Request('https://accounts.example.invalid/api/auth/callback/google?code=invalid&state=invalid'));
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location') ?? '', /error/);
  const signup = await auth.handler(new Request('https://accounts.example.invalid/api/auth/sign-up/email', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://accounts.example.invalid' }, body: JSON.stringify({ name: 'X', email: 'x@example.invalid', password: 'example-secret' }) }));
  assert.ok(signup.status >= 400);
  sqlite.close();
});
