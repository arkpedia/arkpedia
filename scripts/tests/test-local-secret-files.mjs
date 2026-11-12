import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('local credentials and databases stay ignored while example settings remain shareable', () => {
  const privatePaths = ['.env', '.env.production', '.env.preview.local', '.dev.vars', '.dev.vars.preview',
    'credentials.pem', 'signing.key', 'identity.p12', 'identity.pfx', 'account.sqlite', 'account.sqlite3', 'secrets/token.json'];
  const examples = ['.env.example', '.env.production.example', '.dev.vars.example'];
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    input: [...privatePaths, ...examples].join('\n') + '\n', encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').sort(), privatePaths.sort());
});
