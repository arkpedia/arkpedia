/**
 * Reads the official CN activity announcements (data/official-news/cn, scripts/sync/sync-cn-news.mjs)
 * for what the calendar needs before the CN client carries it: the events that open stages and the
 * banners with their rate-up operators, each with the exact hours the post gives.
 *
 * A post is numbered sections ("一、全新SideStory「昨日海」，活动关卡开启"), each with its own
 * "活动时间： 10月09日 12:00 - 10月30日 03:59"; a banner's own preview ("[限定寻访·夏季]【…】限时寻访即将
 * 开启") is one unnumbered section. Dates carry no year: it is the post's, or the next one for a
 * December post announcing January.
 *
 * Only what is certain is read. An event is a section naming 「the event」 that opens its stages
 * (SideStory, 故事集, a mode such as 矢量突破); a rerun is left to the client, because its record
 * already exists under its first run's name, as is a collaboration without 「」. A banner is a
 * 【name】 寻访 section whose "寻访为【…】" line says what kind it is. Login campaigns, outfits,
 * furniture and packs are not calendar records.
 */

const NUMERAL = /^[一二三四五六七八九十]+、/;
const TIME = /(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})\s*[-–~]\s*(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/;
const NOT_EVENT = /签到|登录|新装|时装|家具|组合包|礼包|寻访|甄选|招募|模组|回顾|资源收集|更新|优化|上限|剿灭|复刻/;

/** The post's sections: { title, lines }; a post without numbered sections is one, under its title. */
export function cnSections(post) {
  const sections = [];
  let current = { title: post.title, lines: [] };
  for (const line of post.lines ?? []) {
    if (NUMERAL.test(line)) { if (current.lines.length || current.title !== post.title) sections.push(current); current = { title: line.replace(NUMERAL, ''), lines: [] }; }
    else current.lines.push(line);
  }
  sections.push(current);
  return sections;
}

const pad = n => String(n).padStart(2, '0');
/** "10月09日 12:00 - 10月23日 03:59" in the year of a post published at `published` (seconds):
 *  { start, end } as UTC instants of the UTC+8 times, the end of a :59 rounded up a minute. */
export function cnWindow(text, published) {
  const m = String(text ?? '').match(TIME);
  if (!m) return null;
  const posted = new Date((published + 8 * 3600) * 1000);
  const yearOf = month => posted.getUTCFullYear() + (month < posted.getUTCMonth() + 1 - 6 ? 1 : 0);
  const instant = (month, day, hour, minute) => Date.UTC(yearOf(month), month - 1, day, hour - 8, minute) / 1000;
  const start = instant(+m[1], +m[2], +m[3], +m[4]);
  let end = instant(+m[5], +m[6], +m[7], +m[8]);
  if (end < start) end = Date.UTC(yearOf(+m[1]) + 1, +m[5] - 1, +m[6], +m[7] - 8, +m[8]) / 1000;
  return { start, end: end + (+m[8] === 59 ? 60 : 0) };
}
/** A window's server days, "2026/10/09–2026/10/23" (the end of 03:59 is that day's). */
export function cnDays({ start, end }) {
  const day = ts => { const d = new Date((ts + 8 * 3600) * 1000); return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`; };
  return `${day(start)}–${day(end - 60)}`;
}
const timeOf = (lines, label) => lines.find(line => new RegExp(`^${label}[：:]`).test(line) && TIME.test(line));

/** The events a post announces: [{ type, name, start, end, source }]. */
export function cnEvents(post) {
  const events = [];
  for (const section of cnSections(post)) {
    const title = section.title;
    if (title === post.title || NOT_EVENT.test(title)) continue;
    // The 「name」 that opens: "「昨日海」，活动关卡开启", "故事集「丛林症结」限时开启", "「奇象巡展」限时活动开启";
    // not "「夏日嘉年华」，特别活动开启", a series' side activity.
    const last = [...title.matchAll(/「([^」]+)」(?=[，,]?\s*(?:活动关卡|限时活动|限时|活动)开启)/g)].at(-1);
    if (!last) continue;
    // A mode's number is part of its name ("矢量突破#3「拟生态」"); an event series' is not ("「夏日嘉年华」，SideStory「…」").
    const before = title.slice(0, last.index).replace(/^.*[，,]\s*/, '');
    const mode = before.match(/([\p{Script=Han}]+#\d+)$/u)?.[1];
    const name = mode ? `${mode}「${last[1]}」` : last[1];
    const type = /故事集/.test(before) ? 'Story Collection' : /SideStory/i.test(before) ? (/×|x/i.test(title.replace(/SideStory/gi, '')) ? 'Side Story – Crossover' : 'Side Story') : 'Event';
    // The stages' window: a SideStory's segments end with its stages, its 活动时间 with its store.
    const segments = section.lines.filter(line => /^◆「[^」]+」开启时间[：:]/.test(line)).map(line => cnWindow(line, post.displayTime)).filter(Boolean);
    const window = segments.length
      ? { start: Math.min(...segments.map(w => w.start)), end: Math.max(...segments.map(w => w.end)) }
      : cnWindow(timeOf(section.lines, '关卡开放时间') ?? timeOf(section.lines, '活动时间'), post.displayTime);
    if (window) events.push({ type, name, ...window, source: post.url });
  }
  return events;
}

const names = text => text.split(/\s*[/\\／、]\s*/).map(name => name.replace(/\[限定\]|［限定］/g, '').trim()).filter(Boolean);
/** The banners a post announces: [{ name, kind, start, end, six, five, rateUpSix, source }]. */
export function cnBanners(post) {
  const banners = [];
  for (const section of cnSections(post)) {
    const name = section.title.match(/【([^】]+)】(?:限时寻访|限定寻访)(?:复刻)?(?:即将)?开启/)?.[1]
      ?? (/(?:联合行动|定向甄选)/.test(section.title) && /寻访开启/.test(section.title) ? section.title.match(/【([^】]+)】/)?.[1] : null);
    if (!name || /中坚/.test(name)) continue;
    const window = cnWindow(timeOf(section.lines, '活动时间'), post.displayTime);
    if (!window) continue;
    const said = section.lines.map(line => line.match(/寻访为【([^】]+)】/)?.[1]).find(Boolean);
    const kind = name === '联合行动' ? 'joint' : name === '定向甄选' ? 'orienteering'
      : said === '标准寻访' ? 'featured' : said ? 'limited' : null;
    if (!kind) continue;
    const six = [], five = [], rateUpSix = [];
    for (const line of section.lines) {
      // The exchange's lists ("（300寻访数据契约）") and anything after them are not the rates.
      if (/寻访数据契约/.test(line)) break;
      const star = line.match(/^(★{5,6})\s*(?:（[^）]*出率[^）]*）)?\s*[：:]\s*(.+?)\s*(?:（(.*)）)?\s*$/);
      if (!star) continue;
      const listed = names(star[2]);
      if (star[1].length === 6 && /剩余出率|权值/.test(star[3] ?? '')) rateUpSix.push(...listed);
      else (star[1].length === 6 ? six : five).push(...listed);
    }
    banners.push({ name, kind, ...window, six, five, rateUpSix, source: post.url });
  }
  return banners;
}

const dayOf = ts => cnDays({ start: ts, end: ts + 60 }).slice(0, 10);
/** Every event and banner the cached posts announce, newest post first, each once; a banner
 *  carries `event`, the name of the event its post opens with it, where there is one. */
export function cnAnnouncements(posts) {
  const sorted = [...posts].sort((a, b) => b.displayTime - a.displayTime);
  const events = new Map(), banners = new Map();
  for (const post of sorted) {
    const announced = cnEvents(post);
    for (const event of announced) if (!events.has(event.name)) events.set(event.name, event);
    for (const banner of cnBanners(post)) {
      const key = `${banner.name} ${cnDays(banner)}`;
      if (banners.has(key)) continue;
      // The post's event that opens the same day is the banner's event (its page shows the banner).
      const opening = announced.filter(event => dayOf(event.start) === dayOf(banner.start));
      banners.set(key, opening.length === 1 ? { ...banner, event: opening[0].name } : banner);
    }
  }
  return { events: [...events.values()], banners: [...banners.values()] };
}
