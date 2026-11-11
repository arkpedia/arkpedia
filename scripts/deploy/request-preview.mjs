#!/usr/bin/env node
// Request the existing isolated Preview owner; never publish from this computer.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { uncommittedChanges } from '../content/code-fingerprint.mjs';

const REPOSITORY = 'arkpedia/arkpedia';
export function requestPreview(ref = 'HEAD', {
  git = args => execFileSync('git', args, { encoding: 'utf8', timeout: 30_000 }).trim(),
  gh = args => execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000 }).trim(),
  changes = uncommittedChanges,
} = {}) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw new Error('Expected a source commit or ref');
  if (changes().length) throw new Error('Commit the release changes before requesting Preview');
  const remote = git(['remote', 'get-url', 'origin']);
  if (!['git@github.com:arkpedia/arkpedia.git', 'https://github.com/arkpedia/arkpedia.git', 'https://github.com/arkpedia/arkpedia'].includes(remote)) throw new Error('Expected the canonical Arkpedia repository');
  const source = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('Could not resolve a full immutable source SHA');
  // A locally committed but unpushed SHA cannot be checked out by Actions.
  let published;
  try { published = JSON.parse(gh(['api', `repos/${REPOSITORY}/git/commits/${source}`])); }
  catch { throw new Error('Source is unavailable on GitHub; push it and check GitHub access before requesting Preview'); }
  if (published.sha !== source) throw new Error('Push the source commit before requesting Preview');
  gh(['workflow', 'run', 'cloudflare-preview.yml', '--repo', REPOSITORY, '--ref', 'main', '-f', `source=${source}`]);
  return { source, url: 'https://preview.arkpedia.net', workflow: 'cloudflare-preview.yml' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3) throw new Error('Use request-preview.mjs [source-ref]');
    console.log(JSON.stringify(requestPreview(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
