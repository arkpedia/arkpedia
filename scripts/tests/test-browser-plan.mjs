import test from 'node:test';
import assert from 'node:assert/strict';
import { browserPlan, dependencyIndex } from '../ci/browser-plan.mjs';

const names = ['nav-bar', 'mobile-touch-nav', 'navigation-continuity', 'story-library', 'story-progress', 'music-data-saver', 'music-resume', 'cloud-accounts', 'account-import', 'schedule-archive', 'page-bounds', 'layout-census'];
const specs = names.map(name => `tests/browser/${name}.spec.ts`);
const plan = (paths, extra = {}) => browserPlan({ specs, changes: paths.map(path => ({ path, status: 'M' })), relevant: new Set(['scripts/build/site.mjs']), dependencies: { consumers: new Map(), unreadable: [] }, baselineVerified: true, ...extra });

test('unknown, missing-baseline and explicit-regression requests keep full coverage', () => {
  for (const result of [plan(['lib/unclassified.ts']), plan(['lib/story/progress.ts'], { baselineVerified: false }), plan(['lib/story/progress.ts'], { forceFull: true }), plan([])]) {
    assert.equal(result.lane, 'full'); assert.deepEqual(result.selected, [...specs].sort());
  }
});
test('story selects its family and persistent navigation journeys', () => {
  const result = plan(['lib/story/progress.ts']);
  assert.equal(result.lane, 'targeted');
  for (const name of ['story-library', 'story-progress', 'nav-bar', 'mobile-touch-nav', 'navigation-continuity']) assert.ok(result.selected.includes(`tests/browser/${name}.spec.ts`));
  assert.ok(result.omitted.includes('tests/browser/music-data-saver.spec.ts'));
});
test('account changes keep authentication and music-continuity browser evidence', () => {
  const result = plan(['lib/cloud-account/client.ts']);
  for (const name of ['cloud-accounts', 'account-import', 'music-resume', 'music-data-saver']) assert.ok(result.selected.includes(`tests/browser/${name}.spec.ts`));
  assert.equal(plan(['lib/cloud-account/client.ts'], { specs: specs.filter(file => !file.includes('cloud-accounts')) }).lane, 'full');
});
test('shared shell, style, build and CI policy changes require the whole suite', () => {
  for (const file of ['pages/_app.tsx', 'styles/core/shared.css', 'components/ui/Button.tsx', 'components/layout/Sitenav.tsx', 'package-lock.json', 'scripts/build/site.mjs', 'scripts/ci/browser-plan.mjs']) assert.equal(plan([file]).lane, 'full', file);
});
test('only proved-unread tooling and documentation may omit browser work', () => {
  assert.equal(plan(['scripts/imports/example.py']).lane, 'none');
  assert.equal(plan(['docs/guide.md']).lane, 'none');
  assert.equal(plan(['scripts/imports/example.py'], { relevant: undefined }).lane, 'full');
});
test('spec edits include the edited specification, while helper/deletion/unknown changes run full', () => {
  assert.ok(plan(['tests/browser/story-progress.spec.ts']).selected.includes('tests/browser/story-progress.spec.ts'));
  for (const file of ['tests/browser/helper.ts', 'tests/browser/page-bounds.spec.ts', 'tests/browser/new-unknown.spec.ts']) assert.equal(plan([file]).lane, 'full');
  assert.equal(plan([], { changes: [{ path: 'tests/browser/story-progress.spec.ts', status: 'D' }] }).lane, 'full');
});
test('renames include both paths and mixed families are a union', () => {
  assert.equal(plan(['lib/story/progress.ts', 'lib/shared/progress.ts']).lane, 'full');
  assert.deepEqual(plan(['lib/story/progress.ts', 'lib/music/player.ts']).domains, ['music', 'story']);
});
test('missing core/family inventory fails closed and shadow output never vouches for Check', () => {
  assert.equal(plan(['lib/story/progress.ts'], { specs: specs.filter(file => !file.includes('nav-bar')) }).lane, 'full');
  assert.equal(plan(['lib/story/progress.ts'], { specs: specs.filter(file => !file.includes('story-')) }).lane, 'full');
  for (const result of [plan(['lib/story/progress.ts']), plan(['lib/unknown.ts']), plan(['docs/file.md'])]) assert.equal(result.reusableCheckProof, false);
});

test('transitive consumers outside a feature force full coverage', () => {
  const sources = new Map([
    ['lib/story/progress.ts', 'export const progress = 1;'],
    ['lib/story/bridge.ts', "export { progress } from './progress';"],
    ['lib/account/backup.ts', "import { progress } from '@/lib/story/bridge';"],
  ]);
  const dependencies = dependencyIndex(new Set(sources.keys()), file => sources.get(file));
  const result = plan(['lib/story/progress.ts'], { dependencies });
  assert.equal(result.lane, 'full');
  assert.match(result.reason, /lib\/account\/backup.ts/);
  sources.delete('lib/account/backup.ts');
  assert.equal(plan(['lib/story/progress.ts'], { dependencies: dependencyIndex(new Set(sources.keys()), file => sources.get(file)) }).lane, 'targeted');
});

test('missing or unreadable runtime dependency evidence fails closed', () => {
  assert.equal(plan(['lib/story/progress.ts'], { dependencies: undefined }).lane, 'full');
  const dependencies = dependencyIndex(new Set(['pages/_app.tsx']), () => null);
  assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full');
});
