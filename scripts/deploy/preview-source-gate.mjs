#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { approvePreviewSource } from './release-approval.mjs';
export { approvePreviewSource };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const github = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000 }));
  approvePreviewSource(process.env.SOURCE, github).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
