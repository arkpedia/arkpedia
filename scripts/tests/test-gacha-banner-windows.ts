import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import bundledBanners from '../../data/headhunting_banners.json';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

// Both an unlinked Featured banner and a special banner use the localization gap;
// the special banner withholds its CN lineup until Global confirms it.
const jointRecord = (bundledBanners as HeadhuntingBanner[]).find(b => b.name === '[jo] Joint Operation 23')!;
const cnOnly: HeadhuntingBanner = { ...jointRecord, name: 'A CN-only featured banner', pull_type: 'featured' };
import { resolveGachaSimulatorBanners } from '../../lib/gacha/gachaBannerWindows';
import { getAllEvents } from '../../lib/schedule/schedule';
import { getEventCalendar } from '../../lib/home/frontPageContent';

test('simulator follows calendar forecasts and keeps confirmed Global dates', () => {
  const calendar = getEventCalendar();
  const source = getAllHeadhuntingBanners();
  const persona = source.find(b => b.name.includes('Persona 3 Reload'))!;
  const confirmed = source.find(b => b.name === 'Kernel #62 (Global)')!;
  const event = calendar.find(row => row.name === persona.linked_event)!;
  const resolved = resolveGachaSimulatorBanners([persona, confirmed, cnOnly, jointRecord], getAllEvents(), calendar);

  assert.deepEqual(resolved.map(b => b.name).filter(name => name !== jointRecord.name), [persona.name, cnOnly.name, confirmed.name]);
  assert.equal(resolved.find(b => b.name === persona.name)?.global_date?.split('–')[0], event.dateRange.split('–')[0]);
  assert.equal(resolved.find(b => b.name === persona.name)?.global_date_estimated, true);
  assert.equal(resolved.find(b => b.name === cnOnly.name)?.global_date, '2027/02/09–2027/02/23');
  assert.equal(resolved.find(b => b.name === cnOnly.name)?.global_date_estimated, true);
  // The Joint Operation returns as a forecast with no CN operators.
  assert.equal(resolved.find(b => b.name === jointRecord.name)?.global_date, '2027/02/09–2027/02/23');
  assert.deepEqual(resolved.find(b => b.name === jointRecord.name)?.six_stars, []);
  assert.equal(resolved.find(b => b.name === jointRecord.name)?.global_date_estimated ?? false, true);
  assert.equal(source.some(b => b.name === jointRecord.name), true);
  assert.equal(resolved.find(b => b.name === confirmed.name)?.global_date, confirmed.global_date);
  assert.equal(resolved.find(b => b.name === confirmed.name)?.global_date_estimated, false);
  assert.equal(source.find(b => b.name === persona.name)?.global_date, null);
});

test('a moved calendar forecast changes the simulator order', () => {
  const calendar = getEventCalendar();
  const source = getAllHeadhuntingBanners();
  const persona = source.find(b => b.name.includes('Persona 3 Reload'))!;
  const moved = calendar.map(row => row.name === persona.linked_event
    ? { ...row, dateRange: '2027/01/01–2027/01/30' } : row);
  const resolved = resolveGachaSimulatorBanners([persona, cnOnly], getAllEvents(), moved);
  assert.deepEqual(resolved.map(b => b.name), [cnOnly.name, persona.name]);
  assert.equal(resolved.find(b => b.name === persona.name)?.global_date, '2027/01/01–2027/01/15');
});

/* The request-time half of withContentPage. A finalize hook runs on every request
   against the release's props, so the only records it may read are those props: the
   /gacha one re-estimated banner dates from the deployment's bundled banners and
   calendar, which lagged the release it was finalizing (411 banners to its 412). The
   estimate belongs in getStaticProps, which the content export runs on the release. */
const DEPLOYMENT_RECORDS = /\b(?:getAllHeadhuntingBanners|getBannersSortedByDate|resolveGachaSimulatorBanners|getAllEvents|getEventCalendar|loadGameEvents)\s*\(/;

function finalizeHooks(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const functions = new Map<string, ts.Node>();
  const hooks: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'withContentPage') {
      const options = node.arguments[2];
      const finalize = options && ts.isObjectLiteralExpression(options)
        ? options.properties.find(p => p.name && ts.isIdentifier(p.name) && p.name.text === 'finalize') : undefined;
      if (finalize && ts.isPropertyAssignment(finalize)) hooks.push(finalize.initializer.getText(source));
      if (finalize && ts.isShorthandPropertyAssignment(finalize)) hooks.push(finalize.name.text);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return hooks.map(hook => functions.get(hook)?.getText(source) ?? hook);
}

test('a page\'s request-time finalize reads only the release\'s props, never the deployment\'s banners or calendar', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  const hooks = walk('pages').flatMap(file => finalizeHooks(file).map(body => ({ file, body })));
  // Not vacuous: the home page's hook is found, through its function name.
  assert.ok(hooks.some(hook => hook.file === path.join('pages', 'index.tsx') && hook.body.includes('async function finalizeHome')));
  const offenders = hooks.filter(hook => DEPLOYMENT_RECORDS.test(hook.body)).map(hook => `${hook.file}: ${hook.body.match(DEPLOYMENT_RECORDS)![0]}`);
  assert.deepEqual(offenders, []);
});
