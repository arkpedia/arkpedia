#!/usr/bin/env node
// Explicit operator recovery after manual account acceptance fails. Code/config
// rollback only: no D1 restore, SQL, secret writes or content-pointer changes.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createPilotProvider } from './pilot-release-provider.mjs';
import { uncommittedChanges } from '../content/code-fingerprint.mjs';
import { readPilotConfig } from './cloudflare-pilot.mjs';

const requireValue = (value, message) => { if (!value) throw new Error(`Pilot recovery refused: ${message}`); };
export async function recoverPilotRelease({ expectedSource, expectedVersion, provider }) {
  requireValue(/^[a-f0-9]{40}$/.test(expectedSource ?? '')
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(expectedVersion ?? ''), 'explicit source and version required');
  const actual = provider.observe();
  requireValue(actual.id === expectedVersion, 'pilot differs from the accepted receipt; reconcile before recovery');
  const owner = provider.owner(actual);
  requireValue(owner?.source === expectedSource, 'pilot does not belong to the specified main release');
  const result = await provider.recover(owner, expectedVersion);
  return { ...result, failedSource: expectedSource, failedVersion: expectedVersion, restoredVersion: owner.previousVersion };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv.length === 5 && process.argv[4] === '--local-oauth',
      'freeze main, disable the release flag, then specify source, version and --local-oauth');
    const [expectedSource, expectedVersion] = process.argv.slice(2, 4);
    requireValue(/^[a-f0-9]{40}$/.test(expectedSource ?? ''), 'full source SHA required');
    requireValue(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === expectedSource,
      'use the exact checked release checkout');
    requireValue(uncommittedChanges().length === 0, 'release checkout has uncommitted code');
    readPilotConfig();
    console.log(JSON.stringify(await recoverPilotRelease({ expectedSource, expectedVersion,
      provider: createPilotProvider({ allowLocalRecovery: true }) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
