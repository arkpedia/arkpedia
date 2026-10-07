import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  MUSIC_RESUME_KEY, MUSIC_RESUME_MAX_AGE_MS, parseMusicResume, restoreQueue, takeMusicResume, writeMusicResume, type MusicResumeState,
} from '../../lib/music/musicResume';

/*
 * The music carries on across a new document of the tab (lib/music/musicResume.ts): a reload, or
 * the load Next makes in place of a navigation after a deploy. The browser half is
 * tests/browser/music-resume.spec.ts; this is the record the two documents share.
 */

function memory(entries: Record<string, string> = {}) {
  return {
    entries,
    getItem: (key: string) => (key in entries ? entries[key] : null),
    setItem: (key: string, value: string) => { entries[key] = value; },
    removeItem: (key: string) => { delete entries[key]; },
  };
}

const NOW = Date.parse('2026-10-08T12:00:00Z');
const RECORD: MusicResumeState = {
  version: 1, savedAt: NOW - 2000, left: true, videoId: 'vid-c', title: 'Song C', seconds: 83.4, duration: 240, playing: true,
  // The reader moved d to the front and took b out; the shuffled order plays c, a, d.
  queue: ['vid-d', 'vid-a', 'vid-c'], queueIndex: 2, shuffle: true, shuffleOrder: ['vid-c', 'vid-a', 'vid-d'], shufflePosition: 0,
  repeat: 'all', volume: 35,
};
const CATALOGUE = ['vid-a', 'vid-b', 'vid-c', 'vid-d', 'vid-e'].map((id) => ({ id, title: id.toUpperCase() }));

test('a record round-trips: the same song, moment, queue, shuffled order, repeat and volume', () => {
  const storage = memory();
  writeMusicResume(storage, RECORD);
  const taken = takeMusicResume(storage, NOW);
  assert.deepEqual(taken, RECORD);
  const restored = restoreQueue(CATALOGUE, taken!);
  assert.deepEqual(restored?.queue.map((track) => track.id), ['vid-d', 'vid-a', 'vid-c'], 'the queue as the reader left it, not the catalogue\'s');
  assert.equal(restored?.queueIndex, 2);
  assert.deepEqual(restored?.shuffleOrder, [2, 1, 0]);
  assert.equal(restored?.shufflePosition, 0);
  // Taken once: marked as no longer leaving, so a tab duplicated from this one later (a copy of
  // its sessionStorage) does not start the song a second time.
  assert.equal(takeMusicResume(storage, NOW + 1000), null);
  assert.equal(JSON.parse(storage.entries[MUSIC_RESUME_KEY]).left, false);
});

test('only a record written as the document went resumes, or one of a tab the browser dropped', () => {
  const storage = memory();
  writeMusicResume(storage, { ...RECORD, left: false });
  assert.equal(takeMusicResume(storage, NOW), null, 'written while the document lived: also in any tab duplicated from it');
  assert.deepEqual(takeMusicResume(storage, NOW, { discarded: true }), { ...RECORD, left: false }, 'no pagehide comes before a dropped tab reloads');
});

test('a stale record is ignored and removed', () => {
  for (const savedAt of [NOW - MUSIC_RESUME_MAX_AGE_MS - 1, NOW - 24 * 3600_000, NOW + 10 * 60_000]) {
    const storage = memory();
    writeMusicResume(storage, { ...RECORD, savedAt });
    assert.equal(takeMusicResume(storage, NOW), null, `saved at ${new Date(savedAt).toISOString()}`);
    assert.equal(storage.getItem(MUSIC_RESUME_KEY), null);
  }
  const storage = memory();
  writeMusicResume(storage, { ...RECORD, savedAt: NOW - MUSIC_RESUME_MAX_AGE_MS + 1000 });
  assert.ok(takeMusicResume(storage, NOW), 'a few minutes old still resumes');
});

test('a corrupt record is ignored and removed', () => {
  const broken: unknown[] = [
    'not json', '[]', 'null', '{}',
    { ...RECORD, version: 2 },
    { ...RECORD, savedAt: 'now' },
    { ...RECORD, videoId: '' },
    { ...RECORD, videoId: 'javascript:alert(1)' },
    { ...RECORD, seconds: -1 },
    { ...RECORD, seconds: null },
    { ...RECORD, duration: 'long' },
    { ...RECORD, playing: 'yes' },
    { ...RECORD, queue: 'vid-a' },
    { ...RECORD, queue: ['vid-a', 7] },
    { ...RECORD, queueIndex: 1.5 },
    { ...RECORD, shuffleOrder: [0, 1, 2] },
    { ...RECORD, shufflePosition: -1 },
    { ...RECORD, repeat: 'forever' },
    { ...RECORD, volume: 400 },
    { ...RECORD, left: undefined },
  ];
  for (const value of broken) {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    assert.equal(parseMusicResume(raw), null, raw.slice(0, 80));
    const storage = memory({ [MUSIC_RESUME_KEY]: raw });
    assert.equal(takeMusicResume(storage, NOW), null, raw.slice(0, 80));
    assert.equal(storage.getItem(MUSIC_RESUME_KEY), null);
  }
  // Storage the browser refuses: nothing to resume, nothing thrown.
  const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  assert.equal(takeMusicResume(refusing, NOW), null);
  assert.doesNotThrow(() => writeMusicResume(refusing, RECORD));
  assert.equal(takeMusicResume(null, NOW), null);
});

test('the queue keeps to the songs the catalogue still offers, and its shuffled order stays whole', () => {
  // vid-d left the catalogue (or stream-safe hides it now): the rest keep their order.
  const fewer = CATALOGUE.filter((track) => track.id !== 'vid-d');
  const restored = restoreQueue(fewer, RECORD)!;
  assert.deepEqual(restored.queue.map((track) => track.id), ['vid-a', 'vid-c']);
  assert.equal(restored.queueIndex, 1);
  assert.deepEqual(restored.shuffleOrder, [1, 0]);
  assert.equal(restored.shufflePosition, 0);
  // An order that lost songs gets them back at its end, every position once.
  const partial = restoreQueue(CATALOGUE, { ...RECORD, shuffleOrder: ['vid-a'] })!;
  assert.deepEqual(partial.shuffleOrder, [1, 0, 2]);
  assert.equal(partial.shufflePosition, 2);
  // A song outside the queue (a discovery link) keeps the queue's place it left.
  const outside = restoreQueue(CATALOGUE, { ...RECORD, videoId: 'vid-zz', queueIndex: 1, shufflePosition: 1 })!;
  assert.equal(outside.queueIndex, 1);
  assert.equal(outside.shufflePosition, 1);
  // Shuffle off: no order, the queue in its own order.
  const plain = restoreQueue(CATALOGUE, { ...RECORD, shuffle: false, shuffleOrder: null })!;
  assert.equal(plain.shuffleOrder, null);
  assert.equal(plain.queueIndex, 2);
  // None of its songs left: the player builds its queue as it always did.
  assert.equal(restoreQueue([{ id: 'vid-x' }], RECORD), null);
});

/*
 * No code of the site loads a new document: it ends the music, and the record above only puts
 * the song back. The Import / export dialog reloaded the page after a backup restore
 * (components/account/DataDialog.tsx); the stores now tell their readers (lib/account/backup.ts).
 */
test('no code of the site reloads the page or sets its address', () => {
  const found: string[] = [];
  for (const dir of ['pages', 'components', 'lib']) {
    for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.(tsx?|mjs|js)$/.test(rel) || rel.startsWith('vendor')) continue;
      const file = path.join(dir, rel);
      const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const m of text.matchAll(/\blocation\s*\.\s*(reload|assign|replace)\s*\(|\blocation(\s*\.\s*href)?\s*=(?!=)|\blocation\s*\.\s*href\s*\+=/g)) {
        found.push(`${file}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(found, [], 'a new document ends the music: navigate with next/router, and tell a store\'s readers with its event');
});
