import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { inspectTarget, renderReport } from '../deploy/release-status.mjs';

const commit = 'a'.repeat(40);
const head = 'b'.repeat(40);
const revision = 'c'.repeat(40);
const release = 'd'.repeat(64);
const target = { name: 'dev', url: 'https://site.example', branch: 'dev', contentChannel: 'dev-live', smokePaths: ['/', '/schedule'] };
const encode = data => Buffer.from(JSON.stringify(data));

function fixture({ build = {}, manifest = {}, corrupt = false, errorPage = false, githubDown = false, behind = 0, ci = 'success' } = {}) {
  const bytes = encode({ schema: 2, release, ...manifest });
  return {
    read: async url => {
      if (url.endsWith('/build-info.json')) return encode({ version: 1, commit, codeFingerprint: 'e'.repeat(64), contentSchema: 2, contentChannel: 'dev-live', dirty: false, ...build });
      if (url.endsWith('/current.json')) {
        assert.match(url, /\/dev-live\/current.json$/);
        return encode({ revision, release, schema: 2, manifestSha256: corrupt ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex') });
      }
      if (url.endsWith('/manifest.json')) { assert.ok(url.includes(revision)); return bytes; }
      return Buffer.from(`<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: errorPage ? '/_error' : new URL(url).pathname, props: {} })}</script></html>`);
    },
    github: async path => {
      if (githubDown) throw new Error('not authenticated');
      if (path.includes('/branches/')) return { commit: { sha: head } };
      if (path.includes('/compare/')) return { behind_by: behind };
      assert.ok(path.includes(commit), 'CI lookup must use served commit, not newer branch tip');
      if (path.includes('/actions/runs')) return { workflow_runs: [{ id: 1, name: 'Check', conclusion: ci, html_url: 'https://github.com/arkpedia/arkpedia/actions/runs/1' }] };
      return { check_runs: [] };
    },
  };
}

test('healthy deployed version and newer branch tip remain distinct', async () => {
  const result = await inspectTarget(target, fixture());
  assert.equal(result.status, 'healthy');
  assert.equal(result.atBranchHead, false);
  assert.equal(result.build.commit, commit);
  assert.equal(result.branchHead, head);
  assert.equal(result.content.revision, revision);
  assert.equal(result.smoke.filter(s => s.status === 'pass').length, 2);
  assert.match(renderReport({ observedAt: 'now', targets: [result] }), /Branch tip differs/);
});

test('wrong channel and dirty builds fail even if pages respond', async () => {
  for (const build of [{ contentChannel: 'live' }, { dirty: true }, { commit: 'not-a-sha' }, { commit: 123 }]) {
    const result = await inspectTarget(target, fixture({ build }));
    assert.equal(result.status, 'needs attention');
    assert.equal(result.smoke.length, 2);
    assert.doesNotThrow(() => renderReport({ observedAt: 'now', targets: [result] }));
  }
});

test('dirty identity does not fabricate a schema mismatch when public schema actually matches', async () => {
  const result = await inspectTarget(target, fixture({ build: { dirty: true } }));
  assert.equal(result.status, 'needs attention');
  assert.ok(result.issues.some(issue => /dirty working tree/.test(issue)));
  assert.ok(!result.issues.some(issue => /schema/.test(issue)));
});

test('corrupted manifest and schema mismatch cannot appear verified', async () => {
  for (const options of [{ corrupt: true }, { manifest: { schema: 3 } }]) {
    const result = await inspectTarget(target, fixture(options));
    assert.equal(result.status, 'needs attention');
    assert.equal(result.content, undefined);
  }
});

test('HTTP 200 error pages fail smoke checks', async () => {
  const result = await inspectTarget(target, fixture({ errorPage: true }));
  assert.equal(result.status, 'needs attention');
  assert.ok(result.smoke.every(s => s.status === 'fail'));
});

test('GitHub outage retains public evidence without claiming complete verification', async () => {
  const result = await inspectTarget(target, fixture({ githubDown: true }));
  assert.equal(result.status, 'needs attention');
  assert.equal(result.content.revision, revision);
  assert.ok(result.smoke.every(s => s.status === 'pass'));
  assert.match(result.issues.join(' '), /GitHub evidence unavailable/);
});

test('behind-main branches and red CI remain actionable', async () => {
  for (const options of [{ behind: 3 }, { ci: 'failure' }]) {
    const result = await inspectTarget(target, fixture(options));
    assert.equal(result.status, 'needs attention');
  }
});

test('one unreachable page does not discard other page results', async () => {
  const dependencies = fixture();
  const read = dependencies.read;
  dependencies.read = url => url.endsWith('/schedule') ? Promise.reject(new Error('timeout')) : read(url);
  const result = await inspectTarget(target, dependencies);
  assert.deepEqual(result.smoke.map(s => s.status), ['pass', 'fail']);
});

test('report escapes external messages instead of injecting markdown rows', async () => {
  const result = await inspectTarget(target, fixture());
  result.issues.push('bad|row\n<script> [pretend](https://example.com)');
  const markdown = renderReport({ observedAt: 'now', targets: [result] });
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('bad|row'));
});

test('release report workflow uses trusted main and read-only permissions without provider secrets', () => {
  const text = readFileSync('.github/workflows/release-status.yml', 'utf8');
  const workflow = yaml.load(text);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read', checks: 'read' });
  assert.deepEqual(workflow.on.workflow_run.workflows, ['Deploy']);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.ok(!Object.hasOwn(workflow.on, 'schedule'));
  const steps = workflow.jobs.report.steps;
  assert.equal(steps.find(s => s.uses?.startsWith('actions/checkout')).with.ref, 'main');
  assert.ok(!text.includes('secrets.'));
  assert.match(steps.find(s => s.run?.includes('release-status.mjs')).run, /GITHUB_STEP_SUMMARY/);
});
