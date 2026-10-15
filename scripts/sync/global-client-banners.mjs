/** EN client reconciliation, independent of wiki availability and forecast dates.
 * Mutates records; existing pool IDs and historical lineups remain stable. */
import { newsSections, parseDuration } from '../build/official-news.mjs';
const day = seconds => new Date((seconds - 7 * 3600) * 1000).toISOString().slice(0, 10).replaceAll('-', '/');
const days = pool => `${day(pool.openTime)}–${day(pool.endTime)}`;
const bare = name => String(name ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+rerun\s*$/i, '')
  .normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const ordinal = banner => /^Orienteering #?(\d+)$/.exec(banner.name)?.[1];
const valid = pool => Number.isSafeInteger(pool.openTime) && Number.isSafeInteger(pool.endTime)
  && pool.openTime > 0 && pool.endTime > pool.openTime;
const recent = (pool, now) => pool.endTime * 1000 >= now;
const EN_POOL = /_EN_/;

export function globalBannerNotices(posts) {
  return [...posts].sort((a, b) => (a.publishTime ?? 0) - (b.publishTime ?? 0)).flatMap(post => newsSections(post.lines ?? []).flatMap(section => {
    const title = /^(?:LIMITED|LIMITED-TIME|SPECIAL|STANDARD) HEADHUNTING(?: OPEN)?\s*[–—-]\s*(.+)$/i.exec(section.title);
    const locating = section.title === 'KERNEL LOCATING OPEN';
    const duration = (title || locating) && parseDuration(section.lines.find(line => /^DURATION:/.test(line)));
    return duration?.end ? [{ name: title?.[1], kind: locating ? 'FESCLASSIC' : null, startAt: duration.start,
      endAt: new Date(Date.parse(duration.end) + 60000).toISOString(), source: post.url }] : [];
  }));
}

export function reconcileGlobalClientBanners({ banners, gachaTable, operators, clientSource, posts = [], now = Date.now() }) {
  const before = JSON.stringify(banners), additions = [], quarantine = [];
  const pools = (gachaTable.gachaPoolClient ?? []).filter(pool => EN_POOL.test(pool.gachaPoolId) && valid(pool)).sort((a, b) => a.openTime - b.openTime);
  const notices = globalBannerNotices(posts);
  const roster = new Map(operators.map(op => [op.internalName, op]));
  const report = (pool, reason) => quarantine.push({ key: `banner:${pool.gachaPoolId}`, action: 'kept-previous', sourceRef: clientSource, reason });
  const special = pools.filter(pool => pool.gachaRuleType === 'SPECIAL').sort((a, b) => a.openTime - b.openTime);

  for (const pool of pools) {
    if (!recent(pool, now)) continue;
    const holders = banners.filter(b => b.globalPoolId === pool.gachaPoolId);
    if (holders.length > 1) { report(pool, 'Several records hold this EN pool; none is rewritten.'); continue; }
    let banner = holders[0];
    if (!banner && pool.gachaRuleType === 'SPECIAL') {
      // Advance only from a recorded immediate EN predecessor. Neither a CN pool ID,
      // a predicted date, nor the shared name "Orienteering Headhunting" is identity.
      const index = special.indexOf(pool), previous = special[index - 1];
      const anchors = previous && banners.filter(b => b.globalPoolId === previous.gachaPoolId && ordinal(b));
      const number = anchors?.length === 1 && previous.openTime < pool.openTime ? Number(ordinal(anchors[0])) + 1 : null;
      const candidates = number && banners.filter(b => Number(ordinal(b)) === number);
      if (!number || candidates.length > 1 || candidates[0]?.globalPoolId) {
        report(pool, 'The EN Orienteering pool has no unique recorded predecessor and edition; its forecast is left unchanged.'); continue;
      }
      banner = candidates[0];
      if (!banner) {
        banner = { name: `Orienteering #${number}`, category: 'special', pull_type: 'orienteering', year: Number(day(pool.openTime).slice(0, 4)),
          cn_date: null, global_date: null, linked_event: null, banner_image: null, six_stars: [], five_stars: [], lineupSource: 'pending' };
        banners.push(banner); additions.push(banner.name);
      }
    }
    if (!banner && ['SINGLE', 'LIMITED', 'LINKAGE'].includes(pool.gachaRuleType)) {
      const kind = pool.gachaRuleType === 'SINGLE' ? 'featured' : 'limited';
      const matches = banners.filter(b => b.pull_type === kind && [b.name, ...(b.aliases ?? [])].some(name => bare(name) === bare(pool.gachaPoolName)));
      // Reused names (reruns) require a recorded ID or an exact dated match from the catalogue.
      if (matches.length === 1 && !matches[0].globalPoolId
        && pools.filter(p => bare(p.gachaPoolName) === bare(pool.gachaPoolName)).length === 1) banner = matches[0];
    }
    if (!banner) continue; // Other kinds have their own regional importers.
    const firstGlobalPool = !banner.globalPoolId;
    // Client opens may precede maintenance ending. A named official window for
    // this run wins; a shared generic title alone never identifies an edition.
    const saved = banner.global_window;
    const savedStart = Date.parse(saved?.startAt), savedEnd = Date.parse(saved?.endAt);
    const savedAnnouncement = banner.globalScheduleStatus === 'announced'
      && /^https:\/\/(?:www\.)?arknights\.global\/news\/\d+(?:[#?].*)?$/.test(saved?.timingSource ?? '')
      && Number.isFinite(savedStart) && Number.isFinite(savedEnd) && savedStart < savedEnd
      && day(savedStart / 1000) === day(pool.openTime) && day((savedEnd - 1000) / 1000) === day(pool.endTime)
      ? { startAt: saved.startAt, endAt: saved.endAt, source: saved.timingSource } : null;
    const notice = notices.filter(n => (n.kind ? n.kind === pool.gachaRuleType : bare(n.name) === bare(pool.gachaPoolName))
      && day(Date.parse(n.startAt) / 1000) === day(pool.openTime)
      && day((Date.parse(n.endAt) - 1000) / 1000) === day(pool.endTime)).at(-1) ?? savedAnnouncement;
    const startAt = notice?.startAt ?? new Date(pool.openTime * 1000).toISOString();
    const endAt = notice?.endAt ?? new Date((pool.endTime + (pool.endTime % 60 === 59 ? 1 : 0)) * 1000).toISOString();
    const same = banner.global_window?.startAt === startAt && banner.global_window?.endAt === endAt;
    const official = !!notice || banner.globalScheduleStatus === 'announced' && same;
    Object.assign(banner, { globalPoolId: pool.gachaPoolId, global_date: days(pool), global_date_estimated: false,
      global_window: { startAt, endAt, timingSource: notice?.source || same && banner.global_window.timingSource || clientSource },
      globalScheduleStatus: official ? 'announced' : 'datamined' });
    delete banner.globalLineupPending;
    delete banner.schedule_anchor;

    if (pool.gachaRuleType !== 'SPECIAL') continue;
    if (firstGlobalPool) banner.banner_image = null; // CN artwork is not EN candidate evidence.
    const dict = pool.dynMeta?.rarityPickCharDict;
    const six = dict?.TIER_6, five = dict?.TIER_5;
    const known = (ids, rarity) => Array.isArray(ids) && ids.length >= 3 && new Set(ids).size === ids.length
      && ids.every(id => roster.get(id)?.rarity === rarity);
    if (!known(six, 6) || !known(five, 5)) {
      // Never expose the source record's CN choices as an EN lineup.
      Object.assign(banner, { six_stars: [], five_stars: [], four_stars: [], rate_up_six_stars: [], lineupSource: 'pending', banner_image: null });
      delete banner.announcedLineup;
      report(pool, 'The EN Orienteering candidate IDs are incomplete or unknown; timing is published with the Global lineup pending.');
      quarantine.at(-1).action = 'published-partial';
      continue;
    }
    Object.assign(banner, { six_stars: six.map(id => roster.get(id).name), five_stars: five.map(id => roster.get(id).name),
      four_stars: [], rate_up_six_stars: [], lineupSource: 'client' });
    delete banner.announcedLineup;
  }
  for (const banner of banners) {
    if (['joint', 'orienteering'].includes(banner.pull_type) && banner.cnPoolId && !banner.globalPoolId && !banner.global_window?.timingSource) {
      banner.global_date_estimated = true;
      banner.globalLineupPending = true;
    }
  }
  return { changed: before !== JSON.stringify(banners), additions, quarantine };
}
