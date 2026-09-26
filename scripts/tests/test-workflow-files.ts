import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error js-yaml ships no types; only load() is used.
import yaml from 'js-yaml';

/*
 * Every workflow file must be YAML GitHub can read. A one-line `run:` whose text holds ": "
 * (`--comment "Deployed ${SHA:0:12}: $RUN_URL"`) is a mapping key in a plain scalar, which is
 * a parse error: GitHub then refuses the whole file, so Check never runs and nothing deploys,
 * and the only sign is an "Invalid workflow file" banner in the Actions tab. The step tests
 * elsewhere read the shells line by line (stepScript in test-content-alerts.ts), which does
 * not notice. This parses each file as GitHub does (YAML 1.2) and checks the shape the
 * runner needs.
 *
 * It also holds the runner routing that keeps secrets away from code nobody reviewed:
 * Dependabot's pull requests run on hosted runners, and only a green Check of a push to this
 * repository's main deploys. Merges of other workflow changes must keep both.
 */

const DIR = '.github/workflows';
const files = fs.readdirSync(DIR).filter(name => /\.ya?ml$/.test(name)).sort();

type Step = { name?: string; run?: unknown; uses?: unknown; if?: unknown };
type Job = { 'runs-on'?: unknown; steps?: Step[]; if?: unknown; 'timeout-minutes'?: unknown };
type Workflow = { name?: unknown; on?: unknown; jobs?: Record<string, Job> };

function load(name: string): Workflow {
  return yaml.load(fs.readFileSync(path.join(DIR, name), 'utf8')) as Workflow;
}

test('the workflow directory holds the three private workflows', () => {
  for (const name of ['check.yml', 'deploy.yml', 'prepare-content.yml']) {
    assert.ok(files.includes(name), `${DIR}/${name} exists`);
  }
});

/*
 * One pipeline writes game data: Prepare content release, which refreshes from upstream and
 * publishes to arkpedia-data. refresh-stage-data.yml was a second one. It rebuilt this app's
 * data/ from the mirrors (assets:update, then stages:refresh) and opened a pull request into
 * the app, so the bundle could diverge from arkpedia-data's canonical records (a hand
 * correction there was overwritten in the app copy), and merging it re-pinned the deploy's
 * assets and deployed production. The bundled data/ follows arkpedia-data instead
 * (scripts/content/sync-bundled-data.mjs).
 */
test('no workflow but Prepare content release refreshes game data from upstream', () => {
  assert.ok(!files.includes('refresh-stage-data.yml'), 'refresh-stage-data.yml is retired; sync the bundle with scripts/content/sync-bundled-data.mjs');
  const refresh = /\bnpm run (?:stages:refresh|assets:update)\b|scripts\/sync\/refresh-stage-data\.sh|scripts\/sync\/update-asset-revisions\.mjs|scripts\/stage-pipeline\/build\.mjs/;
  for (const name of files.filter(file => file !== 'prepare-content.yml')) {
    for (const [id, job] of Object.entries(load(name).jobs ?? {})) {
      for (const step of job.steps ?? []) {
        assert.ok(!(typeof step.run === 'string' && refresh.test(step.run)), `${name} job ${id} step ${step.name ?? ''} refreshes game data from upstream; only prepare-content.yml may`);
      }
    }
  }
  // And the one that may still does, so this test cannot pass by matching nothing.
  const prepare = Object.values(load('prepare-content.yml').jobs ?? {}).flatMap(job => job.steps ?? []);
  assert.ok(prepare.some(step => typeof step.run === 'string' && refresh.test(step.run)));
});

for (const name of files) {
  test(`${name} parses as YAML and every job has a runner and runnable steps`, () => {
    let workflow: Workflow;
    try {
      workflow = load(name);
    } catch (error) {
      assert.fail(`${DIR}/${name} is not valid YAML, so GitHub would refuse the whole file: ${(error as Error).message.split('\n')[0]}`);
    }
    assert.equal(typeof workflow.name, 'string', `${name} has a name`);
    assert.ok(workflow.on && typeof workflow.on === 'object', `${name} has triggers`);
    const jobs = Object.entries(workflow.jobs ?? {});
    assert.ok(jobs.length > 0, `${name} has jobs`);
    for (const [id, job] of jobs) {
      assert.equal(typeof job['runs-on'], 'string', `${name} job ${id} names a runner`);
      assert.ok(Array.isArray(job.steps) && job.steps.length > 0, `${name} job ${id} has steps`);
      job.steps!.forEach((step, index) => {
        const label = `${name} job ${id} step ${step.name ?? index}`;
        const kinds = ['run', 'uses'].filter(key => key in step);
        assert.equal(kinds.length, 1, `${label} has exactly one of run or uses`);
        if ('run' in step) assert.equal(typeof step.run, 'string', `${label}'s run is a shell string`);
      });
    }
  });
}

test("Check sends Dependabot's pull requests to hosted runners, runner and timeout alike", () => {
  const job = load('check.yml').jobs!.check;
  const dependabot = "(github.actor == 'dependabot[bot]' || startsWith(github.head_ref, 'dependabot/'))";
  assert.ok(String(job['runs-on']).startsWith(`\${{ ${dependabot} && 'ubuntu-latest' ||`), `runs-on: ${job['runs-on']}`);
  assert.ok(String(job['timeout-minutes']).startsWith(`\${{ ${dependabot} && 20 ||`), `timeout-minutes: ${job['timeout-minutes']}`);
});

test('Deploy may start a held content release again', () => {
  const deploy = load('deploy.yml') as unknown as { permissions?: Record<string, string>; jobs: Record<string, { steps?: { name?: string; run?: string }[] }> };
  assert.equal(deploy.permissions?.actions, 'write', 'deploy.yml needs actions: write to dispatch prepare-content.yml');
  const step = deploy.jobs.deploy.steps?.find(entry => entry.name === 'Release again if one was held for this deploy');
  assert.ok(step?.run?.includes('gh workflow run prepare-content.yml'), 'deploy.yml re-dispatches a held release');
});

test("Deploy checks that production's asset links reach the live release's art, and still releases a held run after", () => {
  const steps = (load('deploy.yml').jobs!.deploy.steps ?? []) as (Step & { id?: string; env?: Record<string, string> })[];
  const index = (name: string) => steps.findIndex(step => step.name === name);
  const check = steps[index("Check that asset links reach the release's art")];
  assert.ok(check, "deploy.yml has the asset-link check");
  assert.equal(check.run, 'node scripts/deploy/check-asset-redirects.mjs');
  assert.equal(check.id, 'asset-links');
  // After production has the build, and before the report that turns its failure into an issue.
  assert.ok(index('Deploy') < index("Check that asset links reach the release's art") && index("Check that asset links reach the release's art") < index('Report the failed deploy'));
  assert.equal(steps[index('Deploy')].id, 'deploy');
  assert.equal(steps[index('Report the failed deploy')].env?.ASSET_LINKS, '${{ steps.asset-links.outcome }}');
  // A failed asset check leaves production on the new build, so a held release still goes out.
  assert.equal(String(steps[index('Release again if one was held for this deploy')].if).replace(/\s+/g, ' '), "${{ !cancelled() && steps.deploy.outcome == 'success' }}");
  // prebuild adopts the release's pins through one GitHub compare per differing repository.
  assert.equal(steps[index('Build')].env?.GH_TOKEN, '${{ github.token }}');
});

test("only a green Check of a push to this repository's main deploys", () => {
  const condition = String(load('deploy.yml').jobs!.deploy.if).replace(/\s+/g, ' ');
  for (const part of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.event == 'push'",
    'github.event.workflow_run.head_repository.full_name == github.repository',
  ]) assert.ok(condition.includes(part), `deploy.yml's if requires ${part}: ${condition}`);
});
