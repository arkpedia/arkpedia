import test from 'node:test';
import assert from 'node:assert/strict';
import { browserPlan, dependencyIndex } from '../ci/browser-plan.mjs';

const names = ['nav-bar', 'mobile-touch-nav', 'navigation-continuity', 'story-library', 'story-progress', 'music-data-saver', 'music-resume', 'cloud-accounts', 'account-import', 'schedule-archive', 'page-bounds', 'layout-census'];
const specs = names.map(name => `tests/browser/${name}.spec.ts`);
const plan = (paths, extra = {}) => browserPlan({ specs, changes: paths.map(path => ({ path, status: 'M' })), relevant: new Set(['scripts/build/site.mjs']), dependencies: { consumers: new Map(), unreadable: [], effects: new Set() }, baselineVerified: true, ...extra });

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
  for (const file of ['pages/_app.tsx', 'styles/core/shared.css', 'styles/story/map.css', 'components/ui/Button.tsx', 'components/layout/Sitenav.tsx', 'package-lock.json', 'scripts/build/site.mjs', 'scripts/ci/browser-plan.mjs']) assert.equal(plan([file]).lane, 'full', file);
});
test('only proved-unread tooling and documentation may omit browser work', () => {
  assert.equal(plan(['scripts/imports/example.py']).lane, 'none');
  assert.equal(plan(['.github/workflows/unrelated.yml']).lane, 'none');
  assert.equal(plan(['infra/runners/compose.yaml']).lane, 'none');
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

test('storage, emitted events, filesystem reads and computed imports keep broad coverage', () => {
  for (const source of ['localStorage.setItem(key, value)', 'window.dispatchEvent(event)', 'readFile(file)', 'import(moduleName)']) {
    const file = 'lib/story/progress.ts';
    const dependencies = dependencyIndex(new Set([file]), () => source);
    assert.equal(plan([file], { dependencies }).lane, 'full', source);
  }
  assert.equal(plan(['lib/story/records.md']).lane, 'full', 'runtime-folder markdown is not documentation proof');
});

test('interpolated or computed consumers anywhere cannot hide a reverse dependency', () => {
  for (const expression of ['import(`./${name}`)', 'require(`./${name}`)', 'module.require(`./${name}`)', 'import("./" + name)', 'require.resolve(name)', 'import(name)']) {
    const sources = new Map([
      ['lib/story/progress.ts', 'export const progress = 1;'],
      ['pages/account.tsx', `const load = () => ${expression};`],
    ]);
    const dependencies = dependencyIndex(new Set(sources.keys()), file => sources.get(file));
    assert.ok(dependencies.unreadable.some(file => file.includes('pages/account.tsx')), expression);
    assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full', expression);
  }
});

test('literal templates, multiline imports, exports and require preserve reverse consumer edges', () => {
  for (const statement of [
    'const load = () => import(`@/lib/story/progress`);',
    'const load = () => require(`@/lib/story/progress`);',
    'import {\n progress\n} from\n "@/lib/story/progress";',
    'export { progress } from "@/lib/story/progress";',
    'import progress = require("@/lib/story/progress");',
  ]) {
    const sources = new Map([['lib/story/progress.ts', 'export const progress = 1;'], ['pages/account.tsx', statement]]);
    const dependencies = dependencyIndex(new Set(sources.keys()), file => sources.get(file));
    assert.deepEqual(dependencies.unreadable, [], statement);
    assert.ok(dependencies.consumers.get('lib/story/progress.ts').has('pages/account.tsx'), statement);
    assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full', statement);
  }
});

test('unresolved aliases, internal paths and undeclared packages fail closed across consumers', () => {
  for (const reference of ['@story/progress', '~/story/progress', '#story', '@/lib/story/missing', './missing', 'unknown-package']) {
    const sources = new Map([
      ['package.json', JSON.stringify({ dependencies: { react: '19', '@scope/known': '1' } })],
      ['lib/story/progress.ts', 'export const progress = 1;'],
      ['pages/account.tsx', `import data from '${reference}';`],
    ]);
    const dependencies = dependencyIndex(new Set(sources.keys()), file => sources.get(file));
    assert.ok(dependencies.unreadable.some(file => file.includes(reference)), reference);
    assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full', reference);
  }
});

test('declared package subpaths and Node builtins are external without masking internal imports', () => {
  const sources = new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '19', '@scope/known': '1' }, devDependencies: { typescript: '5' }, optionalDependencies: { optional: '1' } })],
    ['lib/story/progress.ts', 'export const progress = 1;'],
    ['pages/account.tsx', 'import "react/jsx-runtime"; import "@scope/known/entry"; import "typescript"; import "optional"; import "node:fs"; import "path";'],
  ]);
  const dependencies = dependencyIndex(new Set(sources.keys()), file => sources.get(file));
  assert.deepEqual(dependencies.unreadable, []);
  assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'targeted');
  sources.set('pages/account.tsx', 'import "react/nonexistent"; import "@/lib/story/missing";');
  assert.equal(plan(['lib/story/progress.ts'], { dependencies: dependencyIndex(new Set(sources.keys()), file => sources.get(file)) }).lane, 'full');
});

test('comments and strings do not become module syntax, and malformed syntax fails closed', () => {
  const file = 'lib/story/progress.ts';
  for (const source of ['// import(name)\nexport const x = 1;', 'const text = "import(name)";']) {
    assert.deepEqual(dependencyIndex(new Set([file]), key => key === file ? source : undefined).unreadable, []);
  }
  const sources = new Map([[file, 'export const x = 1;'], ['pages/account.tsx', 'import { from "oops";']]);
  assert.equal(plan([file], { dependencies: dependencyIndex(new Set(sources.keys()), key => sources.get(key)) }).lane, 'full');
  sources.set('package.json', 'not json');
  assert.ok(dependencyIndex(new Set(sources.keys()), key => sources.get(key)).unreadable.some(file => file.includes('package.json')));
});

test('unsupported configured aliases never become external packages with the same name', () => {
  const sources = new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '19' } })],
    ['tsconfig.json', JSON.stringify({ compilerOptions: { paths: { 'react/*': ['lib/story/*'] } } })],
    ['lib/story/progress.ts', 'export const progress = 1;'],
    ['pages/account.tsx', 'import "react/progress";'],
  ]);
  const dependencies = dependencyIndex(new Set(sources.keys()), file => sources.get(file));
  assert.ok(dependencies.unreadable.some(file => file.includes('unsupported configured alias react/progress')));
  assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full');
});

test('redirected root aliases and inherited/base-directory resolution cannot create false consumer edges', () => {
  const sources = new Map([
    ['lib/story/progress.ts', 'export const x = 1;'],
    ['pages/account.tsx', 'import "@/lib/story/progress";'],
  ]);
  const read = file => sources.get(file);
  for (const config of [
    { compilerOptions: { paths: { '@/*': ['other/*'] } } },
    { compilerOptions: { paths: { '@/*': ['./*', 'other/*'] } } },
    { extends: './other-config.json' },
    { compilerOptions: { baseUrl: 'other' } },
  ]) {
    sources.set('tsconfig.json', JSON.stringify(config));
    const dependencies = dependencyIndex(new Set(sources.keys()), read);
    assert.ok(dependencies.unreadable.length > 0);
    assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full');
  }
  sources.set('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }));
  const dependencies = dependencyIndex(new Set(sources.keys()), read);
  assert.deepEqual(dependencies.unreadable, []);
  assert.ok(dependencies.consumers.get('lib/story/progress.ts').has('pages/account.tsx'));
});

test('declared DefinitelyTyped modules only satisfy erased type imports, never runtime imports', () => {
  const sources = new Map([
    ['package.json', JSON.stringify({ devDependencies: { '@types/geojson': '1', '@types/scope__types': '1' } })],
    ['lib/story/progress.ts', 'export const x = 1;'],
    ['pages/account.tsx', 'import type { Feature } from "geojson"; import { type Shape } from "@scope/types"; type Shape = import("geojson").Feature;'],
  ]);
  const read = file => sources.get(file);
  assert.deepEqual(dependencyIndex(new Set(sources.keys()), read).unreadable, []);
  sources.set('pages/account.tsx', 'import "geojson";');
  const dependencies = dependencyIndex(new Set(sources.keys()), read);
  assert.ok(dependencies.unreadable.some(file => file.includes('unresolved module geojson')));
  assert.equal(plan(['lib/story/progress.ts'], { dependencies }).lane, 'full');
});
