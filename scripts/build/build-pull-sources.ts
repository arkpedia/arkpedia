#!/usr/bin/env node
/**
 * What a player can still collect ONCE, written out for the pull planner.
 *
 * Two pools, and they are one-time by nature -- you clear a stage for the first
 * time once, and you break an Annihilation's kill ladder once:
 *
 *   Originite Prime   every stage whose first clear pays one. ONE per stage,
 *                     and a challenge/adverse mode counts as its own stage --
 *                     which is already how data/stages is filed, so counting
 *                     the records IS counting the reward. (Confirmed in game:
 *                     "its one per normal mode and one per advanced/challenge/
 *                     adverse".)
 *   Orundum           the Annihilation break ladders. The three PERMANENT maps
 *                     pay none; the rotating ones pay at four kill counts, and
 *                     the newer maps pay more than the old ones. This is the
 *                     one-time half only -- the 1800/week you can farm is
 *                     recurring income and lives in lib/planner/pulls.ts.
 *
 * Derived, not typed in: the stage records are the site's own, and the ladders
 * come from the upstream campaign_table, so a new Annihilation or a new event
 * changes these numbers by re-running this rather than by anyone remembering.
 *
 * Run:  npx tsx scripts/build-pull-sources.ts
 */
import fs from 'fs';
import path from 'path';
import { resolvePullBannerWindows } from '../../lib/pulls/bannerWindows';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

const ROOT = process.cwd();
const STAGES = path.join(ROOT, 'data', 'stages');
const EN_EXCEL = path.join(ROOT, '.cache/upstream/en-gamedata/en/gamedata/excel');
const CAMPAIGN = path.join(EN_EXCEL, 'campaign_table.json');
const ACTIVITY = path.join(EN_EXCEL, 'activity_table.json');
const RETRO = path.join(EN_EXCEL, 'retro_table.json');
// The commit the checkout above holds when a refresh pinned it (pin-upstream.mjs), else the
// branch: what the missing-table hints below tell you to download.
const ENGLISH_REF = /^[a-f0-9]{40}$/.test(process.env.ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSGAMEDATA ?? '')
  ? process.env.ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSGAMEDATA : 'master';
const BANNERS = path.join(ROOT, 'data', 'headhunting_banners.json');
/* CN runs about half a year ahead, so every event global has not had yet has
   already happened there, stages and all. */
const CN_EXCEL = process.env.PULL_CN_DATA_DIR
  ?? path.join(ROOT, '.cache/upstream/cn-resource/gamedata/excel');
const CN_STAGES = path.join(CN_EXCEL, 'stage_table.json');
const CN_ACTIVITY = path.join(CN_EXCEL, 'activity_table.json');
const CN_GACHA = path.join(CN_EXCEL, 'gacha_table.json');
const OUT = path.join(ROOT, 'data', 'pull-sources.json');

const ORIGINITE_PRIME = '4002';
const ORUNDUM = '4003';

/**
 * Event kinds whose stages pay NO Originite Prime, whatever the table says.
 *
 * The gamedata is wrong here, and provably so: `stage_table` gives Duel
 * Channel's VS-1 a `{id: 4002, type: DIAMOND, dropType: COMPLETE}` reward, and
 * the game does not pay it. Confirmed in game -- "some events don't have stages
 * that reward OP, like icebreaker games, or duel channel, or april fools day
 * events. those only reward materials." The site's own stage records copy the
 * table faithfully, so the correction has to live here.
 *
 * Excluded BY TYPE rather than by event id, so the next co-op or April Fools
 * event is caught without anybody adding it to a list. The types are the
 * gamedata's own, out of activity_table.basicInfo[].type.
 */
const NO_ORIGINITE_TYPES = new Set([
  'MULTIPLAY', 'MULTIPLAY_V3', 'MULTIPLAY_VERIFY2', // Icebreaker Games, the co-op mode
  'ENEMY_DUEL',                                      // Duel Channel
  'APRIL_FOOL',
]);

interface StageRecord {
  id?: string;
  /** The stage's code as the game shows it ("TR-S-1"): what the planner names a stage left by. */
  code?: string;
  variant?: { kind?: string } | null;
  stage_type?: string;
  chapter?: number;
  zone?: { id?: string; name?: string; group?: string };
  event?: { id?: string };
  drops?: { item?: { id?: string } }[];
}

/* A stage's name in the planner's "not cleared" lists. A Challenge Mode or six-star clear
   pays its own Originite Prime under the same code as the stage, so it says which it is. */
const VARIANT_SUFFIX: Record<string, string> = { challenge_mode: ' CM', six_star: ' 6★' };
const stageLabel = (rec: StageRecord) => `${rec.code || rec.id}${VARIANT_SUFFIX[rec.variant?.kind ?? ''] ?? ''}`;

function originiteFromStages(countableEventIds: ReadonlySet<string>) {
  const byType: Record<string, number> = {};
  /* The mainline, chapter by chapter, so a returning player can tick off what
     they have cleared instead of the whole of it at once.
     Grouped by ZONE, not by the chapter field: the adverse-mode stages (H15-1
     and the like) carry no chapter number at all, and grouping by zone puts
     them back with the episode they belong to, which is where a player looking
     for them would expect them. Episodes 15 and 16 ship as activities rather
     than mainline zones, so they have no group name either, and fall back to
     their own chapter number. */
  /* Each chapter's stages too, by the game's stage id, so an imported account's cleared
     stages (lib/account/accountStore) say exactly what is left of it. */
  const zones: Record<string, { id: string; label: string; name: string; op: number; chapter: number; stages: string[]; codes: Record<string, string> }> = {};
  let total = 0;
  for (const file of fs.readdirSync(STAGES)) {
    if (!file.endsWith('.json')) continue;
    let rec: StageRecord;
    try {
      rec = JSON.parse(fs.readFileSync(path.join(STAGES, file), 'utf8'));
    } catch {
      continue;
    }
    if (!(rec.drops ?? []).some((d) => d.item?.id === ORIGINITE_PRIME)) continue;
    /* An event's Originite counts only if the event can still be played -- and
       a minigame's never counts, whatever the table claims.
       ACTIVITY stages only: main-story and side chapters carry an event id too,
       because episodes ship alongside events, and gating those on Record
       Restoration wrongly wrote off 115 chapters of permanent content that has
       never gone anywhere. */
    if (rec.stage_type === 'activity' && rec.event?.id && !countableEventIds.has(rec.event.id)) continue;
    const type = rec.stage_type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    total += 1;

    if (type === 'main' || type === 'sub') {
      const id = rec.zone?.id ?? 'unzoned';
      const z = zones[id] ?? (zones[id] = {
        id,
        label: rec.zone?.group ?? '',
        name: rec.zone?.name ?? '',
        op: 0,
        chapter: Number.POSITIVE_INFINITY,
        stages: [],
        codes: {},
      });
      z.op += 1;
      if (rec.id) { z.stages.push(rec.id); z.codes[rec.id] = stageLabel(rec); }
      if (typeof rec.chapter === 'number' && rec.chapter >= 0) z.chapter = Math.min(z.chapter, rec.chapter);
    }
  }

  const chapters = Object.values(zones)
    .sort((a, b) => a.chapter - b.chapter)
    .map((z) => ({
      id: z.id,
      label: z.label || (Number.isFinite(z.chapter) ? `Episode ${z.chapter}` : z.name),
      name: z.name,
      op: z.op,
      stages: z.stages.sort(),
      stageCodes: z.stages.map((id) => z.codes[id]),
    }));

  /* The chapters ARE the mainline, so they must add up to it exactly. If a zone
     shape ever changes, this fails the build rather than quietly dropping an
     episode's worth of Originite out of the back catalogue. */
  const mainline = (byType.main ?? 0) + (byType.sub ?? 0);
  const chaptered = chapters.reduce((n, c) => n + c.op, 0);
  const unnamed = chapters.filter((c) => c.stages.length !== c.op).map((c) => c.id);
  if (unnamed.length) throw new Error(`build-pull-sources: a stage with no id in ${unnamed.join(', ')}; every Originite stage must name its stage id.`);
  if (chaptered !== mainline) {
    throw new Error(
      `build-pull-sources: the chapters add up to ${chaptered} but the mainline is ${mainline}.`
      + ' Every main and sub stage must land in exactly one chapter.',
    );
  }

  return { total, byType, chapters };
}

/**
 * Every past event, and what its first clears paid.
 *
 * Two jobs. It lets a returning player tick off the events they have already
 * cleared instead of being told they have the whole back catalogue waiting, and
 * it is where the FUTURE-event estimate comes from: the typical payout of an
 * event of each kind, measured rather than assumed.
 *
 * Measured, because the hand model and the data disagree. "8 normal + 8 EX,
 * both with challenge = 32" is a fair description of a modern sidestory, and
 * the median sidestory in this dataset pays 29 -- the spread runs 15 to 40,
 * because events differ in how many stages carry a challenge mode and older
 * ones are smaller. A median off real events beats a tidy number off a
 * prototype event nobody ran.
 */
function eventBreakdown() {
  if (!fs.existsSync(ACTIVITY)) {
    throw new Error(
      `build-pull-sources: missing ${path.relative(ROOT, ACTIVITY)}.\n`
      + '  It is what says which events are minigames rather than real events, and\n'
      + '  without it this would credit Icebreaker Games with 88 Originite Prime it\n'
      + '  does not pay. Fetch it with\n'
      + '  Run `npm run stages:refresh` first so the shared EN gamedata checkout\n'
      + '  contains activity_table.json.',
    );
  }
  const basicInfo = (JSON.parse(fs.readFileSync(ACTIVITY, 'utf8')) as {
    basicInfo?: Record<string, {
      type?: string; name?: string; startTime?: number; endTime?: number;
      /** The event's token shop. A handle the client sends to the server, which
          returns the stock -- the goods themselves are in no client table, so
          this says only WHETHER there is a shop, never what is in it. */
      templateShopId?: string | null;
    }>;
  }).basicInfo ?? {};

  /**
   * Which events you can still go and play.
   *
   * An event that has run and gone is not a pool anybody can draw on, and
   * counting it makes the back catalogue a number about the past rather than
   * about what is available -- "only events that can be still played should be
   * counted. so events that had their rerun and have record restoration."
   *
   * Record Restoration is the game's own permanent archive, and it keeps its own
   * table: retroActList, whose linkedActId names the original run and the rerun
   * that were folded into it. So this is derived, not judged -- a sidestory
   * entering Restoration next month starts counting the day the table says so,
   * and Hymnoi Wisdom drops out without being named, because it is simply not
   * in there.
   */
  if (!fs.existsSync(RETRO)) {
    throw new Error(
      `build-pull-sources: missing ${path.relative(ROOT, RETRO)}.\n`
      + '  It is what says which past events are still playable via Record\n'
      + '  Restoration; without it the back catalogue counts events that are gone.\n'
      + '  curl -sSL -o .cache/upstream/en-gamedata/en/gamedata/excel/retro_table.json \\\n'
      + `    https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${ENGLISH_REF}/en/gamedata/excel/retro_table.json`,
    );
  }
  const retro = JSON.parse(fs.readFileSync(RETRO, 'utf8')) as {
    retroActList?: Record<string, { linkedActId?: string[] }>;
  };
  const restored = new Set<string>();
  for (const r of Object.values(retro.retroActList ?? {})) {
    for (const act of r.linkedActId ?? []) restored.add(act);
  }
  const nowSec = Math.floor(Date.now() / 1000);

  interface Ev {
    id: string; name: string; type: string; kind: string; rerun: boolean; playable: boolean; op: number;
    /** Does this event have a token shop at all. Derivable; what the shop
     *  STOCKS is not -- see EVENT_SHOP_PERMITS in the model. */
    hasShop: boolean;
    /** Its Originite Prime stages, by the game's stage id (an imported account's cleared). */
    stages: string[];
    /** Each of those stages' code as the game shows it, in the same order. */
    stageCodes: string[];
    codes: Record<string, string>;
    /** When it opened on Global (activity_table basicInfo.startTime), as a day: the order the
     *  Free OP Tracker lists events in. */
    start: string;
  }
  const events = new Map<string, Ev>();
  for (const file of fs.readdirSync(STAGES)) {
    if (!file.endsWith('.json')) continue;
    let rec: StageRecord & { event?: { id?: string; name?: string; type?: string; is_rerun?: boolean } };
    try {
      rec = JSON.parse(fs.readFileSync(path.join(STAGES, file), 'utf8'));
    } catch {
      continue;
    }
    const ev = rec.event;
    if (rec.stage_type !== 'activity' || !ev?.id) continue;
    if (!events.has(ev.id)) {
      events.set(ev.id, {
        id: ev.id,
        name: ev.name || ev.id,
        /* Untyped events are the collabs and the big anniversary ones; they pay
           the most, so they are their own bucket rather than lumped in. */
        type: ev.type || 'special',
        /* The gamedata's own activity kind, which is what tells a real event
           from a minigame. */
        kind: basicInfo[ev.id]?.type ?? 'UNKNOWN',
        rerun: !!ev.is_rerun,
        /* 104 of 278 activities carry one. "Every event has a shop" is already
           false before you get to what is in it: A Flurry to the Flame, Heart
           of Surging Flame and Code of Brawl have none, and neither does any
           minigame. */
        hasShop: !!basicInfo[ev.id]?.templateShopId,
        /* In the permanent archive, or running right now. Anything else has
           been and gone. */
        playable: restored.has(ev.id)
          || ((basicInfo[ev.id]?.startTime ?? 0) <= nowSec && (basicInfo[ev.id]?.endTime ?? 0) > nowSec),
        op: 0,
        stages: [],
        stageCodes: [],
        codes: {},
        start: basicInfo[ev.id]?.startTime ? new Date(basicInfo[ev.id]!.startTime! * 1000).toISOString().slice(0, 10) : '',
      });
    }
    if ((rec.drops ?? []).some((d) => d.item?.id === ORIGINITE_PRIME)) {
      events.get(ev.id)!.op += 1;
      if (rec.id) { events.get(ev.id)!.stages.push(rec.id); events.get(ev.id)!.codes[rec.id] = stageLabel(rec); }
    }
  }

  const all = [...events.values()].filter((e) => e.op > 0).map(({ codes, ...e }) => {
    const stages = e.stages.sort();
    return { ...e, stages, stageCodes: stages.map((id) => codes[id]) };
  });
  const unnamed = all.filter((e) => e.stages.length !== e.op).map((e) => e.id);
  if (unnamed.length) throw new Error(`build-pull-sources: a stage with no id in ${unnamed.join(', ')}; every Originite stage must name its stage id.`);
  const excluded = all
    .filter((e) => NO_ORIGINITE_TYPES.has(e.kind))
    .map((e) => ({ id: e.id, name: e.name, kind: e.kind, claimed: e.op }))
    .sort((a, b) => b.claimed - a.claimed);
  const list = all
    .filter((e) => !NO_ORIGINITE_TYPES.has(e.kind))
    .sort((a, b) => b.op - a.op);

  /* The typical payout per kind, as a MEDIAN, over EVERY event of that kind --
     including the ones you can no longer play. A future mini event is
     collectable when it runs, so what past mini events paid is exactly the
     evidence for what the next one pays; whether the old ones are still open
     has nothing to do with it. Only the BACK CATALOGUE is gated on playability.
     The mean is dragged around by the one 44-stage anniversary and by a handful
     of tiny early events; the median is the better guess. */
  const typical: Record<string, { median: number; low: number; high: number; events: number }> = {};
  for (const e of list) {
    (typical[e.type] ??= { median: 0, low: 0, high: 0, events: 0 }).events += 1;
  }
  for (const type of Object.keys(typical)) {
    const ops = list.filter((e) => e.type === type).map((e) => e.op).sort((a, b) => a - b);
    typical[type] = {
      median: ops[Math.floor(ops.length / 2)],
      low: ops[0],
      high: ops[ops.length - 1],
      events: ops.length,
    };
  }
  return { list, typical, excluded };
}

/**
 * How much Originite Prime each CN activity's first clears paid.
 *
 * This is the SAME test the global side uses -- a stage counts when its rewards
 * carry item 4002 -- run against CN's tables, and the two agree exactly: of the
 * 68 events that exist in both, all 68 come out with the same figure and none
 * differs. That is what makes it safe to use for events global has not had yet.
 */
function cnOriginiteByActivity(): Record<string, number> {
  if (!fs.existsSync(CN_STAGES) || !fs.existsSync(CN_ACTIVITY) || !fs.existsSync(CN_GACHA)) {
    throw new Error(
      'build-pull-sources: missing the CN tables.\n'
      + '  Upcoming events have not run on global, so their payout is read from CN,\n'
      + '  which is roughly six months ahead. Without them every future event falls\n'
      + '  back to its kind\'s median, which called a mini event 29 OP when it pays 18.\n'
      + '  Run `npm run stages:refresh` first, or point PULL_CN_DATA_DIR at a\n'
      + '  directory containing activity_table.json, stage_table.json, and\n'
      + '  gacha_table.json.',
    );
  }
  const stages = (JSON.parse(fs.readFileSync(CN_STAGES, 'utf8')) as {
    stages?: Record<string, {
      stageId?: string; zoneId?: string;
      stageDropInfo?: { displayDetailRewards?: { id?: string }[] };
    }>;
  }).stages ?? {};
  const out: Record<string, number> = {};
  for (const st of Object.values(stages)) {
    const rewards = st.stageDropInfo?.displayDetailRewards ?? [];
    if (!rewards.some((r) => r.id === ORIGINITE_PRIME)) continue;
    /* A stage names its activity in its own zone id: act53side_zone1. */
    const m = (st.zoneId ?? '').match(/^(act[0-9a-z]+?)_(zone|sub|perm)/)
      ?? (st.stageId ?? '').match(/^(act[0-9a-z]+?)_/);
    if (m) out[m[1]] = (out[m[1]] ?? 0) + 1;
  }
  return out;
}

/**
 * The Wishing Wall, and what it is guaranteed to pay.
 *
 * The mechanic, from the game's own rule strings in activity_table.dynActs:
 *   rule1  "用尽当日次数选取的所有许愿签中，合成玉数量最多的1张许愿签为当日最终奖励"
 *          -- of the tickets you pick that day, only the SINGLE HIGHEST counts.
 *          You do not add them up.
 *   rule2  "当日许愿签合成玉奖励不足400时，次日可选择3张许愿签"
 *          -- a day under 400 buys you a third pick tomorrow.
 *
 * The prize values are NOT in the client data; the draw is server-side. The EN
 * wiki states them for the Mount Karlan wall: "The possible Orundum values in
 * each Wishing Ticket are 200, 300, 400, 500, 600, 800", picking two of ten
 * daily and keeping the highest, with picks that do not stack.
 *
 * So the GUARANTEED figure -- which is all this page promises -- is the lowest
 * value, every day: both picks coming up 200 is possible, so 200 a day is the
 * floor. rule2 only ever adds picks, so it cannot lower it. Anything above 200
 * a day is luck, and luck is not counted here.
 */
const WISH_MIN_ORUNDUM = 200;

/**
 * Which wall ran when. A wall is an activity carrying a `slotCount` in dynActs,
 * and every one of the 16 on record opened on exactly the same day as a LIMITED
 * gacha pool -- a 0.0 day gap, sixteen times out of sixteen -- so the wall is
 * matched to its banner by that shared start date rather than by name.
 *
 * Not every limited banner has one. Through to late 2024 they alternated, the
 * May and November banners going without. From 2024-11-01 every LIMITED pool
 * has had one, eight consecutively. A banner with no wall record gets nothing
 * rather than an assumed one, which keeps the figure a floor.
 */
function luckyWallsByStartDate(activity: {
  basicInfo?: Record<string, { id?: string; startTime?: number; endTime?: number }>;
  dynActs?: Record<string, { slotCount?: number; rule1?: string; rule2?: string }>;
}) {
  const info = activity.basicInfo ?? {};
  const out: Record<string, { actId: string; days: number; orundum: number }> = {};
  for (const [actId, dyn] of Object.entries(activity.dynActs ?? {})) {
    if (!dyn?.slotCount) continue;
    const b = info[actId];
    if (!b?.startTime || !b?.endTime) continue;
    /* One pick-day per day the wall is open. The windows run a few hours short
       of a whole number of days, so this rounds. */
    const days = Math.round((b.endTime - b.startTime) / 86400);
    if (days <= 0) continue;
    out[new Date(b.startTime * 1000).toISOString().slice(0, 10)] = {
      actId,
      days,
      orundum: days * WISH_MIN_ORUNDUM,
    };
  }
  return out;
}

/**
 * The free pulls a banner hands out, read from the gacha table.
 *
 * Two things, and both are BANNER-LOCKED -- they are pulls on that pool and
 * expire with it, so they can never be saved towards a later banner:
 *
 *   `limitTenGachaItem`  a ten-roll permit issued for that banner alone. The
 *                        item_table entry says so: "Can be used at a certain
 *                        time to recruit talented Operators, 10 rolls at once."
 *   `freeGacha`          {poolId, openTime, endTime, freeCount}. freeCount is 1
 *                        and every window measured is 14 days, which is where
 *                        the fourteen free daily pulls come from -- one a day,
 *                        claimed daily, not accumulated.
 *
 * Keyed off the pool's OWN rule type, never off our banner file's `category`.
 * The two spellings disagree: the Monster Hunter collabs are `category:
 * "limited"` in the banner file while the gacha table types them LINKAGE, and
 * LINKAGE pools get nothing. Trusting the category would have credited those two
 * banners 24 free pulls each that the game does not give.
 */
const FREE_TICKET_PULLS = 10;

// Older mirrors serialize this enum by name; the current CN resource mirror
// serializes the same game enum by number. Normalize both representations at
// the boundary so generated public data stays readable and source-independent.
const GACHA_RULE_NAMES: Record<number, string> = {
  0: 'NORMAL',
  1: 'LIMITED',
  2: 'LINKAGE',
  3: 'ATTAIN',
  4: 'CLASSIC',
  5: 'SINGLE',
  6: 'FESCLASSIC',
  7: 'CLASSIC_ATTAIN',
  8: 'SPECIAL',
  9: 'DOUBLE',
  10: 'CLASSIC_DOUBLE',
  11: 'RETURN',
};

const gachaRuleName = (value: string | number | undefined) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return GACHA_RULE_NAMES[value] ?? `RULE_${value}`;
  return null;
};

function freePullsByPool(gacha: {
  gachaPoolClient?: { gachaPoolId?: string; gachaRuleType?: string | number; openTime?: number; endTime?: number }[];
  freeGacha?: { poolId?: string; openTime?: number; endTime?: number; freeCount?: number }[];
  limitTenGachaItem?: { itemId?: string; endTime?: number }[];
}) {
  const pools = gacha.gachaPoolClient ?? [];
  const free = new Map((gacha.freeGacha ?? []).map((f) => [f.poolId ?? '', f]));
  const tenEnds = new Set((gacha.limitTenGachaItem ?? []).map((t) => t.endTime));

  /* The invariant, asserted rather than assumed: free pulls attach to LIMITED
     pools and to nothing else. Measured both ways on both locales -- every
     LIMITED pool has a freeGacha entry, and no other rule type has one. If that
     ever stops being true the rule above is wrong, and this says so loudly
     instead of quietly paying the wrong banners. */
  const limited = pools.filter((p) => gachaRuleName(p.gachaRuleType) === 'LIMITED');
  const missing = limited.filter((p) => !free.has(p.gachaPoolId ?? ''));
  const stray = [...free.keys()].filter((id) => !limited.some((p) => p.gachaPoolId === id));
  if (missing.length || stray.length) {
    throw new Error(
      'build-pull-sources: free pulls are no longer LIMITED-only.\n'
      + `  LIMITED pools with no freeGacha entry: ${missing.map((p) => p.gachaPoolId).join(', ') || 'none'}\n`
      + `  freeGacha entries on other rule types: ${stray.join(', ') || 'none'}\n`
      + '  Re-derive the rule before trusting the free-pull figures.',
    );
  }

  const out: Record<string, { daily: number; ticket: number; total: number }> = {};
  for (const p of pools) {
    /* LIMITED only, and this is load-bearing rather than tidy. The ten-roll
       permit is matched by END TIME, and pools run concurrently and end
       together -- so a NORMAL pool sharing a LIMITED one's end time picked up
       its permit and was credited 10 free pulls it does not give. Caught by the
       audit, not by reading. */
    if (gachaRuleName(p.gachaRuleType) !== 'LIMITED') continue;
    const id = p.gachaPoolId ?? '';
    const f = free.get(id);
    /* One free pull per day, counted over the window the entry itself carries.
       Rounded because the windows run a few hours short of whole days. */
    const days = f && f.openTime && f.endTime
      ? Math.round((f.endTime - f.openTime) / 86400)
      : 0;
    const daily = f ? (f.freeCount ?? 0) * days : 0;
    const ticket = tenEnds.has(p.endTime) ? FREE_TICKET_PULLS : 0;
    if (daily || ticket) out[id] = { daily, ticket, total: daily + ticket };
  }
  return out;
}

/**
 * The banners still to come, which is what a player is actually saving for.
 *
 * Dates are READ, not estimated: every banner carries its own global run, so
 * "two weeks, three for an anniversary, ten days for a rerun" is a rule of
 * thumb this does not need.
 *
 * The payout of the event each banner ships with is read too. A banner records
 * the CN dates it ran on, and CN is far enough ahead that the event has already
 * happened there -- so the banner is matched to a CN activity by date and the
 * activity's stages are counted. That is a measurement, not an estimate, and it
 * matters: the medians would have called Deterministic Chaos a 29 OP sidestory
 * when it is a mini event paying 18, and Sealed With Time 29 when it pays 40.
 * The median survives only as the fallback for a banner with no CN match.
 */
function upcomingBanners(
  events: { list: { id: string; name: string; type: string; op: number; playable: boolean }[]; typical: Record<string, { median: number }> },
) {
  interface Banner {
    name: string; category: string; start: string; end: string; days: number;
    /** The operators the banner is FOR -- the ones on its art. */
    sixStars: string[];
    /** A celebration banner also boosts a pool of past limiteds. Useful, but
        secondary: showing these as the headline named three operators the art
        does not, on a banner whose whole point is Closure and Kal'tsit. */
    alsoRatedUp: string[];
    image: string | null;
    event: string | null; rerun: boolean;
    op: number;
    /** Where the figure came from, because a count and a guess must not look alike. */
    opSource: 'cn' | 'global' | 'median' | 'none';
    cnAct: string | null;
    /** Already sitting in the back catalogue, so counting it here too would
        pay a player twice for one event. */
    inBacklog: boolean;
    /** The gacha pool this banner IS, and what it hands out free. Banner-locked:
        these pulls expire with the pool and cannot be saved for anything else. */
    poolId: string | null;
    ruleType: string | null;
    freeDaily: number;
    freeTicket: number;
    freePulls: number;
    /** The Wishing Wall running alongside, at its guaranteed floor. Unlike the
        free pulls this is ORUNDUM, so it carries forward like any other. */
    wishActId: string | null;
    wishDays: number;
    wishOrundum: number;
    /** Whether the event shipping with this banner has a token shop. */
    hasShop: boolean;
  }
  const raw = resolvePullBannerWindows(JSON.parse(fs.readFileSync(BANNERS, 'utf8')) as HeadhuntingBanner[]);
  const cnOp = cnOriginiteByActivity();
  const cnGacha = JSON.parse(fs.readFileSync(CN_GACHA, 'utf8')) as Parameters<typeof freePullsByPool>[0];
  const freeByPool = freePullsByPool(cnGacha);
  const cnPools = cnGacha.gachaPoolClient ?? [];
  const walls = luckyWallsByStartDate(
    JSON.parse(fs.readFileSync(CN_ACTIVITY, 'utf8')) as Parameters<typeof luckyWallsByStartDate>[0],
  );
  const cnBasic = (JSON.parse(fs.readFileSync(CN_ACTIVITY, 'utf8')) as {
    basicInfo?: Record<string, {
      id?: string; type?: string; hasStage?: boolean; startTime?: number;
      templateShopId?: string | null;
    }>;
  }).basicInfo ?? {};

  const one = (x: string) => {
    const m = (x || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const range = (s: unknown) => {
    if (typeof s !== 'string') return null;
    const parts = s.split(/[\u2013\u2014]/).map((x) => x.trim());
    const start = one(parts[0]);
    const end = one(parts[1] ?? '');
    return start && end ? { start, end } : null;
  };

  /* Event names arrive decorated -- "[Rerun] Act or Die Rerun" -- so both sides
     are folded to letters and digits before matching. */
  const fold = (s: string) => s.toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\brerun\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const byName = new Map(events.list.map((e) => [fold(e.name), e]));

  const out: Banner[] = [];
  for (const b of raw) {
    const g = range(b.global_date);
    if (!g) continue;
    const linked = typeof b.linked_event === 'string' ? b.linked_event : null;
    const rerun = !!linked && /rerun/i.test(linked);

    /* Match to a CN activity by the CN run date the banner records. Six days of
       slack, because an event usually opens a day either side of its banner. */
    const cnStart = one(String(b.cn_date ?? '').split(/[\u2013\u2014]/)[0] ?? '');
    let cnAct: string | null = null;
    if (linked && cnStart) {
      let best = Infinity;
      for (const a of Object.values(cnBasic)) {
        if (!a.hasStage || !a.id || !a.startTime) continue;
        const d = Math.abs(a.startTime * 1000 - cnStart);
        if (d <= 6 * 86400000 && d < best) { best = d; cnAct = a.id; }
      }
    }

    /* The banner IS a CN gacha pool, found the same way its event is: by the CN
       date the banner records. That gives the pool's own rule type, which is
       what decides free pulls -- our file's `category` disagrees with it. */
    let pool: (typeof cnPools)[number] | null = cnPools.find(pool => pool.gachaPoolId === b.cnPoolId) ?? null;
    if (!pool && cnStart) {
      let best = Infinity;
      for (const p of cnPools) {
        if (!p.openTime) continue;
        const d = Math.abs(p.openTime * 1000 - cnStart);
        if (d <= 4 * 86400000 && d < best) { best = d; pool = p; }
      }
    }
    const freebies = pool ? freeByPool[pool.gachaPoolId ?? ''] : undefined;
    const wall = pool?.openTime
      ? walls[new Date(pool.openTime * 1000).toISOString().slice(0, 10)]
      : undefined;

    /* A minigame pays nothing whatever its stage rows claim -- the same
       correction the global side makes, by the same activity types. */
    const cnType = cnAct ? (cnBasic[cnAct]?.type ?? '') : '';
    const minigame = NO_ORIGINITE_TYPES.has(cnType);

    const known = linked ? byName.get(fold(linked)) : undefined;
    let op = 0;
    let opSource: Banner['opSource'] = 'none';
    if (!linked) {
      opSource = 'none';
    } else if (minigame) {
      op = 0; opSource = 'cn';
    } else if (cnAct && cnOp[cnAct] !== undefined) {
      op = cnOp[cnAct]; opSource = 'cn';
    } else if (known) {
      op = known.op; opSource = 'global';
    } else {
      op = events.typical.sidestory?.median ?? 0; opSource = 'median';
    }

    out.push({
      name: String(b.name ?? ''),
      ...(Array.isArray(b.aliases) ? { aliases: b.aliases } : {}),
      category: String(b.category ?? 'standard'),
      start: new Date(g.start).toISOString().slice(0, 10),
      end: new Date(g.end).toISOString().slice(0, 10),
      days: Math.round((g.end - g.start) / 86400000),
      sixStars: Array.isArray(b.six_stars) ? (b.six_stars as string[]) : [],
      alsoRatedUp: (Array.isArray(b.rate_up_six_stars) ? (b.rate_up_six_stars as string[]) : [])
        .filter((n) => !(Array.isArray(b.six_stars) ? (b.six_stars as string[]) : []).includes(n)),
      image: typeof b.banner_image === 'string' ? b.banner_image : null,
      event: linked,
      rerun,
      op,
      opSource,
      cnAct,
      /* The back catalogue already carries every event you can still play, so a
         banner for one of those must not add its Originite a second time. */
      inBacklog: !!known && known.playable,
      poolId: pool?.gachaPoolId ?? null,
      ruleType: gachaRuleName(pool?.gachaRuleType),
      freeDaily: freebies?.daily ?? 0,
      freeTicket: freebies?.ticket ?? 0,
      freePulls: freebies?.total ?? 0,
      wishActId: wall?.actId ?? null,
      wishDays: wall?.days ?? 0,
      wishOrundum: wall?.orundum ?? 0,
      hasShop: !!(cnAct && cnBasic[cnAct]?.templateShopId),
    });
  }
  /* Every banner on record, in order. Which of them are still to come is
     decided by the PAGE against the reader's own clock -- a build is a snapshot
     and a deploy outlives it, so a banner that ended after the build but before
     the visit would otherwise still be offered. */
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Distinction Certificate, the yellow one. */
const DISTINCTION = '4004';

function orundumFromAnnihilation() {
  if (!fs.existsSync(CAMPAIGN)) {
    throw new Error(
      `build-pull-sources: missing ${path.relative(ROOT, CAMPAIGN)}.\n`
      + '  It is the upstream gamedata cache; fetch it with\n'
      + '  curl -sSL -o .cache/upstream/en-gamedata/en/gamedata/excel/campaign_table.json \\\n'
      + `    https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${ENGLISH_REF}/en/gamedata/excel/campaign_table.json`,
    );
  }
  const table = JSON.parse(fs.readFileSync(CAMPAIGN, 'utf8')) as {
    campaigns: Record<string, { breakLadders?: { rewards?: { id: string; count: number }[] }[] }>;
  };
  const maps: { id: string; orundum: number }[] = [];
  /* The three permanent maps (Chernobog, Lungmen Outskirts and Downtown) pay no Orundum: their
     kill-count rewards are LMD, battle records and certificates. Listed by their Distinction
     Certificates, so the tracker shows every Annihilation the game has. */
  const certMaps: { id: string; certs: number }[] = [];
  let total = 0;
  for (const [id, camp] of Object.entries(table.campaigns || {})) {
    const rewards = (camp.breakLadders ?? []).flatMap((l) => l.rewards ?? []);
    const orundum = rewards.filter((r) => r.id === ORUNDUM).reduce((n, r) => n + r.count, 0);
    const certs = rewards.filter((r) => r.id === DISTINCTION).reduce((n, r) => n + r.count, 0);
    if (orundum > 0) { maps.push({ id, orundum }); total += orundum; } else if (certs > 0) certMaps.push({ id, certs });
  }
  maps.sort((a, b) => a.id.localeCompare(b.id));
  certMaps.sort((a, b) => a.id.localeCompare(b.id));
  return { total, maps, certMaps };
}

const events = eventBreakdown();
const originite = originiteFromStages(
  new Set(events.list.filter((e) => e.playable).map((e) => e.id)),
);
const annihilation = orundumFromAnnihilation();
const banners = upcomingBanners(events);

/* Floors, because the failure this guards against is a silent one: an empty
   data/stages or a campaign_table whose shape moved would write a plausible
   file full of zeroes, and the page would report a confident "0 OP to collect"
   rather than breaking. */
if (originite.total < 1000) {
  throw new Error(`build-pull-sources: only ${originite.total} stages pay Originite Prime -- expected thousands. Check data/stages.`);
}
if (annihilation.maps.length < 10) {
  throw new Error(`build-pull-sources: only ${annihilation.maps.length} Annihilation maps pay Orundum -- expected dozens. Check campaign_table.`);
}

if (events.list.length < 40) {
  throw new Error(`build-pull-sources: only ${events.list.length} events pay Originite Prime -- expected dozens. Check the event field on data/stages.`);
}

const out = {
  /* Regenerate with: npx tsx scripts/build-pull-sources.ts */
  generatedFrom: 'data/stages/*.json + upstream campaign_table.json',
  originitePrime: originite,
  annihilationOrundum: annihilation,
  events,
  banners,
};
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Originite Prime from first clears : ${originite.total}`);
for (const [k, v] of Object.entries(originite.byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${v}`);
}
console.log(`Orundum from Annihilation ladders : ${annihilation.total} across ${annihilation.maps.length} maps`);
if (events.excluded.length) {
  console.log(`Excluded, minigame events the table wrongly credits:`);
  for (const e of events.excluded) console.log(`  ${String(e.claimed).padStart(3)} OP  ${e.kind.padEnd(18)} ${e.name}`);
}
const playable = events.list.filter((e) => e.playable);
console.log(`Events paying Originite Prime     : ${events.list.length} (${playable.length} still playable, ${playable.reduce((n, e) => n + e.op, 0)} OP)`);
for (const [type, t] of Object.entries(events.typical).sort((a, b) => b[1].events - a[1].events)) {
  console.log(`  ${type.padEnd(12)} ${String(t.events).padStart(3)} events, typically ${t.median} OP (${t.low}-${t.high})`);
}
const upcoming = banners.filter((b) => new Date(`${b.end}T23:59:59Z`).getTime() > Date.now());
console.log(`Banners (upcoming, of ${banners.length} on record): ${upcoming.length}`);
for (const b of upcoming) {
  console.log(`  ${b.start} -> ${b.end} ${String(b.days).padStart(2)}d ${b.rerun ? 'RERUN' : '     '} `
    + `${String(b.op).padStart(3)} OP ${b.opSource.padEnd(6)} `
    + `${(b.ruleType ?? '?').padEnd(9)} ${b.freePulls ? `+${b.freePulls} free ` : '         '}`
    + `${b.wishOrundum ? `wall ${b.wishDays}d=${b.wishOrundum} ` : '                '}`
    + `${b.inBacklog ? 'in-backlog ' : '           '}${b.name.slice(0, 32)}`);
}
console.log(`wrote ${path.relative(ROOT, OUT)}`);

// Keep bannerless event rewards refreshed alongside the banner/backlog data.
import './build-pull-event-rewards';
