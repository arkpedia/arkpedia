#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { approvePilotRelease } from './pilot-release-gate.mjs';
import { createPilotProvider, PILOT } from './pilot-release-provider.mjs';
import { readContentReaders } from './deploy-targets.mjs';
import { readPilotConfig, readPilotBuild } from './cloudflare-pilot.mjs';
import { codeFingerprint } from '../content/code-fingerprint.mjs';

const requireValue = (value, message) => { if (!value) throw new Error(`Pilot release refused: ${message}`); };

export async function publishPilotRelease({ source, checkRun, build, approve, provider }) {
  requireValue(/^[a-f0-9]{40}$/.test(source ?? '') && Number.isSafeInteger(checkRun) && checkRun > 0,
    'invalid release source or Check');
  requireValue(build?.version === 1 && build.commit === source && build.dirty === false
    && /^[a-f0-9]{64}$/.test(build.codeFingerprint ?? '') && build.contentSchema === 2
    && build.contentChannel === 'live' && build.deploymentRole === 'production', 'build differs from release contract');
  await approve();
  const previous = provider.observe();
  const previousHealth = await provider.health(previous);
  // Revalidate after preflight network reads, directly before the provider's own
  // resource/version check. The workflow holds its production lock throughout.
  await approve();
  if (previousHealth?.build?.commit === source && previousHealth.build.codeFingerprint === build.codeFingerprint) {
    requireValue(provider.observe().id === previous.id, 'pilot changed during reuse health checks');
    return { action: 'reused', source, fingerprint: build.codeFingerprint, checkRun, version: previous.id, healthy: true };
  }
  const owner = { source, fingerprint: build.codeFingerprint, checkRun, previousVersion: previous.id };
  try {
    const current = provider.deploy(owner);
    await provider.health(current);
    requireValue(provider.observe().id === current.id, 'pilot changed during deployed health checks');
    return { action: 'published', ...owner, version: current.id, healthy: true };
  } catch (error) {
    try { error.recovery = await provider.recover(owner); }
    catch (recovery) { error.recovery = { action: 'manual-reconciliation-required', reason: recovery.message }; }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receipt = '.cache/pilot-release-receipt.json';
  const save = value => { mkdirSync('.cache', { recursive: true }); writeFileSync(receipt, JSON.stringify(value, null, 2) + '\n'); };
  try {
    requireValue(process.argv.length === 4, 'expected Check run and full source SHA');
    requireValue(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === 'arkpedia/arkpedia'
      && process.env.GITHUB_REF === 'refs/heads/main' && process.env.ARKPEDIA_PILOT_RELEASES_ENABLED === 'true',
    'only the explicitly enabled main Actions release owner may deploy');
    const [runId, source] = process.argv.slice(2);
    requireValue(/^[1-9][0-9]*$/.test(runId) && Number.isSafeInteger(Number(runId)), 'invalid Check run');
    requireValue(/^[a-f0-9]{40}$/.test(source), 'invalid source');
    requireValue(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === source, 'checkout differs from checked source');
    readPilotConfig();
    requireValue(readContentReaders().some(reader => reader.url === PILOT.origin && reader.branch === 'main' && reader.live),
      'pilot must be registered in the main content publication gate');
    const build = readPilotBuild(source, codeFingerprint(source));
    const github = path => JSON.parse(execFileSync('gh', ['api', path], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    const result = await publishPilotRelease({ source, checkRun: Number(runId), build,
      approve: () => approvePilotRelease({ repository: 'arkpedia/arkpedia', runId, source, github }),
      provider: createPilotProvider() });
    save(result); console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const failure = { action: 'failed', reason: error.message, ...(error.recovery ? { recovery: error.recovery } : {}) };
    save(failure); console.error(JSON.stringify(failure, null, 2)); process.exitCode = 1;
  }
}
