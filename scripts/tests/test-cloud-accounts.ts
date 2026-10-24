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
  sqlite.exec(fs.readFileSync('migrations/accounts/0001_accounts.sql', 'utf8'));
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
  const db = { prepare, exec: async (sql: string) => sqlite.exec(sql), batch: async (statements: ReturnType<typeof prepare>[]) => Promise.all(statements.map(s => s.all())) } as unknown as D1Database;
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
  sqlite.prepare('DELETE FROM "user" WHERE id = ?').run(user.id);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM cloud_save').get()?.n, 0);
  assert.equal((await call('GET')).status, 401);
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
