#!/usr/bin/env node
/**
 * public/build-info.json: which code this build is, served by the deployment at
 * /build-info.json. The content release job reads it with a GET before it publishes
 * (scripts/content/deploy-gate.mjs) and holds a release compiled by any other code, so a
 * release the deployed app cannot read never goes live (REVIEW OR-02: the generator on main
 * dropped props the deployed pages still dereferenced, and both said schema 2).
 *
 * The first step of prebuild, before any builder can touch the tree. A build that cannot say
 * what it is fails here: deployed, it would hold every release. The file is gitignored, so
 * export.mjs never publishes it as a source record.
 */
import fs from 'node:fs';
import { buildInfo, uncommittedChanges } from '../content/code-fingerprint.mjs';

let info;
try {
  info = buildInfo();
} catch (error) {
  console.error(`[build-info] Cannot tell which commit this build is (${error instanceof Error ? error.message.split('\n')[0] : error}). Build from a git checkout: the content release gate reads /build-info.json.`);
  process.exit(1);
}
if (info.dirty) {
  const changes = uncommittedChanges();
  console.warn(`[build-info] Building ${info.commit.slice(0, 12)} with ${changes.length} uncommitted change(s) (${changes.slice(0, 10).join(', ')}${changes.length > 10 ? ', ...' : ''}). Deployed, this build holds every content release until a clean one replaces it.`);
}
fs.writeFileSync('public/build-info.json', `${JSON.stringify(info, null, 2)}\n`);
console.log(`[build-info] ${info.commit.slice(0, 12)}, code ${info.codeFingerprint.slice(0, 12)}, content schema ${info.contentSchema}`);
