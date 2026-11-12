import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ASSET_SYNCS } from './asset-syncs.mjs';

// Arknights: Endfield's label's YouTube feed (scripts/sync/sync-endfield-albums.mjs FEED, written out
// here: this probe runs before npm ci, and that module imports a package).
export const ENDFIELD_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_wSsatRjjuF1xPlN9mtAPw';

// A cheap daily probe: install dependencies and compile only when inputs moved.
// Include corrections and asset/transcript mirrors, not just game patch dates.
export function watchedRepositories(root = process.cwd()) {
  // Scheduled runs probe before loading source records. Start from the tracked
  // sync inventory, then include any additional repositories from hydrated data.
  let pinned = [];
  try { pinned = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'data/assets/revisions.json'), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return [...new Set([
    'arkpedia/arkpedia-data',
    'ArknightsAssets/ArknightsGamedata',
    'yuanyan3060/ArknightsGameResource',
    'Kengxxiao/ArknightsGameData',
    'PseudoMon/tlvr-source',
    'isHarryh/Ark-Voice',
    // A new animated outfit model (scripts/sync/sync-dynamic-art.mjs).
    'arkpedia/arkpedia-l2d-assets',
    'arkpedia/arkpedia-sd-assets',
    'arkpedia/arkpedia-color-palette',
    ...ASSET_SYNCS.map(sync => `arkpedia/${sync.split('/')[0]}`),
    ...pinned.map(repo => `arkpedia/${repo}`),
  ])];
}

// Each repository's last commit this probe saw. The release job keeps this file in the
// Actions cache between runs, so the probe survives a repository it cannot reach.
export const STATE = '.cache/refresh-fingerprint/revisions.json';
const sha = /^[a-f0-9]{40}$/;

/**
 * The newest commit of every repository. One that cannot be read (an outage, a rate limit,
 * a renamed or deleted repository) is not a reason to hold back the day's release: its
 * last known commit stands in, with a warning, or a stable marker when none is known yet.
 * Whatever the release then fails to fetch from it, its own stage reports.
 */
export async function upstreamRevisions(repositories, { lastKnown = {}, token, fetch = globalThis.fetch } = {}) {
  const warnings = [];
  const revisions = await Promise.all(repositories.map(async repo => {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const commit = Array.isArray(body) ? body[0] : null;
      if (!sha.test(commit?.sha)) throw new Error('the response names no commit');
      return [repo, commit.sha];
    } catch (error) {
      const last = lastKnown[repo];
      if (sha.test(last ?? '')) {
        warnings.push(`Cannot check ${repo} (${error.message}); using its last known commit ${last.slice(0, 12)}.`);
        return [repo, last];
      }
      warnings.push(`Cannot check ${repo} (${error.message}) and no earlier commit is known; it counts as unchanged.`);
      return [repo, `${repo}:unavailable`];
    }
  }));
  return { revisions, warnings };
}

/** What the next run falls back to: every commit seen now, and the older ones it replaced. */
export function rememberRevisions(lastKnown, revisions) {
  return { ...lastKnown, ...Object.fromEntries(revisions.filter(([, revision]) => sha.test(revision))) };
}

function readState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch {
    // No cache yet, or one cut short: start from nothing rather than fail the probe.
    return {};
  }
}

async function main() {
  const stateFile = path.resolve(STATE);
  const lastKnown = readState(stateFile);
  const { revisions, warnings } = await upstreamRevisions(watchedRepositories(), { lastKnown, token: process.env.GH_TOKEN });
  for (const warning of warnings) console.log(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Upstream revision not checked::${warning}` : `warning: ${warning}`);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(rememberRevisions(lastKnown, revisions), null, 2)}\n`);
  // Lyrics come from Monster Siren, which has no repository to watch, so the catalogue
  // itself is the revision: a new song changes this list and wakes the refresh.
  // Deliberately not fatal, like every input above: a label's website being briefly
  // unreachable must not block a game-data refresh that has nothing to do with music. An
  // unreachable probe folds in a stable marker, so the day's other changes still trigger
  // a run.
  let songs = 'monster-siren:unavailable';
  try {
    const response = await fetch('https://monster-siren.hypergryph.com/api/songs', { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } });
    const body = response.ok ? await response.json() : null;
    const list = body?.code === 0 && Array.isArray(body.data?.list) ? body.data.list : null;
    // A truncated list would read as "songs removed" and churn the fingerprint daily.
    if (list && list.length >= 500) songs = list.map(song => String(song.cid)).sort().join(',');
    else console.warn('Monster Siren returned an unusable song list; excluding it from the fingerprint.');
  } catch (error) {
    console.warn(`Cannot check Monster Siren: ${error.message}`);
  }

  // Arknights: Endfield's songs, the same way: its label's YouTube feed (newest 15 uploads)
  // changes when a song is published (scripts/sync/sync-endfield-albums.mjs). Not fatal either.
  let endfield = 'endfield:unavailable';
  try {
    const response = await fetch(ENDFIELD_FEED, { signal: AbortSignal.timeout(30000) });
    const ids = response.ok ? [...(await response.text()).matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map(match => match[1]) : [];
    if (ids.length) endfield = ids.sort().join(',');
    else console.warn('The Endfield label\'s YouTube feed listed no uploads; excluding it from the fingerprint.');
  } catch (error) {
    console.warn(`Cannot check Endfield's YouTube feed: ${error.message}`);
  }

  const generator = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  // Wiki corrections and newly published art must be retried even between game patches.
  const discoveryDay = new Date().toISOString().slice(0, 10);
  const fingerprint = createHash('sha256').update(JSON.stringify({ generator, revisions, discoveryDay, songs: createHash('sha256').update(songs).digest('hex'),
    endfield: createHash('sha256').update(endfield).digest('hex') })).digest('hex');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `fingerprint=${fingerprint}\n`);
  console.log(`Checked ${revisions.length} public sources; refresh fingerprint ${fingerprint}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
