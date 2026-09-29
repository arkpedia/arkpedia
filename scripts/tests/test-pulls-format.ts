import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { formatDayMonth, formatDayMonthYear, formatNumber, formatOneDecimal } from '../../lib/pulls/format';

/*
 * /pulls is prerendered, then hydrated in the reader's browser. Formatting with the
 * reader's locale during render prints "49.700" in de-DE (fr-FR, pt-BR, ru-RU) where the
 * server printed "49,700", and React discards the server HTML (errors 418/423/425). Every
 * number and date in the planner therefore goes through lib/pulls/format.ts, whose locale
 * is fixed and whose dates are read in UTC. This scan keeps it that way (ported from
 * kukkikaze/Arkpedia's pull-planner branch, scripts/test-pull-plan.ts).
 */
const ROOT = join(__dirname, '../..');
const PLANNER_SOURCES = ['pages/pulls.tsx', 'components/pulls', 'lib/pulls'];
const PLANNER_FORMATTER = 'lib/pulls/format.ts';
const LOCALE_CALL = /\.toLocale(?:String|DateString|TimeString)\s*\(|\bIntl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|PluralRules|ListFormat|DisplayNames|Collator)\s*\(/g;

/** Every locale-sensitive formatting call in `source` that breaks the rule, as `file:line`. */
function localeViolations(file: string, source: string): string[] {
  // Drop comments so prose about the rule cannot trip it. `https://` survives.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/gm, '$1');
  const constants = new Map([...code.matchAll(/\bconst\s+(\w+)\s*=\s*(['"])([^'"]+)\2/g)].map(match => [match[1], match[3]]));
  const violations: string[] = [];
  for (const match of code.matchAll(LOCALE_CALL)) {
    const line = code.slice(0, match.index).split('\n').length;
    if (file !== PLANNER_FORMATTER) { violations.push(`${file}:${line} formats outside ${PLANNER_FORMATTER}`); continue; }
    const argument = code.slice(match.index! + match[0].length).match(/^\s*(?:(['"])([^'"]*)\1|(\w+))/);
    const locale = argument ? argument[2] ?? constants.get(argument[3]) : undefined;
    if (!locale || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) violations.push(`${file}:${line} has no explicit locale`);
    if (/DateTimeFormat/.test(match[0]) && !/^[^;]*timeZone:\s*'UTC'/.test(code.slice(match.index!))) violations.push(`${file}:${line} dates must be read in UTC`);
  }
  return violations;
}

test('the locale scan flags reader-locale formatting and the formatter only', () => {
  const bad = ['n.toLocaleString()', 'n.toLocaleString(undefined, { maximumFractionDigits: 1 })', 'd.toLocaleDateString(navigator.language)', 'new Intl.NumberFormat()', 'Intl.DateTimeFormat(undefined, {})', "d.toLocaleTimeString( )", "const url = 'https://x'; n.toLocaleString()"];
  for (const source of bad) {
    assert.equal(localeViolations('components/pulls/Example.tsx', source).length, 1, source);
    assert.ok(localeViolations(PLANNER_FORMATTER, source).some(problem => problem.includes('no explicit locale')), `${source} in the formatter`);
  }
  assert.equal(localeViolations('components/pulls/Example.tsx', "n.toLocaleString('en-US')").length, 1, 'fixed locale, but not the shared formatter');
  assert.deepEqual(localeViolations(PLANNER_FORMATTER, "const L = 'en-US';\nnew Intl.NumberFormat(L);\nn.toLocaleString('en-GB');"), []);
  assert.equal(localeViolations(PLANNER_FORMATTER, "new Intl.DateTimeFormat('en-GB', { day: 'numeric' });").length, 1, 'dates without timeZone UTC');
  assert.deepEqual(localeViolations(PLANNER_FORMATTER, "new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' });"), []);
  assert.deepEqual(localeViolations('components/pulls/Example.tsx', "// n.toLocaleString()\n/* d.toLocaleDateString() */\nquery.toLocaleLowerCase()"), []);
});

test('the planner renders every number and date with a fixed locale, through lib/pulls/format.ts', () => {
  const walk = (path: string): string[] => {
    const full = join(ROOT, path);
    return statSync(full).isDirectory() ? readdirSync(full).flatMap(name => walk(join(path, name))) : /\.tsx?$/.test(path) ? [relative(ROOT, full).split(sep).join('/')] : [];
  };
  const files = PLANNER_SOURCES.flatMap(walk);
  for (const file of ['pages/pulls.tsx', 'components/pulls/PullBannerRow.tsx', 'components/pulls/BannerPicker.tsx', 'lib/pulls/plan.ts', PLANNER_FORMATTER]) assert.ok(files.includes(file), `scanned ${file}`);
  assert.deepEqual(files.flatMap(file => localeViolations(file, readFileSync(join(ROOT, file), 'utf8'))), []);
  assert.equal(formatNumber(49700), '49,700');
  assert.equal(formatNumber(-1205.5), '-1,205.5');
  assert.equal(formatOneDecimal(1234.56), '1,234.6');
  assert.match(formatDayMonth('2026-09-25'), /^25 Sept?$/);
  assert.match(formatDayMonthYear('2027-01-01'), /^1 Jan 2027$/);
  assert.equal(formatDayMonth('not a date'), 'not a date');
});

test('the readers whose pages failed to hydrate: their locale groups digits unlike the server', () => {
  // What a reader in each of these locales got from the bare toLocaleString() /pulls used
  // to call, against what the server printed: the hydration errors, as data.
  for (const locale of ['de-DE', 'fr-FR', 'pt-BR', 'ru-RU']) {
    assert.notEqual((49700).toLocaleString(locale), (49700).toLocaleString('en-US'), locale);
  }
});
