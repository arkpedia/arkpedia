/**
 * The Gacha Simulator's pull history as CSV (pages/gacha.tsx, Export CSV): one row per pulled
 * operator, oldest first, in columns a spreadsheet charts as they are -- numbers as numbers, yes /
 * no as 1 / 0. A ten-pull is ten rows with ten pull numbers. A guaranteed bonus (the 300-pull
 * limited copy) is a row of its own that shares the pull number it came with and adds nothing to
 * the pity count, as the history on the page counts it.
 */
import type { PulledItem } from './gachaTypes';

export const HISTORY_CSV_COLUMNS = ['pull', 'operator', 'rarity', 'featured', 'rate_up', 'bonus', 'guarantee', 'pity', 'six_star_total', 'five_star_total', 'banner', 'banner_type'] as const;

/** The file's name: the banner and the day it was saved, "arkpedia-pulls-<banner>-2026-10-06.csv".
 *  The day is read when the reader presses Export, in an event, never during a render. */
export function historyCsvFilename(bannerName: string, now = new Date()): string {
  const slug = bannerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'banner';
  return `arkpedia-pulls-${slug}-${now.toISOString().slice(0, 10)}.csv`;
}

/** A field as CSV writes it: quoted when it holds a comma, a quote or a line break. */
function field(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** `history` oldest first, as GachaState keeps it. */
export function pullHistoryCsv(history: PulledItem[], banner: { name: string; type: string }): string {
  const rows: (string | number)[][] = [];
  let pull = 0, pity = 0, six = 0, five = 0;
  for (const item of history) {
    if (!item.isBonus) { pull += 1; pity += 1; }
    if (item.rarity === 6) six += 1;
    if (item.rarity === 5) five += 1;
    // The pulls this six-star took, counting itself; on any other row, the pulls since the last one.
    rows.push([pull, item.name, item.rarity, item.isFeatured ? 1 : 0, item.isRateUp ? 1 : 0, item.isBonus ? 1 : 0,
      item.featuredGuaranteeEvent === 'guarantee' || item.crossoverFiveStarGuarantee ? 1 : 0, item.isBonus ? '' : pity, six, five, banner.name, banner.type]);
    if (item.rarity === 6 && !item.isBonus) pity = 0;
  }
  // A byte-order mark, so a spreadsheet reads names like Młynar as UTF-8.
  return `﻿${[HISTORY_CSV_COLUMNS, ...rows].map((row) => row.map(field).join(',')).join('\r\n')}\r\n`;
}
