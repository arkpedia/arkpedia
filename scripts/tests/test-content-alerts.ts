import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { cell, renderQuarantineReport } from '../content/quarantine-report.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { failureLine } from '../content/run-stage.mjs';

/* A stand-in for gh: the issue commands the alert script uses, over a JSON store, plus
   `gh api` answered from canned JSON through the real jq, as gh --jq does. Every call is
   logged, so a case can see what was created, edited, commented on or closed. */
const fakeGh = `#!/usr/bin/env node
const fs = require('fs');
const { execFileSync } = require('child_process');
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const opt = name => args[args.indexOf(name) + 1];
const issue = () => state.issues.find(entry => entry.number === Number(args[2]));
const out = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
state.calls.push(args[0] === 'api' ? 'api ' + args[1] : args.slice(0, 3).join(' '));
if (args[0] === 'api') {
  const answer = state.api[args[1].split('?')[0]];
  if (answer === undefined) { fs.writeFileSync(file, JSON.stringify(state)); process.exit(1); }
  out(execFileSync('jq', ['-r', opt('--jq')], { input: JSON.stringify(answer), encoding: 'utf8' }));
} else if (args[1] === 'list') out(state.issues.filter(entry => entry.state === 'open').map(({ number, title, body }) => ({ number, title, body })));
else if (args[1] === 'view') out({ comments: issue().comments });
else if (args[1] === 'create') state.issues.push({ number: state.issues.length + 1, title: opt('--title'), body: fs.readFileSync(opt('--body-file'), 'utf8'), state: 'open', comments: [] });
else if (args[1] === 'edit') issue().body = fs.readFileSync(opt('--body-file'), 'utf8');
else if (args[1] === 'comment') issue().comments.push({ body: fs.readFileSync(opt('--body-file'), 'utf8') });
else if (args[1] === 'close') { issue().state = 'closed'; issue().comments.push({ body: opt('--comment') }); }
else { console.error('fake gh: unsupported ' + args.join(' ')); process.exit(2); }
fs.writeFileSync(file, JSON.stringify(state));
`;
// GNU date's relative form, which the workflow uses and macOS's date lacks, at a fixed time.
const fakeDate = `#!/usr/bin/env node
if (!process.argv.includes('-d')) { process.stdout.write(new Date(process.env.FAKE_NOW).toISOString() + '\\n'); process.exit(0); }
const days = Number(process.argv[process.argv.indexOf('-d') + 1].match(/^(\\d+) days ago$/)[1]);
process.stdout.write(new Date(Date.parse(process.env.FAKE_NOW) - days * 86400000).toISOString().replace(/\\.\\d{3}Z$/, 'Z') + '\\n');
`;
type Issue = { number: number; title: string; body: string; state: string; comments: { body: string }[] };
function withGitHub(use: (github: ReturnType<typeof fakeGitHub>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-alerts-'));
  try { use(fakeGitHub(root)); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function fakeGitHub(root: string) {
  const bin = path.join(root, 'bin'), stateFile = path.join(root, 'state.json');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), fakeGh, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'date'), fakeDate, { mode: 0o755 });
  fs.writeFileSync(stateFile, JSON.stringify({ issues: [], calls: [], api: {} }));
  const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const env = (extra: Record<string, string> = {}) => ({ ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    FAKE_GH_STATE: stateFile, GITHUB_REPOSITORY: 'arkpedia/test', RUNNER_TEMP: root, RUN_URL: 'https://example.invalid/run/1', ...extra });
  return {
    root,
    seed(issues: Partial<Issue>[], api: Record<string, unknown> = {}) {
      fs.writeFileSync(stateFile, JSON.stringify({ issues: issues.map((issue, i) => ({ number: i + 1, state: 'open', comments: [], body: '', ...issue })), calls: [], api }));
    },
    issues: (): Issue[] => state().issues,
    calls: (): string[] => state().calls,
    alert(args: string[], body?: string) {
      const bodyFile = path.join(root, 'body.md');
      if (body !== undefined) fs.writeFileSync(bodyFile, body);
      const result = spawnSync(process.execPath, ['scripts/content/alert-issue.mjs', ...args, ...(body !== undefined ? ['--body-file', bodyFile] : [])], { encoding: 'utf8', env: env() });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    },
    step(script: string, extra: Record<string, string> = {}) {
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: env(extra) });
      return { status: result.status, output: result.stdout + result.stderr };
    },
  };
}
const failing = ['--alert', 'content-release-failing', '--title', 'Content release failing'];

test('one issue per alert, found by its marker, commented on at most once a day', () => {
  withGitHub(github => {
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-20T20:00:00Z'], 'failed once'), 'created');
    const [issue] = github.issues();
    assert.equal(issue.title, 'Content release failing');
    assert.equal(issue.body, '<!-- arkpedia-alert:content-release-failing -->\nfailed once\n');
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-20T21:00:00Z'], 'failed twice'), 'commented');
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-20T23:59:00Z'], 'failed three times'), 'already-commented');
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-21T00:01:00Z'], 'failed the next day'), 'commented');
    assert.deepEqual(github.issues()[0].comments.map(comment => comment.body), [
      '<!-- arkpedia-alert:content-release-failing:2026-09-20 -->\nfailed twice\n',
      '<!-- arkpedia-alert:content-release-failing:2026-09-21 -->\nfailed the next day\n',
    ]);
    // Renaming the issue changes nothing: the marker finds it.
    github.seed([{ ...github.issues()[0], title: 'Renamed by hand' }]);
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-22T00:00:00Z'], 'still failing'), 'commented');
    assert.equal(github.issues().length, 1);
    assert.equal(github.alert(['close', ...failing, '--comment', 'Recovered']), 'closed');
    assert.equal(github.issues()[0].state, 'closed');
    assert.equal(github.alert(['close', ...failing, '--comment', 'Recovered']), 'none');
  });
});

test('an issue opened by title before markers existed is adopted, not duplicated', () => {
  withGitHub(github => {
    github.seed([{ title: 'Content release failing', body: 'Prepare content release ended with failure' },
      { title: 'Content release failing', body: '<!-- arkpedia-alert:another-alert -->\nnot this one' }]);
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-20T20:00:00Z'], 'failed again'), 'commented');
    assert.equal(github.issues().length, 2);
    assert.equal(github.issues()[0].comments.length, 1);
    assert.equal(github.alert(['close', ...failing, '--comment', 'Recovered']), 'closed');
    assert.deepEqual(github.issues().map(issue => issue.state), ['closed', 'open']);
  });
});

test('a marker quoted further down an issue body does not make it another alert\'s issue', () => {
  withGitHub(github => {
    // Wiki text in the quarantine issue that happens to carry the failed-release marker.
    github.seed([{ title: 'Content quarantined', body: '<!-- arkpedia-alert:content-quarantined -->\n| `banner:<!-- arkpedia-alert:content-release-failing -->` |' }]);
    assert.equal(github.alert(['close', ...failing, '--comment', 'Recovered']), 'none', 'the quarantine issue is not closed as the failed-release report');
    assert.equal(github.alert(['open', ...failing, '--now', '2026-09-20T20:00:00Z'], 'failed <!-- arkpedia-alert:content-quarantined --> again'), 'created');
    const [quarantined, report] = github.issues();
    assert.deepEqual([quarantined.state, quarantined.comments.length], ['open', 0]);
    // A body with a marker in it is posted with the marker defused, so it cannot become one.
    assert.equal(report.body, '<!-- arkpedia-alert:content-release-failing -->\nfailed &lt;!-- arkpedia-alert:content-quarantined --> again\n');
    assert.equal(github.alert(['open', '--alert', 'content-quarantined', '--title', 'Content quarantined', '--now', '2026-09-20T20:00:00Z'], 'still held'), 'commented');
    assert.equal(github.issues()[0].comments.length, 1, 'the issue whose first line is the marker is found');
    // An edit that turned the line endings into CRLF, as GitHub's editor does, still finds it.
    github.seed([{ ...github.issues()[1], body: github.issues()[1].body.replace(/\n/g, '\r\n') }]);
    assert.equal(github.alert(['close', ...failing, '--comment', 'Recovered']), 'closed');
  });
});

test('a rewritten alert tracks the current state, and comments only when that state changed', () => {
  withGitHub(github => {
    const quarantined = ['open', '--alert', 'content-quarantined', '--title', 'Content quarantined', '--rewrite'];
    const body = (digest: string, days: number) => `<!-- arkpedia-alert-digest:${digest} -->\nbanner:X held for ${days} d\n`;
    assert.equal(github.alert([...quarantined, '--now', '2026-09-20T20:00:00Z'], body('one', 0)), 'created');
    // A day older, same records: the body shows the new age, and nobody is notified.
    assert.equal(github.alert([...quarantined, '--now', '2026-09-21T20:00:00Z'], body('one', 1)), 'rewritten');
    assert.equal(github.issues()[0].comments.length, 0);
    assert.match(github.issues()[0].body, /held for 1 d/);
    assert.equal(github.alert([...quarantined, '--now', '2026-09-21T21:00:00Z'], body('one', 1)), 'unchanged');
    assert.equal(github.calls().filter(call => call.startsWith('issue edit')).length, 1, 'an identical body is not sent again');
    // A new record: the body is rewritten and there is one comment for the day.
    assert.equal(github.alert([...quarantined, '--now', '2026-09-22T20:00:00Z'], body('two', 2)), 'commented');
    assert.equal(github.alert([...quarantined, '--now', '2026-09-22T21:00:00Z'], body('three', 2)), 'already-commented');
    assert.equal(github.issues()[0].body, '<!-- arkpedia-alert:content-quarantined -->\n<!-- arkpedia-alert-digest:three -->\nbanner:X held for 2 d\n');
    assert.equal(github.issues()[0].comments.length, 1);
  });
});

test('the quarantine report names why a stage failed, whichever runtime printed it', () => {
  const crash = ['TypeError: fetch failed', '    at json (file:///app/scripts/sync/sync-catalogue.mjs:17:26)',
    '    ... 3 lines matching cause stack trace ...', '    at async syncCatalogue (file:///app/scripts/sync/sync-catalogue.mjs:91:36) {',
    '  [cause]: Error: connect ECONNREFUSED 185.199.108.133:443', '      at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1611:16) {',
    '    errno: -111,', "    code: 'ECONNREFUSED',", "    syscall: 'connect',", '  }', '}', 'Node.js v22.20.0'].join('\n');
  assert.equal(failureLine(crash), '[cause]: Error: connect ECONNREFUSED 185.199.108.133:443');
  assert.equal(failureLine('Traceback (most recent call last):\n  File "import.py", line 3, in <module>\nurllib.error.URLError: <urlopen error [Errno 111] Connection refused>'),
    'urllib.error.URLError: <urlopen error [Errno 111] Connection refused>');
  assert.equal(failureLine('curl: (22) The requested URL returned error: 404'), 'curl: (22) The requested URL returned error: 404');
  assert.equal(failureLine('}\n'), '}', 'nothing better: the last line as it was');
  const report = renderQuarantineReport({ quarantine: null, now: new Date('2026-09-23T20:00:00Z'),
    stageReport: { version: 1, stages: [{ stage: 'catalogue', status: 'failed', durationMs: 1, exit: 'exited 1', error: crash }] } });
  assert.match(report.body, /^\| {2}\| `catalogue` \| failed \| 2026-09-23 \(0 d\) \| exited 1: \\\[cause\\\]: Error: connect ECONNREFUSED 185\.199\.108\.133:443 \|$/m);
});

test('the quarantine report lists held records and failed stages, and marks entries overdue after 3 days', () => {
  // lastSeen may or may not be there: the age counts from firstSeen alone.
  const entry = (key: string, firstSeen: string, extra: object = {}) => ({ key, stage: 'catalogue', reason: `why ${key}`, action: 'omitted-new', firstSeen, ...extra });
  const quarantine = { version: 1, entries: [
    entry('banner:NEW', '2026-09-23', { lastSeen: '2026-09-23' }), entry('banner:THREE', '2026-09-20'), entry('banner:FOUR', '2026-09-19', { reason: 'a | b', sourceRef: 'https://example.invalid/row' }),
    entry('operator:x', '2026-09-10', { stage: 'completeness', action: 'published-partial', sourceRef: 'Headhunting/Banners/2026' }),
    // The stage runner's own entry for a stage that did not run to the end: it dates the
    // stage's row instead of being a row of its own.
    entry('stage:charwords', '2026-09-19', { stage: 'refresh', action: 'kept-previous', reason: 'failed or timed out; the run\'s stage report says how' }),
  ] };
  const stageReport = { version: 1, stages: [
    { stage: 'pin-upstream', status: 'ok', durationMs: 1 },
    { stage: 'charwords', status: 'failed', durationMs: 2, exit: 'exited 22', error: 'curl: (22) The requested URL returned error: 404' },
    { stage: 'voices', status: 'skipped', durationMs: 0, reason: 'needs charwords, which failed' },
  ] };
  const now = new Date('2026-09-23T20:00:00Z');
  assert.deepEqual(renderQuarantineReport({ quarantine: null, stageReport: null, now }), { state: 'nodata' });
  assert.deepEqual(renderQuarantineReport({ quarantine: { version: 1, entries: [] }, stageReport: { stages: [stageReport.stages[0]] }, now }), { state: 'clear' });
  // No stage ran (a correction dispatched without a refresh): nothing says every stage ran.
  assert.deepEqual(renderQuarantineReport({ quarantine: { version: 1, entries: [] }, stageReport: null, now }), { state: 'nodata' });
  const report = renderQuarantineReport({ quarantine, stageReport, now, runUrl: 'https://example.invalid/run/1' });
  assert.equal(report.state, 'alert');
  const rows = report.body.split('\n').filter((line: string) => line.startsWith('| ') && !line.startsWith('| |') && !line.startsWith('| Stage'));
  assert.deepEqual(rows, [
    '| **overdue** | `operator:x` | completeness | published-partial | 2026-09-10 (13 d) | why operator:x (`Headhunting/Banners/2026`) |',
    '| **overdue** | `banner:FOUR` | catalogue | omitted-new | 2026-09-19 (4 d) | a \\| b ([source](https://example.invalid/row)) |',
    '|  | `banner:THREE` | catalogue | omitted-new | 2026-09-20 (3 d) | why banner:THREE |',
    '|  | `banner:NEW` | catalogue | omitted-new | 2026-09-23 (0 d) | why banner:NEW |',
    '| **overdue** | `charwords` | failed | 2026-09-19 (4 d) | exited 22: curl: (22) The requested URL returned error: 404 |',
    '|  | `voices` | skipped | 2026-09-23 (0 d) | needs charwords, which failed |',
  ]);
  assert.match(report.body, /\*\*Quarantined records: 4 \(2 overdue\)\*\*/);
  assert.match(report.body, /\*\*Refresh stages that did not run to the end: 2 \(1 overdue\)\*\*/);
  assert.equal(report.comment, '4 record(s) quarantined, 2 overdue; 2 refresh stage(s) did not run to the end, 1 failing for more than 3 days. The issue body lists them (https://example.invalid/run/1).');
  // The digest ignores a day passing, and notices a record becoming overdue or a new one.
  const later = (days: number, extra: object[] = []) => renderQuarantineReport({ quarantine: { version: 1, entries: [...quarantine.entries, ...extra] }, stageReport, now: new Date(now.getTime() + days * 86_400_000) }).digest;
  assert.equal(later(0), report.digest);
  assert.notEqual(later(1), report.digest, 'banner:THREE becomes overdue');
  assert.equal(later(1), renderQuarantineReport({ quarantine, stageReport, now: new Date('2026-09-24T01:00:00Z') }).digest);
  assert.notEqual(later(0, [entry('banner:ANOTHER', '2026-09-23')]), report.digest);
  // A run that failed before or at the publish says so, and that alone is no news.
  assert.match(report.body, /The day's release went out without what is listed here/);
  const unpublished = renderQuarantineReport({ quarantine, stageReport, now, published: false });
  assert.match(unpublished.body, /This run published nothing \(see the 'Content release failing' issue\)/);
  assert.doesNotMatch(unpublished.body, /release went out/);
  assert.equal(unpublished.digest, report.digest);
  // A stage that goes on failing becomes news the day it turns overdue, like a record.
  const failing = (days: number) => renderQuarantineReport({ quarantine: { version: 1, entries: [entry('stage:charwords', '2026-09-23', { stage: 'refresh', action: 'kept-previous', reason: 'failed' })] },
    stageReport: { version: 1, stages: [stageReport.stages[1]] }, now: new Date(now.getTime() + days * 86_400_000) });
  assert.equal(failing(3).digest, failing(0).digest);
  assert.notEqual(failing(4).digest, failing(0).digest);
  assert.match(failing(4).body, /^\| \*\*overdue\*\* \| `charwords` \| failed \| 2026-09-23 \(4 d\) \|/m);
  // With no stage report, the runner's entries say what the last refresh left failing.
  const leftover = renderQuarantineReport({ quarantine, stageReport: null, now });
  assert.equal(leftover.state, 'alert');
  assert.match(leftover.body, /No refresh stage ran in this run; this is what the last refresh left failing\./);
  assert.match(leftover.body, /^\| \*\*overdue\*\* \| `charwords` \| last refresh \| 2026-09-19 \(4 d\) \| failed or timed out; the run's stage report says how \|$/m);
});

test('text from the wiki, the game or a stage cannot forge a marker, mention anyone or break the table', () => {
  const hostile = [
    '<!-- arkpedia-alert:content-release-failing -->', '<!-- everything after this is hidden', '@octocat', '@arkpedia/maintainers',
    'see #1 and arkpedia/arkpedia#2', 'see GH-3 and gh-4', '<img src=x onerror=alert(1)>', '![pixel](https://example.invalid/p.png)', '[click](javascript:alert(1))',
    'a | b', 'back`tick', 'x'.repeat(5000),
  ].join(' ');
  const quarantine = { version: 1, entries: Array.from({ length: 150 }, (_, i) => ({
    key: `banner:${i}<!-- arkpedia-alert:content-quarantined --> \`@octocat\` |`, stage: 'catalogue', reason: hostile, action: 'omitted-new',
    firstSeen: '2026-09-23', sourceRef: i % 2 ? 'https://example.invalid/a) [x](javascript:alert(1)' : '@octocat <!--',
  })) };
  const stageReport = { version: 1, stages: [{ stage: 'catalogue', status: 'failed', durationMs: 1, exit: 'exited 1', error: `Error: ${hostile}` }] };
  const { body, comment } = renderQuarantineReport({ quarantine, stageReport, now: new Date('2026-09-23T20:00:00Z') });
  const [digestLine, ...rest] = body.split('\n');
  assert.match(digestLine, /^<!-- arkpedia-alert-digest:[0-9a-f]{16} -->$/);
  const text = rest.join('\n');
  assert.doesNotMatch(text, /<!--/, 'no comment opens after the digest line');
  assert.doesNotMatch(text, /<(?:img|a|script)\b/i, 'no raw HTML');
  // Inline code neither mentions nor links; every code span is closed on its own line.
  const prose = text.split('\n').map((line: string) => {
    assert.equal((line.replace(/\\`/g, '').match(/`/g) ?? []).length % 2, 0, `a code span left open: ${line.slice(0, 120)}`);
    return line.replace(/\\`/g, '').replace(/`[^`]*`/g, '');
  }).join('\n');
  assert.doesNotMatch(prose, /(?:^|[^\w])[@#][\w-]/, 'no @mention or #reference GitHub would link');
  assert.doesNotMatch(prose, /gh-\d/i, 'no GH-n reference GitHub would link');
  assert.doesNotMatch(prose, /(?<!\\)\[[^\]]*\]\(javascript:/, 'no live link to a script');
  // GitHub autolinks a bare address in text; only the sourceRef's own [source](...) may link.
  const bare = prose.replace(/\[source\]\(https?:\/\/[^\s)]+\)/g, '');
  assert.doesNotMatch(bare, /:\/\/|(?:mailto|xmpp):(?!\u200b)/i, 'no bare URL GitHub would link');
  assert.doesNotMatch(bare, /www\./i, 'no bare www. address GitHub would link');
  assert.doesNotMatch(bare, /@(?!\u200b)/, 'no bare email address or mention');
  // Each kind of bare address, in a cell of its own, reads as it was and links nowhere.
  for (const [address, shown] of [['https://evil.example/bare', 'https:\u200b//evil.example/bare'], ['visit http://evil.example/x now', 'visit http:\u200b//evil.example/x now'],
    ['www.evil.example', 'www\u200b.evil.example'], ['WWW.EVIL.EXAMPLE', 'WWW\u200b.EVIL.EXAMPLE'], ['HTTPS://EVIL.EXAMPLE/UP', 'HTTPS:\u200b//EVIL.EXAMPLE/UP'],
    ['mailto:someone@example.invalid', 'mailto:\u200bsomeone@\u200bexample.invalid'], ['ftp://evil.example', 'ftp:\u200b//evil.example']]) {
    assert.equal(cell(address), shown, address);
  }
  assert.doesNotMatch(prose, /<(?:img|a|script)\b/i, 'no raw HTML');
  assert.ok(body.length <= 61_000, `the body stays under GitHub's limit (${body.length})`);
  assert.match(body, /…and \d+ more in `source\/data\/quarantine\.json` of arkpedia-data\./, 'what does not fit is counted, not dropped silently');
  assert.match(body, /^\| {2}\| `catalogue` \| failed \| 2026-09-23 \(0 d\) \| exited 1: Error: /m, 'the stage table still fits after the records');
  // Every row still has the table's columns: no pipe of the text splits a cell.
  const unescapedPipes = (line: string) => line.replace(/\\\|/g, '').split('|').length - 1;
  for (const line of text.split('\n').filter((line: string) => line.startsWith('| ') && !line.startsWith('| |'))) assert.equal(unescapedPipes(line), 7 - (line.includes('`catalogue`') ? 1 : 0), line);
  assert.doesNotMatch(comment, /[@#][\w-]|<!--/);
});

test('no address in a cell autolinks, whatever comes before or after it, and the sourceRef still links', () => {
  const z = '\u200b';
  // GitHub reads a scheme back over the letters before "://", links a "www." after "_", "*", "~"
  // or "(", and an email address whose domain begins with "_" or "."; a word boundary missed these.
  const hostile: [string, string][] = [
    ['1https://evil.example', `1https:${z}//evil.example`],
    ['_https://evil.example', `\\_https:${z}//evil.example`],
    ['x_https://evil.example/a_b', `x\\_https:${z}//evil.example/a\\_b`],
    ['git+ssh://evil.example', `git+ssh:${z}//evil.example`],
    ['HTTPS://EVIL.EXAMPLE', `HTTPS:${z}//EVIL.EXAMPLE`],
    ['x_www.evil.example', `x\\_www${z}.evil.example`],
    ['_www.evil.example', `\\_www${z}.evil.example`],
    ['*www.evil.example*', `\\*www${z}.evil.example\\*`],
    ['~www.evil.example', `~www${z}.evil.example`],
    ['(www.evil.example)', `(www${z}.evil.example)`],
    ['1WWW.evil.example', `1WWW${z}.evil.example`],
    ['9mailto:a@evil.example', `9mailto:${z}a@${z}evil.example`],
    ['Xxmpp:foo@evil.example/r', `Xxmpp:${z}foo@${z}evil.example/r`],
    ['user@evil.example', `user@${z}evil.example`],
    ['user@_evil.example', `user@${z}\\_evil.example`],
    ['user_@_evil.example', `user\\_@${z}\\_evil.example`],
    ['a@.b.example', `a@${z}.b.example`],
    ['first.last+tag@sub.evil.example', `first.last+tag@${z}sub.evil.example`],
    // Mentions and references are neutralised as before.
    ['@octocat', `@${z}octocat`], ['@arkpedia/maintainers', `@${z}arkpedia/maintainers`], ['see #12', `see #${z}12`], ['a/b#3', `a/b#${z}3`],
    // GitHub links GH-12 (any case) to issue 12 of the repository, like #12.
    ['GH-1', `GH${z}-1`], ['see gh-2.', `see gh${z}-2.`], ['(Gh-34)', `(Gh${z}-34)`], ['x_GH-5', `x\\_GH${z}-5`],
  ];
  for (const [text, shown] of hostile) assert.equal(cell(text), shown, text);
  const sourceRef = `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${'a'.repeat(40)}/item/icon.png`;
  const { body } = renderQuarantineReport({ quarantine: { version: 1, entries: [{ key: 'item-icon:x', stage: 'item-icons', action: 'published-partial',
    firstSeen: '2026-09-23', reason: hostile.map(([text]) => text).join(' '), sourceRef }] }, stageReport: { version: 1, stages: [] }, now: new Date('2026-09-23T20:00:00Z') });
  const row = body.split('\n').find((line: string) => line.includes('`item-icon:x`')) ?? '';
  assert.ok(row.endsWith(` ([source](${sourceRef})) |`), `the sourceRef keeps its link: ${row.slice(-200)}`);
  const text = row.replace(`[source](${sourceRef})`, '');
  assert.doesNotMatch(text, /:\/\/|www\./i, 'no scheme or www. address is left whole');
  assert.doesNotMatch(text, /@(?!\u200b)|#[\w-]|gh-\d/i, 'no email address, mention or reference is left whole');
});

// The shell of a prepare-content step, as the runner gets it.
// A step's run: a `run: |` block, or a one-line `run:`, of any of the workflows.
function stepScript(name: string, workflow = 'prepare-content') {
  const lines = fs.readFileSync(`.github/workflows/${workflow}.yml`, 'utf8').split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${name}`);
  assert.ok(start >= 0, `${workflow}.yml has a '${name}' step`);
  const item = lines[start].search(/\S/);
  const end = lines.findIndex((line, i) => i > start && line.trim() !== '' && line.search(/\S/) <= item);
  const block = lines.slice(start + 1, end < 0 ? lines.length : end);
  const run = block.findIndex(line => /^\s+run: /.test(line));
  assert.ok(run >= 0, `${workflow}.yml's '${name}' step has a run`);
  if (!/^\s+run: \|$/.test(block[run])) return block[run].replace(/^\s+run: /, '');
  const indent = block[run].search(/\S/) + 2;
  const body: string[] = [];
  for (const line of block.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}
const hasJq = spawnSync('jq', ['--version']).status === 0;

test('the asset-sync report counts a manual run, and keeps one marker-found issue', { skip: !hasJq && 'needs jq, as gh --jq does' }, () => {
  withGitHub(github => {
    const script = stepScript('Report failing asset syncs');
    const runs = (...list: [string, string, string][]) => ({ workflow_runs: list.map(([event, conclusion, created]) => ({ event, conclusion, created_at: created, html_url: `https://example.invalid/${event}/${created}` })) });
    const workflows = ['arkpedia-image-assets/actions/workflows/sync-images.yml', 'arkpedia-skin-assets/actions/workflows/sync-artwork.yml',
      ...['english', 'japanese', 'korean', 'mandarin', 'regional'].map(language => `arkpedia-voice-${language}/actions/workflows/sync-voices.yml`)];
    const green = runs(['schedule', 'success', '2026-09-23T16:11:00Z']);
    const api = (image: object) => Object.fromEntries(workflows.map(workflow => [`repos/arkpedia/${workflow}/runs`, workflow.includes('image') ? image : green]));
    // The scheduled run failed, then someone reran it by hand and it passed: all clear.
    github.seed([{ title: 'Asset sync failing', body: 'The latest finished scheduled run of each asset sync below failed' }],
      api(runs(['workflow_dispatch', 'success', '2026-09-23T17:00:00Z'], ['schedule', 'failure', '2026-09-23T16:11:00Z'])));
    const cleared = github.step(script, { FAKE_NOW: '2026-09-23T20:30:00Z' });
    assert.equal(cleared.status, 0, cleared.output);
    assert.equal(github.issues()[0].state, 'closed', 'the legacy issue is found and closed');
    assert.match(github.issues()[0].comments[0].body, /Every asset sync's latest finished run succeeded/);
    // A push-triggered run is not a sync run: the failed schedule behind it still counts.
    github.seed([], api(runs(['push', 'success', '2026-09-23T18:00:00Z'], ['schedule', 'failure', '2026-09-23T16:11:00Z'])));
    const red = github.step(script, { FAKE_NOW: '2026-09-23T20:30:00Z' });
    assert.equal(red.status, 0, red.output);
    assert.equal(github.issues().length, 1);
    assert.match(github.issues()[0].body, /^<!-- arkpedia-alert:asset-sync-failing -->\nThe latest finished run \(scheduled or manual\)/);
    assert.match(github.issues()[0].body, /- arkpedia\/arkpedia-image-assets `sync-images\.yml`: failure 2026-09-23 https:\/\/example\.invalid\/schedule\//);
    assert.doesNotMatch(github.issues()[0].body, /arkpedia-voice/);
    // A success from before the three-day cutoff means the schedule stopped.
    github.seed([], api(runs(['schedule', 'success', '2026-09-19T16:11:00Z'])));
    github.step(script, { FAKE_NOW: '2026-09-23T20:30:00Z' });
    assert.match(github.issues()[0].body, /sync-images\.yml`: success 2026-09-19/);
  });
});

test('the quarantine step opens, updates and closes its issue from the run\'s files', () => {
  withGitHub(github => {
    const script = stepScript('Report quarantined content');
    const tree = path.join(github.root, 'tree');
    fs.mkdirSync(path.join(tree, 'data'), { recursive: true });
    // The step reads the tree it runs in; the scripts it calls come from this checkout.
    const run = (jobStatus: string) => github.step(`cd ${JSON.stringify(tree)} && ${script.replaceAll('node scripts/', `node ${JSON.stringify(path.resolve('scripts'))}/`)}`, { JOB_STATUS: jobStatus });
    // Nothing to read (the refresh never ran): nothing happens, and no issue is closed.
    github.seed([{ title: 'Content quarantined', body: '<!-- arkpedia-alert:content-quarantined -->\nold' }]);
    assert.equal(run('success').status, 0);
    assert.deepEqual(github.calls(), []);
    // A correction dispatched without a refresh: an empty quarantine, but no stage ran, so
    // the issue is not closed with 'every refresh stage ran'.
    fs.writeFileSync(path.join(tree, 'data/quarantine.json'), JSON.stringify({ version: 1, entries: [] }));
    assert.equal(run('success').status, 0);
    assert.deepEqual(github.calls(), []);
    assert.equal(github.issues()[0].state, 'open');
    const write = (entries: object[], stages: object[]) => {
      fs.writeFileSync(path.join(tree, 'data/quarantine.json'), JSON.stringify({ version: 1, entries }));
      fs.writeFileSync(path.join(tree, 'data/stage-report.json'), JSON.stringify({ version: 1, stages }));
    };
    write([{ key: 'banner:SINGLE_77_0_1', stage: 'catalogue', reason: 'unknown operator', action: 'omitted-new', firstSeen: '2026-09-23', lastSeen: '2026-09-23' }],
      [{ stage: 'charwords', status: 'failed', durationMs: 5, exit: 'exited 22', error: 'curl: (22)' }]);
    assert.equal(run('success').status, 0);
    assert.match(github.issues()[0].body, /banner:SINGLE_77_0_1[\s\S]*`charwords` \| failed/);
    assert.match(github.issues()[0].body, /The day's release went out without what is listed here/);
    const comments = github.issues()[0].comments.length;
    // The same list from a run whose publish failed: the body no longer claims a release.
    assert.equal(run('failure').status, 0);
    assert.match(github.issues()[0].body, /This run published nothing/);
    assert.equal(github.issues()[0].comments.length, comments, 'the list did not change, so nobody is notified');
    // All clear, but the release itself failed: the issue stays open until a good run.
    write([], [{ stage: 'charwords', status: 'ok', durationMs: 5 }]);
    run('failure');
    assert.equal(github.issues()[0].state, 'open');
    run('success');
    assert.equal(github.issues()[0].state, 'closed');
    assert.match(github.issues()[0].comments.at(-1)!.body, /Nothing is quarantined and every refresh stage ran/);
  });
});

// The once-a-day limit itself is the alert script's, tested above with a fixed clock.
test('a failed release reports on the one open issue, and the next good run closes it', () => {
  withGitHub(github => {
    const report = stepScript('Report the failed release'), close = stepScript('Close the failed-release report');
    github.seed([{ title: 'Content release failing', body: 'Prepare content release ended with failure (schedule): https://example.invalid/run/0' }]);
    assert.equal(github.step(report, { FAKE_NOW: '2026-09-23T20:00:00Z', JOB_STATUS: 'failure', GITHUB_EVENT_NAME: 'schedule' }).status, 0);
    assert.equal(github.issues().length, 1, 'the issue opened by title before markers is the one reported on');
    assert.equal(github.issues()[0].comments.length, 1);
    assert.match(github.issues()[0].comments[0].body, /Prepare content release ended with failure \(schedule, .*\): https:\/\/example\.invalid\/run\/1/);
    assert.equal(github.step(close).status, 0);
    assert.equal(github.issues()[0].state, 'closed');
    assert.match(github.issues()[0].comments.at(-1)!.body, /^Recovered: https:\/\/example\.invalid\/run\/1$/);
  });
});

// A run the release gate held (scripts/content/deploy-gate.mjs wrote why) is not a broken
// workflow: the fix is a deploy, so it gets an issue of its own, which a good run closes.
test('a held release reports on its own issue, and a good run closes it with the failure report', () => {
  withGitHub(github => {
    const report = stepScript('Report the failed release'), close = stepScript('Close the failed-release report');
    const held = path.join(github.root, 'release-held.md');
    fs.writeFileSync(held, '**The content release was not published: production cannot be shown to read it.**\n\n- https://arkpedia-dev.vercel.app runs 821a98d4abcd, not the code of 7f236ea5abcd that compiles the release.\n');
    const run = github.step(report, { FAKE_NOW: '2026-09-25T22:00:00Z', JOB_STATUS: 'failure', GITHUB_EVENT_NAME: 'schedule' });
    assert.equal(run.status, 0, run.output);
    const [issue] = github.issues();
    assert.equal(issue.title, 'Content release held');
    assert.match(issue.body, /^<!-- arkpedia-alert:content-release-held -->\n\*\*The content release was not published/);
    assert.match(issue.body, /runs 821a98d4abcd, not the code of 7f236ea5abcd/);
    assert.match(issue.body, /Held by https:\/\/example\.invalid\/run\/1 \(schedule, /);
    assert.equal(github.issues().length, 1, 'no "Content release failing" issue for a hold');
    // Without the gate's file it is an ordinary failure, reported as before.
    fs.rmSync(held);
    github.step(report, { FAKE_NOW: '2026-09-25T22:00:00Z', JOB_STATUS: 'failure', GITHUB_EVENT_NAME: 'schedule' });
    assert.deepEqual(github.issues().map(entry => entry.title), ['Content release held', 'Content release failing']);
    const closed = github.step(close);
    assert.equal(closed.status, 0, closed.output);
    assert.deepEqual(github.issues().map(entry => entry.state), ['closed', 'closed']);
    assert.match(github.issues()[0].comments.at(-1)!.body, /^Production runs the code this run compiled with, and the run succeeded: https:\/\/example\.invalid\/run\/1$/);
  });
});
