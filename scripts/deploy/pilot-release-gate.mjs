#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { approvePilotRelease } from './release-approval.mjs';
export { approvePilotRelease };

const REPOSITORY = 'arkpedia/arkpedia';
const requireValue = (value, message) => { if (!value) throw new Error(`Pilot release refused: ${message}`); };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv.length === 4, 'expected Check run and full source SHA');
    const github = path => JSON.parse(execFileSync('gh', ['api', path], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    console.log(JSON.stringify(await approvePilotRelease({ repository: REPOSITORY,
      runId: process.argv[2], source: process.argv[3], github }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
