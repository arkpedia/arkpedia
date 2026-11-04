/**
 * The optimizer's answers before and after the base skill table: the same accounts, seeds and round budgets run
 * in a checkout of the pre-table tip (e692e12dc) and in this one, their seed plans and recommendations diffed.
 *
 *   npx tsx scripts/bench/compare-optimizer.ts <pre-table checkout> [--rounds 300] [--out .cache/optimizer-compare]
 *                                              [--accounts fixture,sheet252,tests/fixtures/krooster/aiki.json,...]
 *                                              [--report-only]
 *
 * The pre-table checkout is a worktree at e692e12dc with node_modules, data/ and .cache/ linked from this one
 * (`git worktree add --detach <dir> e692e12dc`). Its optimizer has no deterministic round budget, so the two
 * hunks in scripts/bench/pre-table-determinism.patch (the `annealRounds` option and cooling over rounds) are
 * applied there first, and a copy of scripts/bench/optimizer-run.ts is placed in it.
 *
 * Every account runs twice: with the KNOWN_DEVIATIONS operators (whose skills the table reads differently, on
 * purpose) left out, where the two checkouts must agree exactly -- any difference there is a bug; and with the
 * whole roster, where the differences are reported with the deviating operators each plan placed, since one
 * changed number sends the anneal down another path. Runs are sequential: one search at a time on the machine.
 * `--report-only` rebuilds the report from the JSON files of an earlier batch without running anything.
 *
 * The branch also changed how a published plan is completed (completeStaffing.ts: support candidates ranked by
 * their own Morale drain rather than the room's shared rate, commit 4990c4e50), which the search's own score
 * never sees. A difference confined to the Reception Room, Office, Control Center and the Dormitories, with every
 * Factory, Trading Post and Power Plant crew identical, is that completion, not the table, and is reported so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { KNOWN_DEVIATIONS } from '../tests/base-skill-deviations';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const pre = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!pre) throw new Error('usage: compare-optimizer.ts <pre-table checkout> [--rounds N] [--out dir] [--accounts a,b]');
const rounds = Number(flag('--rounds') ?? 300);
const outDir = flag('--out') ?? '.cache/optimizer-compare';
const reportOnly = args.includes('--report-only');
const here = process.cwd();
const accounts = (flag('--accounts') ?? ['fixture', 'sheet252', 'sheet342', ...fs.readdirSync('tests/fixtures/krooster').filter(f => f.endsWith('.json')).map(f => `tests/fixtures/krooster/${f}`)].join(',')).split(',');
fs.mkdirSync(outDir, { recursive: true });

// The pre-table checkout: the patch (once) and the runner.
const patch = path.join(here, 'scripts/bench/pre-table-determinism.patch');
if (!reportOnly) {
  if (!fs.readFileSync(path.join(pre, 'lib/base/accountOptimizer.ts'), 'utf8').includes('annealRounds')) execFileSync('git', ['apply', patch], { cwd: pre, stdio: 'inherit' });
  fs.copyFileSync(path.join(here, 'scripts/bench/optimizer-run.ts'), path.join(pre, 'scripts/bench/optimizer-run.ts'));
}

interface Shift { refill: string[]; rooms: Record<string, (string | null)[]> }
interface Seed { layout: string; products: Record<string, string>; score: number; shifts: Shift[]; periodic: boolean; exhausted: boolean }
interface Rec { id: string; label: string; score: number; lmd: number; exp: number; goldMade: number; products: Record<string, string>; shifts: Shift[] }
interface Run { account: string; rosterSize: number; seeds: Seed[]; recommendations: Rec[]; seedSeconds: number; searchSeconds: number; searched: number }

const run = (cwd: string, account: string, without: string[], out: string, seeds: 'no' | 'only'): Run => {
  const file = path.join(here, outDir, out);
  const accountPath = account.includes('/') ? path.join(here, account) : account;
  if (!(reportOnly && fs.existsSync(file))) execFileSync('npx', ['tsx', 'scripts/bench/optimizer-run.ts', accountPath, String(rounds), file, '--without', without.join(','), '--interval', '12', '--seeds', seeds], { cwd, stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const PRODUCTION = /^prod\d+$/;
/** Whether every production crew (the rooms the search scores) is the same, so a difference is the completion's. */
const sameProduction = (a: Shift[], b: Shift[]) => a.length === b.length && a.every((s, i) => Object.keys(s.rooms).filter(id => PRODUCTION.test(id)).every(id => (s.rooms[id] ?? []).join() === (b[i].rooms[id] ?? []).join()) && s.refill.join() === b[i].refill.join());
const key = (s: Seed) => `${s.layout} ${Object.entries(s.products).sort().map(([id, p]) => `${id}=${p === 'Precious Metals' ? 'gold' : 'exp'}`).join(' ')}`;
const sameShifts = (a: Shift[], b: Shift[]) => JSON.stringify(a) === JSON.stringify(b);
/** The rooms whose crews differ, shift by shift. */
function roomDiffs(a: Shift[], b: Shift[]): string[] {
  const out: string[] = [];
  if (a.length !== b.length) return [`${a.length} shifts vs ${b.length}`];
  a.forEach((shift, i) => {
    for (const id of new Set([...Object.keys(shift.rooms), ...Object.keys(b[i].rooms)])) {
      const x = (shift.rooms[id] ?? []).filter(Boolean).join(', '), y = (b[i].rooms[id] ?? []).filter(Boolean).join(', ');
      if (x !== y) out.push(`shift ${i + 1} ${id}: [${x}] vs [${y}]`);
    }
    if (shift.refill.join() !== b[i].refill.join()) out.push(`shift ${i + 1} refill: [${shift.refill.join(', ')}] vs [${b[i].refill.join(', ')}]`);
  });
  return out;
}
const placedDeviators = (r: Rec | Seed) => [...new Set(r.shifts.flatMap(s => Object.values(s.rooms).flat()).filter((n): n is string => !!n && n in KNOWN_DEVIATIONS))].sort();

const deviators = Object.keys(KNOWN_DEVIATIONS);
const report: string[] = [`# Optimizer before and after the base skill table`, '', `Pre-table checkout: ${pre} (e692e12dc with pre-table-determinism.patch). This checkout: ${here}.`, `Anneal budget ${rounds} rounds per layout, loginInterval 12, objective balanced, no external gold, 252 layouts compared. One run at a time.`, ''];
let bugs = 0;
for (const account of accounts) {
  const name = account.includes('/') ? path.basename(account, '.json') : account;
  for (const mode of ['clean', 'full'] as const) {
    const without = mode === 'clean' ? deviators : [];
    console.log(`\n=== ${name} (${mode})`);
    const a = run(pre, account, without, `${name}-${mode}-pre.json`, 'no');
    const b = run(here, account, without, `${name}-${mode}-post.json`, 'no');
    report.push(`## ${name} (${mode === 'clean' ? 'deviating operators left out' : 'whole roster'}), ${b.rosterSize} operators`, '');
    report.push(`Search ${a.searchSeconds.toFixed(0)} s / ${b.searchSeconds.toFixed(0)} s (${a.searched} / ${b.searched} plans).`, '');
    // The seed plans, by layout and split, only once the recommendations differ: they place the difference before or
    // inside the anneal, and cost about as much as the search.
    const recsDiffer = a.recommendations.length !== b.recommendations.length || a.recommendations.some(r => { const t = b.recommendations.find(x => x.id === r.id); return !t || Math.abs(r.score - t.score) > 1e-6 || !sameShifts(r.shifts, t.shifts); });
    if (recsDiffer) {
      a.seeds = run(pre, account, without, `${name}-${mode}-pre-seeds.json`, 'only').seeds;
      b.seeds = run(here, account, without, `${name}-${mode}-post-seeds.json`, 'only').seeds;
    }
    const seedsB = new Map(b.seeds.map(s => [key(s), s]));
    let seedDiffs = 0;
    for (const s of a.seeds) {
      const t = seedsB.get(key(s));
      if (!t) { report.push(`- seed ${key(s)}: missing after`); seedDiffs++; continue; }
      const scoreDiff = Math.abs(s.score - t.score) > 1e-6, staffDiff = !sameShifts(s.shifts, t.shifts);
      if (scoreDiff || staffDiff) {
        seedDiffs++;
        report.push(`- seed ${key(s)}: score ${s.score.toFixed(1)} vs ${t.score.toFixed(1)}${staffDiff ? `; staffing differs (${roomDiffs(s.shifts, t.shifts).length} rooms)` : ''}; deviators placed: ${[...new Set([...placedDeviators(s), ...placedDeviators(t)])].join(', ') || 'none'}`);
        for (const line of roomDiffs(s.shifts, t.shifts).slice(0, 6)) report.push(`    ${line}`);
      }
    }
    report.push(recsDiffer ? `Seed plans: ${a.seeds.length - seedDiffs} of ${a.seeds.length} identical.` : 'Recommendations identical; seed plans not compared separately.', '');
    // Recommendations, by layout.
    const recsB = new Map(b.recommendations.map(r => [r.id, r]));
    for (const r of a.recommendations) {
      const t = recsB.get(r.id);
      if (!t) { report.push(`- ${r.label}: missing after`); continue; }
      const same = Math.abs(r.score - t.score) <= 1e-6 && sameShifts(r.shifts, t.shifts);
      const completionOnly = !same && sameProduction(r.shifts, t.shifts);
      report.push(`- ${r.label}: funded score ${r.score.toFixed(0)} vs ${t.score.toFixed(0)}${same ? ', identical staffing' : `, products ${JSON.stringify(r.products) === JSON.stringify(t.products) ? 'same' : 'differ'}, ${roomDiffs(r.shifts, t.shifts).length} room-shifts differ${completionOnly ? ' (every Factory, Trading Post and Power Plant crew identical: the completion pass, not the search)' : ''}; deviators placed before: ${placedDeviators(r).join(', ') || 'none'}; after: ${placedDeviators(t).join(', ') || 'none'}`}`);
      if (!same) for (const line of roomDiffs(r.shifts, t.shifts).slice(0, 12)) report.push(`    ${line}`);
      if (!same && !completionOnly && mode === 'clean') { bugs++; report.push(`    **differs in a production crew with the deviating operators left out: a bug, not a listed correction**`); }
    }
    if (seedDiffs && mode === 'clean') { bugs++; report.push(`**seed plans differ with the deviating operators left out: a bug, not a listed correction**`); }
    report.push('');
    fs.writeFileSync(path.join(outDir, 'report.md'), report.join('\n') + '\n');
  }
}
report.push(bugs ? `${bugs} unexplained difference(s): see above.` : 'No production crew differs with the deviating operators left out; the remaining differences are the completion pass (support rooms and Dormitories) or whole-roster runs.');
fs.writeFileSync(path.join(outDir, 'report.md'), report.join('\n') + '\n');
console.log(`\n${report[report.length - 1]}\nreport: ${path.join(outDir, 'report.md')}`);
