#!/usr/bin/env node
/**
 * What code a build or a content release came from, as one hash both sides can compute.
 *
 *   code fingerprint   sha256 of `git ls-tree -r` at a commit: every tracked file's mode,
 *                      blob id and path, less the docs-only paths (config/docs-only-paths.json).
 *                      Two commits that differ only in docs have the same fingerprint; any
 *                      other change -- a page, a builder, a data file, a workflow -- gives a
 *                      new one.
 *
 * The production build publishes its own in public/build-info.json (scripts/build/
 * write-build-info.mjs), export.mjs writes the generator's into release/manifest.json, and
 * deploy-gate.mjs publishes a release only when they are equal. The docs-only paths are the
 * ones check.yml ignores: a docs-only push never deploys, so leaving those files out is what
 * keeps production and main equal after one.
 *
 *   node scripts/content/code-fingerprint.mjs [ref]   print the fingerprint of ref (HEAD)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCHEMA } from './release-input.mjs';
import { contentPointer } from './channel.mjs';
import { deploymentRole } from '../deploy/deployment-role.cjs';
import { pulledSource } from './pull-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DOCS_ONLY_PATHS = JSON.parse(fs.readFileSync(path.join(root, 'config/docs-only-paths.json'), 'utf8')).paths;

/** A paths-filter glob as GitHub reads one: ** crosses folders, * and ? stay inside one.
 *  Negation and character classes are refused rather than read differently from GitHub. */
export function globToRegExp(glob) {
  if (typeof glob !== 'string' || !glob || /[![\]{}\\]/.test(glob)) throw new Error(`Unsupported docs-only glob: ${glob}`);
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; pattern += '(?:.*/)?'; } else pattern += '.*';
    } else if (c === '*') pattern += '[^/]*';
    else if (c === '?') pattern += '[^/]';
    else pattern += c.replace(/[.+^$()|]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}
const docsOnly = DOCS_ONLY_PATHS.map(globToRegExp);
export const isDocsOnly = file => docsOnly.some(pattern => pattern.test(file));

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** The fingerprint of the code at a commit (not the working tree: the release job edits data/). */
export function codeFingerprint(ref = 'HEAD', { cwd = process.cwd() } = {}) {
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', ref], cwd).split('\0').filter(Boolean)
    .filter(entry => !isDocsOnly(entry.slice(entry.indexOf('\t') + 1)));
  if (!entries.length) throw new Error(`No files at ${ref}`);
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

/**
 * Tracked files the build itself rewrites on purpose, which leave it the commit's build:
 *   data/assets/revisions.json   prebuild adopts the live release's newer asset pins
 *                                (scripts/build/adopt-release-asset-pins.mjs). Asset commits
 *                                decide which art a redirect reaches, never the shape of a
 *                                page's props, which is all the release gate guards. Its step
 *                                runs after write-build-info.mjs anyway; this is for the next
 *                                build in the same checkout (a local rebuild, a manual deploy).
 */
export const BUILD_REWRITES = new Set(['data/assets/revisions.json']);

/** Tracked files changed and untracked files added (not ignored) outside the docs-only paths
 *  and BUILD_REWRITES: a build made with any of them is not the commit it names. */
export function uncommittedChanges({ cwd = process.cwd() } = {}) {
  const tokens = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd).split('\0');
  const changed = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    // A rename or copy is followed by its old path, which is changed too.
    if (/^[RC]|^.[RC]/.test(entry)) changed.push(tokens[++i]);
    changed.push(entry.slice(3));
  }
  return changed.filter(file => file && !isDocsOnly(file) && !BUILD_REWRITES.has(file));
}

/** What public/build-info.json says about the build that serves it. */
export function buildInfo({ cwd = process.cwd(), now = new Date() } = {}) {
  return {
    version: 1,
    commit: git(['rev-parse', 'HEAD'], cwd).trim(),
    codeFingerprint: codeFingerprint('HEAD', { cwd }),
    contentSchema: SCHEMA,
    // The content pointer the build reads (scripts/content/channel.mjs): live, or dev-live.
    contentChannel: contentPointer(),
    // The arkpedia-data commit data/ was pulled from (scripts/content/pull-data.mjs).
    dataRevision: pulledSource(cwd)?.revision ?? null,
    deploymentRole: deploymentRole(),
    dirty: uncommittedChanges({ cwd }).length > 0,
    builtAt: now.toISOString(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(codeFingerprint(process.argv[2] ?? 'HEAD'));
