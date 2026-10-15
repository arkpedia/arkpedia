import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Plain Node helper.
import { artFoldersFrom, publicDiskReads } from '../lib/public-disk-reads.mjs';
import assetFolders from '../../config/asset-folders.json';

/* Event CG galleries come from the asset index, never the disk. Every published event page once
   carried its poster alone: lib/events/eventCg.ts listed public/cg-collection/, which no machine
   that exports a release has (images under public/ are git-ignored), while the image repository
   published the set. */

test('an event\'s CG set comes from the asset index, from a directory with no public/ or data/', () => {
  // Its own process, with the module first loaded after the move: a module-level path or cache
  // would otherwise keep the repository's directory (#151). Every expectation is read from the
  // index the same run sees, so a refreshed index never fails a content run.
  execFileSync(process.execPath, ['--import', 'tsx', '-e', `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const cwd = process.cwd();
    const index = JSON.parse(fs.readFileSync(path.join(cwd, 'data/assets/public-asset-index.json'), 'utf8'));
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'event-cg-no-disk-'));
    try {
      process.chdir(empty);
      const { getEventCgImages } = require(path.join(cwd, 'lib/events/eventCg.ts'));
      const { getEventCalendar } = require(path.join(cwd, 'lib/home/frontPageContent.ts'));
      const { eventTitle } = require(path.join(cwd, 'lib/events/eventName.mjs'));
      const folders = new Map();
      for (const file of index.files) {
        const match = /^cg-collection\\/([^/]+)\\/([^/]+\\.(?:webp|png|jpe?g))$/i.exec(file);
        if (match) folders.set(match[1], [...(folders.get(match[1]) || []), file]);
      }
      // As sets: the order is naturalCompare's, which this does not change.
      const set = (files) => [...files].sort();
      for (const [folder, files] of folders) {
        const published = files.map((file) => '/' + file);
        assert.deepEqual(set(getEventCgImages(folder)), set(published), folder + ': every published picture');
        for (const event of getEventCalendar()) {
          if (event.name === folder || eventTitle(event.name) === folder) {
            assert.deepEqual(set(getEventCgImages(event.name)), set(published), event.name + ': its CG set, by its tag-free title');
          }
        }
      }
      assert.deepEqual(getEventCgImages('An event with no CG folder'), []);
    } finally {
      process.chdir(cwd);
      fs.rmSync(empty, { recursive: true, force: true });
    }
  `], { cwd: process.cwd(), stdio: 'pipe' });
});

test('the audit flags app code that reads art from the local public/, and not generated JSON', () => {
  const art = artFoldersFrom(assetFolders);
  const kinds = (source: string) => (publicDiskReads(source, 'lib/fixture.ts', art) as { kind: string; folder: string | null }[]).map(({ kind, folder }) => `${kind}:${folder}`);
  // The reader this replaced, and the other shapes the same mistake takes.
  assert.deepEqual(kinds(`const CG_COLLECTION_DIR = path.join(process.cwd(), 'public', 'cg-collection');`), ['art:cg-collection']);
  assert.deepEqual(kinds(`fs.readdirSync(path.join(process.cwd(), 'public/event-poster'));`), ['art:event-poster']);
  assert.deepEqual(kinds(`fs.existsSync(path.resolve('public', \`stages-images/\${file}\`));`), ['art:stages-images']);
  assert.deepEqual(kinds(`const dir = path.join(process.cwd(), 'public', 'future_operator_icons');`), ['art:future_operator_icons']);
  assert.deepEqual(kinds(`fs.readFileSync(path.join(process.cwd(), 'public', 'misc', 'logo.png'));`), ['art:misc']);
  // A computed folder could be art: it is flagged until its file is allowed with a reason.
  assert.deepEqual(kinds(`const local = path.join(process.cwd(), 'public', relative);`), ['unknown:null']);
  assert.deepEqual(kinds(`const root = path.join(process.cwd(), 'public');`), ['unknown:null']);
  // Generated JSON the build writes and reads on purpose, and strings that only start alike.
  assert.deepEqual(kinds(`fs.readFileSync(path.join(process.cwd(), 'public', 'enemies-index.json'), 'utf8');`), []);
  assert.deepEqual(kinds(`fs.readFileSync(path.join(process.cwd(), 'public/stage-guesser/manifest.json'), 'utf8');`), []);
  assert.deepEqual(kinds(`const dataDir = path.join(process.cwd(), 'public', 'planner-data');`), []);
  assert.deepEqual(kinds(`res.setHeader('Cache-Control', 'public, max-age=60'); join('publicity', 'x.png');`), []);
  assert.deepEqual(kinds(`import index from '@/public/stages-index.json'; publicFiles('cg-collection/Crossing');`), []);
});

test('no app code reads art from the local public/ (scripts/audits/check-public-disk-reads.mjs)', () => {
  execFileSync(process.execPath, ['scripts/audits/check-public-disk-reads.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
});
