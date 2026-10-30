import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// @ts-expect-error Plain Node helper shared by the importers.
import { beginStage, readQuarantine } from '../lib/quarantine.mjs';

const HELPER = path.resolve('scripts/lib/quarantine.mjs');
function temporary(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-quarantine-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const file = (root: string) => path.join(root, 'data/quarantine.json');

test('a stage writes its entries sorted by stage then key, pretty-printed with a trailing newline', () => {
  temporary(root => {
    const art = beginStage(root, 'catalogue-art', new Date('2026-09-23T10:00:00Z'));
    art.add({ key: 'art:event-poster/B.webp', reason: 'No upload yet', action: 'published-partial', sourceRef: 'File:CN B banner.png' });
    art.commit();
    const catalogue = beginStage(root, 'catalogue', new Date('2026-09-23T10:00:00Z'));
    catalogue.add({ key: 'banner:SINGLE_77_0_1', reason: 'unknown operator X', action: 'omitted-new' });
    catalogue.add({ key: 'banner:LIMITED_77_0_2', reason: 'no lineup', action: 'published-partial' });
    catalogue.commit();
    const text = fs.readFileSync(file(root), 'utf8');
    assert.ok(text.endsWith('}\n') && text.includes('\n  "entries": [\n    {\n      "key"'));
    assert.deepEqual(JSON.parse(text), { version: 1, entries: [
      { key: 'banner:LIMITED_77_0_2', stage: 'catalogue', reason: 'no lineup', action: 'published-partial', firstSeen: '2026-09-23' },
      { key: 'banner:SINGLE_77_0_1', stage: 'catalogue', reason: 'unknown operator X', action: 'omitted-new', firstSeen: '2026-09-23' },
      { key: 'art:event-poster/B.webp', stage: 'catalogue-art', reason: 'No upload yet', action: 'published-partial', sourceRef: 'File:CN B banner.png', firstSeen: '2026-09-23' },
    ] });
  });
});

test('a key reported again keeps its firstSeen, a recovered one drops off, and other stages are untouched', () => {
  temporary(root => {
    const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
    const first = beginStage(root, 'catalogue', day('2026-09-20'));
    first.add({ key: 'banner:A', reason: 'r', action: 'omitted-new' });
    first.add({ key: 'banner:B', reason: 'r', action: 'omitted-new' });
    first.commit();
    const other = beginStage(root, 'enemies', day('2026-09-20'));
    other.add({ key: 'enemy:x', reason: 'r', action: 'kept-previous' });
    other.commit();
    const second = beginStage(root, 'catalogue', day('2026-09-23'));
    second.add({ key: 'banner:B', reason: 'still r', action: 'published-partial' });
    second.add({ key: 'banner:C', reason: 'r', action: 'omitted-new' });
    assert.deepEqual(second.commit().map((e: any) => [e.key, e.firstSeen]), [['banner:B', '2026-09-20'], ['banner:C', '2026-09-23']]);
    const entries = readQuarantine(root).entries;
    assert.deepEqual(entries.map((e: any) => [e.stage, e.key, e.firstSeen, e.reason]), [
      ['catalogue', 'banner:B', '2026-09-20', 'still r'],
      ['catalogue', 'banner:C', '2026-09-23', 'r'],
      // A stage that did not run this time keeps its entries exactly.
      ['enemies', 'enemy:x', '2026-09-20', 'r'],
    ]);
    // A stage that ran and found nothing empties its own entries only.
    beginStage(root, 'catalogue', day('2026-09-24')).commit();
    assert.deepEqual(readQuarantine(root).entries.map((e: any) => e.key), ['enemy:x']);
  });
});

test('a day that holds the same records leaves the file byte for byte, since it is a release input', () => {
  temporary(root => {
    const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
    const report = (iso: string, reason: string) => {
      const stage = beginStage(root, 'catalogue', day(iso));
      stage.add({ key: 'banner:A', reason, action: 'published-partial', sourceRef: 'https://example.invalid/a' });
      stage.commit();
      return fs.readFileSync(file(root), 'utf8');
    };
    const monday = report('2026-09-21', 'no lineup');
    assert.equal(report('2026-09-22', 'no lineup'), monday);
    assert.equal(report('2026-10-30', 'no lineup'), monday);
    // A new reason is a change; the entry still dates from its first day.
    const changed = report('2026-10-31', 'no lineup and no art');
    assert.notEqual(changed, monday);
    assert.deepEqual(readQuarantine(root).entries.map((e: any) => [e.firstSeen, e.reason]), [['2026-09-21', 'no lineup and no art']]);
  });
});

test('a stage with nothing to report starts no quarantine file, but still clears its entries from one', () => {
  temporary(root => {
    // A refresh run by hand: the file belongs to arkpedia-data.
    assert.deepEqual(beginStage(root, 'item-icons', new Date('2026-09-23T12:00:00Z')).commit(), []);
    assert.equal(fs.existsSync(file(root)), false);
    const held = beginStage(root, 'item-icons', new Date('2026-09-23T12:00:00Z'));
    held.add({ key: 'item-icon:a', reason: 'r', action: 'published-partial' });
    held.commit();
    beginStage(root, 'item-icons', new Date('2026-09-24T12:00:00Z')).commit();
    assert.equal(fs.readFileSync(file(root), 'utf8'), '{\n  "version": 1,\n  "entries": []\n}\n');
  });
});

test('lastSeen, which files written before 2026-09 carry, is dropped from every entry written', () => {
  temporary(root => {
    fs.mkdirSync(path.dirname(file(root)), { recursive: true });
    fs.writeFileSync(file(root), JSON.stringify({ version: 1, entries: [
      { key: 'banner:A', stage: 'catalogue', reason: 'r', action: 'omitted-new', firstSeen: '2026-09-20', lastSeen: '2026-09-23' },
      { key: 'enemy:x', stage: 'enemies', reason: 'r', action: 'kept-previous', firstSeen: '2026-09-21', lastSeen: '2026-09-23' },
    ] }));
    const stage = beginStage(root, 'catalogue', new Date('2026-09-24T12:00:00Z'));
    stage.add({ key: 'banner:A', reason: 'r', action: 'omitted-new' });
    stage.commit();
    assert.deepEqual(readQuarantine(root).entries, [
      { key: 'banner:A', stage: 'catalogue', reason: 'r', action: 'omitted-new', firstSeen: '2026-09-20' },
      { key: 'enemy:x', stage: 'enemies', reason: 'r', action: 'kept-previous', firstSeen: '2026-09-21' },
    ]);
  });
});

test('an entry may name a longer wait before it is overdue; it is written, kept across days, and a whole number', () => {
  temporary(root => {
    const first = beginStage(root, 'albums', new Date('2026-09-25T10:00:00Z'));
    first.add({ key: 'song:1', reason: 'no upload yet', action: 'published-partial', overdueAfterDays: 45 });
    first.add({ key: 'song:2', reason: 'upload found, needs a person', action: 'published-partial' });
    first.commit();
    const later = beginStage(root, 'albums', new Date('2026-10-01T10:00:00Z'));
    later.add({ key: 'song:1', reason: 'no upload yet', action: 'published-partial', overdueAfterDays: 45 });
    later.add({ key: 'song:2', reason: 'upload found, needs a person', action: 'published-partial' });
    later.commit();
    assert.deepEqual(readQuarantine(root).entries.map(({ key, overdueAfterDays, firstSeen }: { key: string; overdueAfterDays?: number; firstSeen: string }) => [key, overdueAfterDays, firstSeen]),
      [['song:1', 45, '2026-09-25'], ['song:2', undefined, '2026-09-25']]);
    for (const bad of [0, -1, 1.5, '45']) {
      assert.throws(() => later.add({ key: 'song:3', reason: 'r', action: 'published-partial', overdueAfterDays: bad }), /expected a whole number of days/);
    }
  });
});

test('dates are UTC days, the first report of a key in a run stands, and a malformed entry is a bug', () => {
  temporary(root => {
    // 23:30 in UTC-5 is already the next UTC day.
    const stage = beginStage(root, 'catalogue', new Date('2026-09-23T23:30:00-05:00'));
    stage.add({ key: 'banner:A', reason: 'first', action: 'omitted-new' });
    stage.add({ key: 'banner:A', reason: 'second', action: 'kept-previous' });
    const [entry] = stage.commit();
    assert.deepEqual([entry.firstSeen, entry.reason, entry.action], ['2026-09-24', 'first', 'omitted-new']);
    assert.throws(() => stage.add({ key: 'banner:B', reason: 'r', action: 'skipped' }), /expected one of omitted-new, kept-previous, published-partial/);
    assert.throws(() => stage.add({ key: '', reason: 'r', action: 'omitted-new' }), /has no key/);
    assert.throws(() => stage.add({ key: 'banner:B', reason: ' ', action: 'omitted-new' }), /has no reason/);
    assert.throws(() => beginStage(root, '', new Date()), /needs a name/);
    fs.writeFileSync(file(root), '{"entries":{}}');
    assert.throws(() => readQuarantine(root), /not a version 1 quarantine list/);
  });
});

test('importers in other languages report through the command line, under the clock ARKPEDIA_NOW names', () => {
  temporary(root => {
    const run = (stage: string, entries: object[], now: string) => execFileSync(process.execPath, [HELPER, stage],
      { cwd: root, input: JSON.stringify(entries), env: { ...process.env, ARKPEDIA_NOW: now }, encoding: 'utf8' });
    assert.match(run('ra-maps', [{ key: 'ra-map:a', reason: 'wiki unreachable', action: 'published-partial' }], '2026-09-22T20:00:00Z'), /1 record\(s\) quarantined by ra-maps/);
    assert.match(run('ra-maps', [{ key: 'ra-map:a', reason: 'wiki unreachable', action: 'published-partial' }], '2026-09-23T20:00:00Z'), /since 2026-09-22/);
    assert.deepEqual(readQuarantine(root).entries.map((e: any) => [e.key, e.firstSeen]), [['ra-map:a', '2026-09-22']]);
    assert.match(run('ra-maps', [], '2026-09-24T20:00:00Z'), /Nothing quarantined by ra-maps/);
    assert.deepEqual(readQuarantine(root).entries, []);
  });
});

test('a reason that carries text which changes by itself is refused, from any importer, and the day\'s own words pass', () => {
  temporary(root => {
    const stage = beginStage(root, 'palettes', new Date('2026-09-26T10:00:00Z'));
    const key = 'palette:/five-star-skins/Harold - Base.webp';
    // What the palettes stage wrote before 2026-09-26: an object's address (another each run),
    // then a download error with its URL at the skin pin and the day's wording.
    for (const reason of [
      '/five-star-skins/Harold - Base.webp: keeps its previous palette (UnidentifiedImageError: cannot identify image file <_io.BytesIO object at 0x108905580>)',
      '/five-star-skins/Harold - Base.webp: keeps its previous palette (OSError: https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/eb9f58b6c1f2a3d4e5f60718293a4b5c6d7e8f90/five-star-skins/Harold%20-%20Base.webp: <urlopen error [Errno 61] Connection refused>)',
      'Downloading the crest failed (HTTP Error 502: Bad Gateway)',
      'Wiki page Event/Upcoming cannot be used: fetch failed (ECONNREFUSED); its last good read (14 rows) is used instead.',
    ]) assert.throws(() => stage.add({ key, reason, action: 'kept-previous' }), /changes by itself and would make every run a new release/, reason);
    // Reasons the stages write today, each the same words every day it holds the same record.
    for (const reason of [
      '/five-star-skins/Harold - Base.webp: keeps its previous palette, since it could not be downloaded from the pinned skin repository',
      'PA-4 (People, A People): the in-game render map/act51side_04.png is staged as .cache/stage-renders/pa-4.png, but no run has published it to arkpedia-image-assets as stages-images/pa-4.webp yet; the stage is published without a map preview until one does.',
      'stage:asset-revisions failed or timed out; the run\'s stage report says how',
      'Downloading File:CN Gone banner.png on the EN wiki failed; the record is published without event-poster/Gone.webp until a later run imports it.',
      'Rage of The Many (act99mini) is a MULTIPLAY_V4 activity, a type data/game-modes.json does not classify, so it is listed as an ordinary event.',
      'The staged file .cache/stage-renders/pa-4.png is not the file its importer staged (#c03030 hair)',
    ]) assert.doesNotThrow(() => stage.add({ key: `k:${reason.length}`, reason, action: 'published-partial', sourceRef: 'https://raw.githubusercontent.com/o/r/eb9f58b6c1f2a3d4e5f60718293a4b5c6d7e8f90/x.png' }), reason);
    // The command line the Python importers report through refuses it too, and writes nothing.
    const bad = [{ key, reason: 'no palette (UnidentifiedImageError: cannot identify image file <_io.BytesIO object at 0x10ab3c2d0>)', action: 'omitted-new' }];
    assert.throws(() => execFileSync(process.execPath, [HELPER, 'palettes'], { cwd: root, input: JSON.stringify(bad), stdio: 'pipe' }), /0x10ab3c2d0/);
    assert.equal(fs.existsSync(file(root)), false);
  });
});

test('a reason never names wiki.gg, which a released record may only cite, from any importer', () => {
  temporary(root => {
    const stage = beginStage(root, 'reward-icons', new Date('2026-10-15T10:00:00Z'));
    // What the reward-icons stage wrote on 2026-10-15 for an icon it staged and could not publish:
    // test-data-records.ts failed the whole release on the host in it.
    for (const reason of [
      'The reward "Playback Stool" of [Celebration] Critical Phase Transition has an icon at arknights.wiki.gg, staged as .cache/reward-icons/Playback Stool.png, but no run has published it to arkpedia-image-assets as material-icons/Playback Stool.webp yet; it renders without one until one does.',
      'Downloading https://arknights.wiki.gg/images/CN_Gone_banner.png?0a1b2c failed; the record is published without event-poster/Gone.webp until a later run imports it.',
    ]) assert.throws(() => stage.add({ key: 'reward-icon:Playback Stool', reason, action: 'published-partial' }), /names wiki\.gg in its reason/, reason);
    // The same in the words the stages write now, with the address where it belongs.
    assert.doesNotThrow(() => stage.add({ key: 'reward-icon:Playback Stool', action: 'published-partial', sourceRef: 'https://arknights.wiki.gg/images/Playback_Stool.png?e877ba',
      reason: 'The reward "Playback Stool" of [Celebration] Critical Phase Transition has an icon at the EN wiki, staged as .cache/reward-icons/Playback Stool.png, but no run has published it to arkpedia-image-assets as material-icons/Playback Stool.webp yet; it renders without one until one does.' }));
    const bad = [{ key: 'reward-icon:Paper Crown', reason: 'The reward "Paper Crown" of [Side Story] Test has an icon at arknights.wiki.gg, but downloading it failed', action: 'published-partial' }];
    assert.throws(() => execFileSync(process.execPath, [HELPER, 'reward-icons'], { cwd: root, input: JSON.stringify(bad), stdio: 'pipe' }), /names wiki\.gg/);
    assert.equal(fs.existsSync(file(root)), false);
  });
});

test('a sourceRef that moves only to a newer mirror commit is the same source, and leaves the file byte for byte', () => {
  temporary(root => {
    const raw = (commit: string) => `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${commit}/item/act99side_token_new.png`;
    const report = (iso: string, sourceRef: string) => {
      const stage = beginStage(root, 'item-icons', new Date(`${iso}T20:00:00Z`));
      stage.add({ key: 'item-icon:act99side_token_new', reason: 'staged, not published', action: 'published-partial', sourceRef });
      stage.commit();
      return fs.readFileSync(file(root), 'utf8');
    };
    const first = report('2026-09-21', raw('a'.repeat(40)));
    // The mirror commits most days, and every run reads it at that day's pin.
    assert.equal(report('2026-09-22', raw('b'.repeat(40))), first);
    assert.equal(readQuarantine(root).entries[0].sourceRef, raw('a'.repeat(40)), 'the permalink it was first reported with');
    // Another file, or another host, is another source.
    assert.notEqual(report('2026-09-23', raw('c'.repeat(40)).replace('act99side_token_new', 'act98side_token')), first);
    assert.notEqual(report('2026-09-24', 'https://arknights.wiki.gg/images/act99side_token_new.png'), first);
  });
});
