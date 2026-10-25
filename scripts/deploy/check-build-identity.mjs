#!/usr/bin/env node
// Built-in modules only: a deploy must prove its identity, not just answer HTTP 200.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { codeFingerprint } from '../content/code-fingerprint.mjs';
import { SCHEMA } from '../content/release-input.mjs';
import { contentPointer } from '../content/channel.mjs';

export function expectedBuildIdentity({ cwd = process.cwd(), env = process.env } = {}) {
  return { version: 1, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
    codeFingerprint: codeFingerprint('HEAD', { cwd }), contentSchema: SCHEMA,
    contentChannel: contentPointer(env), deploymentRole: 'production', dirty: false };
}

export function validateBuildIdentity(build, expected) {
  if (!expected || typeof expected.commit !== 'string' || !/^[a-f0-9]{40}$/.test(expected.commit)
    || typeof expected.codeFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(expected.codeFingerprint)
    || expected.version !== 1 || expected.dirty !== false || expected.deploymentRole !== 'production'
    || !Number.isInteger(expected.contentSchema) || expected.contentSchema < 1
    || typeof expected.contentChannel !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(expected.contentChannel)) throw new Error('Invalid expected build identity');
  for (const key of ['version', 'dirty', 'commit', 'codeFingerprint', 'contentSchema', 'contentChannel', 'deploymentRole']) {
    if (!build || build[key] !== expected[key]) throw new Error(`Build identity mismatch: ${key}`);
  }
  return build;
}

function parse(bytes) {
  try { return JSON.parse(bytes.toString()); }
  catch { throw new Error('Build identity is not valid JSON'); }
}

export function checkBuildFile(expected, file = '.vercel/output/static/build-info.json') {
  if (fs.statSync(file).size > 16_384) throw new Error('Build identity exceeds its size limit');
  return validateBuildIdentity(parse(fs.readFileSync(file)), expected);
}

export async function readLiveBuild(url, { fetcher = fetch } = {}) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), redirect: 'error',
    headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error('Public build identity is unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Build identity exceeds its size limit');
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks));
}

export async function waitForBuildIdentity(origin, expected, { attempts = 12, delayMs = 5_000,
  read = readLiveBuild, wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Expected a public HTTPS origin without credentials');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12 || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5_000) throw new Error('Invalid identity retry bounds');
  // Validate the expected contract before waiting on alias propagation.
  validateBuildIdentity(expected, expected);
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const address = new URL('/build-info.json', url);
      address.searchParams.set('identity', `${Date.now()}-${attempt}`);
      return validateBuildIdentity(await read(address.href), expected);
    } catch {
      if (attempt + 1 < attempts) await wait(delayMs);
    }
  }
  throw new Error('Public build identity did not match the checked commit within the retry limit');
}

async function main() {
  const expected = expectedBuildIdentity();
  if (process.argv[2] === 'local') checkBuildFile(expected);
  else if (process.argv[2] === 'live' && process.argv[3]) await waitForBuildIdentity(process.argv[3], expected);
  else throw new Error('Use local or live <public HTTPS origin>');
  console.log(`Verified clean build ${expected.commit.slice(0, 12)} (${expected.contentChannel}, schema ${expected.contentSchema}).`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
