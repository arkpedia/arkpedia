import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// @ts-expect-error Node import scripts are plain JavaScript.
import { eventByTitle, KINDS, nameKey, resolveEventVideos, videoKind, videoOperators, words } from '../sync/event-videos.mjs';
// @ts-expect-error Node import scripts are plain JavaScript.
import { checkCatalogue, checkRegistry, CATALOGUE_FILE, EVENT_VIDEOS_FILE, mergeUploads, OVERRIDES_FILE, REGISTRY_FILE, syncOfficialVideos } from '../sync/sync-official-videos.mjs';
import { VIDEO_KIND_LABELS } from '../../lib/events/eventVideos';

/*
 * The event pages' PVs tab (components/events/EventVideos.tsx) shows what data/event-videos.json
 * files under the event: the official channels' uploads (data/official-videos.json), matched by
 * scripts/sync/event-videos.mjs. A wrong match puts another event's PV on a page, so the rules
 * are pinned here on the cases the Global channel's own history raised (2026-10-23).
 */

const REPO = path.resolve(__dirname, '../..');
/** An upload as the stage files it (the scripts are plain JavaScript, so the test names the shape). */
type Filed = { videoId: string; title: string; kind?: string; published: string };
const at = (day: string) => Date.parse(`${day}T00:00:00Z`);
const event = (name: string, start: string, end: string) => ({ name, start: at(start), end: at(end) });
const upload = (videoId: string, title: string, published: string) => ({ videoId, title, published: `${published}T08:00:00Z` });

test('an upload goes to the event its title names as whole words, not inside another word', () => {
  const events = [event('[Side Story – Carnival] Ato', '2026-02-01', '2026-02-15'), event('[Side Story – Celebration] I Portatori dei Velluti', '2026-02-01', '2026-02-15')];
  assert.equal(eventByTitle('Arknights Official Trailer - I Portatori dei Velluti', '2026-01-25T08:00:00Z', events)?.name, '[Side Story – Celebration] I Portatori dei Velluti');
  assert.equal(eventByTitle('Arknights - New Gameplay of ATO', '2026-01-25T08:00:00Z', events)?.name, '[Side Story – Carnival] Ato');
});

test('of two events a title names, the one with the qualifier wins, and a rerun\'s PV never goes to the first run', () => {
  const events = [
    event('[Side Story] Path of Life', '2024-01-01', '2024-01-15'), event('[Rerun] Path of Life Rerun', '2024-01-20', '2024-01-30'),
    event('Vector Breakthrough', '2025-10-30', '2025-11-20'), event('Vector Breakthrough #2: Trial from Misery', '2025-11-01', '2025-11-20'),
  ];
  assert.equal(eventByTitle('Arknights Animation PV - Path of Life Rerun', '2024-01-20T08:00:00Z', events)?.name, '[Rerun] Path of Life Rerun');
  assert.equal(eventByTitle('Arknights Official Trailer - Vector Breakthrough #2: Trial from Misery', '2025-10-28T08:00:00Z', events)?.name, 'Vector Breakthrough #2: Trial from Misery');
  // A rerun with no record yet: its PV goes nowhere rather than to the first run's page.
  assert.equal(eventByTitle('Arknights Animation PV - Path of Life Rerun', '2024-01-20T08:00:00Z', events.filter((e) => e.name !== '[Rerun] Path of Life Rerun')), null);
});

test('a title matches only an event near the upload: a name used twice goes to the right year', () => {
  const events = [event('Rhodes Island Icebreaker Games', '2024-06-01', '2024-06-21'), event('Icebreaker Games #1', '2025-07-01', '2025-07-21')];
  assert.equal(eventByTitle('Arknights Official Trailer - Rhodes Island Icebreaker Games #1', '2025-06-25T08:00:00Z', events)?.name, 'Icebreaker Games #1');
  assert.equal(eventByTitle('Arknights Official Trailer - Rhodes Island Icebreaker Games', '2024-05-28T08:00:00Z', events)?.name, 'Rhodes Island Icebreaker Games');
  assert.equal(eventByTitle('Arknights Official Trailer - Rhodes Island Icebreaker Games', '2023-01-01T08:00:00Z', events), null);
});

test('a season\'s filler may sit between an event\'s words, and nothing else may', () => {
  const events = [event('Contingency Contract Pyrite', '2020-11-11', '2020-11-25'), event('Icebreaker Games #1', '2025-09-05', '2025-09-20')];
  assert.equal(eventByTitle('Arknights Official Trailer - Contingency Contract Season #1 Operation Pyrite', '2020-11-09T08:00:00Z', events)?.name, 'Contingency Contract Pyrite');
  assert.equal(eventByTitle('Arknights Official Trailer - Contingency Contract Pyrite Season', '2020-11-09T08:00:00Z', events)?.name, 'Contingency Contract Pyrite');
  assert.equal(eventByTitle('Arknights - Contingency Contract Rewards for Pyrite', '2020-11-09T08:00:00Z', events), null);
  assert.equal(eventByTitle('Arknights Official Trailer - Rhodes Island Icebreaker Games #2', '2025-09-04T08:00:00Z', events), null);
});

test('an operator\'s preview and EP go to the event whose banner features them, near its window', () => {
  const albums = [{ albumName: 'Innocence', albumAltName: 'Innocence', characters: ["Kal'tsit - Esperanta"] }, { albumName: '花街迎春', albumAltName: 'Spring Comes to Town', characters: ['Aak', 'Hung'] }];
  assert.deepEqual(videoOperators("Arknights - Kal'tsit Esperanta Preview", albums), ["Kal'tsit Esperanta"]);
  assert.deepEqual(videoOperators('Arknights EP - Innocence', albums), ["Kal'tsit - Esperanta"]);
  assert.deepEqual(videoOperators('Arknights EP - Not An Album', albums), []);
  assert.equal(nameKey("Kal'tsit - Esperanta"), nameKey("Kal'tsit Esperanta"));
  const events = [event('[Celebration] Critical Phase Transition', '2026-10-14', '2026-10-28'), event('[Side Story] People, A People', '2026-09-16', '2026-09-30')];
  const featured = new Map([['[Celebration] Critical Phase Transition', ["Kal'tsit Esperanta", 'Closure']], ['[Side Story] People, A People', ['Friston-3']]]);
  const { events: resolved } = resolveEventVideos({
    channels: [{ id: 'UCR0J2NYGuC8epsa1O4DMmXQ', uploads: [
      upload('gUAcO0qvaQc', "Arknights - Kal'tsit Esperanta Preview", '2026-10-13'),
      upload('Bsjh5U0kA7o', 'Arknights EP - Innocence', '2026-10-16'),
      upload('aaaaaaaaaaa', "Arknights - Kal'tsit Esperanta Preview", '2025-01-01'),
      upload('1pQ8W0LftHU', 'Arknights Official Trailer - Critical Phase Transition', '2026-10-12'),
    ] }],
    events, featured, albums,
  });
  assert.deepEqual(resolved['[Celebration] Critical Phase Transition'].map((v: Filed) => v.videoId), ['1pQ8W0LftHU', 'gUAcO0qvaQc', 'Bsjh5U0kA7o']);
  assert.deepEqual(resolved['[Celebration] Critical Phase Transition'].map((v: Filed) => v.kind), ['trailer', 'operator', 'music']);
  assert.equal(resolved['[Side Story] People, A People'], undefined);
});

test('the first channel with videos for an event is the one shown; overrides add official uploads only', () => {
  const events = [event('[Side Story] Act or Die', '2025-03-01', '2025-03-15')];
  const global = { id: 'UCR0J2NYGuC8epsa1O4DMmXQ', uploads: [upload('ggggggggggg', 'Arknights Official Trailer - Act or Die', '2025-02-25'), upload('lorelorelor', 'Arknights - Sargon: Sands', '2025-03-02')] };
  const other = { id: 'UCnnbUv4urnbWgb_lgGUfeBw', uploads: [upload('kkkkkkkkkkk', 'Arknights Official Trailer - Act or Die', '2025-02-26')] };
  const { events: both } = resolveEventVideos({ channels: [global, other], events, featured: new Map(), albums: [] });
  assert.deepEqual(both['[Side Story] Act or Die'].map((v: Filed) => v.videoId), ['ggggggggggg']);
  const { events: overridden } = resolveEventVideos({ channels: [global], events, featured: new Map(), albums: [], overrides: { '[Side Story] Act or Die': { add: ['lorelorelor'], remove: ['ggggggggggg'] } } });
  assert.deepEqual(overridden['[Side Story] Act or Die'].map((v: Filed) => v.videoId), ['lorelorelor']);
  // An id no official channel uploaded (a typo, a fan's upload) is left out and handed back,
  // never thrown: one bad override must not stop the release.
  const typo = resolveEventVideos({ channels: [global], events, featured: new Map(), albums: [], overrides: { '[Side Story] Act or Die': { add: ['fanupload00', 'lorelorelor'] } } });
  assert.deepEqual(typo.events['[Side Story] Act or Die'].map((v: Filed) => v.videoId), ['ggggggggggg', 'lorelorelor']);
  assert.deepEqual(typo.rejected, [{ event: '[Side Story] Act or Die', videoId: 'fanupload00' }]);
});

test('every kind the matcher gives has a label on the page', () => {
  assert.deepEqual(Object.keys(VIDEO_KIND_LABELS).sort(), [...KINDS].sort());
  for (const [title, kind] of [
    ['Arknights Official Trailer - Crossing', 'trailer'], ['Arknights Animation PV - Babel Rerun', 'animation'], ['Arknights - Ato Event Teaser', 'teaser'],
    ['Arknights - Wang Preview', 'operator'], ['Arknights EP - Oath', 'music'], ['Arknights Special PV - A Gift of Time', 'special'],
    ['Arknights - New Gameplay of First of A Thousand Autumns', 'gameplay'], ['Arknights - Ursus: The truly great', 'video'],
  ] as const) assert.equal(videoKind(title), kind, title);
  assert.equal(words('Zwillingstürme im Herbst'), 'zwillingstürme im herbst');
  assert.equal(words("Dorothy’s Vision"), words("Dorothy's Vision"));
});

test('a night\'s run adds the feed\'s new uploads, leaves shorts out, and keeps a channel it cannot read', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'official-videos-'));
  fs.mkdirSync(path.join(root, 'data'));
  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
  write(REGISTRY_FILE, { channels: [{ id: 'UCR0J2NYGuC8epsa1O4DMmXQ', label: 'Global', region: 'en', use: true }, { id: 'UCnnbUv4urnbWgb_lgGUfeBw', label: 'KR', region: 'kr', use: false }] });
  write(CATALOGUE_FILE, { channels: { UCR0J2NYGuC8epsa1O4DMmXQ: { uploads: [upload('1pQ8W0LftHU', 'Arknights Official Trailer - Critical Phase Transition', '2026-10-12')] } } });
  write(OVERRIDES_FILE, { events: {} });
  const entry = (id: string, title: string, published: string, short = false) => `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><link rel="alternate" href="https://www.youtube.com/${short ? 'shorts/' : 'watch?v='}${id}"/><published>${published}</published></entry>`;
  const feed = `<feed>${entry('H-WVVBy47_o', 'Arknights EP - All by My Design', '2026-10-22T08:00:06+00:00')}${entry('shortshort1', 'New Life - Kal&apos;tsit Shorts', '2026-10-18T04:00:10+00:00', true)}${entry('1pQ8W0LftHU', 'Arknights Official Trailer - Critical Phase Transition', '2026-10-12T08:00:17+00:00')}</feed>`;
  const asked: string[] = [];
  const fetcher = (async (url: string) => { asked.push(url); return new Response(feed); }) as typeof fetch;
  const events = { events: [event('[Celebration] Critical Phase Transition', '2026-10-14', '2026-10-28')], featured: new Map([['[Celebration] Critical Phase Transition', ['Closure']]]) };
  fs.writeFileSync(path.join(root, 'data/albums.json'), JSON.stringify([{ albumName: 'All by My Design', albumAltName: 'All by My Design', characters: ['Closure'] }]));
  await syncOfficialVideos(root, { fetcher, events, log: () => {} });
  assert.deepEqual(asked, ['https://www.youtube.com/feeds/videos.xml?channel_id=UCR0J2NYGuC8epsa1O4DMmXQ'], 'only the channels in use');
  const catalogue = checkCatalogue(JSON.parse(fs.readFileSync(path.join(root, CATALOGUE_FILE), 'utf8')));
  assert.deepEqual(catalogue.channels.UCR0J2NYGuC8epsa1O4DMmXQ.uploads.map((u: { videoId: string }) => u.videoId), ['H-WVVBy47_o', '1pQ8W0LftHU']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, EVENT_VIDEOS_FILE), 'utf8')).events['[Celebration] Critical Phase Transition'].map((v: { videoId: string }) => v.videoId), ['1pQ8W0LftHU', 'H-WVVBy47_o']);

  // The feed down: nothing lost, the channel held for the next run.
  const before = fs.readFileSync(path.join(root, CATALOGUE_FILE), 'utf8');
  await syncOfficialVideos(root, { fetcher: (async () => new Response('', { status: 500 })) as typeof fetch, events, log: () => {} });
  assert.equal(fs.readFileSync(path.join(root, CATALOGUE_FILE), 'utf8'), before);
  const held = JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries.map((e: { stage: string; key: string; action: string }) => `${e.stage} ${e.key} ${e.action}`);
  assert.deepEqual(held, ['official-videos feed:UCR0J2NYGuC8epsa1O4DMmXQ kept-previous']);

  // Offline (an editorial run): no request, the file is filed again as it stands, and the hold
  // stays until a run reads the channel.
  asked.length = 0;
  await syncOfficialVideos(root, { fetcher, events, readFeeds: false, log: () => {} });
  assert.deepEqual(asked, []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries.length, 1);
  await syncOfficialVideos(root, { fetcher, events, log: () => {} });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries.length, 0, 'a run that reads the channel clears it');

  // A mistyped override, on an editorial run: the run files everything else and holds the id.
  write(OVERRIDES_FILE, { events: { '[Celebration] Critical Phase Transition': { add: ['notAnUpload'] }, '[Celebration] Critcal Phase Transition': { add: ['1pQ8W0LftHU'] } } });
  await syncOfficialVideos(root, { fetcher, events, readFeeds: false, log: () => {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, EVENT_VIDEOS_FILE), 'utf8')).events['[Celebration] Critical Phase Transition'].map((v: Filed) => v.videoId), ['1pQ8W0LftHU', 'H-WVVBy47_o']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries.map((e: { key: string; action: string }) => `${e.key} ${e.action}`),
    ['override:[Celebration] Critcal Phase Transition omitted-new', 'override:[Celebration] Critical Phase Transition:notAnUpload omitted-new']);
});

test('mergeUploads keeps one entry per video, newest first, with the feed\'s title', () => {
  const merged = mergeUploads([upload('aaaaaaaaaaa', 'Old title', '2026-01-01'), upload('bbbbbbbbbbb', 'B', '2026-02-01')], [upload('aaaaaaaaaaa', 'New title', '2026-01-01')]);
  assert.deepEqual(merged.map((u: Filed) => `${u.videoId} ${u.title}`), ['bbbbbbbbbbb B', 'aaaaaaaaaaa New title']);
});

/* The released files themselves. The stage writes data/event-videos.json from the others on every
   content run; here it is filed again from this checkout's data, so a change to the rules that is
   not filed, or a hand edit, fails here instead of reaching a page. */
test('data/event-videos.json is the catalogue filed by these rules, from official channels only', async () => {
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8'));
  const registry = checkRegistry(read(REGISTRY_FILE));
  const catalogue = checkCatalogue(read(CATALOGUE_FILE));
  for (const id of Object.keys(catalogue.channels)) assert.ok(registry.some((channel: { id: string }) => channel.id === id), `${id} is not an official channel in the registry`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'official-videos-data-'));
  fs.mkdirSync(path.join(root, 'data'));
  for (const file of [REGISTRY_FILE, CATALOGUE_FILE, OVERRIDES_FILE, 'data/albums.json']) fs.copyFileSync(path.join(REPO, file), path.join(root, file));
  fs.cpSync(path.join(REPO, 'data/events'), path.join(root, 'data/events'), { recursive: true });
  await syncOfficialVideos(root, { readFeeds: false, log: () => {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, EVENT_VIDEOS_FILE), 'utf8')), read(EVENT_VIDEOS_FILE), 'data/event-videos.json is stale: run npx tsx scripts/sync/sync-official-videos.mjs --offline');

  const filed = read(EVENT_VIDEOS_FILE).events as Record<string, { videoId: string; title: string }[]>;
  const owners = new Map<string, string[]>();
  for (const [name, videos] of Object.entries(filed)) for (const video of videos) owners.set(video.videoId, [...(owners.get(video.videoId) ?? []), name]);
  const overrides = read(OVERRIDES_FILE).events as Record<string, { add?: string[] }>;
  const added = new Set(Object.values(overrides).flatMap((o) => o.add ?? []));
  for (const [videoId, names] of owners) if (!added.has(videoId)) assert.equal(names.length, 1, `${videoId} is filed under ${names.join(' and ')}`);
  // The cases that went wrong before the rules took words, windows and the longest name.
  const ids = (name: string) => (filed[name] ?? []).map((v) => v.title);
  assert.ok(ids('[Side Story – Carnival] Ato').every((title) => !/Portatori/.test(title)), 'Ato took I Portatori dei Velluti\'s videos');
  assert.ok(ids('[Celebration] Critical Phase Transition').includes('Arknights Official Trailer - Critical Phase Transition'));
  assert.ok(ids('[Celebration] Critical Phase Transition').includes("Arknights - Kal'tsit Esperanta Preview"));
});
