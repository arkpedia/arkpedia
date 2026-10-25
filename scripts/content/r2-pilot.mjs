#!/usr/bin/env node
// Explicit opt-in CLI. No bucket creation, deletion, production key or website binding.
import { pathToFileURL } from 'node:url';
import { createR2PilotClient, r2S3Bucket } from './r2-s3.mjs';
import { pinnedSnapshotSource, readPilotFile } from './r2-source.mjs';
import { stageSnapshot, readStagingPointer, promoteStagingSnapshot } from './r2-snapshot.mjs';

export const HELP = `Inactive R2 staging pilot (JSON output; credentials only through environment)
  inspect --bucket NAME
  stage --bucket NAME --revision FULL_SHA --cache DIRECTORY [--source RELEASE_DIRECTORY] [--fetch-missing] [--concurrency 1..8]
  promote --bucket NAME --candidate FILE --expected FILE [--concurrency 1..8]

Environment: ARKPEDIA_R2_ACCOUNT_ID, ARKPEDIA_R2_ACCESS_KEY_ID, ARKPEDIA_R2_SECRET_ACCESS_KEY.
Use a separate private pilot bucket and bucket-scoped Object Read & Write credentials.
stage never moves a pointer. Save inspect output as the explicit promotion precondition.
If a write fails or times out, inspect before retrying; do not assume it was not applied.
`;

export function parsePilotArguments(argv) {
  const [command, ...args] = argv;
  if (command === '--help' && !args.length) return { command: 'help' };
  const allowed = { inspect: ['bucket'], stage: ['bucket', 'revision', 'cache', 'source', 'fetch-missing', 'concurrency'], promote: ['bucket', 'candidate', 'expected', 'concurrency'] }[command];
  if (!allowed) throw new Error('Choose inspect, stage or promote; use --help for syntax');
  const options = { command, concurrency: 4 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const key = args[index].startsWith('--') ? args[index].slice(2) : '';
    if (!allowed.includes(key) || seen.has(key)) throw new Error('Unknown or duplicate pilot option');
    seen.add(key);
    if (key === 'fetch-missing') { options.fetchMissing = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.bucket ?? '')) throw new Error('An explicit pilot bucket name is required');
  if (command === 'stage' && (!/^[a-f0-9]{40}$/.test(options.revision ?? '') || !options.cache)) throw new Error('stage requires --revision FULL_SHA and --cache DIRECTORY');
  if (command === 'promote' && (!options.candidate || !options.expected)) throw new Error('promote requires --candidate FILE and --expected FILE');
  if (!/^[1-8]$/.test(String(options.concurrency))) throw new Error('Pilot concurrency must be an integer from 1 to 8');
  options.concurrency = Number(options.concurrency);
  return options;
}

async function jsonFile(path) {
  const bytes = await readPilotFile(path, 8192);
  try { return JSON.parse(bytes.toString()); }
  catch { throw new Error('Pilot input file must contain valid JSON'); }
}

export async function runPilot(options, { bucket, source = pinnedSnapshotSource } = {}) {
  if (options.command === 'inspect') return readStagingPointer(bucket);
  if (options.command === 'stage') {
    const input = await source({ revision: options.revision, cacheDirectory: options.cache, sourceDirectory: options.source, fetchMissing: options.fetchMissing });
    return stageSnapshot({ bucket, ...input, concurrency: options.concurrency });
  }
  if (options.command === 'promote') {
    const [candidate, expected] = await Promise.all([jsonFile(options.candidate), jsonFile(options.expected)]);
    return promoteStagingSnapshot({ bucket, candidate, expected, concurrency: options.concurrency });
  }
  throw new Error('Unknown pilot command');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let client;
  try {
    const options = parsePilotArguments(process.argv.slice(2));
    if (options.command === 'help') process.stdout.write(HELP);
    else {
      client = createR2PilotClient({ accountId: process.env.ARKPEDIA_R2_ACCOUNT_ID,
        accessKeyId: process.env.ARKPEDIA_R2_ACCESS_KEY_ID, secretAccessKey: process.env.ARKPEDIA_R2_SECRET_ACCESS_KEY });
      const result = await runPilot(options, { bucket: r2S3Bucket({ client, bucketName: options.bucket }) });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    // Do not dump SDK objects, request signatures or the caller's environment.
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally { client?.destroy(); }
}
