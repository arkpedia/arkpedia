import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const helper = fileURLToPath(new URL('../accounts/configure.mjs', import.meta.url));
const options = ['--database-id', '12345678-1234-1234-1234-123456789abc',
  '--database-name', 'explicit-test-only', '--origin', 'https://accounts.example.invalid'];

test('account configuration requires explicit local target and never replaces an existing database or staging', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arkpedia-account-config-'));
  const initial = '{"d1_databases": [], "observability": {"enabled": true}}';
  const run = args => execFileSync(process.execPath, [helper, ...args], { cwd: directory, stdio: 'pipe' });
  try {
    const target = join(directory, 'accounts.jsonc');
    writeFileSync(target, initial);
    assert.throws(() => run(options), /Command failed/);
    assert.equal(readFileSync(target, 'utf8'), initial);
    run(['--config', 'accounts.jsonc', ...options]);
    const configured = readFileSync(target, 'utf8');
    const data = JSON.parse(configured);
    assert.equal(data.d1_databases[0].database_name, 'explicit-test-only');
    assert.equal(data.vars.ARKPEDIA_AUTH_URL, 'https://accounts.example.invalid');
    assert.throws(() => run(['--config', 'accounts.jsonc', ...options]), /Command failed/);
    assert.equal(readFileSync(target, 'utf8'), configured);
    for (const [name, text] of [
      ['wrangler.staging.jsonc', initial],
      ['alternate.jsonc', '{"d1_databases": [], "vars": {"ARKPEDIA_DEPLOYMENT_ROLE": "staging"}}'],
      ['different-origin.jsonc', '{"d1_databases": [], "vars": {"ARKPEDIA_AUTH_URL": "https://other.example.invalid"}}'],
    ]) {
      writeFileSync(join(directory, name), text);
      assert.throws(() => run(['--config', name, ...options]), /Command failed/);
      assert.equal(readFileSync(join(directory, name), 'utf8'), text);
    }
    assert.throws(() => run(['--config', helper, ...options]), /Command failed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
