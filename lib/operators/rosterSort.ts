import type { Operator, RosterOperator as OperatorSummary } from './operatorTypes';
import type { RosterRanking } from '@/lib/community/rankings';
import { parseBirthdayText, type Birthday } from '@/lib/schedule/scheduleDates';
import { DAY_MS } from '@/lib/time/servers.mjs';
import { STAT_KEYS, getBaseStats, type OperatorStats, type StatKey } from './operatorStats';

export const ROSTER_PROFILE_SORTS = [
  { value: 'height', label: 'Height' },
  { value: 'experience', label: 'Combat experience' },
] as const;

export const ROSTER_STAT_SORTS = [
  { value: 'hp', label: 'HP' },
  { value: 'atk', label: 'Attack' },
  { value: 'def', label: 'Defense' },
  { value: 'res', label: 'Resistance' },
  { value: 'dp', label: 'DP cost' },
  { value: 'block', label: 'Block count' },
  { value: 'redeploy', label: 'Redeploy time', unit: ' s' },
  { value: 'interval', label: 'Attack interval', unit: ' s' },
] as const satisfies readonly { value: StatKey; label: string; unit?: string }[];

export const ROSTER_COMMUNITY_SORTS = [
  { value: 'community-owned', label: 'Owned %' },
  { value: 'community-built', label: 'Built %' },
  { value: 'community-module', label: 'Module unlocked %' },
  { value: 'community-m3', label: 'Any M3 %' },
  { value: 'community-full', label: 'Full mastery %' },
  { value: 'community-max', label: 'Max level %' },
] as const;

type ProfileSort = typeof ROSTER_PROFILE_SORTS[number]['value'];
type CommunitySort = typeof ROSTER_COMMUNITY_SORTS[number]['value'];
export type RosterSort = 'rarity' | 'releaseDate' | 'birthday' | StatKey | ProfileSort | CommunitySort;

export const ROSTER_GENDERS = ['Female', 'Male', 'Other', 'Unknown'] as const;

export interface RosterMetadata {
  bio: {
    gender: typeof ROSTER_GENDERS[number];
    birthday?: Birthday;
    height?: { value: number; label: string };
    experience?: { value: number; label: string };
  };
  /** Final-promotion base values in STAT_KEYS order, with null for missing values. */
  stats: (number | null)[] | null;
  hasUpgradeModule: boolean;
}

export type RosterOperator = OperatorSummary & Partial<RosterMetadata>;

export function rosterMetadata(operator: Pick<Operator, 'basicInfo' | 'stats' | 'modules'>): RosterMetadata {
  return {
    bio: rosterBio(operator.basicInfo),
    stats: rosterStats(operator.stats),
    hasUpgradeModule: operator.modules?.some(module => module.type === 'Upgrade') ?? false,
  };
}

export function rosterStats(stats: OperatorStats | null | undefined): (number | null)[] | null {
  const phase = stats?.phases.at(-1);
  if (!phase) return null;
  const values = getBaseStats(phase, phase.maxLevel);
  return STAT_KEYS.map(key => Number.isFinite(values[key]) ? values[key] : null);
}

export function rosterStatValue(operator: RosterOperator, field: StatKey): number | undefined {
  return operator.stats?.[STAT_KEYS.indexOf(field)] ?? undefined;
}

/** Today is the server's wall-calendar day, expressed as a UTC midnight for date arithmetic. */
export function nextRosterBirthday(birthday: Birthday | undefined, today: number): number | undefined {
  if (!birthday) return undefined;
  const year = new Date(today).getUTCFullYear();
  // February 29 birthdays recur only in leap years, as in the calendar export.
  for (let offset = 0; offset <= 8; offset++) {
    const date = new Date(Date.UTC(year + offset, birthday.month - 1, birthday.day));
    if (+date >= today && date.getUTCDate() === birthday.day) return +date;
  }
  return undefined;
}

const birthdayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric' });
export function rosterBirthdayLabel(date: number | undefined, today: number): string {
  if (date === undefined) return 'Birthday unknown';
  const days = (date - today) / DAY_MS;
  return `${birthdayFormat.format(date)} · ${days === 0 ? 'Today' : days === 1 ? 'In 1 day' : `In ${days} days`}`;
}

export function rosterCommunityValue(field: CommunitySort, operator: RosterOperator, row: RosterRanking | undefined, contributors: number): number | undefined {
  switch (field) {
    case 'community-owned': return contributors && (row || !operator.isFuture) ? (row?.owned ?? 0) * 100 / contributors : undefined;
    case 'community-built': return row?.progress?.built ?? undefined;
    case 'community-module': return operator.hasUpgradeModule ? row?.progress?.module ?? undefined : undefined;
    case 'community-m3': return row?.progress?.m3 ?? undefined;
    case 'community-full': return row?.progress?.full ?? undefined;
    case 'community-max': return row?.progress?.max ?? undefined;
  }
}

export function rosterBio(info: Record<string, string> | null | undefined): RosterMetadata['bio'] {
  const genderText = info?.Gender?.trim().toLowerCase();
  const gender = !genderText || ['unknown', 'undisclosed', '未知', '––'].includes(genderText) ? 'Unknown'
    : ['female', 'self-proclaimed female'].includes(genderText) ? 'Female'
    : genderText === 'male' ? 'Male' : 'Other';
  const birthday = parseBirthdayText(info?.['Date of Birth']);
  const heightText = info?.Height?.trim();
  const height = heightText?.match(/^(\d+(?:\.\d+)?)\s*cm\b/i);
  const experienceText = info?.['Combat Experience']?.trim();
  const years = experienceText?.match(/^(\d+(?:\.\d+)?)\s+years?\b/i);
  const months = experienceText?.match(/^(\d+(?:\.\d+)?)\s+months?\b/i);
  let experienceMonths: number | undefined;
  if (years) experienceMonths = Number(years[1]) * 12;
  else if (months) experienceMonths = Number(months[1]);
  else if (/^half(?: a year|-year)\b/i.test(experienceText ?? '')) experienceMonths = 6;
  else if (/^none\b/i.test(experienceText ?? '')) experienceMonths = 0;
  // Place the published upper bound immediately below one year.
  else if (/^less than (?:one|1) year\b/i.test(experienceText ?? '')) experienceMonths = 12 - 0.01;
  return {
    gender,
    ...(birthday && { birthday }),
    ...(height && heightText && { height: { value: Number(height[1]), label: heightText } }),
    ...(experienceMonths !== undefined && experienceText && { experience: { value: experienceMonths, label: experienceText } }),
  };
}

export function compareRosterValue(a: number | undefined, b: number | undefined, ascending: boolean): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return ascending ? a - b : b - a;
}
