#!/usr/bin/env node
// Shadow planning only. This script neither skips CI nor creates reusable Check proof.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { relevantFiles } from './browser-relevant.mjs';

const CORE = ['nav-bar.spec.ts', 'mobile-touch-nav.spec.ts', 'navigation-continuity.spec.ts'];
const FAMILIES = [
  { name: 'story', code: /^(?:pages\/story(?:\/|\.)|components\/story\/|lib\/story\/|styles\/story\/)/, specs: /^story-.*\.spec\.ts$/ },
  { name: 'schedule', code: /^(?:pages\/schedule\.tsx|pages\/events\/|components\/schedule\/|components\/events\/|lib\/schedule\/|lib\/events\/|styles\/schedule\/|styles\/events\/)/, specs: /^(?:schedule-|regional-schedules|banner-forecasts|home-banner-status|event-|planning-pages).*\.spec\.ts$/ },
  { name: 'music', code: /^(?:pages\/music(?:\/|\.)|pages\/api\/music|components\/music\/|lib\/music\/|styles\/music\/)/, specs: /^(?:music-|song-).*\.spec\.ts$/ },
  { name: 'accounts', code: /^(?:pages\/account\.tsx|pages\/api\/(?:auth\/|cloud-account\.ts|account-import\/)|lib\/(?:cloud-account|account|account-import)\/|components\/(?:account|account-import)\/|styles\/account\/)/, specs: /^(?:account-|cloud-accounts|base-account|medal-collection|friends|reward-import|music-(?:resume|navigation|data-saver)).*\.spec\.ts$/ },
];
const normalize = value => value.replace(/\\/g, '/');
const basename = value => normalize(value).split('/').at(-1);

export function browserPlan({ changes, specs, relevant, baselineVerified = false, forceFull = false }) {
  const inventory = [...new Set(specs.map(normalize))].sort();
  const full = reason => ({ policy: 'shadow-v1', lane: 'full', reason, baselineVerified, selected: inventory, omitted: [], domains: [], reusableCheckProof: false });
  if (forceFull) return full('Explicit full/regression request');
  if (!baselineVerified) return full('No verified green baseline');
  if (!changes.length || !inventory.length) return full('Missing change or browser inventory');
  if (CORE.some(name => !inventory.some(file => basename(file) === name))) return full('Core journey inventory is incomplete');
  const selected = new Set(inventory.filter(file => CORE.includes(basename(file))));
  const domains = new Set();
  let relevantChanges = 0;
  for (const change of changes) {
    const file = normalize(change.path);
    if (file.startsWith('docs/') || file.endsWith('.md')) continue;
    if (file.startsWith('tests/browser/')) {
      // Shared fixtures can affect every browser scenario. Deleted/unknown specs fail closed.
      if (!file.endsWith('.spec.ts') || !inventory.includes(file) || change.status?.startsWith('D')) return full(`Shared or removed browser input: ${file}`);
      if (/layout-census|page-bounds|tabs\.spec|core\.spec/.test(file)) return full(`Broad browser contract: ${file}`);
      selected.add(file);
      relevantChanges++;
      continue;
    }
    const family = FAMILIES.find(item => item.code.test(file));
    if (family) {
      if (/cloud-account|CloudAccountPanel|pages\/api\/auth\//.test(file) && !inventory.includes('tests/browser/cloud-accounts.spec.ts')) return full('Cloud account browser contract is missing');
      const matching = inventory.filter(spec => family.specs.test(basename(spec)));
      if (!matching.length) return full(`No registered browser specs for ${family.name}`);
      matching.forEach(spec => selected.add(spec));
      domains.add(family.name);
      relevantChanges++;
      continue;
    }
    // Existing build dependency closure proves which tooling inputs are not read by browsers.
    if (file.startsWith('scripts/') && !file.startsWith('scripts/ci/') && relevant instanceof Set && !relevant.has(file)) continue;
    return full(`Shared or unclassified input: ${file}`);
  }
  if (!relevantChanges) return { policy: 'shadow-v1', lane: 'none', reason: 'Only documentation or tooling outside the browser/build dependency closure', baselineVerified, selected: [], omitted: inventory, domains: [], reusableCheckProof: false };
  return { policy: 'shadow-v1', lane: 'targeted', reason: 'Core journeys plus affected families/specifications; full CI is unchanged', baselineVerified, selected: [...selected].sort(), omitted: inventory.filter(file => !selected.has(file)), domains: [...domains].sort(), reusableCheckProof: false };
}

function main() {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--base');
  const base = argv[index + 1];
  if (index < 0 || !base || base.startsWith('-')) throw new Error('Use --base <commit/ref>; --assume-green-base is dry-run simulation only');
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const files = new Set(git(['ls-files']).split('\n').filter(Boolean));
  const changes = git(['diff', '--name-status', '-M', base, 'HEAD']).split('\n').filter(Boolean).flatMap(line => {
    const [status, ...paths] = line.split('\t');
    return paths.map(file => ({ status, path: file }));
  });
  const relevant = relevantFiles(files, file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } });
  const plan = browserPlan({ changes, specs: [...files].filter(file => /^tests\/browser\/.*\.spec\.ts$/.test(file)), relevant, baselineVerified: argv.includes('--assume-green-base'), forceFull: argv.includes('--full') });
  console.log(JSON.stringify({ mode: 'shadow-only', base: git(['rev-parse', base]), ...plan }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
