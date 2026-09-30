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
  // A failed asset check leaves production on the new build, so a held release still goes out:
  // after the last of main's deployments (the ones the gate asks), once every earlier one has
  // had its turn.
  assert.equal(String(steps[index('Release again if one was held for this deploy')].if).replace(/\s+/g, ' '), "${{ !cancelled() && steps.deploy.outcome == 'success' && matrix.target.releaseGate && matrix.target.last }}");
  // Each deployment's own site, not every one config/production.json lists.
  assert.equal(check.env?.ARKPEDIA_DEPLOYMENTS, '${{ matrix.target.url }}');
  // prebuild adopts the release's pins through one GitHub compare per differing repository.
  assert.equal(steps[index('Build')].env?.GH_TOKEN, '${{ github.token }}');
});

test("only a green Check of a push to this repository's main or dev deploys", () => {
  // The targets job decides; every deployment waits on it and adds no condition that could
  // run it anyway (always(), a bare !cancelled()).
  const workflow = load('deploy.yml') as unknown as { concurrency?: { group?: string }; jobs: Record<string, Job & { needs?: unknown }> };
  const jobs = workflow.jobs;
  assert.equal(jobs.deploy.needs, 'targets');
  assert.equal(jobs.deploy.if, "needs.targets.outputs.targets != '[]'");
  // A group holds one waiting run: shared, a dev deploy queued behind main's would cancel it.
  assert.equal(workflow.concurrency?.group, 'deploy-${{ github.event.workflow_run.head_branch || github.ref_name }}');
  const condition = String(jobs.targets.if).replace(/\s+/g, ' ');
  for (const part of [
    "github.event.workflow_run.conclusion == 'success'",
    "(github.event.workflow_run.head_branch == 'main' || github.event.workflow_run.head_branch == 'dev')",
    "github.event.workflow_run.event == 'push'",
    'github.event.workflow_run.head_repository.full_name == github.repository',
  ]) assert.ok(condition.includes(part), `deploy.yml's if requires ${part}: ${condition}`);
});

/*
 * Deploy uploads to every live deployment in config/production.json, one after another, each
 * with its own project's ids and token (scripts/deploy/deploy-targets.mjs). On 2026-09-30
 * kukki's project (www.arkpedia.net) was Git-linked to this repository with its domains
 * assigned automatically; the listed-but-not-live entry is how it waits for the cutover.
 */
test('Deploy runs once per listed deployment, with that project\'s ids and token', () => {
  const workflow = load('deploy.yml') as unknown as { on: Record<string, { inputs?: Record<string, { description?: string; type?: string; default?: unknown }> }>; jobs: Record<string, Job & { strategy?: { 'max-parallel'?: number; 'fail-fast'?: boolean; matrix?: Record<string, string> }; env?: Record<string, string>; outputs?: Record<string, string> }> };
  const { targets, deploy } = workflow.jobs;
  const list = (targets.steps ?? []).find(step => step.name === 'List the deployments') as Step & { id?: string };
  assert.equal(list?.id, 'list');
  assert.equal(list?.run, `node scripts/deploy/deploy-targets.mjs --branch "$BRANCH" \${{ inputs.preview && '--preview' || '' }} >> "$GITHUB_OUTPUT"`);
  assert.equal((list as Step & { env?: Record<string, string> }).env?.BRANCH, '${{ github.event.workflow_run.head_branch || github.ref_name }}');
  assert.equal(targets.outputs?.targets, '${{ steps.list.outputs.targets }}');
  assert.deepEqual(deploy.strategy, { 'max-parallel': 1, 'fail-fast': false, matrix: { target: '${{ fromJSON(needs.targets.outputs.targets) }}' } });
  assert.deepEqual({ org: deploy.env?.VERCEL_ORG_ID, project: deploy.env?.VERCEL_PROJECT_ID, scope: deploy.env?.VERCEL_SCOPE }, { org: '${{ matrix.target.orgId }}', project: '${{ matrix.target.projectId }}', scope: '${{ matrix.target.scope }}' });
  const preview = workflow.on.workflow_dispatch.inputs?.preview;
  assert.deepEqual([preview?.type, preview?.default], ['boolean', false]);
  assert.match(String(preview?.description), /not live yet/);
  const steps = (deploy.steps ?? []) as (Step & { env?: Record<string, string> })[];
  // No step reads a fixed secret: each takes the token its deployment names.
  for (const step of steps) {
    if (step.env?.VERCEL_TOKEN) assert.equal(step.env.VERCEL_TOKEN, '${{ secrets[matrix.target.tokenSecret] }}', `${step.name}'s token`);
  }
  assert.ok(steps.filter(step => step.env?.VERCEL_TOKEN).length >= 4);
  // A preview deploys no production and reports nothing: its site sits behind a Vercel login.
  const byName = (name: string) => steps.find(step => step.name === name)!;
  assert.equal(byName('Build').env?.PROD, "${{ matrix.target.production && '--prod' || '' }}");
  assert.equal(byName('Deploy').env?.PROD, "${{ matrix.target.production && '--prod' || '' }}");
  assert.equal(byName("Check that asset links reach the release's art").if, 'matrix.target.production');
  assert.match(String(byName('Report the failed deploy').if), /^matrix\.target\.production && /);
  assert.match(String(byName('Close the failed-deploy report').if), /^matrix\.target\.production && /);
  // The pulled settings carry the project's secrets; they leave the runner whatever happened.
  assert.deepEqual([byName('Forget the pulled project settings').if, byName('Forget the pulled project settings').run], ['always()', 'rm -rf .vercel']);
});

test("main runs the full Check unless a green pull request Check already ran its exact code", () => {
  const workflow = load('check.yml') as unknown as { jobs: Record<string, Job & { needs?: unknown; outputs?: Record<string, string>; permissions?: Record<string, string> }> };
  const seen = workflow.jobs.seen;
  const check = workflow.jobs.check;
  assert.equal(String(seen.if), "github.event_name == 'push'", 'the lookup runs on pushes only');
  assert.equal(String(seen['runs-on']), String(check['runs-on']), 'the lookup runs where Check does (never a hosted runner for our pushes)');
  assert.equal(seen.permissions?.actions, 'read', 'it lists artifacts');
  assert.equal(seen.outputs?.checked, '${{ steps.seen.outputs.checked }}');
  assert.ok(seen.steps!.some(step => step.run === 'node scripts/ci/already-checked.mjs >> "$GITHUB_OUTPUT"'));
  assert.equal(check.needs, 'seen');
  // A failed or skipped lookup (every pull request) still runs everything; only an explicit true skips.
  assert.equal(String(check.if).replace(/\s+/g, ' '), "${{ !cancelled() && needs.seen.outputs.checked != 'true' }}");
  const steps = (check.steps ?? []) as (Step & { with?: Record<string, unknown> })[];
  const record = steps.find(step => step.name === 'Record the code this Check passed');
  assert.ok(record, 'a green pull request Check records its tree');
  assert.equal(String(record!.if), "success() && github.event_name == 'pull_request'");
  assert.equal(String(record!.with?.name), 'checked-tree-${{ steps.tree.outputs.tree }}');
  // Recorded last, so an upload means every step before it passed.
  const last = steps.map(step => step.name).filter(name => name && !['Report a red Check on main', 'Close the red-Check report'].includes(name));
  assert.equal(last[last.length - 1], 'Record the code this Check passed');
});
