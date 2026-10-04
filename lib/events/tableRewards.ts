import type { ResolvedRewardStore } from './rewardTotals';

/**
 * An event's rewards beyond its store, as data/event-rewards.json carries them
 * (scripts/build/build-event-rewards.mjs, from the Global game tables), and their shape on
 * /events/[slug]: each group becomes a block beside the store, so the page's tabs and its All
 * totals take them in with the store's own listings.
 */
export interface TableRewardItem { name: string; count: number; kind: string; id: string }
export interface PackContents { name: string; count: number; kind: string }
export interface EventPack { name: string; start?: string; end?: string | null; contents: PackContents[] }
export interface FurniturePiece { name: string; id: string; obtain: string | null; comfort: number | null }
export interface TableRewardGroup {
  kind: 'login' | 'banner-gift' | 'missions' | 'first-clear' | 'pray' | 'packs' | 'notice' | 'furniture-set';
  title: string;
  source: string;
  start?: string;
  end?: string;
  days?: number;
  count?: number;
  items: TableRewardItem[];
  /** packs: the packs a post's section offers. */
  packs?: EventPack[];
  /** notice: the section's DURATION/DETAILS/REWARDS lines as the post words them. */
  lines?: string[];
  /** furniture-set: the set's pieces and its description. */
  pieces?: FurniturePiece[];
  description?: string | null;
}

/** The tab each kind of group is listed under. A draw login has no fixed payout to list. */
export const TABLE_REWARD_LABEL: Record<TableRewardGroup['kind'], string | null> = {
  login: 'Login event',
  'banner-gift': 'Gifts',
  missions: 'Missions',
  'first-clear': 'First clears',
  // Not a list of rewards to total: their own panels (components/events/EventExtras.tsx).
  pray: null,
  packs: null,
  notice: null,
  'furniture-set': null,
};

/** What the page shows beside the reward blocks: packs, furniture sets and announced gifts. */
export interface EventExtras {
  packs: { title: string; source: string; packs: (Omit<EventPack, 'contents'> & { contents: (PackContents & { iconPath: string | null })[] })[] }[];
  furniture: { title: string; source: string; description: string | null; pieces: FurniturePiece[] }[];
  notices: { title: string; source: string; lines: string[] }[];
}

export const NO_EXTRAS: EventExtras = { packs: [], furniture: [], notices: [] };

export function eventExtras(groups: TableRewardGroup[], iconFor: (name: string) => string | null): EventExtras {
  return {
    packs: groups.filter(g => g.kind === 'packs' && g.packs?.length).map(g => ({
      title: g.title, source: g.source,
      packs: g.packs!.map(pack => ({ ...pack, end: pack.end ?? null, contents: pack.contents.map(item => ({ ...item, iconPath: iconFor(item.name) })) })),
    })),
    furniture: groups.filter(g => g.kind === 'furniture-set' && g.pieces?.length).map(g => ({ title: g.title, source: g.source, description: g.description ?? null, pieces: g.pieces! })),
    notices: groups.filter(g => g.kind === 'notice' && g.lines?.length).map(g => ({ title: g.title, source: g.source, lines: g.lines! })),
  };
}

/* Event tokens are the store's currency, already spent in its listings: counted again here
   they would read as a reward of their own in the All totals. */
const LEFT_OUT = new Set(['event-item']);

export function tableRewardStores(groups: TableRewardGroup[], iconFor: (item: TableRewardItem) => string | null): ResolvedRewardStore[] {
  return groups.flatMap(group => {
    const label = TABLE_REWARD_LABEL[group.kind];
    const items = group.items.filter(item => !LEFT_OUT.has(item.kind));
    if (!label || !items.length) return [];
    return [{
      type: label,
      name: group.title,
      items: items.map(item => ({ name: item.name, quantity: item.count, price: null, currency: '', stock: '1', iconPath: iconFor(item) })),
    }];
  });
}
