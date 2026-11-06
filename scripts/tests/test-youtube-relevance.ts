import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { currentVideoRelevance, isCNVideo, rankDiscoveryVideos, type VideoDiscoveryContext } from '../../lib/music/youtubeRelevance';
import { featuredChannelVideos } from '../../lib/music/youtubeDiscovery';
import { loadVideoDiscoveryContext } from '../../lib/music/youtubeContextServer';
import { archiveListing } from '../sync/sync-youtube-discovery';
import type { YouTubeVideo } from '../../lib/music/youtube';
import { readLocalVideoArchive, YOUTUBE_ARCHIVE_RECORD } from '../../lib/music/youtubeArchiveServer';
import { recordFiles } from '../content/records.mjs';
// @ts-expect-error The shared release fingerprint implementation is plain JavaScript.
import { releaseInput } from '../content/release-input.mjs';

const now = Date.parse('2026-11-06T09:00:00Z');
const until = now + 86400000;
const context: VideoDiscoveryContext = {
  events: [{ name: "The Masses' Travels", aliases: ["The Masses' Travels"], stagePrefixes: ['MT'], until }],
  operators: [{ name: 'Sankta Miksaparato', aliases: ['Sankta Miksaparato', 'Sankta'], until }],
  skins: [{ name: 'Sankta · Caelum Aeternum', aliases: ['Caelum Aeternum'], soleSkinModelAliases: ['Sankta Miksaparato'], until }],
  cnSubjects: [{ aliases: ['Talulah'], globalAt: null }, { aliases: ['Future Operator'], globalAt: until }],
};
const video = (id: string, title: string, channel = id, publishedAt = '2025-10-20T10:00:00Z'): YouTubeVideo => ({
  videoId: id, title, channelLabel: channel, publishedAt, thumbnail: '', url: '', isLivestream: false, liveStatus: 'none',
});

test('old active-event guides outrank current-operator showcases, outfits and fresh unrelated uploads', () => {
  const fresh = video('fresh', 'Arknights news', 'A', '2026-11-06T08:00:00Z');
  const guide = video('guide', 'Arknights MT-EX-8 AFK guide', 'A');
  const operator = video('operator', 'Should you build Sankta Miksaparato? | Arknights');
  const skin = video('skin', 'Arknights Caelum Aeternum skin comparison');
  assert.deepEqual(rankDiscoveryVideos([fresh, skin, operator, guide], context, now).map(v => v.videoId), ['guide', 'operator', 'skin', 'fresh']);
  assert.deepEqual(featuredChannelVideos([fresh, guide, operator, skin], now, context).map(v => v.videoId), ['guide', 'operator', 'skin']);
  assert.equal(currentVideoRelevance(video('other', 'Arknights GM-8 guide'), context, now).score, 0);
  assert.equal(currentVideoRelevance(guide, context, until).score, 0, 'stage-close is exclusive; shop time does not keep a guide current');
});

test('CN is off by default, can be included, and is not inferred from a creator’s language', () => {
  const videos = [video('cn', 'Arknights CN MT-8 guide'), video('future', 'Should you pull Talulah? | Arknights'),
    video('jp', '【アークナイツ | Arknights】MT-8 攻略'), video('kr', '명일방주 Arknights MT-8 공략')];
  assert.deepEqual(rankDiscoveryVideos(videos, context, now).map(v => v.videoId), ['jp', 'kr']);
  assert.equal(rankDiscoveryVideos(videos, context, now, true).length, 4);
  assert.equal(isCNVideo(video('global', 'Arknights Future Operator guide'), context, until), false, 'confirmed Global opening removes the future-content filter');
  assert.equal(isCNVideo(video('jp-cn', '【大陸版：アークナイツ】Arknights guide'), context, now), true);
  assert.equal(isCNVideo({ ...video('generic', 'Arknights the balanced operator'), description: 'An early look at Talulah.' }, context, now), true);
});

test('a skin needs its own current availability, and known archive guides need no invented publication time', () => {
  const indexed = { ...video('indexed', 'Build this operator', 'Guide creator', ''), archived: true as const, operatorNames: ['Sankta Miksaparato'] };
  assert.equal(featuredChannelVideos([indexed], now, context).length, 1);
  assert.equal(featuredChannelVideos([indexed], until, context).length, 0);
  assert.equal(currentVideoRelevance(video('skin', 'Sankta Miksaparato Skin Comparison | Arknights'), context, now).score, 1);
  assert.equal(currentVideoRelevance(video('other-skin', 'Sankta Unavailable Outfit Skin Showcase | Arknights'), context, now).score, 0);
});

test('the real Global records link the running rerun, its stage family and welfare operator', async () => {
  const current = await loadVideoDiscoveryContext(now, true);
  assert.ok(current.events.some(event => event.name === "The Masses' Travels" && event.stagePrefixes?.includes('MT')));
  assert.ok(current.operators.some(operator => operator.name === 'Sankta Miksaparato'));
  assert.ok(current.skins.some(skin => skin.name.includes('The Legend Seeker')));
  assert.ok(current.cnSubjects.some(subject => subject.aliases.includes('Talulah')));
  assert.equal(isCNVideo(video('mt', "Arknights The Masses' Travels guide"), current, now), false, 'a future rerun must not hide an already-Global event');
});

test('the standalone producer reads hydrated records before the derived stage catalogue is rebuilt', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-hydrated-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  for (const entry of fs.readdirSync('data')) {
    if (entry === 'community-stage-catalogue.json') continue;
    const source = path.resolve('data', entry);
    fs.symlinkSync(source, path.join(root, 'data', entry), fs.statSync(source).isDirectory() ? 'junction' : 'file');
  }
  for (const dir of ['public', 'config', 'node_modules']) fs.symlinkSync(path.resolve(dir), path.join(root, dir), 'junction');
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.resolve('scripts/tests/fixtures/youtube-local-context.ts'), new Date(now).toISOString()], {
    encoding: 'utf8', timeout: 30_000,
    cwd: root,
    env: { ...process.env, TSX_TSCONFIG_PATH: path.resolve('tsconfig.json'), ARKPEDIA_WORKER: '', ARKPEDIA_CONTENT_DISABLED: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const current = JSON.parse(result.stdout) as VideoDiscoveryContext;
  assert.ok(current.events.some(event => event.stagePrefixes?.includes('MT')));
  assert.ok(current.operators.some(operator => operator.name === 'Sankta Miksaparato'));
  assert.ok(current.skins.length > 0);
});

test('archive-only changes are public content records and change the release input', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-record-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, YOUTUBE_ARCHIVE_RECORD);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (title: string) => fs.writeFileSync(file, JSON.stringify({ videos: [video('record', title)] }));
  const input = () => releaseInput({ generator: 'a'.repeat(40), sourceHashes: { [YOUTUBE_ARCHIVE_RECORD]: createHash('sha256').update(fs.readFileSync(file)).digest('hex') } });
  write('Arknights first guide');
  assert.ok(recordFiles(root).includes(YOUTUBE_ARCHIVE_RECORD));
  const before = input();
  write('Arknights updated guide');
  assert.notEqual(input(), before, 'an archive update cannot reuse an immutable release id');
  const saved = process.env.ARKPEDIA_YOUTUBE_ARCHIVE_FILE;
  const savedWorker = process.env.ARKPEDIA_WORKER;
  const savedFixture = process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE;
  process.env.ARKPEDIA_YOUTUBE_ARCHIVE_FILE = file;
  delete process.env.ARKPEDIA_WORKER;
  delete process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE;
  try {
    assert.equal(readLocalVideoArchive()[0]?.title, 'Arknights updated guide');
    process.env.ARKPEDIA_WORKER = '1';
    assert.deepEqual(readLocalVideoArchive(), [], 'Workers read the published archive, not local source files');
  }
  finally {
    if (saved === undefined) delete process.env.ARKPEDIA_YOUTUBE_ARCHIVE_FILE;
    else process.env.ARKPEDIA_YOUTUBE_ARCHIVE_FILE = saved;
    if (savedWorker === undefined) delete process.env.ARKPEDIA_WORKER;
    else process.env.ARKPEDIA_WORKER = savedWorker;
    if (savedFixture === undefined) delete process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE;
    else process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE = savedFixture;
  }
});

test('archive lookup accepts trusted creators only and excludes broadcasts without guessing dates', () => {
  const entries = [{ id: 'trusted0001', title: 'Arknights MT-8 guide', channel_id: 'trusted' },
    { id: 'unknown0001', title: 'Arknights MT-8 guide', channel_id: 'unknown' },
    { id: 'stream00001', title: 'Arknights MT-8 guide', channel_id: 'trusted', was_live: true }];
  const found = archiveListing(entries, new Map([['trusted', 'Trusted creator']]));
  assert.equal(found.length, 1);
  assert.equal(found[0].publishedAt, '');
  assert.equal(found[0].archived, true);
});
