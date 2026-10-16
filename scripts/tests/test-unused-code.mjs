import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { declarationDrift, runtimeExports } from '../audits/module-declarations.mjs';

test('the real unused-code configuration reaches pages, manual scripts, tests and .mjs libraries', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-knip-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write('knip.jsonc', fs.readFileSync('knip.jsonc', 'utf8'));
  write('package.json', '{"name":"unused-code-fixture","private":true}');
  write('pages/index.ts', "import { page } from '../lib/page.mjs'; export default () => page;");
  write('lib/page.mjs', 'export const page = 1;');
  write('lib/page.d.mts', 'export declare const page: number;');
  write('scripts/build/manual.mjs', "import { cli } from '../../lib/cli.mjs'; console.log(cli);");
  write('lib/cli.mjs', 'export const cli = 1;');
  write('scripts/tests/test-example.ts', "import { fixture } from '../../lib/fixture'; console.log(fixture);");
  write('lib/fixture.ts', 'export const fixture = 1;');
  const require = createRequire(import.meta.url);
  const cli = path.resolve(path.dirname(require.resolve('knip')), '../bin/knip.js');
  const run = () => spawnSync(process.execPath, [cli, '--directory', root, '--reporter', 'json'], { encoding: 'utf8', timeout: 30000 });
  const clean = run();
  assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`);
  write('lib/cli.mjs', 'export const cli = 1; export const stale = 2;');
  write('lib/orphan.ts', 'export const orphan = 1;');
  write('package.json', '{"name":"unused-code-fixture","private":true,"dependencies":{"unused-fixture-package":"1.0.0"}}');
  const dirty = run();
  assert.equal(dirty.status, 1, `${dirty.stdout}\n${dirty.stderr}`);
  const issues = JSON.parse(dirty.stdout).issues;
  assert.ok(issues.some(i => i.file === 'lib/cli.mjs' && i.exports?.some(e => e.name === 'stale')));
  assert.ok(issues.some(i => i.file === 'lib/orphan.ts' && i.files?.length));
  assert.ok(issues.some(i => i.dependencies?.some(e => e.name === 'unused-fixture-package')));
});

test('declaration checking catches missing/stale exports and parameter-count drift', () => {
  const js = runtimeExports('api.mjs', 'export const value = 1; export function read(x, options = {}) {}');
  const good = runtimeExports('api.d.mts', 'export declare const value: number; export interface OnlyAType {} export function read(x: string, options?: object): string;');
  assert.deepEqual(declarationDrift(js, good), []);
  const bad = runtimeExports('api.d.mts', 'export const obsolete: number; export function read(x: string): string;');
  assert.deepEqual(declarationDrift(js, bad), [
    'value: JavaScript export has no declaration',
    'read: JavaScript/declaration parameter counts differ',
    'obsolete: declared but not exported by JavaScript',
  ]);
});

test('every shared JavaScript declaration matches its runtime export names and parameter counts', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith('.d.mts') ? [file] : [];
  });
  const declarations = walk('lib');
  assert.ok(declarations.length >= 13, 'the shared modules are covered');
  for (const file of declarations) {
    const implementation = file.replace(/\.d\.mts$/, '.mjs');
    assert.ok(fs.existsSync(implementation), file);
    assert.deepEqual(declarationDrift(
      runtimeExports(implementation, fs.readFileSync(implementation, 'utf8')),
      runtimeExports(file, fs.readFileSync(file, 'utf8')),
    ), [], file);
  }
});
