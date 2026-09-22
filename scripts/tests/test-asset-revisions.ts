import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pinAssetUrl } from '../../lib/assets/revisions';
import revisions from '../../data/assets/revisions.json';
import externalAssets from '../../data/assets/external-asset-index.json';
import cdn from '../../config/asset-delivery.json';

const delivered = (repository: string, revision: string, path: string) => cdn.template
  .replace('{repository}', repository)
  .replace('{revision}', revision)
  .replace('{path}', path);

test('public Arkpedia media uses commit-pinned raw GitHub delivery', () => {
  assert.equal(cdn.template, 'https://raw.githubusercontent.com/arkpedia/{repository}/{revision}/{path}');
});

// Explicit pins are also used by independently mergeable upstream content PRs.
function publishedImagePath(value: string): string {
  if (!value.startsWith('https://')) return value;
  const url = new URL(value);
  assert.equal(url.origin, 'https://raw.githubusercontent.com');
  const prefix = `/arkpedia/arkpedia-image-assets/${revisions['arkpedia-image-assets']}`;
  assert.ok(url.pathname.startsWith(`${prefix}/`), 'external art must use the adopted immutable image revision');
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

test('schedule artwork uses Arkpedia image-asset paths', () => {
  const published = new Set(externalAssets.files);
  const directory = path.join(process.cwd(), 'data', 'events');
  for (const file of fs.readdirSync(directory).filter(name => /^events_\d{4}\.json$/.test(name))) {
    const events = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as Array<{ name: string; poster?: string | null }>;
    for (const event of events) {
      if (!event.poster) continue;
      const asset = publishedImagePath(event.poster);
      assert.match(asset, /^\/event-poster\/.+\.(?:webp|jpg)$/, `${file}: ${event.name}`);
      assert.ok(published.has(asset.slice(1)), `${file}: ${event.name} references unpublished ${event.poster}`);
    }
  }
});

test('every headhunting banner has published artwork', () => {
  const published = new Set(externalAssets.files);
  const banners = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'headhunting_banners.json'), 'utf8')) as Array<{ name: string; banner_image?: string | null }>;
  assert.ok(banners.length > 400, 'banner history unexpectedly shrank');
  for (const banner of banners) {
    const asset = publishedImagePath(banner.banner_image || '');
    assert.match(asset, /^\/headhunting-banner-images\/.+\.(?:webp|jpg)$/, `${banner.name} has no normalized artwork path`);
    assert.ok(published.has(asset.slice(1)), `${banner.name} references unpublished ${banner.banner_image}`);
  }
});

test('pins public media while preserving encoded filenames and template placeholders', () => {
  assert.equal(pinAssetUrl('https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/current/a%20b/{id}.mp3'),
    delivered('arkpedia-voice-english', revisions['arkpedia-voice-english'], 'current/a%20b/{id}.mp3'));
  assert.equal(pinAssetUrl('https://example.com/main/test.mp3'), 'https://example.com/main/test.mp3');
  assert.throws(() => pinAssetUrl('https://raw.githubusercontent.com/arkpedia/unconfigured-assets/main/image.png'), /Missing asset revision/);
});
