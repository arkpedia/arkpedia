import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('root configuration is explicit and temporary artifacts stay out of Git', () => {
  const allowed = new Set([
    '.env.example', '.dev.vars.example', '.gitignore', '.vercelignore', '.nvmrc',
    'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'RIGHTS.md', 'eslint.config.mjs', 'next-env.d.ts', 'next.config.js',
    'package-lock.json', 'package.json', 'playwright.config.ts', 'playwright.optimizer.config.ts', 'playwright.webkit-music.config.ts', 'tsconfig.json', 'vercel.json',
    'knip.jsonc', 'open-next.config.ts', 'open-next.preview.config.ts', 'wrangler.preview.jsonc',
    'wrangler.jsonc',
  ]);
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(tracked.filter(file => !file.includes('/') && !allowed.has(file)), []);
  // One root lint config, in ESLint 9's flat form: `next lint` is gone in Next 16, so the
  // eslintrc files it read are gone with it rather than left to be silently ignored.
  assert.ok(fs.existsSync('eslint.config.mjs'), 'the flat lint config is the only root one');
  assert.equal(fs.existsSync('.eslintrc.json'), false);
  assert.equal(fs.existsSync('scripts/.eslintrc.json'), false);
  assert.equal(JSON.parse(fs.readFileSync('tsconfig.json', 'utf8')).compilerOptions.noUnusedLocals, true);
});

test('private survey responses and the retired database cannot reenter the source tree', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(tracked.filter(file => file.startsWith('data/survey/') || file.startsWith('database/')), []);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies.pg, undefined);
  assert.equal(pkg.devDependencies['@types/pg'], undefined);
  // A stale local copy or deployment trace still must not publish the private source.
  assert.match(fs.readFileSync('.vercelignore', 'utf8'), /^data\/survey\/poll_raw_export_clean\.csv$/m);
});
