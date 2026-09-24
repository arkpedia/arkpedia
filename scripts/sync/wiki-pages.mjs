/**
 * The structured wiki pages the daily refresh reads, as enrichment that can never hold
 * the release back. The game tables decide what exists; these pages add English names
 * and the lineups the tables leave out. So a page that cannot be used today -- the wiki
 * is down, the page moved behind a redirect, was deleted, or was reformatted so that no
 * row parses where there were rows, or too few of them (see shrinkProblem) -- is read
 * from its last good copy, and the problem is reported to the quarantine list instead of
 * thrown.
 *
 * The last good copy is the page's parsed rows, kept in data/wiki-cache/<page>.json.
 * It is a data file, published with the release and hydrated into the next run, so it
 * survives the runner. It is rewritten only when the rows change, and holds no timestamp
 * but the day a shrink began (below): a page that did not change leaves the file alone,
 * and an unchanged day publishes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { wikiBase, wikiParseUrl, wikiText, parseWikiRows } from './catalogue-model.mjs';

export const WIKI_CACHE = 'data/wiki-cache';
// wiki.gg refuses requests that do not say who is asking.
const USER_AGENT = 'Arkpedia-refresh/1.0 (+https://arkpedia.net)';

export const wikiCacheFile = (root, page) => path.join(root, WIKI_CACHE, `${page.replaceAll('/', '-')}.json`);
/*
 * A page that parses to fewer rows than it held has most likely been reformatted under the
 * parser -- rows moved into another template, a nested template cutting cells short -- not
 * emptied. How few is too few depends on the page:
 *
 * A year's banner page (Headhunting/Banners/<year>) only grows during its year, so ANY
 * shrink from its last good copy is suspect.
 *
 * The Upcoming pages lose rows as Global catches up: the wiki moves a banner row to the
 * yearly page once Global dates the banner, and an event row off the page once Global
 * schedules the event. So a row that left is first looked for where it went -- `movedTo`,
 * which the caller must give for these pages (sync-catalogue.mjs: the yearly page's rows,
 * the Global client's activity table) -- and a read whose every lost row turned up there is
 * taken. The rows date only the CN run, so a date accounts for nothing: a CN window long over
 * stays Upcoming until Global dates it. Otherwise the page is judged by half -- of the most
 * rows it held within PEAK_DAYS, less the rows found moved, not of yesterday's copy, or a
 * page could lose half its rows every day, each loss taken as the next day's yardstick. The
 * cache keeps that count as `peak` ({rows, since}) while it is above the rows it holds, set
 * on the day a shrink is taken and dropped once the page grows back past it. Pages this
 * small are not judged.
 *
 * A shrink is never taken silently. One held back stays held back, and reported (overdue
 * after three days, like any quarantined record), until the rows it lost turn up where they
 * went, the page grows back, or a maintainer accepts it by deleting the page's cache file in
 * arkpedia-data: the peak it was judged by is marked `held` on the first day, and a held peak
 * does not run out. The day the hold ends rewrites the cache without the mark.
 */
export const SHRINK_JUDGED_FROM = 6;
export const PEAK_DAYS = 7;
const onlyGrows = page => /^Headhunting\/Banners\/\d{4}$/.test(page);
const utcDay = now => now.toISOString().slice(0, 10);
const daysFrom = (since, today) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
/** The most rows the page held within PEAK_DAYS, or since the shrink it holds back, by the last good copy. */
function heldPeak(cached, today) {
  const peak = cached?.peak;
  const live = peak && Number.isInteger(peak.rows) && (peak.held === true || daysFrom(peak.since, today) <= PEAK_DAYS) ? peak : null;
  return live && live.rows > cached.rows.length ? live : null;
}
/** How many rows of the last good copy today's read lacks, and how many of those turned up where the wiki moves them. */
function rowsLeft(cached, rows, movedTo) {
  const kept = new Set(rows.map(row => JSON.stringify(row)));
  const left = (cached?.rows ?? []).filter(row => !kept.has(JSON.stringify(row)));
  return { left: left.length, moved: movedTo ? left.filter(row => movedTo.has(row)).length : 0 };
}
/** Why today's rows are too few to take over the last good copy, or null. The words hold no
 * count of today's rows: the reason is a release input, and the good copy stands meanwhile. */
function shrinkProblem(page, template, rows, cached, today, { left, moved }, movedTo) {
  const had = cached?.rows.length ?? 0;
  // Every row that left turned up where the wiki moves it: Global caught up on them.
  if (!onlyGrows(page) && left === moved) return null;
  if (!rows.length && had) return `it has no "${template}" row that parses, where the last good read had ${had}; the template or its fields have probably changed`;
  if (onlyGrows(page)) return rows.length < had ? `fewer "${template}" rows parse than its last good read had, and a year's banner page only grows; rows have probably moved to another template or been cut short` : null;
  const held = Math.max(had, heldPeak(cached, today)?.rows ?? 0) - moved;
  if (held >= SHRINK_JUDGED_FROM && rows.length < held / 2) {
    return `fewer than half the "${template}" rows it recently held parse, not counting rows that moved ${movedTo.name}; most of the page has probably been reformatted`;
  }
  return null;
}
/** The peak a taken read leaves in the cache: the running one (less the rows that moved) while
 * it stands above the rows, else the count before today's shrink, from today. Never held. */
function nextPeak(page, rows, cached, today, moved) {
  if (onlyGrows(page) || !cached) return null;
  const top = heldPeak(cached, today) ?? { rows: cached.rows.length, since: today };
  const rest = top.rows - moved;
  return rest > rows.length && daysFrom(top.since, today) <= PEAK_DAYS ? { rows: rest, since: top.since } : null;
}
const writeCache = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
export const wikiPageUrl = page => `${wikiBase()}/wiki/${encodeURI(page.replaceAll(' ', '_'))}`;

/* Why a request for the page failed, in words that stay the same while the problem does:
   the reason is published in data/quarantine.json, a release input, so an outage that
   answers 502 one day, refuses the connection the next and serves a maintenance page (or a
   403 challenge) the day after must not read as a new problem each day. Every failure of the
   request itself -- no answer, an HTTP error of any status, an answer that is not the API's
   JSON -- is this one kind; the exact error goes to the log. A page the wiki does serve but
   that cannot be used (missing, still a redirect) keeps wikiText's own words, which name the
   page's state. */
const UNREACHABLE = 'the wiki could not be reached';
class RequestFailed extends Error {}

async function fetchWikiJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new RequestFailed(UNREACHABLE, { cause: error });
  }
}

function lastGoodRead(file) {
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(cached?.rows) ? cached : null;
  } catch {
    return null;
  }
}

/**
 * The rows of one structured page, never throwing over anything the wiki does. `alerts` is a
 * quarantine stage (scripts/lib/quarantine.mjs); `write: false` leaves the cache untouched (dry
 * runs). A page that loses rows as Global catches up (every page but a year's banner page)
 * needs `movedTo`: { name, has(row) }, where the wiki moves a row that leaves it (see the top);
 * leaving it out is a bug in the caller, and throws.
 */
export async function readWikiRows(root, page, template, { now = new Date(), alerts, write = true, movedTo } = {}) {
  if (!onlyGrows(page) && (typeof movedTo?.name !== 'string' || typeof movedTo.has !== 'function')) {
    throw new TypeError(`readWikiRows(${page}) needs movedTo: { name, has(row) }, to tell a row Global caught up on from a row the page lost`);
  }
  const file = wikiCacheFile(root, page);
  const cached = lastGoodRead(file);
  const today = utcDay(now);
  let rows, problem;
  try {
    const text = wikiText(page, await fetchWikiJson(wikiParseUrl(page)), now);
    // The only excused absence: this year's banner page before the wiki creates it.
    if (!text) {
      console.warn(`${page} does not exist on the wiki yet; reading it as no rows until the end of January (UTC).`);
      return [];
    }
    rows = parseWikiRows(text, template);
  } catch (error) {
    const exact = error instanceof RequestFailed ? error.cause : error;
    const cause = exact.cause?.code ?? exact.cause?.message;
    console.warn(`Reading ${page} failed: ${exact.message}${cause ? ` (${cause})` : ''}`);
    problem = error.message;
  }
  if (rows) {
    const gone = rowsLeft(cached, rows, onlyGrows(page) ? null : movedTo);
    // No row where there were rows is a template or field rename, not a quiet day.
    const shrunk = shrinkProblem(page, template, rows, cached, today, gone, movedTo);
    if (!shrunk) {
      // The same rows leave the file alone, whatever became of the peak meanwhile -- unless
      // they end a hold, whose mark comes off.
      if (write && (JSON.stringify(cached?.rows) !== JSON.stringify(rows) || cached?.peak?.held)) {
        const peak = nextPeak(page, rows, cached, today, gone.moved);
        writeCache(file, { page, template, rows, ...(peak ? { peak } : {}) });
      }
      return rows;
    }
    // Held back until the lost rows are accounted for: the peak it is judged by stops running out.
    const peak = heldPeak(cached, today);
    if (write && peak && !peak.held) writeCache(file, { ...cached, peak: { ...peak, held: true } });
    problem = `${shrunk}. If it really lost them, delete source/${path.relative(root, file)} in arkpedia-data (a correction branch) and the next run takes the page as it is`;
  }
  const fallback = cached?.rows ?? [];
  const outcome = cached ? `its last good read (${fallback.length} rows) is used instead` : 'no earlier read is cached, so it reads as no rows and nothing new is discovered from it';
  console.warn(`Wiki page ${page} cannot be used: ${problem}; ${outcome}.`);
  alerts?.add({ key: `wiki:${page}`, action: cached ? 'kept-previous' : 'omitted-new', reason: `Wiki page ${page} cannot be used: ${problem}; ${outcome}.`, sourceRef: wikiPageUrl(page) });
  return fallback;
}
