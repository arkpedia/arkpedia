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
 * A day the list page cannot be read is reported to the quarantine list (stage cn-news) and the
 * cached posts stand. One post that cannot be fetched, or holds no article this reader can find,
 * is that post's problem alone (cn-news:<cid>): the posts after it are still read, and it is
 * asked for again on every run while the list still shows it. Its entry reads the same whichever
 * it was (unreadPost); which one goes to the log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { newsLines } from '../build/official-news.mjs';
import { beginStage, readQuarantine } from '../lib/quarantine.mjs';

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
  // Each one `fetched: false` when its page could not be had at all, true when it holds no article.
  const unreadable = [];
  for (const post of fresh) {
    const url = `${SITE}/${post.cid}`;
    let html;
    try {
      html = await getText(url, fetcher);
    } catch (error) {
      console.warn(`CN news post ${url} could not be fetched: ${error.message}`);
      unreadable.push({ ...post, fetched: false });
      continue;
    } finally {
      await pause();
    }
    const lines = postLines(html, post.title);
    if (!lines) {
      console.warn(`CN news post ${url} holds no article this reader can find (no "${post.title}" heading, or no sign-off after it).`);
      unreadable.push({ ...post, fetched: true });
      continue;
    }
    fs.writeFileSync(path.join(dir, `${post.cid}.json`), `${JSON.stringify({ ...post, url, lines }, null, 1)}\n`);
  }
  return { fresh: fresh.length - unreadable.length, unreadable };
}

/** The quarantine entry of a post this run could not read. One wording, whether its page could
 *  not be had or held no article this reader can find: a post that failed one way one night and
 *  the other the next changed its reason, and data/quarantine.json, a release input, with it. */
export const unreadPost = ({ cid, title }) => ({ key: `cn-news:${cid}`, action: 'omitted-new',
  reason: `The CN announcement "${title}" (${SITE}/${cid}) could not be read; it is left out until it can be.` });

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  // What the last run reported for single posts: still unread on a day the list cannot be read.
  const unread = readQuarantine(root).entries.filter(entry => entry.stage === 'cn-news' && /^cn-news:\d+$/.test(entry.key));
  const stage = beginStage(root, 'cn-news');
  syncCnNews(root).then(({ fresh, unreadable }) => {
    for (const post of unreadable) stage.add(unreadPost(post));
    console.log(`CN news: ${fresh} new post(s)${unreadable.length ? `, ${unreadable.length} unreadable` : ''}.`);
    stage.commit();
  }, error => {
    console.error(error);
    stage.add({ key: 'cn-news', action: 'kept-previous', reason: 'The official CN news could not be read; the cached announcements stand.' });
    for (const { key, action, reason, sourceRef } of unread) stage.add({ key, action, reason, sourceRef });
    stage.commit();
  });
}
