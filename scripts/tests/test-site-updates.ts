import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import { listDrafts, parseUpdate, publishDraft, readDraft, readPublishedImage, readPublishedUpdates, saveDraft } from '../../lib/site-updates/store';

const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yf2kAAAAASUVORK5CYII=';
const update = {
  title: 'New navigation',
  body: 'Find planners in Tools.',
  major: true,
  images: [
    { src: screenshot, alt: 'Desktop Tools menu', device: 'desktop' },
    { src: screenshot, alt: 'Mobile Tools menu', device: 'mobile' },
  ],
};

test('major updates remain private until an editor publishes the saved revision', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const db = { prepare: (sql: string) => {
    const statement = sqlite.prepare(sql);
    return {
      all: async () => ({ results: statement.all() }),
      bind: (...args: (string | number)[]) => ({
        first: async (column?: string) => {
          const row = statement.get(...args);
          return (column ? row?.[column] : row) ?? null;
        },
      }),
    };
  } } as unknown as D1Database;
  try {
    sqlite.exec(readFileSync('migrations/accounts/0033_site_updates.sql', 'utf8'));
    const [starter] = await listDrafts(db);
    assert.equal(starter.id, 'tools-and-guides');
    assert.equal(starter.publishedAt, null);
    assert.deepEqual(await readPublishedUpdates(db, true), []);

    const saved = await saveDraft(db, null, 0, parseUpdate(update), 'editor@example.com');
    assert.ok(saved);
    const { id } = saved;
    assert.equal(await readPublishedImage(db, id, 0), null);
    assert.deepEqual(await readPublishedUpdates(db, false), []);
    assert.ok(await saveDraft(db, id, 1, parseUpdate({ ...update, title: 'Reviewed navigation' }), 'editor@example.com'));
    assert.equal(await publishDraft(db, id, 1, 'editor@example.com'), null);
    assert.ok(await publishDraft(db, id, 2, 'editor@example.com'));
    assert.equal(await saveDraft(db, id, 3, parseUpdate(update), 'editor@example.com'), null);

    const [published] = await readPublishedUpdates(db, true);
    assert.equal(published.title, 'Reviewed navigation');
    assert.equal(published.images.length, 2);
    assert.equal(published.images[1].src, `/api/site-updates?id=${id}&image=1`);
    assert.equal((await readPublishedImage(db, id, 1))?.mime, 'image/png');
    assert.equal((await readDraft(db, id))?.images[1].src, screenshot);
    const minor = await saveDraft(db, null, 0, parseUpdate({ ...update, title: 'Routine update', major: false }), 'editor@example.com');
    assert.ok(minor);
    assert.ok(await publishDraft(db, minor.id, 1, 'editor@example.com'));
    assert.equal((await readPublishedUpdates(db, true))[0].id, id);
    assert.equal((await readPublishedUpdates(db, false)).length, 2);
  } finally { sqlite.close(); }
});

test('update pictures require described, supported raster images', () => {
  assert.throws(() => parseUpdate({ ...update, images: [{ ...update.images[0], alt: '' }] }), /Describe/);
  assert.throws(() => parseUpdate({ ...update, images: [{ ...update.images[0], device: 'all', src: 'data:image/svg+xml;base64,AAAA' }] }), /Choose a PNG/);
  assert.throws(() => parseUpdate({ ...update, images: [{ ...update.images[0], device: 'ipad' }] }), /display option/);
});
