#!/usr/bin/env node
/**
 * Caches Arknights Global's official event announcements into data/official-news/global/<id>.json
 * ({ id, title, publishTime, url, lines }), for build-event-rewards.mjs to read packs, gifts and
 * the like from (scripts/build/official-news.mjs). The official website is a source the user named
 * for news (2026-10-03), ahead of the wiki.
 *
 * Reads the public list, newest first, page by page until a page holds nothing new, and fetches
 * each event post not cached yet: about two GETs on a quiet day, the whole archive (193 posts back
 * to January 2020) on the first run. A post is never refetched: an announcement does not change.
 * GET only. A day the site cannot be read is reported to the quarantine list (stage
 * official-news) and the cached posts stand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { newsLines } from '../build/official-news.mjs';
import { beginStage } from '../lib/quarantine.mjs';

const API = 'https://www.arknights.global/api/resource/news';
export const NEWS_DIR = 'data/official-news/global';
// A cached post is <id>.json; nothing else in the directory is one.
const POST_FILE = /^\d+\.json$/;
const PAGE = 30;

async function getJson(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'Arkpedia-refresh/1.0 (+https://arkpedia.net)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body?.code !== 0 || !body.data) throw new Error('unexpected response');
  return body.data;
}

/** The cached posts, for build-event-rewards.mjs, in file-name order; none before the first sync. */
export function readOfficialNews(root) {
  const dir = path.join(root, NEWS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(file => POST_FILE.test(file)).sort().map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
}

export async function syncOfficialNews(root, { fetcher = globalThis.fetch, pause = () => new Promise(resolve => setTimeout(resolve, 300)) } = {}) {
  const dir = path.join(root, NEWS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const cached = new Set(fs.readdirSync(dir).filter(file => POST_FILE.test(file)).map(file => Number(file.slice(0, -5))));
  const fresh = [];
  for (let index = 1; index <= 50; index++) {
    const { rows } = await getJson(`${API}/list?index=${index}&size=${PAGE}&type=latest`, fetcher);
    if (!Array.isArray(rows) || !rows.length) break;
    const unseen = rows.filter(row => row.type === 'event' && !cached.has(row.id));
    fresh.push(...unseen);
    if (!unseen.length && index > 1) break;
    if (rows.length < PAGE) break;
  }
  for (const row of fresh) {
    const post = await getJson(`${API}/detail?id=${row.id}`, fetcher);
    const record = { id: post.id ?? row.id, title: post.title ?? row.title, publishTime: post.publishTime ?? row.publishTime, url: `https://www.arknights.global/news/${row.id}`, lines: newsLines(post.content) };
    fs.writeFileSync(path.join(dir, `${record.id}.json`), `${JSON.stringify(record, null, 1)}\n`);
    await pause();
  }
  return fresh.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  const stage = beginStage(root, 'official-news');
  syncOfficialNews(root).then(count => {
    console.log(`Official news: ${count} new post(s).`);
    stage.commit();
  }, error => {
    console.error(error);
    stage.add({ key: 'official-news:global', action: 'kept-previous', reason: 'The official Global news could not be read; the cached announcements stand.' });
    stage.commit();
  });
}
