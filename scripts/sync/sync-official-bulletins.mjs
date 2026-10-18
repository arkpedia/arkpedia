/**
 * The in-game notice boards of every region (en, jp, kr, cn), as derived facts in
 * data/official-bulletins.json: what each board announced, when, and -- for a headhunting
 * banner -- its pool id and its official art. The website news (sync-official-news.mjs,
 * sync-cn-news.mjs, sync-regional-schedules.mjs) is text; the board is what the game itself
 * shows, keyed the way the game's tables are.
 *
 * Two lists per region, both public JSON the client reads (scripts/lib/official-endpoints.mjs
 * says what these readers send and keep):
 *   - the webview board, `<prean>/api/game/bulletinList?target=Android`, and each new item's
 *     `/api/game/bulletin/<cid>`. A banner's item links into the game with
 *     `uniwebview://move?target=recruit&param1=<pool id>`, the gacha_table's id (the pool ids
 *     the banners in data/headhunting_banners.json carry). Its `bannerImageUrl` is the
 *     official art: hashed once (sha1 and size) and not kept.
 *   - the announcement list at network_config's `an` (en, jp, kr; CN's is dead, see
 *     DEAD_ANNOUNCEMENT_LISTS): id, group (ACTIVITY, SYSTEM), title and a month and day.
 *
 * Kept per item: id, kind, title, date, link, pool id, image address and hash, and the day
 * this reader first saw it. Never the notice's text or picture. The boards hold about a dozen
 * items each, so every item ever seen stays in the file: the history cannot be read back later.
 *
 * Ids are strings with leading zeros and in no order ("0593" after "8360"), so an item is new
 * when its id is not in the file, never by comparing numbers. A day that changes nothing writes
 * nothing. GET only: one list per board, one detail per new item, one image per new banner.
 *
 * A board that cannot be read keeps its region's facts as they were (kept-previous); an item
 * whose detail cannot be read is left out and asked for again the next run (omitted-new); a
 * board whose newest item is older than STALE_DAYS has probably moved while the address the
 * client carries did not, and is reported (kept-previous) with what it still lists.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beginStage, defaultNow } from '../lib/quarantine.mjs';
import { DEAD_ANNOUNCEMENT_LISTS, getBytes, getJson, REGIONS, regionNetwork } from '../lib/official-endpoints.mjs';

export const OFFICIAL_BULLETINS = 'data/official-bulletins.json';
/** The newest item of a live board is days old; one older than this is a board that moved. */
export const STALE_DAYS = 45;

const day = now => new Date(now).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** One line: the boards break titles with a literal "\n" (and sometimes a real one). */
export const cleanTitle = title => String(title ?? '').replace(/\\n|\n/g, ' ').replace(/\s+/g, ' ').trim();

/** `uniwebview://move?target=recruit&param1=LIMITED_EN_42_0_1` -> { target, param }, or null. */
export function parseJumpLink(link) {
  const text = String(link ?? '');
  const query = text.indexOf('?');
  if (query < 0) return null;
  const params = new URLSearchParams(text.slice(query + 1));
  const target = params.get('target');
  if (!target) return null;
  const param = params.get('param1');
  return param ? { target, param } : { target };
}

/** A banner when it links to the recruit screen with a pool id; otherwise the board's category:
 *  1 event or campaign, 2 the developers' news, anything else (4, merchandise and media) other. */
export function bulletinKind(category, link) {
  if (link?.target === 'recruit' && link.param) return 'banner';
  if (Number(category) === 1) return 'event';
  if (Number(category) === 2) return 'news';
  return 'other';
}

/** The announcement list dates a notice by month and day only. A month and day ahead of the run
 *  by more than a month is last year's (a December notice still listed in January). */
export function noticeDate(month, day_, now) {
  const today = new Date(now);
  const m = Number(month), d = Number(day_);
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  let year = today.getUTCFullYear();
  if (Date.UTC(year, m - 1, d) - today.getTime() > 31 * 86_400_000) year -= 1;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A notice page's address without the cache-busting `t` the list appends to it every time. */
export function stableUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('t');
    return parsed.href;
  } catch {
    return String(url ?? '');
  }
}

/** A bulletin record from the board's list item and its detail. */
export function bulletinRecord(item, detail, firstSeen) {
  const link = parseJumpLink(detail?.jumpLink);
  const kind = bulletinKind(item.category ?? detail?.category, link);
  const heading = cleanTitle(detail?.header);
  const imageUrl = String(detail?.bannerImageUrl ?? '').trim();
  return {
    id: String(item.cid),
    kind,
    category: Number(item.category ?? detail?.category),
    title: cleanTitle(item.title ?? detail?.title),
    ...(heading ? { heading } : {}),
    displayDate: String(item.displayTime ?? detail?.displayTime ?? ''),
    ...(link ? { link } : {}),
    ...(kind === 'banner' ? { poolId: link.param } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    firstSeen,
  };
}

const byDateThenId = date => (a, b) => (date(b) ?? '').localeCompare(date(a) ?? '') || b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id);

function listedBulletins(response, region) {
  const list = response?.data?.list;
  if (!Array.isArray(list) || list.some(item => typeof item?.cid !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(item?.displayTime ?? '')))) {
    throw new Error(`${region}'s webview board lists no items with their ids and dates: its layout has probably changed`);
  }
  return list;
}

function listedNotices(response, region) {
  const list = response?.announceList;
  if (!Array.isArray(list) || list.some(item => typeof item?.announceId !== 'string')) {
    throw new Error(`${region}'s announcement list names no notices: its layout has probably changed`);
  }
  return list;
}

export function readOfficialBulletins(root) {
  const file = path.join(root, OFFICIAL_BULLETINS);
  if (!fs.existsSync(file)) return { version: 1, regions: {} };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.version !== 1 || typeof data.regions !== 'object') throw new Error(`${OFFICIAL_BULLETINS} is not {"version":1,"regions":{...}}`);
  return data;
}

/**
 * Reads every region's boards into the file. Returns { problems: [{ key, action, reason }],
 * added: { region: count } }; writes the file only when what it says changed.
 */
export async function syncOfficialBulletins(root, { fetcher = globalThis.fetch, now = defaultNow(), pause = () => new Promise(resolve => setTimeout(resolve, 300)) } = {}) {
  const today = day(now);
  const before = readOfficialBulletins(root);
  const next = { version: 1, regions: {} };
  const problems = [], added = {};

  for (const region of REGIONS) {
    const previous = before.regions[region] ?? { bulletins: [], notices: [] };
    const bulletins = new Map((previous.bulletins ?? []).map(record => [record.id, record]));
    const notices = new Map((previous.notices ?? []).map(record => [record.id, record]));
    added[region] = 0;
    let network;
    try {
      network = await regionNetwork(region, fetcher);
    } catch (error) {
      console.warn(error.message);
      problems.push({ key: `official-bulletins:${region}`, action: 'kept-previous', reason: `The ${region} client's network_config could not be read; its notice boards keep what they last said.` });
      next.regions[region] = previous;
      continue;
    }

    try {
      const listed = listedBulletins(await getJson(`${network.prean}/api/game/bulletinList?target=Android`, fetcher), region);
      for (const item of listed) {
        if (bulletins.has(item.cid)) continue;
        try {
          const detail = (await getJson(`${network.prean}/api/game/bulletin/${encodeURIComponent(item.cid)}`, fetcher))?.data;
          if (!detail || String(detail.cid) !== item.cid) throw new Error('the detail names another item');
          bulletins.set(item.cid, bulletinRecord(item, detail, today));
          added[region]++;
        } catch (error) {
          console.warn(`${region} bulletin ${item.cid} could not be read: ${error.message}`);
          problems.push({ key: `official-bulletins:${region}:${item.cid}`, action: 'omitted-new',
            reason: `The ${region} in-game notice "${cleanTitle(item.title)}" (${item.cid}) could not be read; it is left out until it can be.` });
        } finally {
          await pause();
        }
      }
      const newest = listed.map(item => item.displayTime).sort().at(-1);
      if (newest && daysBetween(newest, today) > STALE_DAYS) {
        problems.push({ key: `official-bulletins:${region}:stale`, action: 'kept-previous',
          reason: `The ${region} in-game board's newest notice is from ${newest}: the board has probably moved, and its notices stop at that day.` });
      }
    } catch (error) {
      console.warn(error.message);
      problems.push({ key: `official-bulletins:${region}:board`, action: 'kept-previous', reason: `The ${region} in-game board could not be read; its notices stay as they were.` });
    }

    // Art hashed once: a record with an address and no hash is new, or one whose image failed.
    for (const record of bulletins.values()) {
      if (!record.image?.url || record.image.sha1) continue;
      try {
        const bytes = await getBytes(record.image.url, fetcher);
        record.image = { url: record.image.url, sha1: crypto.createHash('sha1').update(bytes).digest('hex'), bytes: bytes.length };
      } catch (error) {
        console.warn(`${region} bulletin ${record.id}'s image could not be hashed (asked again next run): ${error.message}`);
      } finally {
        await pause();
      }
    }

    if (network.an && !DEAD_ANNOUNCEMENT_LISTS.has(region)) {
      try {
        const listed = listedNotices(await getJson(network.an, fetcher), region);
        for (const item of listed) {
          if (notices.has(item.announceId)) continue;
          const date = noticeDate(item.month, item.day, now);
          notices.set(item.announceId, { id: item.announceId, group: String(item.group ?? ''), title: cleanTitle(item.title),
            ...(date ? { date } : {}), ...(item.webUrl ? { url: stableUrl(item.webUrl) } : {}), firstSeen: today });
          added[region]++;
        }
        const newest = listed.map(item => noticeDate(item.month, item.day, now)).filter(Boolean).sort().at(-1);
        if (newest && daysBetween(newest, today) > STALE_DAYS) {
          problems.push({ key: `official-bulletins:${region}:announcements-stale`, action: 'kept-previous',
            reason: `The ${region} in-game announcement list's newest notice is from ${newest}: the list has probably moved.` });
        }
      } catch (error) {
        console.warn(error.message);
        problems.push({ key: `official-bulletins:${region}:announcements`, action: 'kept-previous', reason: `The ${region} in-game announcement list could not be read; its notices stay as they were.` });
      }
    }

    next.regions[region] = {
      bulletins: [...bulletins.values()].sort(byDateThenId(record => record.displayDate)),
      notices: [...notices.values()].sort(byDateThenId(record => record.date)),
    };
  }

  const text = `${JSON.stringify(next, null, 1)}\n`;
  const file = path.join(root, OFFICIAL_BULLETINS);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
  return { problems, added };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  const stage = beginStage(root, 'official-bulletins');
  syncOfficialBulletins(root).then(({ problems, added }) => {
    for (const problem of problems) stage.add(problem);
    console.log(`Official notice boards: ${REGIONS.map(region => `${region} +${added[region] ?? 0}`).join(', ')}${problems.length ? `; ${problems.length} problem(s)` : ''}.`);
    stage.commit();
  }, error => {
    console.error(error);
    stage.add({ key: 'official-bulletins', action: 'kept-previous', reason: 'The official notice boards could not be read; the facts kept from earlier runs stand.' });
    stage.commit();
    process.exitCode = 1;
  });
}
