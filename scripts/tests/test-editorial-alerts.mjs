import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failedSources, recordBody, recoveryPlan } from '../content/release-failure.mjs';
import { isBusy, unpublishedPlan, UNPUBLISHED_AFTER_HOURS } from '../content/editorial-watch.mjs';

// 2026-10-13: an editorial commit failed three main compiles; a run of data main that did not
// contain it succeeded and closed "Content release failing" as Recovered, and the edit and two
// later ones stayed unpublished for nine hours with no open issue.
const editorial = 'e'.repeat(40);
const later = 'f'.repeat(40);
const dataMain = 'a'.repeat(40);
const descendant = 'd'.repeat(40);

test('a failure records the source commit it compiled, and keeps the ones before it', () => {
  const first = recordBody({ body: 'Prepare content release ended with failure: run 1', source: editorial });
  assert.deepEqual(failedSources(first), [editorial]);
  const second = recordBody({ body: 'Prepare content release ended with failure: run 2', previous: first, source: later });
  assert.deepEqual(failedSources(second), [editorial, later], 'a second failing commit is not lost to the one-comment-a-day limit');
  assert.match(second, /run 2/);
  assert.equal(failedSources(recordBody({ body: 'again', previous: second, source: editorial })).length, 2, 'no duplicates');
  assert.equal(recordBody({ body: 'failed before the data checkout\n' }), 'failed before the data checkout', 'no source, no list');
});

test('only a run that compiled every failing source closes the issue', () => {
  const body = recordBody({ body: 'failed', source: editorial });
  // contains(sha, head): is sha in head's history.
  const history = { [descendant]: [editorial], [dataMain]: [] };
  const contains = (sha, head) => (history[head] ?? []).includes(sha);
  assert.deepEqual(recoveryPlan({ body, head: dataMain, contains }), { close: false, missing: [editorial] },
    'a run of data main that does not contain the editorial commit is not a recovery');
  assert.deepEqual(recoveryPlan({ body, head: editorial, contains }), { close: true, missing: [] });
  assert.deepEqual(recoveryPlan({ body, head: descendant, contains }), { close: true, missing: [] });
  assert.deepEqual(recoveryPlan({ body, head: null, contains }).close, false, 'a run that compiled nothing it can name recovers nothing');
  assert.deepEqual(recoveryPlan({ body: 'failed before the data checkout', head: dataMain, contains }), { close: true, missing: [] },
    'a failure that named no source still closes on any success, as before');
  const two = recordBody({ body: 'failed', previous: body, source: later });
  assert.deepEqual(recoveryPlan({ body: two, head: descendant, contains }).missing, [later]);
});

test('editorial edits not in data main for over two hours raise "Editorial edits unpublished"', () => {
  const now = new Date('2026-10-13T18:00:00Z');
  const commit = (sha, at, message) => ({ sha, commit: { message, committer: { date: at } } });
  const stuck = { status: 'ahead', commits: [commit(editorial, '2026-10-13T08:17:00Z', 'Give three operators palette recipes\n\nbody'),
    commit(later, '2026-10-13T09:00:00Z', 'Translate base skills')] };
  const plan = unpublishedPlan(stuck, now);
  assert.equal(plan.open, true);
  assert.match(plan.body, new RegExp(`over ${UNPUBLISHED_AFTER_HOURS} hours`));
  assert.match(plan.body, /`eeeeeeeeeeee` Give three operators palette recipes\n/);
  assert.doesNotMatch(plan.body, /body|08:17|2026-10-13/, 'subjects only, and no times: an unchanged backlog edits nothing');
  assert.equal(unpublishedPlan(stuck, now).body, plan.body);
  assert.equal(unpublishedPlan({ ...stuck, status: 'diverged' }, now).body, plan.body, 'main moving past the branch hides nothing');
  const fresh = { status: 'ahead', commits: [commit(later, '2026-10-13T17:30:00Z', 'Just pushed')] };
  assert.deepEqual(unpublishedPlan(fresh, now), { open: false, waiting: true }, 'an edit minutes old is still on its way');
  for (const status of ['identical', 'behind']) assert.deepEqual(unpublishedPlan({ status }, now), { open: false }, 'published: close');
});

test('the run that asked the watcher to look again is not counted as busy', () => {
  const runs = [{ id: 7, status: 'in_progress' }, { id: 6, status: 'completed' }];
  assert.equal(isBusy(runs), true);
  assert.equal(isBusy(runs, '7'), false);
  assert.equal(isBusy([...runs, { id: 8, status: 'queued' }], '7'), true, 'another main run still is');
});

test('the workflow rebuilds stale palettes without the refresh, recovers by source, and re-asks the watcher only after success', async () => {
  const fs = await import('node:fs');
  const { default: yaml } = await import('js-yaml');
  const workflow = yaml.load(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8'));
  const steps = workflow.jobs.prepare.steps;
  const at = name => steps.findIndex(step => step.name === name);
  const rebuild = steps[at('Rebuild palettes whose review or recipe changed')];
  assert.ok(rebuild, 'an editorial compile rebuilds the palettes whose review or recipe changed');
  assert.match(rebuild.run, /build-color-palettes\.py --revisions data\/assets\/revisions\.json --if-stale/);
  assert.match(rebuild.if, /steps\.refresh\.outcome == 'skipped'/, 'only when the refresh, which has the palettes stage, did not run');
  assert.ok(at('Refresh supported upstream records') < at('Rebuild palettes whose review or recipe changed')
    && at('Rebuild palettes whose review or recipe changed') < at('Validate and compile data (no website build)'));
  assert.match(steps[at('Report the failed release')].run, /release-failure\.mjs record .*--source "\$\{SOURCE_HEAD:-none\}"/);
  assert.match(steps[at('Close the failed-release report')].run, /release-failure\.mjs recover .*--source "\$\{SOURCE_HEAD:-none\}"/);
  assert.doesNotMatch(steps[at('Close the failed-release report')].run, /alert-issue\.mjs close --alert "content-release-failing/);
  const handoff = workflow.jobs['notify-editorial'];
  assert.equal(handoff.if, "${{ !cancelled() && github.ref_name == 'main' && needs.prepare.result == 'success' }}");
  assert.match(handoff.steps[0].run, /gh workflow run editorial-content\.yml/);
});
