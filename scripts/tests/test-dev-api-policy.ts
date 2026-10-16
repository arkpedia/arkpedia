import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { devOnlyApi } from '../../lib/dev/devOnly';
import { readOptimizerCache, writeOptimizerCache } from '../../lib/dev/optimizerCache';

test('local API access separates public reads from passcode-protected writes and blocks every production method', async t => {
  const environment: Record<string, string | undefined> = process.env;
  const before = { NODE_ENV: process.env.NODE_ENV, DEV_CONSOLE_PASSCODE: process.env.DEV_CONSOLE_PASSCODE };
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let called = 0;
  const handler = devOnlyApi(async (_req, res) => { called++; res.status(204).end(); }, { passcode: 'writes' });
  const request = async (method: string, passcode?: string, run = handler) => {
    let code = 0;
    const response = { status(value: number) { code = value; return response; }, json() { return response; }, end() { return response; } };
    await run({ method, headers: passcode === undefined ? {} : { 'x-dev-passcode': passcode } } as NextApiRequest, response as unknown as NextApiResponse);
    return code;
  };
  for (const env of ['production', 'test', undefined]) {
    if (env === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = env;
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE']) assert.equal(await request(method, 'secret'), 404);
  }
  assert.equal(called, 0);
  environment.NODE_ENV = 'development';
  process.env.DEV_CONSOLE_PASSCODE = 'secret';
  assert.equal(await request('GET'), 204, 'mount-time result reads need no write passcode');
  assert.equal(await request('HEAD'), 204);
  assert.equal(await request('POST'), 401);
  assert.equal(await request('POST', 'wrong'), 401);
  assert.equal(await request('POST', 'secret'), 204);
  const privateRead = devOnlyApi(async (_req, res) => { res.status(204).end(); }, { passcode: 'all' });
  assert.equal(await request('GET', undefined, privateRead), 401);
  assert.equal(await request('GET', 'secret', privateRead), 204);
  delete process.env.DEV_CONSOLE_PASSCODE;
  assert.equal(await request('POST'), 204);
});

test('optimizer caches preserve legacy calculations and backups without changing source records', t => {
  const original = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-cache-'));
  t.after(() => { process.chdir(original); fs.rmSync(root, { recursive: true, force: true }); });
  process.chdir(root);
  fs.mkdirSync('data');
  const legacy = '{"retained":true}';
  fs.writeFileSync('data/optimizer-results.json', legacy);
  assert.deepEqual(readOptimizerCache('operator'), { retained: true });
  assert.equal(fs.readFileSync('data/optimizer-results.json', 'utf8'), legacy);
  assert.deepEqual(JSON.parse(fs.readFileSync('.cache/optimizers/operator.json', 'utf8')), { retained: true });
  writeOptimizerCache('operator', { updated: true });
  assert.deepEqual(readOptimizerCache('operator'), { updated: true });
  assert.deepEqual(JSON.parse(fs.readFileSync('.cache/optimizers/operator.json.bak', 'utf8')), { retained: true });
  writeOptimizerCache('whole-base', { separate: true });
  assert.deepEqual(readOptimizerCache('whole-base'), { separate: true });
  assert.equal(fs.existsSync('data/whole-base-optimizer-results.json'), false);
  assert.throws(() => writeOptimizerCache('../source' as never, {}), /Unknown optimizer cache/);
});
