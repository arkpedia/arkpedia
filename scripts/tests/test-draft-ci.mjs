import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';

const workflow = yaml.load(fs.readFileSync('.github/workflows/check.yml', 'utf8'));
const { draft, check } = workflow.jobs;
const context = (event = 'pull_request', isDraft = true, repo = 'arkpedia/arkpedia') => ({ event_name: event, repository: 'arkpedia/arkpedia', event: { pull_request: { draft: isDraft, head: { repo: { full_name: repo } } } } });
function condition(source, github, checked = 'false', cancelled = false) {
  const expression = source.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  return new Function('github', 'needs', 'cancelled', `return (${expression});`)(github, { seen: { outputs: { checked } } }, () => cancelled);
}

test('only same-repository drafts take quick feedback; ready/manual/push/fork use the full gate', () => {
  assert.equal(condition(draft.if, context()), true);
  assert.equal(condition(check.if, context()), false);
  const missingDraft = context();
  delete missingDraft.event.pull_request.draft;
  for (const github of [context('pull_request', false), missingDraft, context('pull_request', true, 'someone/fork'), context('workflow_dispatch'), context('push')]) {
    assert.equal(condition(draft.if, github), false);
    assert.equal(condition(check.if, github), true);
  }
  assert.equal(condition(check.if, context('push'), 'true'), false, 'real exact-tree full proof still reuses');
  assert.equal(condition(check.if, context('push'), 'false', true), false);
});

test('draft readiness changes start a new run and the branch protection check keeps its identity', () => {
  for (const event of ['opened', 'synchronize', 'reopened', 'ready_for_review', 'converted_to_draft']) assert.ok(workflow.on.pull_request.types.includes(event));
  assert.equal(check.needs, 'seen');
  assert.equal(workflow.concurrency.group, 'check-${{ github.ref }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
});

test('drafts retain regression verdicts/types/lint and cannot publish or create full-proof artifacts', () => {
  const step = (job, name) => job.steps.find(item => item.name === name);
  assert.equal(step(draft, 'Application and Python regression tests').run, step(check, 'Application and Python regression tests').run);
  assert.equal(step(draft, 'Typecheck').run, 'npm run typecheck');
  assert.equal(step(draft, 'Lint').run, step(check, 'Lint').run);
  assert.equal(step(draft, 'Prepare build inputs').env.ARKPEDIA_CONTENT_DISABLED, '1');
  assert.deepEqual(draft.permissions, { contents: 'read' });
  for (const item of draft.steps) {
    assert.ok(!/upload-artifact|deploy|checked-tree|test:browser|content:export/.test(item.uses ?? item.run ?? ''), item.name);
    assert.equal(item['continue-on-error'], undefined);
  }
  const proof = step(check, 'Record the code this Check passed');
  assert.ok(proof.uses?.startsWith('actions/upload-artifact'));
  assert.equal(proof.with.name, 'checked-tree-${{ steps.tree.outputs.tree }}');
  assert.ok(proof.if.includes('success()'));
});

test('browser failure evidence is distinct from approval artifacts and runs only after a failed browser lane', () => {
  const failure = check.steps.find(item => item.name === 'Preserve browser failure evidence');
  assert.ok(failure.if.includes('failure()'));
  assert.ok(failure.if.includes("steps.full_browser.outcome == 'failure'"));
  assert.ok(failure.if.includes("steps.selected_browser.outcome == 'failure'"));
  assert.ok(failure.if.includes("steps.validate_browser.outcome == 'failure'"));
  assert.ok(failure.with.name.startsWith('browser-failure-'));
  assert.equal(failure.with['retention-days'], 3);
  for (const step of check.steps.filter(item => item.uses?.startsWith('actions/upload-artifact')
    && item.with.name.startsWith('checked-'))) assert.ok(step.if.includes('success()'));
});

test('draft feedback retains the established dependency-isolation runner rule', () => {
  assert.equal(draft['runs-on'], check['runs-on']);
  assert.equal(draft['runs-on'], 'ubuntu-latest');
  assert.equal(draft.steps.find(item => item.run === 'npm ci').run, 'npm ci');
});
