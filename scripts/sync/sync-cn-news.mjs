#!/usr/bin/env node
/**
 * Caches Arknights CN's official activity announcements into data/official-news/cn/<cid>.json
 * ({ cid, title, displayTime, url, lines }): the "[活动预告]" previews name a coming event, its
 * banner with the rate-up operators and the exact opening hours about a week before the CN client
 * carries any of it. The catalogue reads them (scripts/build/cn-news.mjs) to publish the event and
 * banner on the day of the announcement. The official website is a source the user named for CN
 * news (2026-10-03), ahead of the wiki.
 *
 * The site (https://ak.hypergryph.com/news) is server-rendered and answers only a browser user
 * agent; its list page embeds the latest posts of each tab, the activity tab ("tab":"1") holding
 * about three months of previews, so a nightly read never misses one. Each post not cached yet is
 * fetched once: an announcement does not change, and a correction is a post of its own. GET only.
 * A day the site cannot be read is reported to the quarantine list (stage cn-news) and the cached
 * posts stand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { newsLines } from '../build/official-news.mjs';
import { beginStage } from '../lib/quarantine.mjs';

const SITE = 'https://ak.hypergryph.com/news';
export const CN_NEWS_DIR = 'data/official-news/cn';
// A cached post is <cid>.json; nothing else in the directory is one.
const POST_FILE = /^\d+\.json$/;
// The site sends a bare client a challenge page instead of the post.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function getText(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** The activity posts the list page embeds: [{ cid, title, displayTime }], each once. */
export function listedPosts(html) {
  const text = String(html ?? '').replace(/\\"/g, '"');
  const posts = new Map();
  for (const match of text.matchAll(/\{"cid":"(\d+)","tab":"(\d+)","sticky":(?:true|false),"title":"((?:[^"\\]|\\.)*)","author":"(?:[^"\\]|\\.)*","displayTime":(\d+)/g)) {
    if (match[2] === '1' && !posts.has(match[1])) posts.set(match[1], { cid: match[1], title: match[3], displayTime: Number(match[4]) });
  }
  return [...posts.values()];
}

/** A post page's article as lines: the server-rendered body, from the title to the sign-off. */
export function postLines(html, title) {
  const page = String(html ?? '');
  const bodyAt = page.indexOf('<body'), scriptAt = page.indexOf('<script', bodyAt);
  // The body up to its first script (the page's data, not its text), or to the end if it has none.
  const body = bodyAt < 0 ? '' : page.slice(bodyAt, scriptAt < 0 ? undefined : scriptAt);
  const lines = newsLines(body);
  const start = lines.indexOf(title);
  // The sign-off ends an announcement. A post without one (a fan contest) runs on into the page's
  // own navigation, which opens with INFO / 返回列表 ("back to the list") under the article and
  // reaches the footer's ARKNIGHTS after it, so whichever comes first ends the article.
  const end = lines.findIndex((line, i) => i > start && /^(?:【明日方舟】运营组|INFO|返回列表|ARKNIGHTS)$/.test(line));
  if (start < 0 || end < 0) return null;
  // The date under the title ("2026 // 10 / 03") is the list's displayTime already.
  return lines.slice(start + 1, end).filter(line => !/^\d{4} \/\/ \d{2} \/ \d{2}$/.test(line));
}

/** The cached posts, for the catalogue (scripts/build/cn-news.mjs reads them), in cid order; none
 *  before the first sync. */
export function readCnNews(root) {
  const dir = path.join(root, CN_NEWS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(file => POST_FILE.test(file)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)))
    .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
}

export async function syncCnNews(root, { fetcher = globalThis.fetch, pause = () => new Promise(resolve => setTimeout(resolve, 500)) } = {}) {
  const dir = path.join(root, CN_NEWS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const cached = new Set(fs.readdirSync(dir).filter(file => POST_FILE.test(file)).map(file => file.slice(0, -5)));
  const listed = listedPosts(await getText(SITE, fetcher));
  if (!listed.length || listed.some(post => !Number.isFinite(post.displayTime) || post.displayTime <= 0)) {
    throw new Error('the news page lists no activity posts with their dates: its layout has probably changed');
  }
  const fresh = listed.filter(post => !cached.has(post.cid));
  const unreadable = [];
  for (const post of fresh) {
    const url = `${SITE}/${post.cid}`;
    const lines = postLines(await getText(url, fetcher), post.title);
    await pause();
    if (!lines) { unreadable.push(post); continue; }
    fs.writeFileSync(path.join(dir, `${post.cid}.json`), `${JSON.stringify({ ...post, url, lines }, null, 1)}\n`);
  }
  return { fresh: fresh.length - unreadable.length, unreadable };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  const stage = beginStage(root, 'cn-news');
  syncCnNews(root).then(({ fresh, unreadable }) => {
    for (const post of unreadable) {
      stage.add({ key: `cn-news:${post.cid}`, action: 'omitted-new', reason: `The CN announcement "${post.title}" (${SITE}/${post.cid}) has no article this reader can find; it is left out until it can be read.` });
    }
    console.log(`CN news: ${fresh} new post(s)${unreadable.length ? `, ${unreadable.length} unreadable` : ''}.`);
    stage.commit();
  }, error => {
    console.error(error);
    stage.add({ key: 'cn-news', action: 'kept-previous', reason: 'The official CN news could not be read; the cached announcements stand.' });
    stage.commit();
  });
}
