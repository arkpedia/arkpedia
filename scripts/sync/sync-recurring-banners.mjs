#!/usr/bin/env node
/**
 * Add recurring Global Standard and Kernel banners from current sources.
 *
 * The client table is authoritative for exact start/end timestamps. It also
 * contains the Kernel rate-up character ids. Standard rate-ups are not present
 * in the client table, so those names come from the structured yearly banner
 * table on Arknights Terra Wiki and are accepted only when the row has an exact
 * matching client window. This prevents a stale or speculative wiki row from
 * becoming a live countdown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CLIENT_BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel';
const WIKI_API = 'https://arknights.wiki.gg/api.php';
const CLIENT_SOURCE = `${CLIENT_BASE}/gacha_table.json`;

function serverDate(timestamp, utcOffsetHours = -7) {
  const date = new Date((timestamp + utcOffsetHours * 3600) * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
}

function isoEnd(timestamp) {
  return new Date((timestamp + (timestamp % 60 === 59 ? 1 : 0)) * 1000).toISOString();
}

function parseFields(block) {
  const fields = {};
  for (const line of block.split('\n')) {
    const match = /^\s*\|\s*([^=]+?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

export function parseRecurringWikiRows(wikitext) {
  const rows = [];
  for (const match of wikitext.matchAll(/\{\{Banners cell\s*([\s\S]*?)\}\}/g)) {
    const row = parseFields(match[1]);
    if (!['standard', 'kernel'].includes(row.type) || !/^\d+$/.test(row.no || '')) continue;
    const start = /^(\d{4}\/\d{2}\/\d{2})\s+\d{2}:\d{2}:\d{2}$/.exec(row.start || '');
    const end = /^(\d{4}\/\d{2}\/\d{2})\s+\d{2}:\d{2}:\d{2}$/.exec(row.end || '');
    const operators = (row.operators || '').split(',').map((name) => name.trim()).filter(Boolean);
    if (!start || !end || operators.length !== 5) continue;
    rows.push({ type: row.type, number: Number(row.no), start: start[1], end: end[1], operators });
  }
  return rows;
}

function clientRows(gachaTable, type) {
  const rule = type === 'standard' ? 'DOUBLE' : 'CLASSIC_DOUBLE';
  return (gachaTable.gachaPoolClient || []).filter((row) => row.gachaRuleType === rule
    && row.openTime && row.endTime && row.endTime - row.openTime <= 15 * 86400);
}

function operatorRarity(name, roster) {
  const rarity = roster.get(name);
  if (rarity !== 5 && rarity !== 6) throw new Error(`Recurring banner references an unknown 5/6-star operator: ${name}`);
  return rarity;
}

function namesFromKernelClient(row, characters) {
  const ids = [row.dynMeta?.main6RarityCharId, row.dynMeta?.sub6RarityCharId, ...(row.dynMeta?.rare5CharList || [])];
  if (ids.some((id) => !id || !characters[id]?.name)) {
    throw new Error(`Kernel client row ${row.gachaPoolId} has incomplete rate-up metadata`);
  }
  return ids.map((id) => characters[id].name);
}

export function reconcileRecurringBanners({ banners, gachaTable, characters, wikiRows, roster }) {
  const next = structuredClone(banners);
  const additions = [];
  const existing = new Set(next.map((banner) => banner.name));

  for (const type of ['standard', 'kernel']) {
    const shipped = clientRows(gachaTable, type);
    for (const wiki of wikiRows.filter((row) => row.type === type).sort((a, b) => a.number - b.number)) {
      const name = `${type === 'standard' ? 'Standard Pool' : 'Kernel'} #${wiki.number} (Global)`;
      if (existing.has(name)) continue;
      const client = shipped.find((row) => serverDate(row.openTime) === wiki.start && serverDate(row.endTime) === wiki.end);
      if (!client) continue;

      if (type === 'kernel') {
        const clientNames = new Set(namesFromKernelClient(client, characters));
        if (clientNames.size !== wiki.operators.length || wiki.operators.some((operator) => !clientNames.has(operator))) {
          throw new Error(`${name} rate-ups disagree between client data and the wiki`);
        }
      }

      const sixStars = wiki.operators.filter((operator) => operatorRarity(operator, roster) === 6);
      const fiveStars = wiki.operators.filter((operator) => operatorRarity(operator, roster) === 5);
      if (sixStars.length !== 2 || fiveStars.length !== 3) throw new Error(`${name} does not contain two 6-stars and three 5-stars`);

      const imageName = name.replace('#', '');
      const banner = {
        name,
        category: type === 'standard' ? 'standard_pool' : 'kernel',
        cn_date: null,
        global_date: `${wiki.start}–${wiki.end}`,
        global_date_estimated: false,
        global_window: {
          startAt: new Date(client.openTime * 1000).toISOString(),
          endAt: isoEnd(client.endTime),
          timingSource: CLIENT_SOURCE,
        },
        banner_image: `/headhunting-banner-images/${imageName}.webp`,
        year: Number(wiki.start.slice(0, 4)),
        four_stars: [],
        five_stars: fiveStars,
        rate_up_six_stars: [],
        six_stars: sixStars,
        pull_type: type,
        linked_event: null,
      };
      next.push(banner);
      existing.add(name);
      additions.push(name);
    }
  }
  return { banners: next, additions };
}

async function json(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Arkpedia-refresh/1.0 (+https://arkpedia.net)' } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function readTable(root, file) {
  const cached = path.join(root, '.cache/upstream/en-gamedata/en/gamedata/excel', file);
  try {
    // This command is also useful standalone. Prefer the current published
    // table so a stale local cache cannot hide the banner that triggered the
    // refresh; the workflow cache remains a network-failure fallback.
    return await json(`${CLIENT_BASE}/${file}`);
  } catch (error) {
    if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
    throw error;
  }
}

export async function syncRecurringBanners(root = process.cwd()) {
  const bannersAt = path.join(root, 'data/headhunting_banners.json');
  const operatorFolders = fs.readdirSync(path.join(root, 'data')).filter((name) => /^operators-[1-6]star$/.test(name));
  const roster = new Map();
  for (const folder of operatorFolders) {
    for (const file of fs.readdirSync(path.join(root, 'data', folder)).filter((name) => name.endsWith('.json'))) {
      const operator = JSON.parse(fs.readFileSync(path.join(root, 'data', folder, file), 'utf8'));
      roster.set(operator.name, operator.rarity);
    }
  }
  const year = new Date().getUTCFullYear();
  const wikiUrl = `${WIKI_API}?action=parse&page=${encodeURIComponent(`Headhunting/Banners/${year}`)}&prop=wikitext&format=json&origin=*`;
  const [gachaTable, characters, wiki] = await Promise.all([
    readTable(root, 'gacha_table.json'),
    readTable(root, 'character_table.json'),
    json(wikiUrl),
  ]);
  const banners = JSON.parse(fs.readFileSync(bannersAt, 'utf8'));
  const result = reconcileRecurringBanners({
    banners,
    gachaTable,
    characters,
    wikiRows: parseRecurringWikiRows(wiki.parse?.wikitext?.['*'] || ''),
    roster,
  });
  if (result.additions.length) fs.writeFileSync(bannersAt, `${JSON.stringify(result.banners, null, 2)}\n`);
  return result.additions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const additions = await syncRecurringBanners();
  console.log(additions.length ? `Added recurring banners:\n${additions.map((name) => `  + ${name}`).join('\n')}` : 'Recurring banners are current.');
}
