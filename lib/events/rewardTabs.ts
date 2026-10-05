import type { EventExtras } from './tableRewards';

/*
 * The Rewards section's tabs on /events/[slug], and the links that name one (#skins, #rewards,
 * #rewards/packs), as plain functions the page and scripts/tests/test-event-links.ts share.
 *
 * The list is built once, here: the page used to build it twice, once with labels for the Tabs
 * and once without for reading a link, so a tab added to one list and not the other would show
 * without a link opening it, or a link would open a tab that is not drawn. All is the first tab
 * only when the event has reward blocks to total: an event whose rewards are only packs, an
 * announcement or a furniture set opened on an All that said "Nothing here." beside the tabs that
 * held them (13 events, Rhodes Island Icebreaker Games and Wishes from Stars among them).
 */
export const ALL_TAB = 'all';
/** The tabs beside the reward blocks: values no store type can take. */
export const EXTRA_TABS = { packs: '__packs', furniture: '__furniture', notices: '__notices' } as const;

export interface RewardTab { value: string; label: string }

/** All (when there are blocks), each block type, then the announced gifts, packs and furniture. */
export function rewardTabsFor(rewardTypes: readonly string[], extras: EventExtras): RewardTab[] {
  return [
    ...(rewardTypes.length ? [{ value: ALL_TAB, label: 'All' }] : []),
    ...rewardTypes.map((type) => ({ value: type, label: type })),
    ...(extras.notices.length ? [{ value: EXTRA_TABS.notices, label: 'Announced' }] : []),
    ...(extras.packs.length ? [{ value: EXTRA_TABS.packs, label: 'Packs' }] : []),
    ...(extras.furniture.length ? [{ value: EXTRA_TABS.furniture, label: 'Furniture' }] : []),
  ];
}

/** A reward tab as a link names it: "Login event" is login-event, the packs tab packs. Always
 *  [a-z0-9-], so a link the page writes never needs decoding to be read back. */
export const tabSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The tab on screen: the one chosen if this event has it, else its first, the way the page's
 *  section is derived. Undefined only for an event with no Rewards tabs at all. */
export function shownRewardTab(chosen: string, tabs: readonly RewardTab[]): string | undefined {
  return tabs.some((tab) => tab.value === chosen) ? chosen : tabs[0]?.value;
}

/** The hash for a section and reward tab: the section alone (#rewards for the first tab), else
 *  #rewards/<tab>. */
export function eventLink(section: string, rewardTab: string | undefined, tabs: readonly RewardTab[]): string {
  return section === 'rewards' && rewardTab !== undefined && rewardTab !== tabs[0]?.value ? `rewards/${tabSlug(rewardTab)}` : section;
}

/**
 * What a link's hash opens: one of this event's sections and, for Rewards, the tab it names, or
 * the first tab for a bare #rewards or a tab this event does not have (a bare #rewards used to
 * leave whichever tab was on screen). Null for a hash that names no section of this event.
 *
 * The hash is read as it stands, never decoded. It is the reader's URL, so it can hold anything:
 * a literal '%' stays '%' in location.hash, decodeURIComponent('%') throws, and the throw inside
 * the page's effect replaced the whole page with Next's "Application error" for a link such as
 * #100% or #rewards/%E0. Every slug the page writes is [a-z0-9-] (tabSlug), so there is nothing
 * to decode.
 */
export function readEventLink<S extends string>(hash: string, sections: readonly S[], tabs: readonly RewardTab[]): { section: S; rewardTab: string | undefined } | null {
  const [name, slug] = hash.replace(/^#/, '').split('/');
  const section = sections.find((key) => key === name);
  if (section === undefined) return null;
  if (section !== 'rewards') return { section, rewardTab: undefined };
  return { section, rewardTab: (slug ? tabs.find((tab) => tabSlug(tab.value) === slug) : undefined)?.value ?? tabs[0]?.value };
}
