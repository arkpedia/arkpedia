/**
 * The imported Pull History as CSV (components/account/PullHistory.tsx, Export CSV): one row per
 * pull, oldest first, in columns a spreadsheet charts as they are, the way the Gacha Simulator's
 * export writes them (lib/gacha/historyCsv.ts): numbers as numbers, yes / no as 1 / 0, a byte-order
 * mark and CRLF lines.
 *
 * Every name, rarity and count is the one the page shows: the labels come from pullLabels, which
 * the page reads too, and `pity` counts as the page's "since the last 6★" does (bannerPulls): per
 * banner, the pulls this six-star took counting itself, on any other row the pulls since that
 * banner's last six-star, so a banner's latest row is the number its line on the page shows.
 */
import { pullSessions, type PullHistory, type PullRecord } from '@/lib/account/pulls';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

export const PULL_HISTORY_CSV_COLUMNS = ['pull', 'time_utc', 'banner', 'pool_id', 'operator', 'rarity', 'pity', 'ten_pull', 'six_star_total', 'five_star_total'] as const;

/** How the page and the CSV name a pull: a pull's rarity and name are the id map's where it has
 *  the operator, the Account Center's otherwise; a banner is named by its record (the map's
 *  pools), else by the Account Center, else by its pool id. */
export function pullLabels(history: PullHistory, map: GameAccountMap) {
  const known = (row: PullRecord) => map.chars[row.char];
  return {
    rarity: (row: PullRecord) => known(row)?.rarity ?? row.star ?? 3,
    operatorName: (row: PullRecord) => known(row)?.name ?? history.names[row.char] ?? row.char,
    bannerName: (pool: string) => map.pools?.[pool] ?? history.pools[pool] ?? pool,
  };
}

/** The file's name, "arkpedia-pull-history-2026-10-06.csv": the day is read when the reader
 *  presses Export, in an event, never during a render. */
export function pullHistoryCsvFilename(now = new Date()): string {
  return `arkpedia-pull-history-${now.toISOString().slice(0, 10)}.csv`;
}

/** A field as CSV writes it: quoted when it holds a comma, a quote or a line break. */
function field(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The history (its rows newest first, as the record keeps them) as CSV. */
export function pullHistoryCsv(history: PullHistory, map: GameAccountMap): string {
  const labels = pullLabels(history, map);
  // A press of ten (or of one): a ten-pull's rows share their time and pool.
  const batchSize = new Map(pullSessions(history.rows).map((session) => [`${session.at}|${session.pool}`, session.rows.length]));
  const pity = new Map<string, number>();
  let six = 0, five = 0;
  // Oldest first, as bannerPulls counts: a ten-pull's rows reversed with the rest.
  const rows = [...history.rows].reverse().map((row, index) => {
    const stars = labels.rarity(row);
    const sinceLast = (pity.get(row.pool) ?? 0) + 1;
    pity.set(row.pool, stars === 6 ? 0 : sinceLast);
    if (stars === 6) six += 1;
    if (stars === 5) five += 1;
    return [index + 1, new Date(row.at * 1000).toISOString().replace('.000Z', 'Z'), labels.bannerName(row.pool), row.pool,
      labels.operatorName(row), stars, sinceLast, (batchSize.get(`${row.at}|${row.pool}`) ?? 1) > 1 ? 1 : 0, six, five];
  });
  // A byte-order mark, so a spreadsheet reads names like Młynar as UTF-8.
  return `﻿${[PULL_HISTORY_CSV_COLUMNS, ...rows].map((row) => row.map(field).join(',')).join('\r\n')}\r\n`;
}
