import test from 'node:test';
import assert from 'node:assert/strict';
import { pageRoute, releaseBrowserPlan, specRoutes } from '../ci/release-browser-plan.mjs';
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

// Runtime files outside the named families are placed by the pages that import them.
const routedSpecs = [...specs, 'tests/browser/skin-planner-wishlist.spec.ts', 'tests/browser/gacha-help.spec.ts', 'tests/browser/pulls-wallet.spec.ts'];
const graph = edges => ({ consumers: new Map(Object.entries(edges).map(([target, consumers]) => [target, new Set(consumers)])), unreadable: [], effects: new Set() });
const sources = {
  'tests/browser/skin-planner-wishlist.spec.ts': "test('x', async ({ page }) => { await page.goto('/skin-planner'); });",
  'tests/browser/gacha-help.spec.ts': "import { openPullableSimulator } from './census-routes';\ntest('x', async ({ page }) => { await openPullableSimulator(page); });",
  'tests/browser/pulls-wallet.spec.ts': "const PAGE = '/pull-planner?tab=wallet';",
  'tests/browser/layout-census.spec.ts': "import { CENSUS_STATES, censusRoutes } from './census-routes';",
  'tests/browser/census-routes.ts': "export async function openPullableSimulator(page) {\n  await page.goto('/gacha-simulator');\n}\nexport const CENSUS_STATES = [{ route: '/music' }];\n",
};
const routes = specRoutes(routedSpecs, file => sources[file] ?? '');
const edges = {
  'components/skins/Wishlist.tsx': ['pages/skin-planner.tsx'],
  'components/gacha/Help.module.css': ['components/gacha/Help.tsx'],
  'components/gacha/Help.tsx': ['pages/gacha-simulator.tsx'],
  'components/changelog/Badge.tsx': ['pages/_app.tsx'],
  'components/ui/LockToggle.tsx': ['pages/pull-planner.tsx'],
  'data/rerun-clear-operators.json': ['lib/pulls/schedule.ts'],
  'lib/pulls/schedule.ts': ['pages/pull-planner.tsx'],
  'lib/meta/PageMeta.tsx': Array.from({ length: 13 }, (_, index) => `pages/page-${index}.tsx`),
};
const routed = (paths, overrides = {}) => releaseBrowserPlan(full, { changes: paths.map(path => typeof path === 'string' ? { path, status: 'M' } : path),
  specs: routedSpecs, baselineVerified: true, dependencies: graph(edges), routes, readers: () => [], ...overrides });
const picked = plan => plan.selected.map(file => file.replace(/^tests\/browser\/|\.spec\.ts$/g, ''));

test('a spec visits the routes it spells out and those of the helpers it imports; census lists are every route', () => {
  assert.deepEqual([...routes.get('tests/browser/skin-planner-wishlist.spec.ts')], ['skin-planner']);
  assert.deepEqual([...routes.get('tests/browser/gacha-help.spec.ts')], ['gacha-simulator']);
  assert.deepEqual([...routes.get('tests/browser/pulls-wallet.spec.ts')], ['pull-planner']);
  assert.ok(routes.get('tests/browser/layout-census.spec.ts').has('*'));
  assert.equal(pageRoute('pages/index.tsx'), '');
  assert.equal(pageRoute('pages/operators/[name].tsx'), 'operators');
  assert.equal(pageRoute('pages/api/music-audio.ts'), 'api/music-audio');
});

test('a file outside the families runs core plus the specs of the pages that import it', () => {
  const plan = routed(['components/skins/Wishlist.tsx']);
  assert.equal(plan.lane, 'targeted');
  assert.ok(picked(plan).includes('skin-planner-wishlist'));
  assert.ok(picked(plan).includes('nav-bar'));
  for (const name of ['gacha-help', 'pulls-wallet', 'core', 'layout-census']) assert.ok(!picked(plan).includes(name), name);
  assert.ok(picked(routed(['components/gacha/Help.module.css'])).includes('gacha-help'), 'through a component, to a helper-visited route');
});

test('shared chrome keeps its representative set and adds the specs of the few pages that use it', () => {
  const plan = routed(['components/ui/LockToggle.tsx']);
  for (const name of ['core', 'planning-pages', 'pulls-wallet']) assert.ok(picked(plan).includes(name), name);
  assert.ok(!picked(plan).includes('skin-planner-wishlist'));
});

test('a file the app shell or many pages import is shared chrome', () => {
  for (const path of ['components/changelog/Badge.tsx', 'lib/meta/PageMeta.tsx']) {
    const plan = routed([path]);
    assert.equal(plan.lane, 'targeted');
    assert.ok(picked(plan).includes('core') && picked(plan).includes('planning-pages'), path);
  }
});

test('a data file is placed by its importers only when no runtime file reads it by a computed path', () => {
  assert.ok(picked(routed(['data/rerun-clear-operators.json'])).includes('pulls-wallet'));
  assert.equal(routed(['data/rerun-clear-operators.json'], { readers: () => ['lib/content/dataTable.ts'] }), full);
  assert.equal(routed(['data/rerun-clear-operators.json'], { readers: undefined }), full);
  assert.equal(routed(['data/stages/act1.json']), full, 'nested data stays conservative');
});

test('no importing page, a deleted file, an unreadable graph or toolchain input keeps the original plan', () => {
  assert.equal(routed(['lib/orphan/helper.ts']), full);
  assert.equal(routed([{ path: 'components/skins/Wishlist.tsx', status: 'D' }]), full);
  assert.equal(routed(['components/skins/Wishlist.tsx'], { dependencies: { ...graph(edges), unreadable: ['lib/x.ts: computed module reference'] } }), full);
  assert.equal(routed(['components/skins/Wishlist.tsx'], { routes: null }), full);
  for (const path of ['package.json', 'next.config.js', 'config/production.json', 'public/robots.txt', 'tests/browser/census-routes.ts']) {
    assert.equal(routed(['components/skins/Wishlist.tsx', path]), full, path);
  }
});

test('files outside what the build and the specs read do not widen the plan', () => {
  const relevant = new Set(['components/skins/Wishlist.tsx', 'scripts/ci/browser-lane.mjs']);
  const plan = routed(['components/skins/Wishlist.tsx', 'scripts/tests/test-skins.ts'], { relevant });
  assert.equal(plan.lane, 'targeted');
  assert.equal(routed(['components/skins/Wishlist.tsx', 'scripts/ci/browser-lane.mjs'], { relevant }), full, 'CI policy is never skipped');
});
