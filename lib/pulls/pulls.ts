import { getAnnihilationNextEnd, getNextDailyReset } from '@/lib/schedule/opsSchedules';
import { wishingWallOrundum, type WishingWallMode } from './wishingWall';

/**
 * How many pulls a player can have by a given date.
 *
 * Two halves, answering different questions:
 *
 *   ONE-TIME    what is still lying on the floor -- an Originite Prime for
 *               every stage never cleared, and the Orundum in every
 *               Annihilation kill ladder never broken. A new account's whole
 *               back catalogue. From data/pull-sources.json, derived by
 *               scripts/build-pull-sources.ts out of the site's own stage
 *               records and the upstream campaign table, and read through
 *               lib/pulls/sources.ts on the server only: the browser gets the
 *               release's copy as page props (BacklogSources).
 *   RECURRING   what arrives between now and the banner: the daily mission,
 *               the weekly mission, and the Annihilation farm.
 *
 * EVERY CONSTANT SAYS WHERE IT CAME FROM, because half of them are not in the
 * gamedata at all. The daily and weekly figures were read out of `mission_table`.
 * The pull price, the Originite exchange and the certificate shop are
 * server-side -- `gacha_table` prices nothing and `shop_client_table` carries no
 * certificate prices -- so they come from the user, who plays the game. Do not
 * "correct" one of those from memory; check it in game, the way it was got.
 *
 * Deliberately standalone (lib/pulls, not lib/planner): the level-up planner is
 * being rewritten on its own branch, and a pull calculator that imports none of
 * it can be dropped into either version of the page.
 */

/** 600 Orundum a pull. From the user; no client table prices a pull. */
export const ORUNDUM_PER_PULL = 600;

/** 1 Originite Prime buys 180 Orundum. From the user; the `180` in gacha_table
 *  is a recruitment timer and nothing to do with this. */
export const ORUNDUM_PER_ORIGINITE = 180;

/**
 * The certificate shop as a month's allowance: 258 Distinction Certificates for
 * 38 pulls, refreshing monthly. From the user -- shop_client_table ships no
 * certificate prices.
 *
 * Held as the PAIR rather than as a rate, because the cap and the price are two
 * different facts, and dividing them into "6.8 certs a pull" loses the one that
 * bites: a reader sitting on 5,000 certificates still gets 38 pulls this month.
 */
export const CERT_MONTHLY_PULLS = 38;
export const CERT_MONTHLY_COST = 258;

/** 100 a day. mission_table.periodicalRewards -- 28 `reward_daily_*` entries,
 *  every one of them 100. */
export const DAILY_ORUNDUM = 100;

/** 500 a week. mission_table.weeklyRewards.reward_weekly_309, the live one. */
export const WEEKLY_ORUNDUM = 500;

/**
 * 1800 a week from Annihilation, from the user -- and worth writing down why
 * the table seems to disagree. campaign_table's break ladders are the ONE-TIME
 * first-clear rewards (1500 on the older rotating maps, 2300 on the newer four)
 * and the three permanent maps pay none at all. The recurring farm is a
 * separate weekly cap the client data does not carry. Both are used here: the
 * ladders as one-time income, this as weekly.
 */
export const ANNIHILATION_WEEKLY_ORUNDUM = 1800;

/** What the back catalogue is worth, if none of it has been collected yet. */
/**
 * The monthly card.
 *
 * The daily payout is read from the game: `checkin_table.monthlySubItem`, the
 * live group `mCard_1_2`, pays item 4003 (Orundum) x200 at each daily sign-in.
 * So it follows the SAME daily reset the daily mission does, and is counted the
 * same way rather than multiplied out by calendar days.
 *
 * The 6 Originite Prime for buying one is not in any client table -- the
 * purchase itself happens server-side, and `shop_client_table` names the good
 * (`GP_mCard_1`) without its contents. arknights.wiki.gg's Originite Prime page
 * states it: "The Monthly Card awards Originite Prime x6 in every purchase."
 */
export const MONTHLY_CARD_DAILY_ORUNDUM = 200;
export const MONTHLY_CARD_ORIGINITE = 6;
export const MONTHLY_CARD_DAYS = 30;

export interface MonthlyCard {
  cards: number;
  orundum: number;
  originitePrime: number;
}

/**
 * What a card holder gets over the window.
 *
 * Cards are ROUNDED UP, because the daily 200 is only paid while a card is
 * active: drawing it for 40 days means buying a second card on day 30, and
 * a reader who gets the Orundum for a fortnight has bought a card to get it.
 * The count is shown on its own line so anyone who already owns an active card
 * can see the assumption and discount it.
 */
export function monthlyCardIncome(income: Income): MonthlyCard {
  const cards = Math.ceil(income.days / MONTHLY_CARD_DAYS);
  return {
    cards,
    orundum: income.days * MONTHLY_CARD_DAILY_ORUNDUM,
    originitePrime: cards * MONTHLY_CARD_ORIGINITE,
  };
}

export interface Chapter {
  id: string;
  /** "Episode 11", or "Prologue". */
  label: string;
  /** The episode's own title, which is the half a reader recognises. */
  name: string;
  op: number;
  /** Its Originite Prime stages, by the game's stage id: what an import's cleared counts against. */
  stages: string[];
  /** Each of those stages as the game names it ("TR-S-1", "0-1 CM"), in the same order. */
  stageCodes: string[];
}

export interface PastEvent {
  id: string; name: string; type: string; kind: string; rerun: boolean;
  /** Whether the event has a token shop, and so stocks permits. */
  hasShop: boolean;
  /** In Record Restoration, or running right now -- i.e. you can still go and
   *  clear it. An event that has been and gone is not a pool to draw on. */
  playable: boolean;
  op: number;
  stages: string[];
  stageCodes: string[];
  /** When it opened on Global, as a day ("" when unknown): the order events are listed in. */
  start: string;
}

/** One first clear the reader can tick off: a resource stage or an Annihilation map. A
 *  permanent Annihilation pays no Orundum (amount 0) but Distinction Certificates (`certs`). */
export interface FirstClear { id: string; name: string; amount: number; certs?: number }

/**
 * The back catalogue, as the page's content release has it.
 *
 * A required argument rather than a module constant, because the constant was
 * the bug: compiled into the browser bundle, it froze the playable events at the
 * last deploy while the release's schedule moved on, and a new Global event was
 * marked "in the back catalogue" by the one and counted by neither. The page
 * gets this from getStaticProps (lib/pulls/sources.ts, run against the release's
 * data by the content export), the same call that marks `inBacklog`.
 */
export interface BacklogSources {
  chapters: WithStageIds<Chapter>[];
  originiteByStageType: Record<string, number>;
  annihilationOrundum: number;
  playable: (WithStageIds<Pick<PastEvent, 'id' | 'name' | 'op' | 'stages' | 'stageCodes'>> & { start?: string })[];
  resources: FirstClear[];
  annihilation: FirstClear[];
}

/** `stages` and `stageCodes` are absent from a release exported by code from before they were
 *  kept (the nightly release is compiled by main's code, so dev met one), and fillFromDeployment can
 *  only fill an item the deployment also knows. */
type WithStageIds<T extends { stages: string[]; stageCodes: string[] }> = Omit<T, 'stages' | 'stageCodes'> & { stages?: string[]; stageCodes?: string[] };

/**
 * The release's back catalogue with what an older release lacks filled in from the
 * deployment's own copy: each chapter's and event's stage ids and codes, each event's start
 * date, and the Annihilation maps it does not list (the permanent three, which pay
 * certificates rather than Orundum). The release's chapters and events stay the list: the
 * deployment's lags every Global event until a redeploy.
 */
export function fillFromDeployment(release: BacklogSources, deployment: BacklogSources): BacklogSources {
  const known = new Map<string, { stages?: string[]; stageCodes?: string[]; start?: string }>([...deployment.chapters, ...deployment.playable].map((item) => [item.id, item]));
  /* The codes go with the ids they were written for: a release's own ids keep codes only from
     a deployment entry with the very same ids. */
  const fill = <T extends { id: string; stages?: string[]; stageCodes?: string[]; start?: string }>(item: T): T => {
    const same = known.get(item.id);
    const start = item.start || same?.start;
    if (item.stages && item.stageCodes?.length === item.stages.length) return start === item.start ? item : { ...item, start };
    const stages = item.stages ?? same?.stages;
    const stageCodes = same?.stages && stages && same.stages.join() === stages.join() ? same.stageCodes : undefined;
    return { ...item, stages, stageCodes, ...(start ? { start } : {}) };
  };
  const listed = new Set(release.annihilation.map((map) => map.id));
  const annihilation = [...release.annihilation, ...deployment.annihilation.filter((map) => !listed.has(map.id))].sort((a, b) => a.id.localeCompare(b.id));
  return { ...release, chapters: release.chapters.map(fill), playable: release.playable.map(fill), annihilation };
}

/** The labels a reader knows these by; the gamedata's own words are internal. */
export const EVENT_TYPE_LABEL: Record<string, string> = {
  sidestory: 'Sidestory',
  ministory: 'Mini event',
  special: 'Collab / anniversary',
  branchline: 'Branchline',
};

/**
 * What is LEFT of the back catalogue once the player says what they have done.
 *
 * A returning player is the normal case, not the exception: telling somebody
 * with three years of clears that 2,717 Originite Prime is waiting for them is
 * worse than not offering the figure at all. `doneEvents` is the set of event
 * ids already cleared; `doneStageTypes` covers the non-event pools, which are
 * all-or-nothing in practice -- somebody who has played the main story has
 * cleared essentially all of it.
 */
export function remainingBacklog(
  backlog: BacklogSources,
  doneEvents: ReadonlySet<string>,
  /** Chapter ids the reader has cleared, plus 'daily' for the resource stages.
   *  One set, because they are one question: what have you already done. */
  doneKeys: ReadonlySet<string>,
  annihilationDone: boolean,
): { originitePrime: number; annihilationOrundum: number; orundum: number; permits: number } {
  let op = 0;
  for (const c of backlog.chapters) {
    if (!doneKeys.has(c.id)) op += c.op;
  }
  /* The resource stages are the only first clears the chapters do not cover.
     'activity' is the events, counted below; 'main' and 'sub' are the chapters. */
  for (const [type, n] of Object.entries(backlog.originiteByStageType)) {
    if (type === 'activity' || type === 'main' || type === 'sub') continue;
    if (!doneKeys.has(type)) op += type === 'daily' ? Math.max(0, n - backlog.resources.reduce((sum, stage) => sum + (doneKeys.has(stage.id) ? stage.amount : 0), 0)) : n;
  }
  // Archived stage clears do not reopen expired event shops. Current shops
  // are counted once, in the scheduled event rewards instead.
  const permits = 0;
  for (const ev of backlog.playable) {
    if (!doneEvents.has(ev.id)) op += ev.op;
  }
  const annihilationOrundum = annihilationDone ? 0 : Math.max(0, backlog.annihilationOrundum - backlog.annihilation.reduce((sum, stage) => sum + (doneKeys.has(stage.id) ? stage.amount : 0), 0));
  return {
    originitePrime: op,
    annihilationOrundum,
    orundum: op * ORUNDUM_PER_ORIGINITE + annihilationOrundum,
    permits,
  };
}

/**
 * The back catalogue as an imported account leaves it (lib/account/accountStore): each
 * chapter and event worth only its Originite stages the account has not cleared, a resource
 * stage done when cleared, and an Annihilation map done when every kill-count reward is
 * claimed. What it gives back is what remainingBacklog takes, so the totals and the
 * Unclaimed rewards panel come from one count. `annihilation` is null for a record from
 * before it was kept; the reader's own ticks say then.
 */
export function backlogFromAccount(backlog: BacklogSources, cleared: ReadonlySet<string>, annihilation: ReadonlySet<string> | null): {
  sources: BacklogSources; doneEvents: Set<string>; doneKeys: Set<string>;
} {
  /* An item whose stage ids neither the release nor the deployment has counts in full: an
     import cannot say what of it is cleared, and the page answers the minimum left only
     when it knows. */
  const left = ({ stages, op }: { stages?: string[]; op: number }) => (stages ? stages.filter((id) => !cleared.has(id)).length : op);
  const chapters = backlog.chapters.map((chapter) => ({ ...chapter, op: left(chapter) }));
  const playable = backlog.playable.map((event) => ({ ...event, op: left(event) }));
  const doneKeys = new Set([
    ...chapters.filter((chapter) => !chapter.op).map((chapter) => chapter.id),
    ...backlog.resources.filter((stage) => cleared.has(stage.id.replace(/^resource:/, ''))).map((stage) => stage.id),
    ...(annihilation ? backlog.annihilation.filter((map) => annihilation.has(map.id.replace(/^annihilation:/, ''))).map((map) => map.id) : []),
  ]);
  return { sources: { ...backlog, chapters, playable }, doneEvents: new Set(playable.filter((event) => !event.op).map((event) => event.id)), doneKeys };
}

/**
 * What an unticked chapter or event is still worth, with an import: what the import left of
 * it (backlogFromAccount's sources), or all of it when the import had it cleared and the
 * reader has unticked it since -- unticking says "count this", and counting nothing would make
 * the tick do nothing. A ticked one counts nothing either way (remainingBacklog).
 */
export function unclaimedBacklog(full: BacklogSources, fromAccount: BacklogSources): BacklogSources {
  const left = new Map([...fromAccount.chapters, ...fromAccount.playable].map((item) => [item.id, item.op]));
  const worth = <T extends { id: string; op: number }>(item: T): T => ({ ...item, op: left.get(item.id) || item.op });
  return { ...full, chapters: full.chapters.map(worth), playable: full.playable.map(worth) };
}

/*
 * A rerun of an event you have already cleared pays no Originite Prime -- the
 * first clears are spent. Two further things can come out of one, and neither
 * is counted here: the Intelligence Certification Store's 2,000 Orundum, which
 * only a player who bought the original shop out can reach, and the shop
 * operator handed out again, which a player who already has them converts to
 * Distinction Certificates. Both are conditional on what somebody did the first
 * time round, and this page answers the MINIMUM, so both are left out. They are
 * in the history if they are ever wanted back.
 */

/**
 * The Wishing Wall's floor, per day.
 *
 * You pick two tickets a day and keep only the HIGHEST -- the game's own rule
 * string says so -- and the possible values are 200/300/400/500/600/800. Both
 * picks coming up 200 is possible, so 200 a day is what is guaranteed. A day
 * under 400 earns a third pick tomorrow, which can only ever raise the result,
 * never lower it. Anything above 200 a day is luck.
 */
export { WISH_MIN_ORUNDUM } from './wishingWall';

/**
 * Headhunting permits an event's token shop stocks.
 *
 * NOT in the client data, and searched for thoroughly rather than assumed: an
 * event shop's only trace is `activity_table.basicInfo[act].templateShopId`, a
 * handle the client hands the server, which returns the stock. That id appears
 * nowhere else in any table, in either locale -- there is no goods list, no
 * price and no stock count to read. So this is a stated number, like
 * ORUNDUM_PER_PULL and MONTHLY_CARD_ORIGINITE before it: from the site owner,
 * who plays the game. Check in game before changing it.
 *
 * What IS derivable is whether an event has a shop at all, and that already
 * corrects the premise: only 64 of the 72 events that pay Originite have one.
 * The permits are gated on that flag, so a minigame -- which has no shop --
 * scores zero on its own rather than by being listed somewhere.
 */
export const EVENT_SHOP_PERMITS = 3;

export interface UpcomingBanner {
  name: string;
  aliases?: string[];
  /** The linked event still uses a predicted Global window in the schedule. */
  datesEstimated?: boolean;
  globalLineupPending?: boolean;
  category: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  days: number;
  sixStars: string[];
  alsoRatedUp: string[];
  image: string | null;
  event: string | null;
  rerun: boolean;
  op: number;
  opSource: 'cn' | 'global' | 'median' | 'none';
  cnAct: string | null;
  inBacklog: boolean;
  poolId: string | null;
  ruleType: string | null;
  freeDaily: number;
  freeTicket: number;
  freePulls: number;
  wishActId: string | null;
  wishDays: number;
  wishOrundum: number;
  hasShop: boolean;
}

/**
 * The free pulls a banner gives you, by a given moment.
 *
 * BANNER-LOCKED, which is the whole point: the ten-roll permit is issued for
 * that pool alone and the daily ones are pulls on that pool. They expire with
 * it. So they are never savings -- a limited banner running between now and the
 * one you are saving for hands you nothing you can carry forward, and folding
 * them into a running total would be the most flattering wrong number this page
 * could produce.
 *
 * They count only for the banner being ASKED about, and only as far as the date
 * asked about: the permit is there on day one, the daily pulls arrive one a day.
 * That is most of the difference between the day-one and last-day figures for a
 * limited banner, and it is a real difference -- 11 free pulls against 24.
 */
export function bannerFreePulls(banner: UpcomingBanner, when: Date): number {
  const start = new Date(`${banner.start}T00:00:00Z`).getTime();
  if (when.getTime() < start) return 0;
  const daysIn = Math.floor((when.getTime() - start) / 86400000) + 1;
  const daily = Math.max(0, Math.min(banner.freeDaily, daysIn));
  return banner.freeTicket + daily;
}

/** The reward schedule also contains events without a headhunting banner. */
export type PullEventReward = Pick<UpcomingBanner, 'name' | 'event' | 'start' | 'end' | 'rerun' | 'op' | 'opSource' | 'inBacklog' | 'hasShop' | 'wishActId' | 'wishDays' | 'wishOrundum'> & {
  shopPermits?: number;
  /** Preserve saved rerun choices previously keyed by banner name. */
  legacyNames?: string[];
};
export function eventWasCleared(event: PullEventReward, cleared: ReadonlySet<string>): boolean {
  return event.rerun && [event.name, ...(event.legacyNames ?? [])].some(name => cleared.has(name));
}
export function eventShopPermits(event: PullEventReward): number {
  return event.shopPermits ?? (event.hasShop ? EVENT_SHOP_PERMITS : 0);
}

export interface BannerHaul {
  /** Events whose Originite counts by the boundary, and what they pay. */
  op: number;
  /** Wishing Wall Orundum under the chosen scenario. Not an event clear, so a cleared rerun
   *  does not cancel it and the back catalogue does not already hold it. */
  wishOrundum: number;
  wishWalls: PullEventReward[];
  /** Permits from the event shops, in PULLS. Bought with event currency, so a
   *  rerun you have already cleared still sells them -- unlike its Originite,
   *  which is spent. */
  permits: number;
  shops: PullEventReward[];
  counted: PullEventReward[];
  skipped: PullEventReward[];
}

export interface RerunOptions {
  wishingWallMode?: WishingWallMode;
  /** Reruns the reader has already cleared, which therefore pay nothing. */
  cleared: ReadonlySet<string>;
}

/**
 * What scheduled events pay by a given moment, including bannerless events.
 *
 * An event's Originite counts once the event has FINISHED, not once it has
 * started. That is the conservative reading and the honest one for a question
 * of the form "can I afford it": an event running on the day you pull is not
 * money you can count on having cleared.
 *
 * A banner whose event is already in the back catalogue is skipped rather than
 * counted, because the back catalogue holds every event you can still play and
 * paying for it twice would be the easiest wrong number on the page.
 */
export function bannerHaul(
  banners: readonly PullEventReward[],
  by: Date,
  options: RerunOptions,
): BannerHaul {
  let op = 0;
  let wishOrundum = 0;
  let permits = 0;
  const counted: PullEventReward[] = [];
  const skipped: PullEventReward[] = [];
  const wishWalls: PullEventReward[] = [];
  const shops: PullEventReward[] = [];
  for (const b of banners) {
    const ended = new Date(`${b.end}T23:59:59Z`).getTime() <= by.getTime();
    if (!ended) continue;

    /* The Wishing Wall is checked FIRST and on its own terms. It pays Orundum
       rather than stage clears, so none of the event bookkeeping applies to it:
       a rerun you have already cleared still has its wall, and the back
       catalogue -- which holds first clears -- never contained it. */
    if (b.wishOrundum > 0) {
      wishOrundum += !options.wishingWallMode || options.wishingWallMode === 'minimum'
        ? b.wishOrundum
        : wishingWallOrundum(b.wishDays, options.wishingWallMode);
      wishWalls.push(b);
    }

    if (!b.event) continue;

    /* The shop sells permits for event currency, which a rerun hands out again
       -- so a rerun you have already cleared still pays these even though its
       first-clear Originite is gone. */
    if (eventShopPermits(b) > 0) {
      permits += eventShopPermits(b);
      shops.push(b);
    }
    if (b.inBacklog) { skipped.push(b); continue; }
    if (!eventWasCleared(b, options.cleared)) op += b.op;
    counted.push(b);
  }
  return { op, wishOrundum, wishWalls, permits, shops, counted, skipped };
}

export interface Holdings {
  orundum: number;
  originitePrime: number;
  /** Headhunting permits, counted in PULLS -- a ten-pull permit is ten. They
   *  are not currency and buy nothing else, so they are added at the end. */
  permits: number;
}

export interface Income {
  /** Daily resets crossed -- how many times the daily mission pays. */
  days: number;
  /** Weekly resets crossed -- the weekly mission AND the Annihilation cap. */
  weeks: number;
  /** Calendar months crossed, for the certificate shop's allowance. */
  months: number;
  daily: number;
  weekly: number;
  annihilation: number;
  /** Orundum only. Certificates are counted in pulls, not orundum. */
  orundum: number;
}

/**
 * How many times each reset falls in (from, to].
 *
 * COUNTED, not divided. `days / 7` is out by one most of the time: asking on a
 * Sunday about a banner ten days out crosses two weekly resets, not 1.43, and
 * the difference is 2,300 Orundum -- nearly four pulls. The site already knows
 * when the resets are (19:00 SGT daily, Monday for the week), so this walks
 * them rather than approximating.
 */
export function incomeBetween(from: Date, to: Date): Income {
  if (!(to > from)) {
    return { days: 0, weeks: 0, months: 0, daily: 0, weekly: 0, annihilation: 0, orundum: 0 };
  }
  /* Bounded so a nonsense date cannot spin: ten years of resets is far past any
     banner anyone is planning for. */
  let days = 0;
  for (let t = getNextDailyReset(from); t <= to && days < 4000; t = getNextDailyReset(t)) days += 1;
  let weeks = 0;
  for (let t = getAnnihilationNextEnd(from); t <= to && weeks < 600; t = getAnnihilationNextEnd(t)) weeks += 1;

  /* Calendar months, which is what a monthly shop allowance follows -- not
     30-day blocks. */
  const months = Math.max(
    0,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()),
  );

  const daily = days * DAILY_ORUNDUM;
  const weekly = weeks * WEEKLY_ORUNDUM;
  const annihilation = weeks * ANNIHILATION_WEEKLY_ORUNDUM;
  return { days, weeks, months, daily, weekly, annihilation, orundum: daily + weekly + annihilation };
}

export interface PullTotal {
  /** Orundum in hand, plus everything that converts to it. */
  orundum: number;
  fromOriginite: number;
  /** Pulls that need no Orundum at all. */
  permits: number;
  pulls: number;
  /** Orundum left over after the last whole pull. */
  remainder: number;
}

/**
 * Holdings plus income, as pulls.
 *
 * Permits are added at the end rather than converted: a permit IS a pull, it
 * buys nothing else, and folding it into an Orundum total would let leftover
 * permit "value" combine with leftover Orundum into a pull neither could
 * actually pay for.
 */
export function pullsFrom(held: Holdings, income: Income): PullTotal {
  const originite = Math.max(0, Math.floor(held.originitePrime || 0));
  const fromOriginite = originite * ORUNDUM_PER_ORIGINITE;
  const orundum = Math.max(0, Math.floor(held.orundum || 0)) + fromOriginite + income.orundum;
  const permits = Math.max(0, Math.floor(held.permits || 0));

  return {
    orundum,
    fromOriginite,
    permits,
    pulls: Math.floor(orundum / ORUNDUM_PER_PULL) + permits,
    remainder: orundum % ORUNDUM_PER_PULL,
  };
}
