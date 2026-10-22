import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/* Server code runs on Vercel's Node and on the Cloudflare Worker (docs/development/cloudflare-workers.md).
   The Worker's fetch throws on two options Node accepts, before any request is sent: `credentials`, and a
   `redirect` of 'error' ('follow' and 'manual' only). On 2026-10-22 the account import's server list
   and every music cover failed on the Worker for this, and worked on Vercel. A server-side fetch that must
   not follow a redirect uses 'manual' and checks the status: a 3xx is not `ok`. Checked here: every API
   route, and the lib modules each one imports. */
const API = 'pages/api';
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.(ts|tsx|mjs|js)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
const resolve = (spec: string) => ['.ts', '.tsx', '.mjs', '.js', '/index.ts'].map(ext => spec.replace(/^@\//, '') + ext).find(file => fs.existsSync(file));

test('server code passes fetch no option a Cloudflare Worker rejects', () => {
  const routes = files(API);
  assert.ok(routes.length > 10, 'the API routes were found');
  const checked = new Set<string>();
  for (const route of routes) {
    checked.add(route);
    for (const [, spec] of fs.readFileSync(route, 'utf8').matchAll(/from '(@\/lib\/[^']+)'/g)) {
      const file = resolve(spec);
      if (file) checked.add(file);
    }
  }
  const failures = [...checked].flatMap(file => fs.readFileSync(file, 'utf8').split('\n').flatMap((line, index) =>
    /\bredirect:\s*'error'|\bcredentials:\s*'/.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
  assert.deepEqual(failures, []);
  assert.ok(checked.has('lib/account-import/publicNetwork.ts'), 'the import\'s server list is among them');
});
