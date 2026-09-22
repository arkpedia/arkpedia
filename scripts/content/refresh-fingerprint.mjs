import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// A cheap daily probe: install dependencies and compile only when inputs moved.
// Include corrections and asset/transcript mirrors, not just game patch dates.
const repositories = [
  'arkpedia/arkpedia-data',
  'ArknightsAssets/ArknightsGamedata',
  'yuanyan3060/ArknightsGameResource',
  'Kengxxiao/ArknightsGameData',
  'PseudoMon/tlvr-source',
  'isHarryh/Ark-Voice',
  ...Object.keys(JSON.parse(readFileSync('data/assets/revisions.json', 'utf8'))).map(repo => `arkpedia/${repo}`),
];
const revisions = await Promise.all(repositories.map(async repo => {
  const response = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, {
    headers: process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Cannot check ${repo}: ${response.status}`);
  const [commit] = await response.json();
  if (!/^[a-f0-9]{40}$/.test(commit?.sha)) throw new Error(`Missing revision for ${repo}`);
  return [repo, commit.sha];
}));
// Lyrics come from Monster Siren, which has no repository to watch, so the catalogue
// itself is the revision: a new song changes this list and wakes the refresh.
// Deliberately not fatal. Every other input here is a GitHub repository whose outage
// should stop a publication, but a label's website being briefly unreachable must not
// block a game-data refresh that has nothing to do with music. An unreachable probe
// folds in a stable marker, so the day's other changes still trigger a run.
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

const generator = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
// Wiki corrections and newly published art must be retried even between game patches.
const discoveryDay = new Date().toISOString().slice(0, 10);
const fingerprint = createHash('sha256').update(JSON.stringify({ generator, revisions, discoveryDay, songs: createHash('sha256').update(songs).digest('hex') })).digest('hex');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fingerprint=${fingerprint}\n`);
console.log(`Checked ${revisions.length} public sources; refresh fingerprint ${fingerprint}`);
