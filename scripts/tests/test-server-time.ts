import fs from 'node:fs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { SERVER_TIME, DAY_MS, serverDate, serverDay, serverClockAt, serverCalendarTime, getNextDailyReset, getNextWeeklyReset, serverOffsetLabel, type GameServer } from '../../lib/time/servers.mjs';
import { incomeBetween } from '../../lib/pulls/pulls';
import { certificateMonths, greenCertificateIncome } from '../../lib/pulls/incomeSettings';
import { getCurrentResetWindowWeekday, getCurrentlyAvailableChipClasses } from '../../lib/schedule/opsSchedules';
import { parseGameWindow } from '../../lib/schedule/gameWindow';

const at = (value: string) => new Date(value);

test('every server changes game day at its reset, while wall-calendar dates keep their distinct meaning', () => {
  for (const [server, reset] of [
    ['en', '2026-10-19T11:00:00Z'], ['jp', '2026-10-18T19:00:00Z'],
    ['kr', '2026-10-18T19:00:00Z'], ['cn', '2026-10-18T20:00:00Z'],
  ] as const) {
    const instant = at(reset), before = new Date(instant.getTime() - 1);
    assert.equal(serverDate(before, server), '2026-10-18', server);
    assert.equal(serverDate(instant, server), '2026-10-19', server);
    assert.equal(serverCalendarTime(before, server).toISOString().slice(0, 10), '2026-10-19', 'calendar midnight has already passed');
    assert.equal(serverClockAt(before, server).clock, '03:59');
    assert.equal(serverClockAt(instant, server).clock, '04:00');
    assert.equal(getNextDailyReset(before, server).getTime(), instant.getTime());
    assert.equal(getNextDailyReset(instant, server).getTime(), instant.getTime() + DAY_MS);
    assert.equal(getNextWeeklyReset(before, server).getTime(), instant.getTime());
    assert.equal(getNextWeeklyReset(instant, server).getTime(), instant.getTime() + 7 * DAY_MS);
    assert.equal(getCurrentResetWindowWeekday(before, server), 0);
    assert.equal(getCurrentResetWindowWeekday(instant, server), 1);
  }
});

test('regional daily and weekly income, rotations and month keys use the same account server', () => {
  const from = at('2026-10-18T18:59:59Z'), to = at('2026-10-18T19:00:00Z');
  assert.deepEqual([incomeBetween(from, to, 'en').days, incomeBetween(from, to, 'en').weeks], [0, 0]);
  for (const server of ['jp', 'kr'] as const) {
    assert.deepEqual([incomeBetween(from, to, server).days, incomeBetween(from, to, server).weeks], [1, 1]);
    assert.notDeepEqual(getCurrentlyAvailableChipClasses(from, server), getCurrentlyAvailableChipClasses(to, server));
    assert.equal(serverOffsetLabel(server), 'UTC+9');
    const monthFrom = at('2026-10-31T14:59:59Z'), monthTo = at('2026-10-31T15:00:00Z');
    assert.deepEqual(certificateMonths(monthFrom, monthTo, server), ['2026-10', '2026-11']);
    assert.equal(greenCertificateIncome(monthFrom, monthTo, true, server).months, 1);
    assert.deepEqual(certificateMonths(monthFrom, monthTo, 'en'), ['2026-10']);
  }
});

test('date-only estimates use their owning region, and exact announcement instants always win', () => {
  for (const server of Object.keys(SERVER_TIME) as GameServer[]) {
    const window = parseGameWindow('2026/10/19–2026/10/20', {}, server, true)!;
    assert.equal(serverClockAt(window.start, server).clock, '04:00');
    const exact = { startAt: '2026-10-19T03:45:00Z', endAt: '2026-10-20T05:30:00Z' };
    assert.deepEqual(parseGameWindow('2026/10/19–2026/10/20', exact, server), { start: at(exact.startAt), end: at(exact.endAt) });
  }
  assert.equal(serverDay(Date.parse('2026-10-18T16:00:00Z') / 1000), '2026/10/19', 'catalogue defaults remain CN wall-calendar dates');
});

test('fixed game times are identical under host timezones and daylight-saving changes', () => {
  const url = pathToFileURL(path.resolve('lib/time/servers.mjs')).href;
  const code = `import { serverClockAt, serverDate, getNextWeeklyReset } from ${JSON.stringify(url)};
    console.log(JSON.stringify(['2026-03-08T10:59Z', '2026-03-08T11:00Z', '2026-11-01T10:59Z', '2026-11-01T11:00Z'].flatMap(time => ['en', 'jp', 'kr', 'cn'].map(server => { const now = new Date(time); return [serverClockAt(now, server), serverDate(now, server), getNextWeeklyReset(now, server)]; }))));`;
  const values = ['UTC', 'Asia/Tokyo', 'Asia/Seoul', 'America/Los_Angeles'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, TZ } }));
  values.forEach(value => assert.equal(value, values[0]));
});


/** Catch copied server policies, leaving unrelated duration arithmetic alone. */
function timeCopies(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = new Set<string>();
  const at = (node: ts.Node, kind: string) => found.add(`${kind}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
  const factors = (node: ts.Node): number[] | null => {
    if (ts.isNumericLiteral(node)) return [Number(node.text)];
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
      const left = factors(node.left), right = factors(node.right);
      return left && right ? [...left, ...right] : null;
    }
    return null;
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) && /^Etc\/GMT/.test(node.text)) at(node, 'timezone');
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name
      && /^server(?:Day|Date)$/.test(node.name.getText(source))) at(node, 'helper');
    if (ts.isBinaryExpression(node)) {
      const parts = factors(node);
      if (parts && [7, 8, 9, 11, 15].includes(parts[0])
        && ['3600', '3600000', '60,60', '60,60,1000'].includes(parts.slice(1).join(','))) at(node, 'offset');
    }
    node.forEachChild(visit);
  };
  visit(source);
  return [...found];
}

test('the server-time guard catches copied offsets and helpers without flagging comments or ordinary day durations', () => {
  assert.deepEqual(timeCopies('fixture.ts', '// new Date(now - 7 * 3600000)\nconst next = now + 24 * 3600000;'), []);
  assert.deepEqual(timeCopies('fixture.ts', "function serverDate(t) { return new Date(t - 7 * 3600000); }"), ['helper:1', 'offset:1']);
  assert.deepEqual(timeCopies('fixture.ts', "const zone = 'Etc/GMT+7'; const shifted = ts + 9 * 60 * 60 * 1000;"), ['timezone:1', 'offset:1']);
});

test('application and pipeline server-time rules live only in the shared module', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['tests', 'fixtures', 'vendor', 'node_modules'].includes(entry.name) ? [] : walk(file);
    return /\.(?:tsx?|mjs|cjs|js)$/.test(entry.name) ? [file] : [];
  });
  const files = ['lib', 'pages', 'components', 'scripts'].flatMap(walk).filter(file => file !== 'lib/time/servers.mjs');
  assert.deepEqual(files.flatMap(file => timeCopies(file, fs.readFileSync(file, 'utf8')).map(problem => `${file}:${problem}`)), []);
});
