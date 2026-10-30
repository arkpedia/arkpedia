import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pinnedDataEntries } from '../content/pull-data.mjs';

test('a compile hydrated outside the pull cache can distinguish arriving records from the pinned records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-arrivals-'));
  const cache = path.join(root, 'hydrated-checkout');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: cache, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    fs.mkdirSync(path.join(cache, 'source/data'), { recursive: true });
    git('init', '-q');
    fs.writeFileSync(path.join(cache, 'source/data/existing.json'), '{}');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Pinned records');
    const revision = git('rev-parse', 'HEAD');
    fs.mkdirSync(path.join(root, 'tests/browser'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests/browser/data-pin.json'), JSON.stringify({ revision }));
    fs.writeFileSync(path.join(cache, 'source/data/arriving.json'), '{}');
    assert.equal(pinnedDataEntries(root, {}), null, 'there is no default pull cache during a content compile');
    assert.deepEqual([...pinnedDataEntries(root, { ARKPEDIA_DATA_CACHE: cache })!], ['existing.json']);
    const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
    const compile = workflow.split('- name: Validate and compile data (no website build)')[1].split('\n      - name:')[0];
    assert.match(compile, /ARKPEDIA_DATA_CACHE:.*arkpedia-data.*runner\.temp/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
