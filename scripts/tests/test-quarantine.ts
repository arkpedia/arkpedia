import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// @ts-expect-error Plain Node helper shared by the importers.
import { beginStage, readQuarantine } from '../lib/quarantine.mjs';
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
import { reconcileCalendars } from '../sync/catalogue-model.mjs';

const HELPER = path.resolve('scripts/lib/quarantine.mjs');
function temporary(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-quarantine-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const file = (root: string) => path.join(root, 'data/quarantine.json');
const serverDay = (seconds: number) => new Date((seconds + 8 * 3600) * 1000).toISOString().slice(0, 10).replaceAll('-', '/');

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
    // A refresh run by hand, or the manual fallback's pull request: the file belongs to arkpedia-data.
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

/*
 * data/quarantine.json is a release input, so a day on which nothing changed -- the same
 * tables, the same wiki rows, the same records -- must write it byte for byte, even with
 * the clock a few days on and every mirror at a newer commit. Each writer below has
 * something to report on both days: CN pools published from the client (one a Joint
 * Operation, named after its pool), wiki event rows that stop matching (one of them opening
 * between the two days), a Global pool in another record's estimated window, and two Kernel
 * banners, one waiting for an operator record and one the wiki row disagrees with.
 */
test('the same inputs on two different days, with the mirrors a commit on, write the same quarantine file byte for byte', async () => {
  const cnDay = (day: string) => Date.parse(`${day.replaceAll('/', '-')}T16:00:00+08:00`) / 1000;
  const enDay = (day: string) => Date.parse(`${day.replaceAll('/', '-')}T04:00:00-07:00`) / 1000;
  const fortnight = (open: number) => open + 14 * 86400 - 1;
  const empty = { characters: {}, skins: { charSkins: {}, brandList: {} }, activity: { basicInfo: {}, missionData: {} }, gacha: { gachaPoolClient: [] } };
  const activities = Object.fromEntries(['2026/06/01', '2026/06/15', '2026/07/01', '2026/07/15', '2026/09/24'].map((day, i) =>
    [`act${i}`, { id: `act${i}`, name: `act${i}`, hasStage: true, startTime: cnDay(day), endTime: cnDay(day) + 14 * 86400 }]));
  const cn = { ...empty, source: 'cn-mirror', activity: { basicInfo: activities, missionData: {} }, gacha: { gachaPoolClient: [
    { gachaPoolId: 'NORM_90_0_3', gachaRuleType: 'NORMAL', gachaPoolName: '适合多种场合的强力干员', openTime: cnDay('2026/09/14'), endTime: fortnight(cnDay('2026/09/14')) },
    { gachaPoolId: 'LIMITED_90_0_1', gachaRuleType: 'LIMITED', gachaPoolName: '限定之名', openTime: cnDay('2026/09/10'), endTime: fortnight(cnDay('2026/09/10')), limitParam: { limitedCharId: 'char_9001_ltd' } },
  ] } };
  const en = { ...empty, source: 'en-mirror', gacha: { gachaPoolClient: [
    { gachaPoolId: 'SINGLE_EN_50_0_1', gachaRuleType: 'SINGLE', gachaPoolName: 'Dithyramb Unending', openTime: enDay('2026/09/20'), endTime: fortnight(enDay('2026/09/20')) },
  ] } };
  const operators = [{ name: 'Limited Six', internalName: 'char_9001_ltd', rarity: 6 }, { name: 'Five A', internalName: 'char_9003_five', rarity: 5 }];
  const eventRows = Object.values(activities).map((act: any, i) => ({ name: `Event ${i}`, type: 'side story', cnstart: serverDay(act.startTime), cnend: '2026/12/31' }));
  const catalogueBanners = [{ name: 'Deterministic Chaos', pull_type: 'featured', category: 'standard', global_date: '2026/09/20–2026/10/04', cnPoolId: 'SINGLE_75_0_1' }];
  // The recurring importer builds its client URL from the pin when it loads, so each day loads its own copy.
  const kernelPool = (gachaPoolId: string, day: string, rare5CharList: string[]) => ({ gachaPoolId, gachaRuleType: 'CLASSIC_DOUBLE', openTime: enDay(day), endTime: fortnight(enDay(day)),
    dynMeta: { main6RarityCharId: 'six_c', sub6RarityCharId: 'six_d', rare5CharList } });
  const gachaTable = { gachaPoolClient: [kernelPool('kernel_a', '2026/09/01', ['newguy', 'five_e', 'five_f']), kernelPool('kernel_b', '2026/09/15', ['five_d', 'five_e', 'five_f'])] };
  const characters = Object.fromEntries(['Six C', 'Six D', 'Five D', 'Five E', 'Five F', 'NewGuy'].map(name => [name.toLowerCase().replace(' ', '_'), { name }]));
  const roster = new Map([['Six C', 6], ['Six D', 6], ['Five D', 5], ['Five E', 5], ['Five F', 5], ['Five A', 5]]);
  const wikiRows = [
    { type: 'kernel', number: 60, start: '2026/09/01', end: '2026/09/15', operators: ['Six C', 'Six D', 'NewGuy', 'Five E', 'Five F'] },
    { type: 'kernel', number: 61, start: '2026/09/15', end: '2026/09/29', operators: ['Six C', 'Six D', 'Five A', 'Five E', 'Five F'] },
  ];
  const pin = 'ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSGAMEDATA', pinned = process.env[pin];
  const recurringAt = async (commit: string) => {
    process.env[pin] = commit;
    try { return await import(`../sync/sync-recurring-banners.mjs?pin=${commit}`); } finally { if (pinned === undefined) delete process.env[pin]; else process.env[pin] = pinned; }
  };
  const days = [{ now: new Date('2026-09-22T12:00:00Z'), recurring: await recurringAt('a'.repeat(40)) }, { now: new Date('2026-09-26T12:00:00Z'), recurring: await recurringAt('b'.repeat(40)) }];
  temporary(root => {
    let records = { events: [] as object[], banners: catalogueBanners as object[], recurring: [] as object[] };
    const files = days.map(({ now, recurring }) => {
      const calendars = reconcileCalendars({ events: records.events, banners: records.banners, operators, cn, en, eventRows, bannerRows: [], now: now.getTime() });
      const banners = recurring.reconcileRecurringBanners({ banners: records.recurring, gachaTable, characters, wikiRows, roster, now: now.getTime() });
      for (const [stage, entries] of [['catalogue', calendars.quarantine], ['recurring-banners', banners.quarantine]] as [string, object[]][]) {
        const writer = beginStage(root, stage, now);
        for (const entry of entries) writer.add(entry);
        writer.commit();
      }
      records = { events: calendars.events, banners: calendars.banners, recurring: banners.banners };
      return fs.readFileSync(file(root), 'utf8');
    });
    const entries = readQuarantine(root).entries;
    assert.deepEqual(entries.map((e: any) => e.key), ['banner:LIMITED_90_0_1', 'banner:NORM_90_0_3', 'banner:SINGLE_EN_50_0_1', 'events:wiki-rows', 'banner:kernel_a', 'banner:kernel_b']);
    assert.match(entries[1].reason, /^Joint Operation \(NORM_90_0_3\) is published from the CN client without/, 'the pool id once');
    assert.equal(files[1], files[0]);
  });
});
