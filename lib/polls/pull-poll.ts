import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import type { BannerGoal } from '@/lib/pulls/plan';
import type { UpcomingBanner } from '@/lib/pulls/pulls';

export const PULL_POLL_ID = 'pull-or-skip-v1';
export const PULL_POLL_DRAFT = 'arkpedia.pull-poll.v1';
export type Want = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Ballot = Record<string, Record<string, Want>>;
export interface PollBanner {
  id: string; name: string; aliases: string[]; start: string; end: string;
  endAt: string | null; estimated: boolean; image: string | null; operators: string[];
}
export function pollBanners(banners: UpcomingBanner[], lineups: readonly HeadhuntingBanner[] = []): PollBanner[] {
  return banners.filter(b => !b.globalLineupPending && b.sixStars.length).map(b => {
    const lineup = lineups.find(row => row.name === b.name || row.aliases?.includes(b.name) || b.aliases?.includes(row.name)
      || (!!b.poolId && (row.cnPoolId === b.poolId || row.globalPoolId === b.poolId)));
    return ({
    id: b.poolId ?? `${b.name}:${b.start}`, name: b.name, aliases: b.aliases ?? [],
    start: b.start, end: b.end, endAt: b.endAt ?? null, estimated: !!b.datesEstimated,
    image: b.image, operators: [...new Set([...b.sixStars, ...b.alsoRatedUp, ...(!lineup?.globalLineupPending ? [...(lineup?.five_stars ?? []), ...(lineup?.four_stars ?? [])] : [])])],
  }); });
}
/** -1 is good to have; zero is an explicit skip. Missing means unanswered. */
export function parseBallot(value: unknown, banners: readonly PollBanner[]): Ballot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid poll choices.');
  const catalogue = new Map(banners.map(b => [b.id, b]));
  const result: Ballot = {};
  if (Object.keys(value).length > 200) throw Error('Too many banners.');
  for (const [id, raw] of Object.entries(value)) {
    const banner = catalogue.get(id);
    if (!banner || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('This poll’s banners changed. Reload before submitting.');
    const choices: Record<string, Want> = {};
    for (const [name, want] of Object.entries(raw)) {
      if (!banner.operators.includes(name) || !Number.isInteger(want) || Number(want) < -1 || Number(want) > 6) throw Error('Choose a valid operator potential.');
      Object.defineProperty(choices, name, { value: want, enumerable: true, writable: true, configurable: true });
    }
    if (Object.keys(choices).length) Object.defineProperty(result, id, { value: choices, enumerable: true, writable: true, configurable: true });
  }
  return result;
}
export function bannerChoice(choices: Record<string, Want> | undefined, banner: PollBanner): string {
  if (!choices || banner.operators.some(name => choices[name] === undefined)) return '';
  const values = banner.operators.map(name => choices[name]);
  return values.every(w => w === 0) ? 'skip' : values.every(w => w === -1) ? 'maybe' : values.every(w => w > 0) ? 'pull' : 'custom';
}
export function setBannerChoice(ballot: Ballot, banner: PollBanner, choice: string): Ballot {
  const want: Want = choice === 'pull' ? 1 : choice === 'maybe' ? -1 : 0;
  return { ...ballot, [banner.id]: Object.fromEntries(banner.operators.map(name => [name, want])) };
}
export function importGoals(goals: readonly BannerGoal[], banners: readonly PollBanner[]): Ballot {
  const result: Ballot = {};
  for (const banner of banners) {
    const goal = goals.find(g => g.banner === banner.name || banner.aliases.includes(g.banner));
    if (!goal) continue;
    result[banner.id] = Object.fromEntries(banner.operators.map(name => [name,
      goal.targets?.length ? goal.targets.find(t => t.name === name)?.copies ?? 0 : 1])) as Record<string, Want>;
  }
  return result;
}
/** URL fragments stay in the browser; sharing never publishes a ballot. */
export function encodeBallot(ballot: Ballot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ballot));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBallot(encoded: string, banners: readonly PollBanner[]): Ballot {
  if (encoded.length > 50000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error('Invalid shared poll.');
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return parseBallot(JSON.parse(new TextDecoder().decode(bytes)), banners);
}
