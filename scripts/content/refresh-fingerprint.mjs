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
const generator = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const fingerprint = createHash('sha256').update(JSON.stringify({ generator, revisions })).digest('hex');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fingerprint=${fingerprint}\n`);
console.log(`Checked ${revisions.length} public sources; refresh fingerprint ${fingerprint}`);
