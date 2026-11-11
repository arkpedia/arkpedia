import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireReplayPermit, cancelReplayPermit, REPLAY_QUEUE_LEASE } from '../../lib/replays/pacing-server';
import { createPermitHandler } from '../../pages/api/account-import/replay-permit';
import { allowAccountRequest, ACCOUNT_LIMITS } from '../../lib/cloud-account/limits';
// Runtime is Node 24; the application's older @types/node does not declare this module.
// @ts-expect-error node:sqlite is available in the supported CI runtime.
import { DatabaseSync, backup } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import { makeSignature } from 'better-auth/crypto';
import { getAuthTables } from 'better-auth/db';
import { collectCloudData, fingerprint, personalData, restoreCloudData, validateCloudData } from '../../lib/cloud-account/data';
import { accountAuth, accountsEnv, type AccountsEnv } from '../../lib/cloud-account/server';
import { createNativeAuthHandler, nativeAuthChallenge } from '../../lib/cloud-account/native-auth';
import { createReplayHandler } from '../../lib/cloud-account/replays-api';
import { createCloudAccountHandler } from '../../lib/cloud-account/api';
import { createCommunityHandler } from '../../lib/community/api';
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

test('visualizer preference survives personal cloud save and restore on a new browser', () => {
  const key = 'arkpedia:settings';
  const browser = storage({ [key]: JSON.stringify({ version: 2, values: { musicVisualizer: 'waves' } }) });
  const saved = validateCloudData(collectCloudData(browser, false), false);
  const other = storage();
  restoreCloudData(saved, false, other);
  assert.equal(JSON.parse(other.getItem(key)!).values.musicVisualizer, 'waves');
  assert.equal(key in collectCloudData(browser, false, false), false);
});

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

function database(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (filename === ':memory:') for (const migration of fs.readdirSync('migrations/accounts').filter(name => name.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(`migrations/accounts/${migration}`, 'utf8'));
  const totalChanges = () => Number(sqlite.prepare('SELECT total_changes() AS n').get()?.n);
  const prepare = (sql: string, values: unknown[] = []) => ({
    bind: (...bound: unknown[]) => prepare(sql, bound),
    all: async () => {
      const before = totalChanges();
      const statement = sqlite.prepare(sql);
      const rows = statement.columns().length ? statement.all(...values as never[]) : (statement.run(...values as never[]), []);
      // D1 counts trigger/cascade writes as well as the directly affected row.
      const stats = { ...sqlite.prepare('SELECT last_insert_rowid() AS last_row_id').get(), changes: totalChanges() - before };
      return { results: rows, meta: stats, success: true };
    },
    first: async () => sqlite.prepare(sql).get(...values as never[]) ?? null,
    run: async () => {
      const before = totalChanges();
      const stats = sqlite.prepare(sql).run(...values as never[]);
      return { meta: { ...stats, changes: totalChanges() - before } };
    },
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

test('production accounts require explicit enablement and canonical origin; unknown roles stay disabled', () => {
  const key = Symbol.for('__cloudflare-context__');
  const runtime = globalThis as unknown as Record<symbol, unknown>;
  const previous = runtime[key];
  const env = envFor({} as D1Database);
  try {
    for (const role of ['production', undefined, 'dev']) {
      runtime[key] = { env: { ...env, ARKPEDIA_DEPLOYMENT_ROLE: role } };
      assert.equal(accountsEnv(), null);
    }
    const production = { ...env, ARKPEDIA_DEPLOYMENT_ROLE: 'production', ARKPEDIA_ACCOUNTS_ENABLED: '1', ARKPEDIA_AUTH_URL: 'https://www.arkpedia.net' };
    runtime[key] = { env: production };
    assert.equal(accountsEnv(), production);
    for (const patch of [{ ARKPEDIA_ACCOUNTS_ENABLED: undefined }, { ARKPEDIA_ACCOUNTS_ENABLED: '0' }, { ARKPEDIA_AUTH_URL: 'https://preview.arkpedia.net' }, { ARKPEDIA_DEPLOYMENT_ROLE: 'dev' }]) {
      runtime[key] = { env: { ...production, ...patch } };
      assert.equal(accountsEnv(), null);
    }
    const preview = { ...env, ARKPEDIA_DEPLOYMENT_ROLE: 'staging' };
    runtime[key] = { env: preview };
    assert.equal(accountsEnv(), preview);
  } finally {
    if (previous === undefined) delete runtime[key];
    else runtime[key] = previous;
  }
});

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
  sqlite.prepare('UPDATE arkpedia_profile SET avatarId = ? WHERE userId = ?').run('six-star-icons/Suzuran - Base.webp', user.id);
  sqlite.prepare('UPDATE cloud_save SET syncReviewed = 1, personalSync = 1 WHERE userId = ?').run(user.id);
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
  assert.equal(((await call('GET')).result.profile as { avatarId: string }).avatarId, 'six-star-icons/Suzuran - Base.webp', 'profile pictures survive snapshot replacement and cloud-save deletion');
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
  sqlite.prepare('UPDATE cloud_save SET syncReviewed = 1, personalSync = 1 WHERE userId = ?').run(user.id);
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
  for (const user of [userA, userB]) {
    sqlite.prepare('INSERT INTO cloud_save (userId, revision, payload, updatedAt) VALUES (?, 4, ?, ?)').run(user.id, '{"musicFavorites":["kept"]}', new Date().toISOString());
  }
  assert.equal((await call(userA.id, '', 'GET', { username: 'Doctor#1234' })).status, 401);
  assert.equal((await call(userA.id, cookieA, 'PUT', { username: 'Doctor#1234' }, 'https://evil.invalid')).status, 403);
  assert.equal((await call(userB.id, cookieA, 'PUT', { username: 'Doctor#1234' })).status, 409);
  const contenders = [
    { user: userA, cookie: cookieA, session: sessionA, username: 'Doctor#1234' },
    { user: userB, cookie: cookieB, session: sessionB, username: 'ＤＯＣＴＯＲ#1234' },
  ];
  const race = await Promise.all(contenders.map(({ user, cookie, username }) => call(user.id, cookie, 'PUT', { username })));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  // Either authenticated request may win; all later checks follow that actual owner.
  const winner = contenders[race[0].status === 200 ? 0 : 1], loser = contenders[race[0].status === 200 ? 1 : 0];
  const confirmation = normalizeUsername(winner.username).username;
  assert.equal(sqlite.prepare('SELECT userId FROM arkpedia_profile WHERE usernameKey = ?').get('doctor#1234')?.userId, winner.user.id);
  assert.equal((await call(loser.user.id, loser.cookie, 'GET', { username: 'doctor#1234' })).result.available, false);
  assert.equal((await call(winner.user.id, winner.cookie, 'GET', { username: 'doctor#1234' })).result.available, true);
  for (const { user } of contenders) {
    assert.equal(sqlite.prepare('SELECT payload FROM cloud_save WHERE userId = ?').get(user.id)?.payload, '{"musicFavorites":["kept"]}');
    assert.equal(sqlite.prepare('SELECT revision FROM cloud_save WHERE userId = ?').get(user.id)?.revision, 4);
  }
  const avatarId = 'six-star-icons/Suzuran - Base.webp';
  assert.equal((await call(winner.user.id, '', 'PATCH', { avatarId })).status, 401);
  assert.equal((await call(winner.user.id, winner.cookie, 'PATCH', { avatarId }, 'https://evil.invalid')).status, 403);
  assert.equal((await call(loser.user.id, winner.cookie, 'PATCH', { avatarId })).status, 409);
  assert.equal((await call(loser.user.id, loser.cookie, 'PATCH', { avatarId })).status, 409, 'a username is required');
  for (const avatarId of ['https://evil.invalid/avatar.png', 'six-star-icons/../../secret.png', 'six-star-icons/not-in-catalogue.webp', 5, undefined]) {
    assert.equal((await call(winner.user.id, winner.cookie, 'PATCH', { avatarId })).status, 400);
  }
  const changed = await call(winner.user.id, winner.cookie, 'PATCH', { avatarId });
  assert.equal(changed.status, 200);
  assert.equal((changed.result.profile as { avatarId: string }).avatarId, avatarId);
  assert.equal(sqlite.prepare('SELECT avatarId FROM arkpedia_profile WHERE userId = ?').get(winner.user.id)?.avatarId, avatarId);
  assert.equal((await call(winner.user.id, winner.cookie, 'PUT', { username: winner.username })).status, 200);
  assert.equal(sqlite.prepare('SELECT avatarId FROM arkpedia_profile WHERE userId = ?').get(winner.user.id)?.avatarId, avatarId, 'older username writes preserve the picture');
  assert.equal(sqlite.prepare('SELECT payload FROM cloud_save WHERE userId = ?').get(winner.user.id)?.payload, '{"musicFavorites":["kept"]}');
  assert.equal((await call(winner.user.id, winner.cookie, 'PATCH', { avatarId: null })).status, 200);
  assert.equal(sqlite.prepare('SELECT avatarId FROM arkpedia_profile WHERE userId = ?').get(winner.user.id)?.avatarId, null, 'default is saved, not a missing update');
  assert.equal((await call(loser.user.id, winner.cookie, 'DELETE', { confirmation })).status, 409);
  assert.equal((await call(winner.user.id, winner.cookie, 'DELETE', { confirmation: 'wrong' })).status, 400);
  sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(new Date(Date.now() - 600_000).toISOString(), winner.session.id);
  assert.equal((await call(winner.user.id, winner.cookie, 'DELETE', { confirmation })).status, 403);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "user" WHERE id = ?').get(winner.user.id)?.n, 1);
  sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(new Date().toISOString(), winner.session.id);
  assert.equal((await call(winner.user.id, winner.cookie, 'DELETE', { confirmation })).status, 200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "user" WHERE id = ?').get(winner.user.id)?.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save WHERE userId = ?').get(winner.user.id)?.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save').get()?.n, 1);
  assert.equal(sqlite.prepare('SELECT payload FROM cloud_save WHERE userId = ?').get(loser.user.id)?.payload, '{"musicFavorites":["kept"]}');
  assert.equal(sqlite.prepare('SELECT revision FROM cloud_save WHERE userId = ?').get(loser.user.id)?.revision, 4);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM arkpedia_profile').get()?.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "user" WHERE id = ?').get(loser.user.id)?.n, 1);
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

test('account limits are atomic across clients, isolate users, recover next minute and leave deletion available', async () => {
  const { sqlite, db } = database();
  sqlite.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('a','A','a@test.invalid','2026-01-01','2026-01-01'),('b','B','b@test.invalid','2026-01-01','2026-01-01')`);
  const now = 1793491200000;
  const attempts = await Promise.all(Array.from({ length: ACCOUNT_LIMITS.write + 5 }, () => allowAccountRequest(db, 'a', 'write', now)));
  assert.equal(attempts.filter(x => x.allowed).length, ACCOUNT_LIMITS.write);
  assert.equal((await allowAccountRequest(db, 'a', 'write', now + 1000)).allowed, false);
  assert.equal((await allowAccountRequest(db, 'a', 'remove', now)).allowed, true);
  assert.equal((await allowAccountRequest(db, 'b', 'write', now)).allowed, true);
  assert.equal((await allowAccountRequest(db, 'a', 'write', now + 60_000)).allowed, true);
  sqlite.prepare('DELETE FROM "user" WHERE id = ?').run('a');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM account_request_limit WHERE userId = ?').get('a')?.n, 0);
  sqlite.close();
});

test('API throttling returns Retry-After before reading saves', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env), ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ name: 'Test', email: 'limited@example.invalid', emailVerified: true }, { method: 'oauth' });
  const session = await ctx.internalAdapter.createSession(user.id, false);
  const cookie = `${ctx.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, ctx.secret)}`;
  const handler = createCloudAccountHandler(() => env);
  sqlite.prepare('INSERT INTO account_request_limit VALUES (?, ?, ?, ?)').run(user.id, 'read', Math.floor(Date.now()/60000), ACCOUNT_LIMITS.read);
  let status = 200; const headers: Record<string, string> = {};
  const res = { setHeader: (k: string,v: string) => { headers[k] = v; }, status: (code: number) => { status=code;return res; }, json: () => {} };
  await handler({ method: 'GET', headers: { cookie } } as NextApiRequest, res as unknown as NextApiResponse);
  assert.equal(status, 429); assert.ok(Number(headers['Retry-After']) > 0); assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save').get()?.n, 0);
  sqlite.close();
});

test('linking and revoking other devices require fresh authentication; revocation keeps this session and other accounts', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env), ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ name: 'Test', email: 'sessions@example.invalid', emailVerified: true }, { method: 'oauth' });
  const otherUser = await ctx.internalAdapter.createUser({ name: 'Other', email: 'other-session@example.invalid', emailVerified: true }, { method: 'oauth' });
  const current = await ctx.internalAdapter.createSession(user.id, false), other = await ctx.internalAdapter.createSession(user.id, false);
  const foreign = await ctx.internalAdapter.createSession(otherUser.id, false);
  const cookie = `${ctx.authCookies.sessionToken.name}=${current.token}.${await makeSignature(current.token, ctx.secret)}`;
  const post = (endpoint: string, body = {}) => auth.handler(new Request(env.ARKPEDIA_AUTH_URL + '/api/auth/' + endpoint, {
    method: 'POST', headers: { cookie, origin: env.ARKPEDIA_AUTH_URL, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(new Date(Date.now()-600000).toISOString(),current.id);
  for (const endpoint of ['link-social','revoke-other-sessions']) {
    const response = await post(endpoint,{ provider:'discord',callbackURL:'/account?settings=logins' });
    assert.equal(response.status,403); assert.equal((await response.json()).code,'SESSION_NOT_FRESH');
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM verification').get()?.n,0,'stale link creates no OAuth state');
  sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(new Date().toISOString(),current.id);
  assert.equal((await post('link-social',{ provider:'discord',callbackURL:'/account?settings=logins' })).status,200);
  assert.equal((await post('revoke-other-sessions')).status,200);
  assert.equal(sqlite.prepare('SELECT id FROM session WHERE id = ?').get(other.id),undefined);
  for(const session of [current,foreign]) assert.ok(sqlite.prepare('SELECT id FROM session WHERE id = ?').get(session.id));
  const oldCookie = `${ctx.authCookies.sessionToken.name}=${other.token}.${await makeSignature(other.token,ctx.secret)}`;
  assert.equal(await auth.api.getSession({headers:new Headers({cookie:oldCookie})}),null);
  sqlite.close();
});

test('archive quotas reject accumulated growth atomically, preserve old rows and reclaim space on consent withdrawal', async () => {
  const { sqlite, db } = database();
  sqlite.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('a','A','a@test.invalid','2026-01-01','2026-01-01');
    INSERT INTO cloud_save(userId,updatedAt) VALUES ('a','2026-01-01');
    INSERT INTO pull_archive_account VALUES ('a','en','1','Doctor',NULL,'2026-01-01');
    INSERT INTO pull_archive_row VALUES ('a','en','1',1,'pool','char',100000,5,NULL,NULL);`);
  await assert.rejects(db.batch([
    db.prepare('UPDATE cloud_save SET revision = revision + 1 WHERE userId = ?').bind('a'),
    db.prepare("INSERT INTO pull_archive_row VALUES ('a','en','1',2,'pool','char',1,5,NULL,NULL)"),
  ]), /ARKPEDIA_ARCHIVE_QUOTA/);
  assert.equal(sqlite.prepare('SELECT revision FROM cloud_save').get()?.revision,0);
  assert.equal(sqlite.prepare('SELECT sum(count) AS n FROM pull_archive_row').get()?.n,100000);
  assert.throws(()=>sqlite.exec("UPDATE pull_archive_row SET count = 100001"),/ARKPEDIA_ARCHIVE_QUOTA/);
  sqlite.exec('UPDATE pull_archive_row SET count = 1');
  assert.throws(()=>sqlite.prepare('UPDATE pull_archive_row SET poolName = ?').run('x'.repeat(16777216)),/ARKPEDIA_ARCHIVE_QUOTA/);
  // Replaying known data does not consume quota twice.
  sqlite.exec("INSERT INTO pull_archive_row VALUES ('a','en','1',1,'pool','char',1,5,NULL,NULL) ON CONFLICT DO UPDATE SET count=max(count,excluded.count)");
  assert.equal(sqlite.prepare('SELECT pulls FROM pull_archive_usage').get()?.pulls,1);
  for(let i=2;i<=64;i++)sqlite.prepare("INSERT INTO pull_archive_account VALUES ('a','en',?,'Doctor',NULL,'2026-01-01')").run(String(i));
  assert.throws(()=>sqlite.exec("INSERT INTO pull_archive_account VALUES ('a','en','65','Doctor',NULL,'2026-01-01')"),/ARKPEDIA_ARCHIVE_QUOTA/);
  sqlite.exec('DELETE FROM pull_archive_account');
  const usage = sqlite.prepare('SELECT accounts,pulls,bytes FROM pull_archive_usage').get();
  assert.deepEqual({...usage},{accounts:0,pulls:0,bytes:0});
  sqlite.close();
});

test('database backup restores identities, active sessions, saved data and archive accounting', async () => {
  const { sqlite, db } = database(), env = envFor(db), auth = accountAuth(env), ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({name:'Backup',email:'backup@example.invalid',emailVerified:true},{method:'oauth'});
  const session = await ctx.internalAdapter.createSession(user.id,false);
  sqlite.prepare('INSERT INTO cloud_save(userId,payload,updatedAt) VALUES (?,?,?)').run(user.id,'{"theme":"light"}',new Date().toISOString());
  sqlite.prepare('INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').run('link','provider-id','google',user.id,'2026-01-01','2026-01-01');
  sqlite.prepare("INSERT INTO pull_archive_account VALUES (?,'en','1','Doctor',NULL,'2026-01-01')").run(user.id);
  sqlite.prepare("INSERT INTO pull_archive_row VALUES (?,'en','1',1,'pool','char',3,5,NULL,NULL)").run(user.id);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'arkpedia-account-backup-'));
  try {
    const filename = path.join(dir,'accounts.sqlite'); await backup(sqlite,filename);
    const restored = database(filename);
    try {
      assert.equal(restored.sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
      const restoredAuth=accountAuth(envFor(restored.db));
      const cookie=`${ctx.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token,ctx.secret)}`;
      assert.equal((await restoredAuth.api.getSession({headers:new Headers({cookie})}))?.user.id,user.id);
      assert.equal(restored.sqlite.prepare('SELECT payload FROM cloud_save WHERE userId = ?').get(user.id)?.payload,'{"theme":"light"}');
      assert.equal(restored.sqlite.prepare('SELECT userId FROM account WHERE id = ?').get('link')?.userId,user.id);
      assert.equal(restored.sqlite.prepare('SELECT pulls FROM pull_archive_usage WHERE userId = ?').get(user.id)?.pulls,3);
      assert.equal((await allowAccountRequest(restored.db,user.id,'write')).allowed,true);
    } finally {restored.sqlite.close();}
  } finally {sqlite.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('hardening migration preserves pre-existing archives above quota and allows removal', () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON');
  for(const name of ['0001_accounts.sql','0002_account_profiles.sql','0003_pull_archives.sql']) sqlite.exec(fs.readFileSync(`migrations/accounts/${name}`,'utf8'));
  sqlite.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('a','A','a@test.invalid','2026-01-01','2026-01-01');
    INSERT INTO cloud_save(userId,revision,payload,updatedAt) VALUES ('a',42,'{"theme":"dark"}','2026-01-01');
    INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES ('link','provider-id','google','a','2026-01-01','2026-01-01');
    INSERT INTO pull_archive_account VALUES ('a','en','1','Doctor',NULL,'2026-01-01');
    INSERT INTO pull_archive_row VALUES ('a','en','1',1,'pool','char',100001,5,NULL,NULL);`);
  const tables=['user','cloud_save','account','pull_archive_account','pull_archive_row'];
  const before=tables.map(table=>sqlite.prepare(`SELECT * FROM "${table}"`).all());
  sqlite.exec(fs.readFileSync('migrations/accounts/0004_account_protection.sql','utf8'));
  assert.deepEqual(tables.map(table=>sqlite.prepare(`SELECT * FROM "${table}"`).all()),before);
  assert.equal(sqlite.prepare('SELECT pulls FROM pull_archive_usage').get()?.pulls,100001);
  assert.throws(()=>sqlite.exec('UPDATE pull_archive_row SET count=count+1'),/ARKPEDIA_ARCHIVE_QUOTA/);
  sqlite.exec('DELETE FROM pull_archive_account');
  assert.equal(sqlite.prepare('SELECT pulls FROM pull_archive_usage').get()?.pulls,0);
  sqlite.close();
});

test('new accounts must confirm all saving categories before any data upload, including stale clients', async () => {
  const { sqlite, db } = database(), env = envFor(db), context = await accountAuth(env).$context;
  const user = await context.internalAdapter.createUser({ name: 'Test', email: 'consent@example.invalid', emailVerified: true }, { method: 'oauth' });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  const handler = createCloudAccountHandler(() => env);
  async function call(method: string, body: Record<string, unknown> = {}) {
    let status = 200, result: any;
    const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { result = value; }, end: () => {} };
    await handler({ method, headers: { cookie, origin: env.ARKPEDIA_AUTH_URL, 'content-type': 'application/json' }, body: { owner: user.id, ...body } } as NextApiRequest, res as unknown as NextApiResponse);
    return { status, result };
  }
  const initial = (await call('GET')).result;
  assert.equal(initial.syncReviewed, false); assert.equal(initial.personalSync, false);
  const choices = { syncReviewed: true, savingVersion: 2, personalSync: false, historySync: false, gameSync: false };
  assert.equal((await call('PATCH', { revision: 0, ...choices })).status, 428, 'profile still required');
  sqlite.prepare('INSERT INTO arkpedia_profile (userId, username, usernameKey, updatedAt) VALUES (?, ?, ?, ?)').run(user.id, 'Consent', 'consent', '2026-11-01');
  for (const [method, body] of [['PUT', { data: { musicFavorites: ['private'] } }], ['POST', { archives: [archive()] }], ['PATCH', { personalSync: true }]] as const) {
    assert.equal((await call(method, { revision: 0, ...body })).status, 428);
  }
  assert.equal((await call('PATCH', { revision: 0, syncReviewed: true, personalSync: true })).status, 400);
  assert.equal((await call('PATCH', { revision: 0, ...choices, data: { theme: 'dark' } })).status, 400);
  assert.equal((await call('PATCH', { revision: 0, ...choices, archives: [archive()] })).status, 400);
  assert.equal((await call('GET')).result.syncReviewed, false);
  assert.deepEqual((await call('GET')).result.data, {});
  const approved = await call('PATCH', { revision: 0, ...choices });
  assert.equal(approved.status, 200); assert.equal(approved.result.syncReviewed, true);
  assert.deepEqual(approved.result.data, {}); assert.deepEqual(approved.result.archives, []);
  assert.equal((await call('GET')).result.syncReviewed, true, 'persisted independently of browser state');
  assert.equal((await call('PATCH', { revision: 0, ...choices, personalSync: true })).status, 409, 'another tab cannot overwrite the confirmed choices');
  assert.equal((await call('PUT', { revision: 1, data: { musicFavorites: ['private'] } })).status, 400, 'all-off remains enforced after setup');
  assert.equal((await call('PATCH', { revision: 1, personalSync: true, savingVersion: 2 })).status, 200);
  assert.equal((await call('PUT', { revision: 2, data: { musicFavorites: ['selected'] } })).status, 200);
  assert.deepEqual((await call('GET')).result.data, { musicFavorites: ['selected'] });
  sqlite.close();
});

test('sync-review migration preserves established accounts and leaves unfinished accounts pending', () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON');
  for (const name of fs.readdirSync('migrations/accounts').filter(name => name.endsWith('.sql') && name < '0005').sort()) sqlite.exec(fs.readFileSync(`migrations/accounts/${name}`, 'utf8'));
  sqlite.exec(`INSERT INTO "user" (id,name,email,createdAt,updatedAt) VALUES ('old','Old','old@example.invalid','2026-01-01','2026-01-01'),('pending','Pending','pending@example.invalid','2026-01-01','2026-01-01');
    INSERT INTO arkpedia_profile(userId,username,usernameKey,updatedAt) VALUES ('old','Old','old','2026-01-01');
    INSERT INTO cloud_save(userId,revision,payload,personalSync,gameSync,historySync,paused,updatedAt) VALUES ('old',42,'{"theme":"dark"}',1,0,1,1,'2026-01-01'),('pending',0,'{}',1,0,0,0,'2026-01-01');`);
  const before = sqlite.prepare("SELECT * FROM cloud_save WHERE userId = 'old'").get();
  sqlite.exec(fs.readFileSync('migrations/accounts/0005_sync_choices.sql', 'utf8'));
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM cloud_save WHERE userId = 'old'").get() }, { ...before, syncReviewed: 1 });
  assert.equal(sqlite.prepare("SELECT syncReviewed FROM cloud_save WHERE userId = 'pending'").get()?.syncReviewed, 0);
  sqlite.close();
});


test('auto-deploy API isolates owners, enforces consent and CAS, avoids stale fingerprints and reclaims withdrawn saves', async () => {
  const {sqlite,db}=database(),env=envFor(db),auth=accountAuth(env),ctx=await auth.$context;
  const user=await ctx.internalAdapter.createUser({name:'Test',email:'replay@example.invalid',emailVerified:true},{method:'oauth'});
  const session=await ctx.internalAdapter.createSession(user.id,false);
  const cookie=`${ctx.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token,ctx.secret)}`;
  const handler=createReplayHandler(()=>env);
  async function call(method:string,body:Record<string,unknown>={},extra:Record<string,string>={}) {
    let status=200,result:Record<string,any>={};
    const res={setHeader:()=>{},status:(code:number)=>{status=code;return res;},json:(value:Record<string,any>)=>{result=value;},end:()=>{}};
    await handler({method,headers:{cookie,origin:env.ARKPEDIA_AUTH_URL,'content-type':'application/json',...extra},query:{owner:user.id,namespace:'en:1',...body},body:{owner:user.id,namespace:'en:1',...body}} as unknown as NextApiRequest,res as unknown as NextApiResponse);return {status,result};
  }
  const payload=JSON.stringify({journal:{metadata:{stageId:'main_00-01'},squad:[],logs:[]}});
  const row={stageId:'main_00-01',fingerprint:'[1,2,2,0,3]',payload,expectedHash:null};
  assert.equal((await call('GET',{}, {cookie:''})).status,401);
  assert.equal((await call('PUT',row,{origin:'https://evil.invalid'})).status,403);
  assert.equal((await call('GET')).status,403);
  sqlite.prepare('INSERT INTO cloud_save(userId,syncReviewed,gameSync,updatedAt) VALUES(?,1,1,?)').run(user.id,'2026-11-01');
  assert.equal((await call('PUT',{...row,owner:'other'})).status,409);
  const saved=await call('PUT',row);assert.equal(saved.status,200);
  const hash=saved.result.hash;
  assert.equal((await call('GET',{stageId:row.stageId})).result.record.hash,hash,'a successful response corresponds to the stored replay');
  assert.equal((await call('PUT',row)).status,409,'null expected hash cannot overwrite a row');
  assert.equal((await call('PATCH',{stageId:row.stageId,hash,fingerprint:'[1,1,1,0,3]'})).status,409,'older counters cannot overwrite a newer fingerprint');
  assert.equal((await call('PATCH',{stageId:row.stageId,hash,fingerprint:'[1,3,3,0,3]'})).status,200);
  assert.equal((await call('PUT',{...row,expectedHash:hash})).status,409,'stale full record is rejected');
  const updated=await call('PUT',{...row,expectedHash:hash,fingerprint:'[1,3,3,0,3]',payload:JSON.stringify({...JSON.parse(payload),timestamp:2})});
  assert.equal(updated.status,200,'a matching update succeeds even when quota triggers also write');
  assert.notEqual(updated.result.hash,hash);
  assert.equal((await call('DELETE',{stageId:row.stageId,hash,fingerprint:'[0,4,4,0,3]'})).status,409,'a stale hash cannot remove a newer replay');
  assert.equal((await call('DELETE',{stageId:row.stageId,hash:updated.result.hash,fingerprint:'[0,4,4,0,3]'})).status,200,'deletion reports success despite quota maintenance');
  assert.equal(sqlite.prepare('SELECT records FROM auto_deploy_usage WHERE userId=?').get(user.id)?.records,0);
  assert.equal((await call('PUT',row)).status,200);
  assert.equal((await call('GET')).result.records.length,1);
  assert.equal((await call('GET',{namespace:'jp:1'})).result.records.length,0);
  assert.equal((await call('PUT',{...row,namespace:'en:2',payload:JSON.stringify({...JSON.parse(payload),secret:'private'})})).status,400);
  const before=sqlite.prepare('SELECT bytes FROM auto_deploy_usage WHERE userId=?').get(user.id)?.bytes;
  sqlite.prepare('UPDATE auto_deploy_usage SET bytes=33554432 WHERE userId=?').run(user.id);
  assert.equal((await call('PUT',{...row,namespace:'en:2'})).status,413);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auto_deploy').get()?.n,1,'quota rollback retains prior replay');
  sqlite.prepare('UPDATE auto_deploy_usage SET bytes=? WHERE userId=?').run(before,user.id);
  let withdrawalStatus=200;
  const withdrawalResponse={setHeader:()=>{},status:(code:number)=>{withdrawalStatus=code;return withdrawalResponse;},json:()=>{},end:()=>{}};
  await createCloudAccountHandler(()=>env)({method:'PATCH',headers:{cookie,origin:env.ARKPEDIA_AUTH_URL,'content-type':'application/json'},body:{owner:user.id,revision:0,savingVersion:2,gameSync:false}} as NextApiRequest,withdrawalResponse as unknown as NextApiResponse);
  assert.equal(withdrawalStatus,200,'consent withdrawal succeeds when it also deletes replays and updates quota totals');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auto_deploy').get()?.n,0);
  assert.equal(sqlite.prepare('SELECT bytes FROM auto_deploy_usage WHERE userId=?').get(user.id)?.bytes,0);
  assert.equal((await call('PUT',{...row,expectedHash:null})).status,403);
  sqlite.close();
});


test('shared replay queue is FIFO, deduplicates polls and gives a returning browser the last position', async()=>{
  const {sqlite,db}=database(),now=10000000;
  const clients=Array.from({length:30},()=>crypto.randomUUID());
  const first=await Promise.all(clients.map(client=>acquireReplayPermit(db,client,now)));
  assert.equal(first.filter(r=>r.granted).length,1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM replay_wait_queue').get()?.n,29);
  // A fast newcomer or repeated polls cannot overtake an already waiting client.
  const newcomer=crypto.randomUUID();
  assert.equal((await acquireReplayPermit(db,newcomer,now+500)).granted,false);
  for(let i=1;i<clients.length;i++){
    const at=now+i*500;
    assert.equal((await acquireReplayPermit(db,newcomer,at)).granted,false);
    assert.equal((await acquireReplayPermit(db,clients[i],at)).granted,true);
    // Renew the simulated waiting browsers, as the real client does every <=2.1s.
    for(const pending of clients.slice(i+1))await acquireReplayPermit(db,pending,at);
  }
  assert.equal((await acquireReplayPermit(db,newcomer,now+15000)).granted,true);
  assert.equal((await acquireReplayPermit(db,newcomer,now+15500)).granted,false);
  const other=crypto.randomUUID();
  assert.equal((await acquireReplayPermit(db,other,now+15500)).granted,true,'a browser on cooldown does not hold up others');
  assert.equal((await acquireReplayPermit(db,newcomer,now+18000)).granted,true);
  sqlite.close();
});
test('abandoned waits expire, cancellation keeps cooldowns and older clients share the same global allowance',async()=>{
  const {sqlite,db}=database(),now=10000000,a=crypto.randomUUID(),b=crypto.randomUUID();
  assert.equal((await acquireReplayPermit(db,a,now)).granted,true);
  await acquireReplayPermit(db,a,now+1);
  await cancelReplayPermit(db,a);
  assert.equal((await acquireReplayPermit(db,a,now+500)).granted,false,'cancel cannot reset cooldown');
  assert.equal((await acquireReplayPermit(db,b,now+500)).granted,true);
  await acquireReplayPermit(db,a,now+501);
  await cancelReplayPermit(db,a);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM replay_wait_queue').get()?.n,0);
  const abandoned=crypto.randomUUID(),next=crypto.randomUUID();
  await acquireReplayPermit(db,abandoned,now+501);
  assert.equal((await acquireReplayPermit(db,next,now+1000)).granted,false);
  assert.equal((await acquireReplayPermit(db,next,now+501+REPLAY_QUEUE_LEASE)).granted,true);
  await acquireReplayPermit(db,crypto.randomUUID(),now+3620000);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM replay_pacing').get()?.n,2);
  sqlite.close();
});
test('replay queue is bounded, permits existing waiters to renew and reclaims expired capacity',async()=>{
  const {sqlite,db}=database(),now=10000000;
  const clients=Array.from({length:1000},()=>crypto.randomUUID());
  const insert=sqlite.prepare('INSERT INTO replay_wait_queue(client,readyAt,expiresAt) VALUES (?,?,?)');
  for(const client of clients)insert.run(client,now,now+REPLAY_QUEUE_LEASE);
  const overflow=await acquireReplayPermit(db,crypto.randomUUID(),now);
  assert.equal(overflow.full,true);assert.equal(overflow.granted,false);
  const renewed=await acquireReplayPermit(db,clients[999],now+1);
  assert.equal(renewed.full,undefined);assert.equal(renewed.position,1000);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM replay_wait_queue').get()?.n,1000);
  assert.equal((await acquireReplayPermit(db,clients[0],now+500)).granted,true);
  assert.equal((await acquireReplayPermit(db,crypto.randomUUID(),now+REPLAY_QUEUE_LEASE+1)).granted,true);
  sqlite.close();
});
test('replay admission API accepts only anonymous same-origin requests and stops when coordination is unavailable',async()=>{
  const {sqlite,db}=database();const env=envFor(db),handler=createPermitHandler(()=>env);
  const call=async(method='POST',body:unknown={client:crypto.randomUUID()},origin=env.ARKPEDIA_AUTH_URL,run=handler)=>{
    let status=200,result:Record<string,unknown>={};const headers:Record<string,string>={};
    await run({method,body,headers:{origin,'content-type':'application/json'}} as NextApiRequest,{setHeader:(k:string,v:string)=>{headers[k]=v;},status:(n:number)=>{status=n;return {json:(v:Record<string,unknown>)=>{result=v;}};}} as unknown as NextApiResponse);
    assert.equal(headers['Cache-Control'],'private, no-store');return {status,result};
  };
  assert.equal((await call('GET')).status,405);
  assert.equal((await call('POST',{client:crypto.randomUUID()},'https://elsewhere.invalid')).status,403);
  for(const body of [null,[],{client:'global'},{client:crypto.randomUUID(),stageId:'main_00-01'},{client:crypto.randomUUID(),token:'private'}])assert.equal((await call('POST',body)).status,400);
  assert.equal((await call()).result.granted,true);
  assert.equal((await call()).result.granted,false);
  assert.deepEqual((await call('DELETE')).result,{cancelled:true});
  assert.equal((await call('POST',undefined,undefined,createPermitHandler(()=>null))).status,503);
  sqlite.exec('DROP TABLE replay_pacing');assert.equal((await call()).status,503);
  sqlite.close();
});


test('community sharing accepts the same authenticated session as private cloud saves',async()=>{
  const {sqlite,db}=database();
  try{
    const limiter={limit:async()=>({success:true})};
    const env={...envFor(db),ACCOUNT_TRAFFIC_LIMIT:limiter,ACCOUNT_IP_LIMIT:limiter};
    const context=await accountAuth(env).$context;
    const user=await context.internalAdapter.createUser({name:'Test',email:'community@example.invalid',emailVerified:true},{method:'oauth'});
    const session=await context.internalAdapter.createSession(user.id,false);
    const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token,context.secret)}`;
    for(const handler of [createCloudAccountHandler(()=>env),createCommunityHandler('sharing',{resolveEnv:()=>env})]){
      let status=200,result:any;const res={setHeader:()=>{},status:(n:number)=>{status=n;return res;},json:(v:unknown)=>{result=v;},end:()=>{}};
      await handler({method:'GET',headers:{cookie},query:{}} as NextApiRequest,res as unknown as NextApiResponse);
      assert.equal(status,200,JSON.stringify(result));
    }
  }finally{sqlite.close();}
});


test('native OAuth requires provider callback ticket and native proof; cookies never enter URLs or JSON', async () => {
  const { sqlite, db } = database();
  const env = { ...envFor(db), ARKPEDIA_AUTH_URL: 'https://www.arkpedia.net', ARKPEDIA_DEPLOYMENT_ROLE: 'production', ARKPEDIA_ACCOUNTS_ENABLED: '1' };
  const auth = accountAuth(env), context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: 'Test', email: 'native@example.invalid', emailVerified: true }, { method: 'oauth' });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
  const handler = createNativeAuthHandler(() => env);
  async function call(action: string, body: Record<string, unknown> = {}, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
    let status = 200, result: Record<string, unknown> = {}, location = '';
    const responseHeaders: Record<string, string | string[]> = {};
    const res = { setHeader: (key: string, value: string | string[]) => { responseHeaders[key.toLowerCase()] = value; }, status: (value: number) => { status = value; return res; },
      json: (value: Record<string, unknown>) => { result = value; }, end: () => {}, redirect: (value: number, url: string) => { status = value; location = url; } };
    await handler({ method: ['begin', 'redeem'].includes(action) ? 'POST' : 'GET', query: { action, ...query }, body,
      headers: { origin: env.ARKPEDIA_AUTH_URL, cookie, 'content-type': 'application/json', ...headers } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return { status, result, location, headers: responseHeaders };
  }
  try {
    const verifier = 'v'.repeat(43), challenge = await nativeAuthChallenge(verifier);
    const body = { challenge, provider: 'google', mode: 'sign-in', returnPath: '//evil.invalid' };
    assert.equal((await call('begin', body, {}, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await call('begin', { ...body, challenge: 'plain' })).status, 400);
    assert.equal((await call('begin', { ...body, provider: 'unknown' })).status, 400);
    for (const provider of ['google', 'discord']) {
      const begin = await call('begin', { ...body, provider });
      assert.equal(begin.status, 200);
      const state = begin.result.state as string;
      const start = await call('start', {}, { state });
      assert.equal(start.status, 302);
      assert.equal(new URL(start.location).protocol, 'https:');
      assert.equal(new URL(start.location).searchParams.get('redirect_uri'), env.ARKPEDIA_AUTH_URL + '/api/auth/callback/' + provider);
      assert.ok(!start.location.includes(session.token));
      assert.match((await call('start', {}, { state })).location, /error=expired/);
      assert.match((await call('complete', {}, { state })).location, /error=failed/);
      assert.equal((await call('redeem', { state, verifier })).status, 401);
      // Emulate the successful provider return. The extra ticket is stored server-side
      // inside Better Auth's OAuth state; start/failed returns never disclose it.
      const record = sqlite.prepare("SELECT identifier FROM verification WHERE identifier LIKE ?").get('native-complete:' + state + ':%');
      const ticket = String(record.identifier).split(':')[2];
      assert.ok(!start.location.includes(ticket));
      const completed = await call('complete', {}, { state, ticket });
      assert.equal(completed.location, 'net.arkpedia.mobile://auth?state=' + state);
      assert.equal((await call('redeem', { state, verifier: 'x'.repeat(43) })).status, 401);
      const attempts = await Promise.all([call('redeem', { state, verifier }), call('redeem', { state, verifier })]);
      assert.deepEqual(attempts.map(attempt => attempt.status).sort(), [200, 401]);
      const redeemed = attempts.find(attempt => attempt.status === 200)!;
      assert.deepEqual(redeemed.result, { returnPath: '/account?account=welcome' });
      const cookies = redeemed.headers['set-cookie'] as string[];
      assert.ok(cookies.some(value => value.startsWith('__Secure-arkpedia.session_token=') && value.includes('HttpOnly') && value.includes('Secure')));
      assert.ok(!JSON.stringify(redeemed.result).includes(session.token));
      assert.equal((await call('redeem', { state, verifier })).status, 401);
      assert.match((await call('complete', {}, { state, ticket })).location, /error=failed/);
    }
    const linked = await call('begin', { ...body, mode: 'link' });
    assert.equal((await call('start', {}, { state: linked.result.state as string })).status, 302);
    assert.equal((await call('begin', { ...body, mode: 'link' }, {}, { cookie: '' })).status, 401);
    sqlite.prepare('UPDATE session SET createdAt = ? WHERE id = ?').run(Date.now() - 600_000, session.id);
    assert.equal((await call('begin', { ...body, mode: 'link' })).result.code, 'SESSION_NOT_FRESH');
    const expired = await call('begin', body);
    sqlite.prepare("UPDATE verification SET expiresAt = 0 WHERE identifier = ?").run('native-launch:' + expired.result.state);
    assert.match((await call('start', {}, { state: expired.result.state as string })).location, /error=expired/);
    const other = await context.internalAdapter.createUser({ name: 'Other', email: 'other-native@example.invalid', emailVerified: true }, { method: 'oauth' });
    const otherSession = await context.internalAdapter.createSession(other.id, false);
    const otherCookie = `${context.authCookies.sessionToken.name}=${otherSession.token}.${await makeSignature(otherSession.token, context.secret)}`;
    const confirmation = await call('begin', { ...body, mode: 'confirm' });
    const confirmState = confirmation.result.state as string;
    await call('start', {}, { state: confirmState });
    const confirmRecord = sqlite.prepare("SELECT identifier FROM verification WHERE identifier LIKE ?").get('native-complete:' + confirmState + ':%');
    const confirmTicket = String(confirmRecord.identifier).split(':')[2];
    assert.match((await call('complete', {}, { state: confirmState, ticket: confirmTicket }, { cookie: otherCookie })).location, /error=account/);
    assert.equal((await call('redeem', { state: confirmState, verifier })).status, 401);
    const timed = await call('begin', body), timedState = timed.result.state as string;
    await call('start', {}, { state: timedState });
    const timedRecord = sqlite.prepare("SELECT identifier FROM verification WHERE identifier LIKE ?").get('native-complete:' + timedState + ':%');
    await call('complete', {}, { state: timedState, ticket: String(timedRecord.identifier).split(':')[2] });
    sqlite.prepare("UPDATE verification SET expiresAt = 0 WHERE identifier LIKE ?").run('native-handoff:' + timedState + ':%');
    assert.equal((await call('redeem', { state: timedState, verifier })).status, 401);
    const generate = await auth.handler(new Request(env.ARKPEDIA_AUTH_URL + '/api/auth/one-time-token/generate', { headers: { cookie } }));
    assert.equal(generate.status, 400, 'One-time tokens cannot be generated by a browser client');
  } finally { sqlite.close(); }
});
