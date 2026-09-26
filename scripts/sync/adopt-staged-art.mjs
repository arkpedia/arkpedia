#!/usr/bin/env node
/**
 * After the staged-art stage has published what the importers staged and adopted the new
 * asset revisions: each importer that staged a file now published runs again, as the refresh
 * ran it (config/staged-art.json, `adopt`). With the files in the availability index it finds
 * them published, points its records at them -- a preview, a render, an icon mapping, a cover
 * filename -- and reports its quarantine entries without them, so they clear the same day.
 *
 *   node scripts/sync/adopt-staged-art.mjs <published.json>
 *
 * published.json is what publish-catalogue-assets.py wrote: {files: {destination: kind}}.
 * An importer that fails fails this, and with it the stage, whose changes under data/ are
 * then put back with the asset pins; the next run adopts the files instead.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { stagedKinds } from '../lib/staged-art.mjs';
import { readQuarantine } from '../lib/quarantine.mjs';

/** The kinds with anything published, in the registry's order, each with its adopt command. */
export function adoptions(published, kinds = stagedKinds()) {
  const counts = new Map();
  for (const kind of Object.values(published.files ?? {})) {
    if (!kinds[kind]) throw new Error(`published.json names ${kind}, which is not a staged art kind`);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return Object.entries(kinds).filter(([kind]) => counts.has(kind)).map(([kind, spec]) => ({ kind, files: counts.get(kind), command: spec.adopt }));
}

export function adoptStagedArt(publishedFile, { root = process.cwd(), run = spawnSync, log = console.log } = {}) {
  const published = JSON.parse(fs.readFileSync(publishedFile, 'utf8'));
  const before = new Set(readQuarantine(root).entries.map(entry => `${entry.stage} ${entry.key}`));
  for (const { kind, files, command } of adoptions(published)) {
    log(`== ${kind}: ${files} file(s) published; ${command.join(' ')}`);
    const result = run(command[0], command.slice(1), { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${command.join(' ')} exited ${result.status ?? result.signal} adopting what ${kind} staged`);
  }
  const after = new Set(readQuarantine(root).entries.map(entry => `${entry.stage} ${entry.key}`));
  const cleared = [...before].filter(key => !after.has(key)).sort();
  log(`${cleared.length} quarantine entr${cleared.length === 1 ? 'y' : 'ies'} cleared by publishing the staged art${cleared.length ? ':' : '.'}`);
  for (const key of cleared) log(`  - ${key}`);
  return cleared;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('usage: adopt-staged-art.mjs <published.json>');
  adoptStagedArt(process.argv[2]);
}
