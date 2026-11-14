import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/ccb/operator/[name]';
import type { OperatorBuildData } from '../../lib/ccb/types';

test('CCB reads the local catalogue in a production-mode browser build but never on a Worker', async () => {
  const keys = ['NODE_ENV', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_WORKER', 'VERCEL'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NODE_ENV: 'production', ARKPEDIA_CONTENT_DISABLED: '1', ARKPEDIA_WORKER: '0', VERCEL: '0' });
    async function request() {
      let status = 0;
      let body: OperatorBuildData | undefined;
      const response = { setHeader() {}, status(value: number) { status = value; return response; }, json(value: OperatorBuildData) { body = value; } };
      await handler({ method: 'GET', query: { name: 'Thorns' } } as unknown as NextApiRequest, response as unknown as NextApiResponse);
      return { status, body };
    }
    const local = await request();
    assert.equal(local.status, 200);
    assert.equal(local.body?.name, 'Thorns');
    assert.ok(local.body?.stats?.phases.length);
    process.env.ARKPEDIA_WORKER = '1';
    assert.equal((await request()).status, 404, 'a Worker must not read the bundled source catalogue');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: previous[key] });
    }
  }
});
