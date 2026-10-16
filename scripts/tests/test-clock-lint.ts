import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLOCK_ROUTES } from '../../lib/content/pageClock';

// eslint ships no type declarations, and this is the only place a script needs its API.
type LintResult = { messages: { ruleId: string | null; line: number }[] };
type Linter = { lintText(code: string, options: { filePath: string }): Promise<LintResult[]>; calculateConfigForFile(file: string): Promise<{ rules?: Record<string, unknown> }> };
const { ESLint } = require('eslint') as { ESLint: new (options: { cwd: string }) => Linter };

// Pages rendered on the server at the request's moment and hydrated in the reader's
// browser later must not read the clock while rendering: /gacha (its Upcoming tab and
// LIVE NOW) and the home page's Events panel both did, and both failed hydration once a
// banner or event closed in between. The .eslintrc.json override bans argument-less
// `new Date()`, `Date.now()`, `serverWeekday()` and `toServerTime()` in every such file;
// they read the reader's clock through lib/time/readerClock.ts, after mount. These tests
// fail if the override is removed, or if a route gets a page clock without it.
const eslint = new ESLint({ cwd: process.cwd() });
const rules = async (filePath: string) => (await eslint.calculateConfigForFile(filePath)).rules ?? {};
const guarded = async (filePath: string) => 'no-restricted-syntax' in await rules(filePath)
  && JSON.stringify((await rules(filePath))['no-restricted-syntax']).includes("NewExpression[callee.name='Date'][arguments.length=0]");

/** The page file Next serves a route from. */
function pageFile(route: string): string {
  const base = route === '/' ? 'pages/index' : `pages${route}`;
  const file = [`${base}.tsx`, `${base}/index.tsx`].find((candidate) => fs.existsSync(candidate));
  assert.ok(file, `no page file for ${route}`);
  return file;
}

// Every page contentPageClock gives a clock, and the components that render from it.
const GUARDED = [...new Set([...CLOCK_ROUTES.map(pageFile), 'pages/gacha.tsx', 'components/schedule/EventsPanel.tsx', 'components/home/GachaBannersPanel.tsx'])];

test('debug globals cannot retain page data after navigation; internal reads remain allowed', async () => {
  const code = 'window.__operators = []; const x = window.__operators; window.__assetRetry = true;';
  for (const filePath of ['pages/base.tsx', 'pages/gacha.tsx', 'lib/assets/assetRetry.ts']) {
    const messages = (await eslint.lintText(code, { filePath }))[0].messages.filter(m => m.ruleId === 'no-restricted-syntax');
    assert.equal(messages.length, 1, filePath);
  }
});

test('the clock ban covers every page with a request clock, /gacha, the Events panel and the home page\'s banners', async () => {
  assert.ok(CLOCK_ROUTES.includes('/gacha') && CLOCK_ROUTES.includes('/'), 'the two pages this guard was written for have a clock');
  for (const file of GUARDED) assert.ok(await guarded(file), `${file} renders from a request clock but .eslintrc.json does not ban clock reads in it`);
  // The helper that reads the clock after mount is not under the ban, nor is a page without a clock.
  assert.equal(await guarded('lib/time/readerClock.ts'), false);
});

test('lint rejects each argument-less clock read in a guarded file, and nothing else', async () => {
  const code = [
    "import { serverWeekday, toServerTime } from '@/lib/time/servers.mjs';",
    'export function f(): number { return new Date().getTime() + Date.now(); }',
    'export const g = new Date(0);',
    'export const h = serverWeekday() + serverWeekday(g) + toServerTime().getTime() + toServerTime(g).getTime();',
    '',
  ].join('\n');
  const flagged = async (filePath: string) => (await eslint.lintText(code, { filePath }))[0].messages
    .filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.line);
  for (const file of GUARDED) {
    assert.deepEqual(await flagged(file), [2, 2, 4, 4], `${file}: new Date(), Date.now(), serverWeekday() and toServerTime(), not new Date(0) or a call with a moment`);
  }
  assert.deepEqual(await flagged('lib/time/readerClock.ts'), [], 'the reader-clock helpers are where the clock is read');
});
