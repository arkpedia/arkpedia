import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const PUBLISHER = path.join(process.cwd(), 'scripts/sync/publish-catalogue-assets.py');
const write = (root: string, file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};

/* The catalogue stage's plan names Orienteering 7's banner art with its CN source, and the image
   repository retired that file (CN art, until Global carries the banner). Built again, the
   repository's own check refused it and the whole catalogue-assets stage failed (2026-10-28). */
test('the catalogue publisher leaves a retired image out instead of rebuilding it from the plan\'s source', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-retired-art-')));
  try {
    const images = path.join(root, 'image-assets');
    write(images, 'asset-manifest.json', { version: 1, files: {} });
    write(images, 'asset-source-map.json', { version: 1, sourceRepository: 'https://github.com/yuanyan3060/ArknightsGameResource', files: {} });
    write(images, 'scripts/validate_images.py', 'print("validated")\n');
    const retired = { schemaVersion: 1, paths: { 'headhunting-banner-images/Orienteering 7.webp': { reason: 'CN art until Global carries it', removed: '#32' } } };
    write(images, 'retired-assets.json', retired);
    execFileSync('git', ['init', '-q', '-b', 'main', images]);
    // A source path the build would have to download: reaching it at all would fail this test offline.
    write(root, 'plan.json', { revision: '7'.repeat(40), sourceRepository: 'example/never-fetched',
      files: [{ path: 'headhunting-banner-images/Orienteering 7.webp', sourcePath: 'banner/never-fetched.png' }] });
    const result = spawnSync('python3', [PUBLISHER, 'plan.json', images, '--published', 'published.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Left out headhunting-banner-images\/Orienteering 7\.webp: retired in the image repository/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'published.json'), 'utf8')).files, {}, 'nothing built, nothing claimed');
    assert.equal(fs.existsSync(path.join(images, 'headhunting-banner-images/Orienteering 7.webp')), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(images, 'retired-assets.json'), 'utf8')), retired, 'the retirement stands');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
