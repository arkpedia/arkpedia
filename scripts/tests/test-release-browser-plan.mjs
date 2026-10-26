import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseBrowserPlan } from '../ci/release-browser-plan.mjs';
const names = ['nav-bar', 'mobile-touch-nav', 'navigation-continuity', 'privacy', 'statistics-prompt',
  'core', 'navigation-account-redesign', 'credits-games-review', 'music-workspace', 'music-navigation',
  'story-progress', 'base-account', 'reward-import', 'planning-pages', 'media-community-games', 'music-resume', 'music-versions',
  'account-import', 'story-map-stability', 'layout-census', 'layout-census-after', 'motion', 'x-buttons'];
const specs = names.map(name => `tests/browser/${name}.spec.ts`);
const full = { lane: 'full', selected: specs, omitted: [], domains: [], reason: 'shared input' };
const make = (paths, overrides = {}) => releaseBrowserPlan(full, { changes: paths.map(path => ({ path, status: 'M' })), specs, baselineVerified: true, ...overrides });

test('feature CSS selects core and the affected functional family without the global visual census', () => {
  const plan = make(['styles/music/player.css']);
  assert.equal(plan.lane, 'targeted');
  for (const name of ['privacy', 'music-navigation', 'music-resume', 'music-versions']) assert.ok(plan.selected.includes(`tests/browser/${name}.spec.ts`));
  for (const name of ['motion', 'layout-census', 'x-buttons', 'story-map-stability']) assert.ok(plan.omitted.includes(`tests/browser/${name}.spec.ts`));
  assert.equal(new Set([...plan.selected, ...plan.omitted]).size, specs.length);
});
test('shared chrome checks representative populated features and consent', () => {
  const plan = make(['styles/core/shared.css']);
  for (const name of ['core', 'music-workspace', 'base-account', 'reward-import', 'story-progress', 'credits-games-review']) assert.ok(plan.selected.includes(`tests/browser/${name}.spec.ts`));
});
test('account changes retain account import and playback-resume checks', () => {
  const plan = make(['lib/account/resetData.ts']);
  assert.ok(plan.selected.includes('tests/browser/account-import.spec.ts'));
  assert.ok(plan.selected.includes('tests/browser/music-resume.spec.ts'));
});
test('unknown, toolchain, fixture and deleted inputs or missing baseline keep conservative coverage', () => {
  for (const path of ['package-lock.json', 'scripts/ci/browser-lane.mjs', 'lib/unclassified/state.ts', 'tests/browser/youtube-stub.ts']) assert.equal(make([path]), full);
  assert.equal(make(['styles/music/player.css'], { baselineVerified: false }), full);
  assert.equal(make(['styles/music/player.css'], { specs: specs.filter(file => !file.endsWith('/nav-bar.spec.ts')) }), full);
  assert.equal(make([], { changes: [{ path: 'tests/browser/music-resume.spec.ts', status: 'D' }] }), full);
});
test('changed functional specifications remain blocking and visual specifications stay in the audit', () => {
  const plan = make(['tests/browser/story-map-stability.spec.ts', 'tests/browser/motion.spec.ts']);
  assert.ok(plan.selected.includes('tests/browser/story-map-stability.spec.ts'));
  assert.ok(plan.omitted.includes('tests/browser/motion.spec.ts'));
});

// The production catalogue predates the preview-only consent and workspace specs.
test('production inventory keeps a real targeted lane without preview-only tests', () => {
  const production = specs.filter(file => !/privacy|statistics-prompt|navigation-account-redesign|credits-games-review|music-workspace/.test(file));
  const plan = make(['styles/core/shared.css'], { specs: production });
  assert.equal(plan.lane, 'targeted');
  assert.ok(plan.selected.includes('tests/browser/account-import.spec.ts'));
  assert.ok(plan.selected.includes('tests/browser/media-community-games.spec.ts'));
});
