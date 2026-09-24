#!/usr/bin/env node
/**
 * Fills cnPoolId and globalPoolId on the banner records that do not carry them, from
 * the CN and EN gacha tables, and lists what it could not decide.
 *
 * A banner's identity is its gacha pool. Until 2026-09 only the banners discovered
 * through the wiki carried one (28 cnPoolId, 18 globalPoolId of 411), so everything
 * else could only be found by name. This matches each pool to the record whose
 * cn_date or global_date is the pool's window, of a kind the pool can be, and on Global
 * under the record's own name when the client names the pool after its banner -- the
 * same linkPools() the catalogue sync runs every day, which keeps new records filled.
 * Only one-to-one matches are written; an id already on a record is never replaced.
 * What it cannot decide is printed for a person to settle (the daily sync reports only
 * recent pools):
 *   ?  several records fit one pool, or several pools one record
 *   !  the one record a pool fits already records another pool
 *   ~  a named Global pool fits records by window and kind, but none by name
 *
 *   node scripts/sync/backfill-pool-ids.mjs [banners.json] [--write]
 *     [--cn-table gacha_table.json] [--en-table gacha_table.json]
 *
 * Without --cn-table/--en-table the tables are read from the catalogue's mirrors at
 * their current commits, which are printed so the change can name its inputs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { linkPools, POOL_REGIONS } from './catalogue-model.mjs';

const MIRRORS = {
  cn: { repo: 'Kengxxiao/ArknightsGameData', branch: 'master', file: 'zh_CN/gamedata/excel/gacha_table.json' },
  global: { repo: 'ArknightsAssets/ArknightsGamedata', branch: 'master', file: 'en/gamedata/excel/gacha_table.json' },
};

async function json(url) {
  const headers = url.startsWith('https://api.github.com/') && process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {};
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function mirrorTable({ repo, branch, file }) {
  const { sha } = await json(`https://api.github.com/repos/${repo}/commits/${branch}`);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Invalid revision: ${repo}`);
  return { table: await json(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`), source: `${repo}@${sha} ${file}` };
}

/** Links every region's pools; `banners` is changed in place. */
export function backfillPoolIds(banners, tables) {
  const report = {};
  for (const [region, table] of Object.entries(tables)) {
    const pools = table?.gachaPoolClient;
    if (!Array.isArray(pools) || pools.length < 100) throw new Error(`Truncated or changed ${region} gacha table`);
    const { id } = POOL_REGIONS[region];
    const before = banners.filter(b => b[id]).length;
    const { links, ambiguous, disagreements, conflicts } = linkPools(banners, pools, region);
    for (const { index, poolId } of links) banners[index][id] = poolId;
    report[region] = { before, after: banners.filter(b => b[id]).length,
      linked: links.map(({ index, poolId }) => `${poolId} -> ${banners[index].name}`), ambiguous, disagreements, conflicts };
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => { const at = args.indexOf(name); return at === -1 ? null : args.splice(at, 2)[1]; };
  const local = { cn: option('--cn-table'), global: option('--en-table') };
  const write = args.includes('--write');
  const file = args.find(a => !a.startsWith('--')) ?? 'data/headhunting_banners.json';
  const banners = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tables = {}, sources = [];
  for (const region of ['cn', 'global']) {
    if (local[region]) { tables[region] = JSON.parse(fs.readFileSync(local[region], 'utf8')); sources.push(local[region]); continue; }
    const { table, source } = await mirrorTable(MIRRORS[region]);
    tables[region] = table; sources.push(source);
  }
  const report = backfillPoolIds(banners, tables);
  console.log(`Gacha tables:\n${sources.map(s => `  ${s}`).join('\n')}`);
  for (const [region, r] of Object.entries(report)) {
    console.log(`\n${POOL_REGIONS[region].id}: ${r.before} -> ${r.after} of ${banners.length} records (${r.linked.length} linked)`);
    for (const line of r.linked) console.log(`  + ${line}`);
    for (const a of r.ambiguous) console.log(`  ? ${a.pools.join(' / ')} (${a.window}): ${a.reason ?? 'several records fit'} -- ${a.candidates.join(' | ')}`);
    for (const d of r.disagreements) console.log(`  ! ${d.banner}: recorded ${d.recorded}, the window matches ${d.matched}`);
    for (const c of r.conflicts) console.log(`  ~ ${c.pool} "${c.poolName}" (${c.window}): named otherwise -- ${c.candidates.join(' | ')}`);
  }
  if (write) fs.writeFileSync(file, `${JSON.stringify(banners, null, 2)}\n`);
  else console.log('\nDry run; pass --write to save.');
}
