import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('obsolete monolithic operator and event files cannot return as editable sources', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'data/events.json')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'data/operator-release-overrides.json')), false);
  for (const route of ['data', 'add-event', 'add-skin', 'upload']) {
    assert.equal(fs.existsSync(path.join(ROOT, `pages/api/dev/${route}.ts`)), false, route);
  }
  assert.match(read('pages/dev/index.tsx'), /github\.com\/arkpedia\/arkpedia-data\/tree\/main\/source/);
});

test('application asset delivery configuration lives outside hydrated game data', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'config/asset-delivery.json')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'data/assets/cdn.json')), false);
});

test('content hydration cannot restore retired public source records', () => {
  const hydration = read('scripts/content/hydrate-source.mjs');
  assert.match(hydration, /data\/events\.json/);
  assert.match(hydration, /data\/operator-release-overrides\.json/);
  assert.match(hydration, /'data\/optimizer-results\.json'/);
  assert.match(hydration, /'data\/whole-base-optimizer-results\.json'/);
  assert.match(hydration, /deprecated\(relative\)/);
  // The retired banner-art stage's record: arkpedia-data still carries a copy, and hydrated
  // back it would be published with every release, read by nothing.
  assert.equal(fs.existsSync(path.join(ROOT, 'data/assets/banner_art_sources.json')), false);
  assert.match(hydration, /deprecatedSourceFiles = new Set\(\[[^\]]*'data\/assets\/banner_art_sources\.json'/);
});

test('every canonical event-year file is part of the runtime event loader', () => {
  const loader = read('lib/events/loadEventsData.ts');
  const files = fs.readdirSync(path.join(ROOT, 'data/events'))
    .filter((file) => /^events_\d{4}\.json$/.test(file));
  assert.ok(files.length > 0);
  for (const file of files) assert.match(loader, new RegExp(file.replace('.', '\\.')));
});

test('release-sensitive games use the shared timestamp-aware availability source', () => {
  // The palette exports release markers (releaseMarker) and filters them at render
  // (isReleasedAt, lib/minigames/logic.ts): both are the same shared source.
  for (const file of ['pages/games/operator-guesser.tsx', 'lib/minigames/data.ts', 'lib/minigames/logic.ts', 'pages/operator-planner.tsx']) {
    const source = read(file);
    assert.match(source, /isOperatorReleased|releaseMarker\(|isReleasedAt\(/);
    assert.doesNotMatch(source, /parseDate\([^\n]*Release Date/);
    assert.doesNotMatch(source, /filter\(\(op\) => !op\.isFuture\)/);
  }
});
