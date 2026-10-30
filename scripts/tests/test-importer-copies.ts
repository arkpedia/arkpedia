import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * arkpedia-data's import (its importer/, docs/importer.md) keeps a copy of every module it shares
 * with the site -- lib/ helpers such as the servers' reset times, a few config/ files, the
 * catalogue and stage-runner scripts -- at the same path as here. Each one a file here and there
 * both have must be the same file: a change lands in both repositories, or this fails. Read from
 * data main, where the importer's copies land first (the data change goes before the app's).
 */

const DATA = 'https://github.com/arkpedia/arkpedia-data.git';
// Each repository's own: its package, its stage lists and runner, its Python pins, its tests.
const OWN = [/^package(-lock)?\.json$/, /^tsconfig\.json$/, /^scripts\/content\/run-stage\.mjs$/, /^scripts\/sync\/refresh-stage-data\.sh$/,
  /^scripts\/content\/requirements\.txt$/, /^scripts\/tests\//, /^(data|public)$/];

function importer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-importer-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  try {
    git('clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', DATA, '.');
    git('sparse-checkout', 'set', 'importer');
    return dir;
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    // On a laptop without the network this cannot be checked; in CI it must be.
    if (process.env.CI) throw error;
    return null;
  }
}

test("every file the site shares with arkpedia-data's importer is the same file in both", t => {
  const root = importer();
  if (!root) { t.skip('arkpedia-data could not be cloned'); return; }
  try {
    const files = execFileSync('git', ['ls-files', 'importer'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
      .map(file => file.slice('importer/'.length)).filter(file => !OWN.some(own => own.test(file)));
    const shared = files.filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
    // Not vacuous: the servers' reset times and the stage runner's helpers are among them.
    assert.ok(shared.includes('lib/time/servers.mjs') && shared.includes('scripts/lib/quarantine.mjs'), `${shared.length} shared files`);
    const differ = shared.filter(file => !fs.readFileSync(file).equals(fs.readFileSync(path.join(root, 'importer', file))));
    assert.deepEqual(differ, [], 'change these in both repositories (arkpedia-data importer/ first), or keep a repository\'s own in OWN');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
