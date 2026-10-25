#!/usr/bin/env node
// Read-only release evidence. No provider tokens, deploys, logins or account data.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const DATA = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
const root = new URL('../../', import.meta.url);
const readConfig = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const message = error => String(error.message ?? error).split('\n')[0].slice(0, 240);
const cell = value => String(value ?? 'unknown').replace(/[|\r\n<>]/g, ' ').replace(/[\[\]`]/g, '');

export async function httpRead(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow', headers: { 'User-Agent': 'Arkpedia-release-status' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 6_000_000) throw new Error(`Response too large: ${url}`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function githubRead(path) {
  const windowsGh = `${process.env.ProgramFiles ?? 'C:/Program Files'}/GitHub CLI/gh.exe`;
  const executable = process.env.ARKPEDIA_GH_CLI || (process.platform === 'win32' && existsSync(windowsGh) ? windowsGh : 'gh');
  const { stdout } = await run(executable, ['api', path], { timeout: 25_000, maxBuffer: 4_000_000 });
  return JSON.parse(stdout);
}

export function validateBuild(build, channel) {
  if (!SHA.test(build.commit) || !HASH.test(build.codeFingerprint) || build.version !== 1) throw new Error('Invalid build identity');
  if (build.dirty !== false) throw new Error('Deployment was built from a dirty working tree');
  if (!Number.isInteger(build.contentSchema) || build.contentSchema < 1) throw new Error('Invalid build schema');
  if (build.contentChannel !== channel) throw new Error(`Wrong content channel: ${build.contentChannel}, expected ${channel}`);
}

export async function inspectTarget(target, { read = httpRead, github = githubRead } = {}) {
  const result = { ...target, status: 'healthy', issues: [], smoke: [], ci: [] };
  const fail = error => { result.status = 'needs attention'; result.issues.push(message(error)); };
  let observedSchema;
  try {
    const build = JSON.parse(await read(`${target.url}/build-info.json`));
    // Dirty/untrusted identity must fail, but its independently readable schema
    // should not turn that one issue into a fabricated schema mismatch too.
    if (Number.isInteger(build?.contentSchema) && build.contentSchema > 0) observedSchema = build.contentSchema;
    validateBuild(build, target.contentChannel);
    result.build = build;
  } catch (error) { fail(error); }

  // A pointer is resolved once per target. Manifest bytes must match its checksum.
  try {
    const pointer = JSON.parse(await read(`${DATA}/${target.contentChannel}/current.json`));
    if (!SHA.test(pointer.revision) || !HASH.test(pointer.manifestSha256) || !HASH.test(pointer.release)) throw new Error('Invalid content pointer');
    const bytes = await read(`${DATA}/${pointer.revision}/release/manifest.json`);
    if (hash(bytes) !== pointer.manifestSha256) throw new Error('Content manifest checksum mismatch');
    const manifest = JSON.parse(bytes);
    if (manifest.release !== pointer.release || manifest.schema !== pointer.schema) throw new Error('Content pointer and manifest disagree');
    if (manifest.schema !== observedSchema) throw new Error('Content schema does not match deployment');
    result.content = { revision: pointer.revision, release: pointer.release, schema: manifest.schema };
  } catch (error) { fail(error); }

  await Promise.all(target.smokePaths.map(async path => {
    try {
      const html = (await read(`${target.url}${path}`)).toString();
      const match = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!match) throw new Error('Missing Next page data');
      const data = JSON.parse(match[1]);
      if (data.page !== path || data.props?.pageProps?.statusCode >= 400 || data.notFound) throw new Error('Unexpected or error page returned');
      result.smoke.push({ path, status: 'pass' });
    } catch (error) { result.smoke.push({ path, status: 'fail' }); fail(new Error(`${path}: ${message(error)}`)); }
  }));
  result.smoke.sort((a, b) => target.smokePaths.indexOf(a.path) - target.smokePaths.indexOf(b.path));

  try {
    const branch = await github(`repos/arkpedia/arkpedia/branches/${encodeURIComponent(target.branch)}`);
    result.branchHead = branch.commit.sha;
    result.atBranchHead = result.build?.commit === result.branchHead;
    if (target.branch !== 'main') {
      const comparison = await github(`repos/arkpedia/arkpedia/compare/main...${encodeURIComponent(target.branch)}`);
      result.behindMain = comparison.behind_by;
      if (comparison.behind_by > 0) fail(new Error(`${target.branch} is ${comparison.behind_by} commits behind main`));
    }
    if (SHA.test(result.build?.commit ?? '')) {
      const sha = result.build.commit;
      const [actions, checks] = await Promise.all([
        github(`repos/arkpedia/arkpedia/actions/runs?head_sha=${sha}&per_page=100`),
        github(`repos/arkpedia/arkpedia/commits/${sha}/check-runs?per_page=100`),
      ]);
      // Evidence belongs to the served SHA, never whichever run happened most recently.
      for (const name of ['Check', 'Deploy']) {
        const latest = actions.workflow_runs.filter(item => item.name === name).sort((a, b) => b.id - a.id)[0];
        if (latest) result.ci.push({ name, state: latest.conclusion || latest.status, url: latest.html_url });
      }
      const workers = checks.check_runs.filter(item => /Workers Builds/i.test(item.name));
      if (workers.length) {
        const latest = workers.sort((a, b) => b.id - a.id)[0];
        result.ci.push({ name: 'Workers Builds', state: latest.conclusion || latest.status, url: latest.details_url });
      }
      if (!result.ci.length) result.issues.push('No matching CI evidence found for served commit');
      for (const item of result.ci) if (['failure', 'timed_out', 'action_required', 'cancelled'].includes(item.state)) fail(new Error(`${item.name}: ${item.state} on served commit`));
    }
  } catch (error) { result.githubUnavailable = true; fail(new Error(`GitHub evidence unavailable: ${message(error)}`)); }
  return result;
}

export function renderReport(report) {
  const lines = ['# Arkpedia release status', '', `Observed: ${report.observedAt}`, '',
    '| Site | Live checks | Served commit / branch tip | Content | HTTP smoke | CI evidence | Behind main |',
    '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const target of report.targets) {
    const identity = target.build?.commit?.slice(0, 12) ?? 'unknown';
    const tip = target.branchHead?.slice(0, 12) ?? 'unknown';
    const ci = target.ci.map(item => `${cell(item.name)}: ${cell(item.state)}`).join('; ') || 'unavailable';
    lines.push(`| [${cell(target.name)}](${target.url}) | ${cell(target.status)} | ${identity} / ${tip} | ${cell(target.contentChannel)} · ${target.content?.release.slice(0, 12) ?? 'unverified'} | ${target.smoke.filter(s => s.status === 'pass').length}/${target.smoke.length} | ${ci} | ${target.behindMain ?? (target.branch === 'main' ? '—' : 'unknown')} |`);
  }
  lines.push('', 'Live checks cover clean build identity, channel/schema, pointer/manifest integrity and HTTP page responses. They do not prove which content release an ISR page currently renders, or replace browser UX checks.', '');
  for (const target of report.targets) {
    lines.push(`## ${cell(target.name)}`, '', `Branch: ${cell(target.branch)}. ${target.atBranchHead ? 'Serves branch tip.' : 'Branch tip differs or could not be verified; this may be an in-progress deploy or a docs-only commit.'}`, '');
    if (target.content) lines.push(`Published content commit: ${target.content.revision}`, '');
    lines.push(...target.ci.map(item => `- ${cell(item.name)}: ${cell(item.state)}${/^https:\/\/github\.com\//.test(item.url ?? '') ? ` · [run](${item.url})` : ''}`));
    if (!target.ci.length) lines.push('- CI evidence: unavailable.');
    lines.push(...target.issues.map(issue => `- ${cell(issue)}`), '');
  }
  return `${lines.join('\n')}\n`;
}

export async function collectReport(dependencies = {}) {
  const [production, channels, config] = await Promise.all(['config/production.json', 'config/content-channels.json', 'config/release-status.json'].map(readConfig));
  const targets = [
    ...[...production.deployments, ...(production.contentReaders ?? [])].filter(target => target.live).map(({ name, url, branch }) => ({ name, url, branch, contentChannel: channels.channels[branch].pointer })),
    ...config.additionalTargets,
  ].map(target => ({ ...target, smokePaths: config.smokePaths }));
  return { observedAt: new Date().toISOString(), targets: await Promise.all(targets.map(target => inspectTarget(target, dependencies))) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await collectReport();
    console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : renderReport(report));
    if (report.targets.some(target => target.status !== 'healthy')) process.exitCode = 1;
  } catch (error) { console.error(message(error)); process.exitCode = 1; }
}
