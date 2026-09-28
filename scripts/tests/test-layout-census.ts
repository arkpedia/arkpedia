import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CENSUS_STATES, censusRoutes } from '../../tests/browser/census-routes';
import { boundsRoutes, HEADING_ROUTES, PICTURE_ROUTES } from '../../tests/browser/layout-checks';

/*
 * The browser suite loads each census page once per theme per project (r11). Until then
 * cards-and-headings.spec.ts, page-bounds.spec.ts and row-alignment.spec.ts each declared a
 * test per census address, and per state, of their own: 842 of the suite's 1,212 tests, and
 * over half its time, went to loading the same ~45 pages up to a dozen times each. The
 * layout census (tests/browser/layout-census.spec.ts) runs every one of those checks on a
 * single load. This holds the suite to that shape:
 * - no spec but the census declares a test for each census address or state (a loop over
 *   censusRoutes(), CENSUS_STATES, boundsRoutes(), HEADING_ROUTES or PICTURE_ROUTES), so a
 *   new per-page check joins the census's load instead of adding ~90 loads of its own;
 * - the per-page tables live in tests/browser/layout-checks.ts, not in a spec;
 * - every address a table names is one the census loads, or it would measure nothing.
 * A spec that picks one state out of CENSUS_STATES (a .find or a .filter) is a driven
 * test of its own and is fine.
 */
const DIR = path.join(__dirname, '../../tests/browser');
const CENSUS = 'layout-census.spec.ts';
const LISTS = /censusRoutes\(\)|CENSUS_STATES|boundsRoutes\(\)|\broutes\(\)|HEADING_ROUTES|PICTURE_ROUTES/;
const specs = fs.readdirSync(DIR).filter((file) => file.endsWith('.spec.ts'));

/** Each `for (... of <list>)` and `<list>.forEach(` in a source, with its line. */
function loopsOver(source: string): string[] {
  const out: string[] = [];
  source.split('\n').forEach((line, i) => {
    const loop = line.match(/for\s*\(\s*const\s+[^;]*?\bof\s+(.+)$/);
    const each = line.match(/([\w.[\]()]+)\s*\.forEach\(/);
    const list = loop?.[1] ?? each?.[1];
    if (list && LISTS.test(list) && !/\.(find|filter)\(/.test(list)) out.push(`${i + 1}: ${line.trim()}`);
  });
  return out;
}

test('only the layout census declares a test for every census page', () => {
  assert.ok(specs.includes(CENSUS), `${CENSUS} exists`);
  assert.ok(loopsOver(fs.readFileSync(path.join(DIR, CENSUS), 'utf8')).length > 0, `${CENSUS} loops over the census pages (the check itself still sees a loop)`);
  const others = specs.filter((file) => file !== CENSUS).flatMap((file) => loopsOver(fs.readFileSync(path.join(DIR, file), 'utf8')).map((hit) => `${file}:${hit}`));
  assert.deepEqual(others, [], 'a spec that loads every census page again: put its check on the layout census\'s load (layout-census.spec.ts, layout-checks.ts)');
});

test('the per-page tables live in layout-checks.ts', () => {
  const tables = ['HEADING_ROUTES', 'PICTURE_ROUTES', 'CONTENT_CARDS', 'HOME_CARDS', 'FIRST_GAP_OTHERS', 'ALLOWED', 'TOLERANCE', 'BOUNDS_EXCLUDED', 'BOUNDS_SAMPLES'];
  const defined = specs.flatMap((file) => {
    const source = fs.readFileSync(path.join(DIR, file), 'utf8');
    return tables.filter((name) => new RegExp(`(?:const|let|var)\\s+${name}\\b`).test(source)).map((name) => `${file} defines ${name}`);
  });
  assert.deepEqual(defined, []);
  const checks = fs.readFileSync(path.join(DIR, 'layout-checks.ts'), 'utf8');
  for (const name of tables) assert.match(checks, new RegExp(`export const ${name}\\b`), `layout-checks.ts exports ${name}`);
});

test('every address a census table names is a census address', () => {
  const routes = new Set(censusRoutes());
  assert.deepEqual(Object.keys(HEADING_ROUTES).filter((route) => !routes.has(route)), [], 'HEADING_ROUTES');
  assert.deepEqual(boundsRoutes().filter((route) => !routes.has(route)), [], 'boundsRoutes()');
  // The picture census also loads three addresses of its own; they are real pages.
  assert.ok(Object.keys(PICTURE_ROUTES).filter((route) => !routes.has(route)).length <= 3, 'PICTURE_ROUTES adds at most its three addresses of its own');
  const ids = CENSUS_STATES.map((state) => state.id);
  assert.equal(new Set(ids).size, ids.length, 'every driven state has its own id');
});

/*
 * The suite runs one browser per two CPUs, at most three (r11): the Check's browser run was
 * one worker on a 4-vCPU runner whose other three CPUs sat idle, and it alone took 19 of the
 * Check's 26 minutes on the NAS, past the 20 minutes GitHub gives Dependabot's pull requests.
 * The census spreads over the workers, so the one check that needs every page at both widths
 * (a stale stack-align entry) cannot run at the end of either project's pages: it is its own
 * project, after both, or it would skip itself in every run and nothing would say so.
 */
test('the browser suite uses the runner\'s CPUs, and the census\'s whole-suite check runs after both widths', async () => {
  const os = await import('node:os');
  const real = os.default.availableParallelism;
  const workers = process.env.PW_WORKERS;
  delete process.env.PW_WORKERS;
  os.default.availableParallelism = () => 4;
  try {
    const config = (await import('../../playwright.config')).default;
    assert.equal(config.workers, 2, 'two workers on a 4-vCPU runner');
    const projects = Object.fromEntries((config.projects ?? []).map((p) => [p.name, p]));
    const after = projects['after-census'];
    assert.ok(after, 'an after-census project');
    assert.deepEqual([...(after.dependencies ?? [])].sort(), ['desktop', 'mobile'], 'it runs after both widths');
    const matches = (pattern: unknown, file: string) => [pattern].flat().some((p) => (p instanceof RegExp ? p.test(file) : false));
    assert.ok(matches(after.testMatch, 'tests/browser/layout-census-after.spec.ts'), 'it runs layout-census-after.spec.ts');
    for (const name of ['desktop', 'mobile']) assert.ok(matches(projects[name].testIgnore, 'tests/browser/layout-census-after.spec.ts'), `${name} leaves it out`);
  } finally {
    os.default.availableParallelism = real;
    if (workers !== undefined) process.env.PW_WORKERS = workers;
  }
  const census = fs.readFileSync(path.join(DIR, CENSUS), 'utf8');
  assert.match(census, /test\.describe\.configure\(\{ mode: 'parallel' \}\)/, 'the census spreads its pages over the workers');
  assert.doesNotMatch(census, /stack-align inset is still on a page/, 'the stale check is not in a file the widths run');
  assert.match(fs.readFileSync(path.join(DIR, 'layout-census-after.spec.ts'), 'utf8'), /stack-align inset is still on a page/);
});
