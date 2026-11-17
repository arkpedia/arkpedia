/** Official broadcasts are independent of the community's curated creator videos. */
export type BroadcastGame = 'arknights' | 'endfield';
export type BroadcastRegion = 'global' | 'jp' | 'kr' | 'cn';
export type BroadcastStatus = 'upcoming' | 'live' | 'ended';
export interface OfficialBroadcast {
  id: string; source: string; game: BroadcastGame; region: BroadcastRegion;
  title: string; url: string; thumbnail: string | null; startsAt: string;
  status: BroadcastStatus; verifiedAt: string; groupKey: string;
}
export type BroadcastCandidate = Omit<OfficialBroadcast, 'groupKey'> & { description?: string };
export interface BroadcastSnapshot { checkedAt: string; broadcasts: OfficialBroadcast[]; degraded: boolean }
export interface BroadcastGroup { key: string; primary: OfficialBroadcast; others: OfficialBroadcast[] }
export interface BroadcastEventAlias { key: string; names: string[] }
export const BROADCAST_LOOKAHEAD = 7 * 86400000;
export const BROADCAST_LIVE_MAX_AGE = 90000;
export const BROADCAST_REGIONS: Record<BroadcastRegion, string> = { global:'Global', jp:'JP', kr:'KR', cn:'CN' };
const priority: Record<BroadcastRegion, number> = { global:0, jp:1, kr:2, cn:3 };
const folded = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, ' ').trim();
const intro = (text = '') => text.split(/\n\s*\n|https?:\/\//)[0];

/** A stream-format title, or an Endfield patch programme/premiere; never ordinary creator uploads. */
export function importantBroadcast(title: string, description: string, game: BroadcastGame): boolean {
  const text = `${title}\n${intro(description)}`;
  if (/24\s*\/\s*7|24時間|24小时|\bradio\b|\bloop(?:ing)?\b/i.test(title)) return false;
  if (/live\s?stream|special\s+(?:program(?:me)?|broadcast)|anniversary.*\blive\b|生放送|直播|特别节目|前瞻|특별\s*방송|라이브|생방송/i.test(title)) return true;
  return game === 'endfield' && /\b(?:patch|version|ver\.?|v\s*\d+\.\d+)|版本|버전|バージョン/i.test(text)
    && /\b(?:preview|announcement|overview|reveal|trailer|special|program(?:me)?)\b|前瞻|특별|予告/i.test(text);
}

function identityTokens(broadcast: BroadcastCandidate, aliases: readonly BroadcastEventAlias[]): string[] {
  const family = `${broadcast.game}:${broadcast.game === 'arknights' && broadcast.region === 'cn' ? 'cn' : 'global'}`;
  const text = `${broadcast.title}\n${intro(broadcast.description)}`;
  const tokens: string[] = [];
  const anniversaries = new Set([...text.matchAll(/(\d+(?:\.5)?)\s*(?:周年|주년)|\b(\d+(?:\.5)?)(?:st|nd|rd|th)?\s*(?:year\s*)?anniversary/giu)].map(match => String(Number(match[1] ?? match[2]))));
  if (anniversaries.size === 1) tokens.push(`${family}:anniversary:${[...anniversaries][0]}`);
  if (broadcast.game === 'endfield') {
    const versions = new Set([...text.matchAll(/\b(?:version|ver\.?|v)\s*(\d+\.\d+)|(?:版本|버전|バージョン)\s*(\d+\.\d+)|(\d+\.\d+)\s*(?:版本|버전|バージョン)/giu)].map(match => match[1] ?? match[2] ?? match[3]));
    if (versions.size === 1) tokens.push(`${family}:version:${[...versions][0]}`);
  }
  const matching = (value: string) => new Set((broadcast.game === 'arknights' ? aliases : []).filter(alias => alias.names.some(name => {
    const needle = folded(name), haystack = folded(value);
    return needle.length >= 3 && (/\p{Script=Han}/u.test(needle) ? haystack.includes(needle) : ` ${haystack} `.includes(` ${needle} `));
  })).map(alias => alias.key));
  const titleMatches = matching(broadcast.title);
  const matches = titleMatches.size ? titleMatches : matching(intro(broadcast.description));
  if (matches.size === 1) tokens.push(`${family}:event:${[...matches][0]}`);
  return tokens.length ? tokens : [`${family}:unique:${broadcast.id}`];
}

/** Strong shared identities only; proximity or a generic "special livestream" is insufficient. */
export function assignBroadcastGroups(candidates: readonly BroadcastCandidate[], aliases: readonly BroadcastEventAlias[] = []): OfficialBroadcast[] {
  const tokens = candidates.map(candidate => identityTokens(candidate, aliases));
  const parent = candidates.map((_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]));
  const owners = new Map<string, number>();
  for (const [index, keys] of tokens.entries()) for (const key of keys) {
    const owner = owners.get(key);
    if (owner !== undefined) parent[root(index)] = root(owner);
    else owners.set(key, index);
  }
  const keys = new Map<number, string[]>();
  tokens.forEach((list, index) => keys.set(root(index), [...(keys.get(root(index)) ?? []), ...list]));
  return candidates.map(({ description: _description, ...candidate }, index) => ({ ...candidate, groupKey: keys.get(root(index))!.sort()[0] }));
}

export function broadcastIsEligible(broadcast: OfficialBroadcast, now: number): boolean {
  const start = Date.parse(broadcast.startsAt), age = now - Date.parse(broadcast.verifiedAt);
  if (!Number.isFinite(start) || !Number.isFinite(age) || age < -300000) return false;
  if (broadcast.status === 'live') return age <= BROADCAST_LIVE_MAX_AGE;
  // A freshly confirmed delayed broadcast can still say Starting soon, never Live.
  return broadcast.status === 'upcoming' && age <= 86400000 && start >= now - 6 * 3600000 && start <= now + BROADCAST_LOOKAHEAD;
}

export function featuredBroadcastGroups(broadcasts: readonly OfficialBroadcast[], now: number, featuredLiveIds: readonly string[] = []): BroadcastGroup[] {
  const grouped = new Map<string, OfficialBroadcast[]>();
  for (const broadcast of broadcasts) grouped.set(broadcast.groupKey, [...(grouped.get(broadcast.groupKey) ?? []), broadcast]);
  const compare = (a: OfficialBroadcast, b: OfficialBroadcast) => Number(b.status === 'live') - Number(a.status === 'live')
    || Date.parse(a.startsAt) - Date.parse(b.startsAt) || priority[a.region] - priority[b.region] || a.id.localeCompare(b.id);
  return [...grouped].flatMap(([key, members]) => {
    const eligible = members.filter(member => broadcastIsEligible(member, now)).sort(compare);
    // Once a reader is watching a featured live broadcast, a delayed regional
    // start (including a nominally same-time Global/KR tie) must not displace it.
    const primary = eligible.find(member => member.status === 'live' && featuredLiveIds.includes(member.id)) ?? eligible[0];
    if (!primary) return [];
    const others = members.filter(member => member.id !== primary.id && (member.status === 'ended' || broadcastIsEligible(member,now)) && Date.parse(member.startsAt) >= now - BROADCAST_LOOKAHEAD && Date.parse(member.startsAt) <= now + BROADCAST_LOOKAHEAD)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || priority[a.region] - priority[b.region]);
    return [{ key, primary, others }];
  }).sort((a, b) => compare(a.primary, b.primary));
}

export function validBroadcastSnapshot(value: unknown): value is BroadcastSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as BroadcastSnapshot;
  return typeof snapshot.checkedAt === 'string' && Number.isFinite(Date.parse(snapshot.checkedAt)) && typeof snapshot.degraded === 'boolean'
    && Array.isArray(snapshot.broadcasts) && snapshot.broadcasts.length <= 64 && snapshot.broadcasts.every(broadcast => {
      if (!broadcast || !['arknights','endfield'].includes(broadcast.game) || !Object.hasOwn(BROADCAST_REGIONS, broadcast.region)
        || !['upcoming','live','ended'].includes(broadcast.status) || typeof broadcast.id !== 'string' || typeof broadcast.source !== 'string'
        || typeof broadcast.title !== 'string' || broadcast.title.length > 500 || typeof broadcast.groupKey !== 'string' || broadcast.groupKey.length > 300
        || typeof broadcast.startsAt !== 'string' || typeof broadcast.verifiedAt !== 'string' || !Number.isFinite(Date.parse(broadcast.startsAt)) || !Number.isFinite(Date.parse(broadcast.verifiedAt))) return false;
      try {
        const url = new URL(broadcast.url);
        return url.protocol === 'https:' && (url.hostname === 'www.youtube.com' && url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') ?? '')
          || url.hostname === 'live.bilibili.com' && /^\/\d+$/.test(url.pathname)) && (broadcast.thumbnail === null || typeof broadcast.thumbnail === 'string' && (/^https:\/\/(?:i\.ytimg\.com|[\w.-]+\.hdslb\.com)\//.test(broadcast.thumbnail) || /^\/(?!\/)/.test(broadcast.thumbnail)));
      } catch { return false; }
    });
}
