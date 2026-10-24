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

const account = { version: 1, server: 'en', importedAt: '2026-10-24T12:00:00Z', doctor: 'Doctor', operators: ['Amiya'], skins: [], cleared: [] };
function storage(entries: Record<string, string> = {}) {
  return { entries, getItem: (k: string) => entries[k] ?? null, setItem: (k: string, v: string) => { entries[k] = v; }, removeItem: (k: string) => { delete entries[k]; } } as Storage & { entries: Record<string, string> };
}

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
