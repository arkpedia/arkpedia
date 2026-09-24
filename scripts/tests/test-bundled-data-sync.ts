import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// @ts-expect-error Plain Node content-pipeline script.
import { syncBundledData } from '../content/sync-bundled-data.mjs';

// A made-up data repository with one commit, and an app tree that has fallen behind it.
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-bundled-'));
  const data = path.join(base, 'arkpedia-data'), app = path.join(base, 'app');
  const write = (root: string, file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write(data, 'source/data/enemies/Old Event.json', '{"content":{"id":"act41sre"}}\n');
  write(data, 'source/data/enemies/People, A People.json', '{"content":{"id":"act51side"}}\n');
  write(data, 'source/data/skins.json', '["canonical"]\n');
  write(data, 'source/public/enemies-index.json', '[{"slug":"new"}]\n');
  const git = (...args: string[]) => execFileSync('git', ['-C', data, ...args], { stdio: 'pipe' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'release');
  write(app, 'data/enemies/Old Event.json', '{"content":{"id":"act41side"}}\n');
  write(app, 'data/enemies/Retired.json', '{"content":{"id":"gone"}}\n');
  write(app, 'data/enemies/README.md', 'kept\n');
  write(app, 'data/skins.json', '["bundled"]\n');
  write(app, 'public/enemies-index.json', '[{"slug":"old"}]\n');
  return { base, data, app, read: (file: string) => fs.readFileSync(path.join(app, file), 'utf8') };
}

test('a named directory is mirrored from the ref, and nothing outside the named paths moves', () => {
  const { base, data, app, read } = fixture();
  try {
    const result = syncBundledData({ checkout: data, ref: 'HEAD', paths: ['data/enemies/', 'public/enemies-index.json'], root: app });
    assert.deepEqual(result, {
      changed: ['data/enemies/Old Event.json', 'data/enemies/People, A People.json', 'public/enemies-index.json'],
      removed: ['data/enemies/Retired.json'],
    });
    assert.equal(read('data/enemies/People, A People.json'), '{"content":{"id":"act51side"}}\n');
    assert.equal(read('data/enemies/Old Event.json'), '{"content":{"id":"act41sre"}}\n');
    assert.ok(!fs.existsSync(path.join(app, 'data/enemies/Retired.json')));
    // Not a record, so the ref cannot vouch for its absence.
    assert.equal(read('data/enemies/README.md'), 'kept\n');
    // Not named, so left as it was.
    assert.equal(read('data/skins.json'), '["bundled"]\n');
    // Run again: already in line.
    assert.deepEqual(syncBundledData({ checkout: data, ref: 'HEAD', paths: ['data/enemies'], root: app }), { changed: [], removed: [] });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('--check reports the drift and writes nothing; a path the ref lacks or outside the bundle is refused', () => {
  const { base, data, app, read } = fixture();
  try {
    const result = syncBundledData({ checkout: data, ref: 'HEAD', paths: ['data/enemies'], root: app, check: true });
    assert.deepEqual(result.changed, ['data/enemies/Old Event.json', 'data/enemies/People, A People.json']);
    assert.deepEqual(result.removed, ['data/enemies/Retired.json']);
    assert.equal(read('data/enemies/Old Event.json'), '{"content":{"id":"act41side"}}\n');
    assert.ok(fs.existsSync(path.join(app, 'data/enemies/Retired.json')));
    assert.ok(!fs.existsSync(path.join(app, 'data/enemies/People, A People.json')));
    assert.throws(() => syncBundledData({ checkout: data, ref: 'HEAD', paths: ['data/stages'], root: app }), /HEAD has nothing at source\/data\/stages/);
    for (const wrong of ['lib/gacha', 'data/../package.json', 'public/enemy-detail/a.json']) {
      assert.throws(() => syncBundledData({ checkout: data, ref: 'HEAD', paths: [wrong], root: app }), /Not a bundled data path/, wrong);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
