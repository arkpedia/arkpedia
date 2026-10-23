/**
 * Which content pointer a reader of the release uses, in CommonJS so next.config.js can ask too
 * (scripts/content/channel.mjs re-exports it). ARKPEDIA_CONTENT_CHANNEL when set; else, in a
 * Deploy build, the channel of the branch the Vercel project being built follows
 * (VERCEL_PROJECT_ID, which Deploy sets for every build, looked up in config/production.json),
 * so arkpedia-dev builds against dev-live whichever revision of deploy.yml runs; in a Cloudflare
 * Workers build, the channel of the branch it builds (WORKERS_CI_BRANCH, which Workers Builds
 * sets): the Worker built from dev read live, www's release, until 2026-10-22; else live.
 * lib/content/release.ts's contentChannel() writes the same rule out for the site's bundle.
 */
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const { channels: CHANNELS } = require(path.join(root, 'config/content-channels.json'));
const { deployments } = require(path.join(root, 'config/production.json'));

const POINTER = /^[a-z0-9][a-z0-9-]*$/;

/** The pointer a deployment of `branch` reads: its channel's, else live. */
/** Branches with no content channel of their own that read another branch's. While the Cloudflare
 *  path is set up, `cloudflare` is dev plus the Cloudflare-only work, and the Worker built from it
 *  reads dev's release (docs/development/cloudflare-workers.md). */
const READS_CHANNEL_OF = { cloudflare: 'dev' };
function pointerForBranch(branch) {
  const channel = Object.hasOwn(READS_CHANNEL_OF, branch ?? '') ? READS_CHANNEL_OF[branch] : branch;
  return Object.hasOwn(CHANNELS, channel ?? '') ? CHANNELS[channel].pointer : 'live';
}

function contentPointer(env = process.env) {
  const project = env.VERCEL_PROJECT_ID ? deployments.find(deployment => deployment.vercel?.projectId === env.VERCEL_PROJECT_ID) : null;
  const value = env.ARKPEDIA_CONTENT_CHANNEL || pointerForBranch(project?.branch ?? env.WORKERS_CI_BRANCH);
  if (!POINTER.test(value)) throw new Error(`ARKPEDIA_CONTENT_CHANNEL must be a branch name of lower-case letters, digits and dashes, not ${value}`);
  return value;
}

module.exports = { CHANNELS, contentPointer, pointerForBranch };
