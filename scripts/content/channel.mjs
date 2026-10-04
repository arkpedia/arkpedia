#!/usr/bin/env node
/**
 * The content channels: per branch of this repository that Prepare content release runs on, the
 * arkpedia-data branch its release is published to and the pointer branch whose current.json
 * names it. A site reads the pointer of its channel (lib/content/server.ts, through
 * ARKPEDIA_CONTENT_CHANNEL, which Deploy sets from the deployment's branch).
 *
 *   node scripts/content/channel.mjs --branch <branch>   the channel's settings, as lines for $GITHUB_ENV
 *
 * Why a dev channel: the release was compiled only by main's code, so arkpedia-dev rendered
 * main's data and a pipeline change merged to dev showed nothing until it reached main (the
 * full rebuild of operator records from the game's tables, 2026-10-04). Dev's run compiles data
 * main's records with dev's code into data `dev`, rebuilt from main every run (so force-pushed),
 * and points `dev-live` at it. Data main and `live` are never written by it, and nothing in
 * arkpedia-data listens to either dev branch.
 *
 * Any other branch has no channel and the run fails at once: a feature branch never publishes.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const CHANNELS = {
  main: { dataBranch: 'main', pointer: 'live' },
  dev: { dataBranch: 'dev', pointer: 'dev-live' },
};

/** The channel `branch` publishes to, or an error: no other branch has one. */
export function channelFor(branch) {
  const channel = Object.hasOwn(CHANNELS, branch ?? '') ? CHANNELS[branch] : null;
  if (!channel) throw new Error(`${branch} has no content channel: Prepare content release publishes only from ${Object.keys(CHANNELS).join(' or ')}`);
  return channel;
}

/** The pointer branch a reader of the release uses: ARKPEDIA_CONTENT_CHANNEL, else live. The
 *  same rule as lib/content/server.ts's contentChannel(). */
export const POINTER = /^[a-z0-9][a-z0-9-]*$/;
export function contentPointer(env = process.env) {
  const value = env.ARKPEDIA_CONTENT_CHANNEL || 'live';
  if (!POINTER.test(value)) throw new Error(`ARKPEDIA_CONTENT_CHANNEL must be a branch name of lower-case letters, digits and dashes, not ${value}`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const at = process.argv.indexOf('--branch');
  const branch = at > 0 ? process.argv[at + 1] : undefined;
  const { dataBranch, pointer } = channelFor(branch);
  console.log(`ARKPEDIA_RELEASE_BRANCH=${branch}`);
  console.log(`ARKPEDIA_DATA_BRANCH=${dataBranch}`);
  console.log(`ARKPEDIA_CONTENT_POINTER=${pointer}`);
}
