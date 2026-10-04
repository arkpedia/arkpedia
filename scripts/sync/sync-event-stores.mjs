#!/usr/bin/env node
/**
 * Writes data/event-stores.json: each event's store, as arknights.wiki.gg lists it -- an original
 * run's on the event's page, a rerun's on its "/Rerun" page (a rerun sells its own store: tokens
 * for the operator, other stock). Neither the game tables nor the official announcements carry a
 * store's listings (the server sends them; the announcements say "..., etc."), so this is the
 * wiki as a named gap filler (2026-10-03: the wiki only for what the datamining is missing). It
 * replaces the one-off wiki import in the event records (`rewards`), which never refreshed and
 * left "Furniture not found" placeholders.
 *
 * A store is one {{Event store head}} ... {{Event store cell|...}} run on the page, named by the
 * heading above it; a cell is item=Name,qty | furniture=Name | outfit=Name | upware=Name, with
 * price=Currency,amount and stock=N.
 *
 * Fetching: a page parsed before is kept (data/wiki-cache/event-stores/<page>.json) and fetched
 * again only while its event is running or ahead, or ended in the last 30 days; the rest of the
 * archive never changes. About ten GETs a day after the first run (one per event, ~200). A page
 * that cannot be read keeps its last parse and is reported to the quarantine list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beginStage } from '../lib/quarantine.mjs';

const API = 'https://arknights.wiki.gg/api.php';
const USER_AGENT = 'Arkpedia-refresh/1.0 (+https://arkpedia.net)';
export const CACHE = 'data/wiki-cache/event-stores';
const DAY = 86_400_000;

/** The event's name without its "[Side Story]"-style prefix. */
const title = name => String(name ?? '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
/** The wiki page an event's store is on: the event's, or for a rerun its "/Rerun" subpage. */
export function storePage(name) {
  const rerun = /^\[Rerun\]/.test(name) || /\sRerun$/.test(name);
  const base = title(name).replace(/\s+Rerun$/, '');
  return rerun ? `${base}/Rerun` : base;
}

/** "Name,qty" as [name, qty]; a name may itself hold commas ("People, A People Token,5"). */
function nameCount(value) {
  const match = String(value ?? '').trim().match(/^(.*?)(?:,\s*([\d,]+))?$/);
  return [match[1].trim(), match[2] ? Number(match[2].replace(/,/g, '')) : 1];
}

/** The stores on a page's wikitext: [{ name, currency, items: [{ name, type, quantity, price, stock }] }]. */
export function parseStores(wikitext) {
  const stores = [];
  let heading = null;
  let current = null;
  for (const line of String(wikitext ?? '').split('\n')) {
    const h = line.match(/^=+\s*(.*?)\s*=+\s*$/);
    if (h) { heading = h[1].replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1'); current = null; continue; }
    for (const cell of line.matchAll(/\{\{Event store cell\|([^}]*)\}\}/g)) {
      const params = Object.fromEntries(cell[1].split('|').map(part => {
        const at = part.indexOf('=');
        return at < 0 ? [part.trim(), ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
      }));
      const kind = ['item', 'furniture', 'outfit', 'upware'].find(k => params[k]);
      if (!kind) continue;
      const [name, quantity] = kind === 'item' ? nameCount(params.item) : [params[kind], 1];
      const [currency, price] = nameCount(params.price);
      if (!current) {
        current = { name: heading ?? 'Event Store', currency, items: [] };
        stores.push(current);
      }
      current.items.push({
        name,
        type: kind === 'item' ? 'material' : kind === 'outfit' ? 'skin' : kind,
        quantity,
        price: params.price ? price : null,
        stock: params.stock && /^\d+$/.test(params.stock) ? params.stock : 'unlimited',
        ...(params.cert ? { ambience: Number(params.cert) || null } : {}),
      });
    }
  }
  return stores;
}

async function wikitext(page, fetcher) {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&redirects=1`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) return null;
  return { title: body.parse.title, text: body.parse.wikitext['*'] };
}

/** The window an event record gives (Global first, else CN), as [start, end] instants. */
function window(event) {
  const range = String(event?.global?.dateRange || event?.cn?.dateRange || '');
  const dates = [...range.matchAll(/(\d{4})\/(\d{2})\/(\d{2})/g)].map(m => Date.UTC(+m[1], m[2] - 1, +m[3]));
  return dates.length ? [dates[0], dates[1] ?? dates[0]] : null;
}

export async function syncEventStores(root, { fetcher = globalThis.fetch, now = Date.now(), pause = () => new Promise(resolve => setTimeout(resolve, 500)), report = () => {} } = {}) {
  const events = fs.readdirSync(path.join(root, 'data/events')).filter(file => /^events_\d+\.json$/.test(file))
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(root, 'data/events', file), 'utf8')));
  const cacheDir = path.join(root, CACHE);
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = {};
  let fetched = 0;
  for (const event of events) {
    const page = storePage(event.name);
    const file = path.join(cacheDir, `${page.replace(/[\\/:*?"<>|]/g, '_')}.json`);
    const cached = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const span = window(event);
    const live = !span || span[1] + 30 * DAY >= now;
    let entry = cached;
    if (!cached || live) {
      try {
        const got = await wikitext(page, fetcher);
        fetched++;
        await pause();
        if (got) {
          entry = { page: got.title, source: `https://arknights.wiki.gg/wiki/${encodeURIComponent(got.title.replace(/ /g, '_'))}`, stores: parseStores(got.text) };
          if (JSON.stringify(entry) !== JSON.stringify(cached)) fs.writeFileSync(file, `${JSON.stringify(entry, null, 1)}\n`);
        }
      } catch (error) {
        report(event.name, error);
      }
    }
    if (entry?.stores?.length) out[event.name] = entry;
  }
  return { stores: out, fetched };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  const stage = beginStage(root, 'event-stores');
  syncEventStores(root, {
    report: (name, error) => {
      console.error(`${name}: ${error.message}`);
      stage.add({ key: `event-store:${name}`, action: 'kept-previous', reason: `${name}: its wiki store page could not be read; the last parse stands.` });
    },
  }).then(({ stores, fetched }) => {
    const text = `${JSON.stringify({ about: 'Each event\'s store from the Arknights wiki (scripts/sync/sync-event-stores.mjs), a rerun\'s from its /Rerun page. Generated every refresh: do not edit.', events: stores }, null, 1)}\n`;
    const file = path.join(root, 'data/event-stores.json');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
    stage.commit();
    console.log(`Event stores: ${Object.keys(stores).length} events, ${fetched} page(s) read.`);
  }, error => { console.error(error); process.exitCode = 1; });
}
