import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { countOf } from '../../lib/stages/stageText';

/*
 * Copy on the stage pages. The Terminal home printed "1 seasons" from a `{count} {noun}`
 * that always took the plural, and it formatted an event's closing date in the reader's
 * own locale once mounted, so the render after hydration printed a different string from
 * the server's markup (toLocaleDateString(undefined, ...)).
 */

test('a count takes its noun in the right number', () => {
  assert.equal(countOf(1, 'season'), '1 season');
  assert.equal(countOf(2, 'season'), '2 seasons');
  assert.equal(countOf(0, 'stage'), '0 stages');
  assert.equal(countOf(1, 'operation'), '1 operation');
  assert.equal(countOf(3, 'theme'), '3 themes');
});

const STAGE_CODE = ['pages/stages', 'components/stages', 'lib/stages'];
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const at = path.join(dir, entry.name);
  return entry.isDirectory() ? files(at) : /\.(tsx?|mjs)$/.test(entry.name) ? [at] : [];
});

test('the stage pages format dates and numbers in a locale they name, never the visitor\'s', () => {
  // No locale, `undefined`, or one picked at run time is whatever Intl finds on the machine
  // rendering: the build server's for the markup and the reader's in the browser, which do
  // not agree. So the first argument must be a string literal.
  const call = /\.toLocale(?:Date|Time)?String\(|new Intl\.(?:DateTimeFormat|NumberFormat)\(/g;
  const unnamed = (line: string) => [...line.matchAll(call)]
    .some((m) => !/^\s*['"`]/.test(line.slice((m.index ?? 0) + m[0].length)));
  const offenders = STAGE_CODE.flatMap(files).flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((line, i) => (unnamed(line) ? `${file}:${i + 1}: ${line.trim()}` : null))
    .filter((hit): hit is string => !!hit));
  assert.deepEqual(offenders, [], 'pass a fixed locale (the stage pages use en-GB for dates)');
  // The check itself: it catches the line this replaced, and passes a named locale.
  assert.ok(unnamed("new Date(end * 1000).toLocaleDateString(mounted ? undefined : 'en-GB', {"));
  assert.ok(unnamed('x.toLocaleDateString(undefined, { day: "numeric" })'));
  assert.ok(unnamed('n.toLocaleString()'));
  assert.ok(!unnamed("new Date(end * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC' })"));
});
