#!/usr/bin/env node
/**
 * Checks the pull calculator's arithmetic.
 *
 * WHY THIS EXISTS. Every number it produces is plausible. "You will have 47
 * pulls" is not a claim anybody can check by eye, and the two ways it goes
 * wrong are both silent: counting resets by dividing (`days / 7`) is off by one
 * most weeks, and a certificate pile that ignores the monthly cap buys pulls
 * the shop would never sell. So the resets are counted against known dates and
 * the caps are asserted.
 *
 * Run:  npm run audit:pulls
 */
import {
  ANNIHILATION_WEEKLY_ORUNDUM, DAILY_ORUNDUM, ORUNDUM_PER_ORIGINITE, ORUNDUM_PER_PULL,
  WEEKLY_ORUNDUM,
  MONTHLY_CARD_DAILY_ORUNDUM, MONTHLY_CARD_DAYS, MONTHLY_CARD_ORIGINITE,
  EVENT_SHOP_PERMITS, WISH_MIN_ORUNDUM, bannerFreePulls,
  bannerHaul, incomeBetween, monthlyCardIncome,
  pullsFrom, remainingBacklog,
} from '@/lib/pulls/pulls';
import {
  EVENT_TYPES, ONE_TIME, EXCLUDED_EVENTS, PAST_EVENTS, PLAYABLE_EVENTS,
  ALL_BANNERS, bannersAfter, bundledBacklogSources, futureEventOrundum,
} from '@/lib/pulls/sources';

let failures = 0;
function check(label: string, cond: boolean, saw = '') {
  if (!cond) { failures++; console.log(`FAIL  ${label}${saw ? ` -- saw ${saw}` : ''}`); }
  else console.log(`ok    ${label}`);
}

/* The reset clock is 19:00 SGT = 11:00 UTC; the weekly one is Monday.
   2026-09-07 is a Monday, so these dates are chosen to sit either side of a
   known weekly reset rather than at an arbitrary offset. */
const at = (iso: string) => new Date(iso);

/* --- counting, not dividing ------------------------------------------------ */
const oneDay = incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-09-04T12:00:00Z'));
check('one day spans exactly one daily reset', oneDay.days === 1, String(oneDay.days));
check('  and pays one daily mission', oneDay.daily === DAILY_ORUNDUM, String(oneDay.daily));

const justUnder = incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-09-03T10:59:00Z'));
check('a window that ends before it starts pays nothing', justUnder.orundum === 0 && justUnder.days === 0);

/* Thursday 3 Sep -> Sunday 13 Sep is ten days and crosses ONE Monday reset
   (7 Sep). Dividing would say 10/7 = 1.43 and round to either 1 or 2; the
   difference is a whole week of Annihilation. */
const tenDays = incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-09-13T12:00:00Z'));
check('ten days from a Thursday crosses 1 Monday reset, not 1.43',
  tenDays.weeks === 1, `${tenDays.weeks}`);
check('  ten daily resets in ten days', tenDays.days === 10, String(tenDays.days));
check('  so orundum = 10x100 + 1x500 + 1x1800',
  tenDays.orundum === 10 * DAILY_ORUNDUM + WEEKLY_ORUNDUM + ANNIHILATION_WEEKLY_ORUNDUM,
  String(tenDays.orundum));

/* THE CASE THAT DISCRIMINATES. Saturday -> Tuesday is three days and crosses
   one Monday reset; `days / 7` gives ZERO. Without this, the ten-day and
   fortnight cases above pass either way (10/7 and 14/7 both round to the right
   answer by luck), so they prove nothing about counting vs dividing -- which is
   exactly how an audit ends up green while the bug it was written for is live. */
const shortWeek = incomeBetween(at('2026-09-05T12:00:00Z'), at('2026-09-08T12:00:00Z'));
check('Sat -> Tue is 3 days but still crosses a Monday reset (days/7 would say 0)',
  shortWeek.weeks === 1 && shortWeek.days === 3, `${shortWeek.weeks} weeks / ${shortWeek.days} days`);
check('  so it pays a full week of Annihilation',
  shortWeek.annihilation === ANNIHILATION_WEEKLY_ORUNDUM, String(shortWeek.annihilation));

/* Two Mondays in a fortnight, always. */
const fortnight = incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-09-17T12:00:00Z'));
check('a fortnight crosses exactly 2 weekly resets', fortnight.weeks === 2, String(fortnight.weeks));
check('  and 14 daily resets', fortnight.days === 14, String(fortnight.days));

/* --- conversions ----------------------------------------------------------- */
const nothing = pullsFrom({ orundum: 0, originitePrime: 0, permits: 0 },
  incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-09-03T12:00:00Z')));
check('nothing in, nothing out', nothing.pulls === 0 && nothing.orundum === 0);

const zeroWindow = incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-09-03T12:00:00Z'));
const exact = pullsFrom({ orundum: 6000, originitePrime: 0, permits: 0 }, zeroWindow);
check('6000 orundum is exactly 10 pulls', exact.pulls === 10 && exact.remainder === 0, String(exact.pulls));

const partial = pullsFrom({ orundum: 599, originitePrime: 0, permits: 0 }, zeroWindow);
check('599 orundum is 0 pulls, not a fraction', partial.pulls === 0 && partial.remainder === 599);

const op = pullsFrom({ orundum: 0, originitePrime: 10, permits: 0 }, zeroWindow);
check('10 Originite Prime = 1800 orundum = 3 pulls',
  op.fromOriginite === 10 * ORUNDUM_PER_ORIGINITE && op.pulls === 3, `${op.fromOriginite}/${op.pulls}`);

/* The certificate shop is deliberately NOT counted -- see the note in the model.
   The calendar-month count it used stays checked, because the income walk still
   reports it and a future feature will want it right. */
const quarter = incomeBetween(at('2026-09-03T12:00:00Z'), at('2026-12-03T12:00:00Z'));
check('Sep -> Dec is 3 calendar months', quarter.months === 3, String(quarter.months));

/* --- the one-time pools, against the committed data ------------------------ */
/* A floor, not the current figure: the pool legitimately moves as events enter
   Record Restoration and as new chapters ship, and a check pinned to today's
   number would fail every time the data refreshed. It catches the collapse --
   a broken join writing zeroes -- which is the failure that would otherwise
   render as a confident, wrong page. */
check('Originite Prime pool is in the thousands, not collapsed',
  ONE_TIME.originitePrime > 1200, String(ONE_TIME.originitePrime));
check('  and its stage types add up to the total',
  Object.values(ONE_TIME.originiteByStageType).reduce((a, b) => a + b, 0) === ONE_TIME.originitePrime);
check('Annihilation one-time orundum is tens of thousands',
  ONE_TIME.annihilationOrundum > 40000, String(ONE_TIME.annihilationOrundum));
check('  across dozens of maps', ONE_TIME.annihilationMaps >= 30, String(ONE_TIME.annihilationMaps));

/* A brand-new account collecting the whole back catalogue, stated as pulls so
   the number means something. */
const backlog = pullsFrom(
  { orundum: ONE_TIME.annihilationOrundum, originitePrime: ONE_TIME.originitePrime, permits: 0 },
  zeroWindow,
);
console.log(`\n  (the whole back catalogue: ${backlog.orundum.toLocaleString()} orundum = ${backlog.pulls} pulls)`);
check('the back catalogue is a four-figure orundum pile at least', backlog.orundum > 100000);

/* --- events, past and future ----------------------------------------------- */
check('every past event that pays OP is listed', PAST_EVENTS.length > 60, String(PAST_EVENTS.length));
check('the PLAYABLE events account for exactly the activity Originite counted',
  PLAYABLE_EVENTS.reduce((n, e) => n + e.op, 0) === ONE_TIME.originiteByStageType.activity,
  `${PLAYABLE_EVENTS.reduce((n, e) => n + e.op, 0)} vs ${ONE_TIME.originiteByStageType.activity}`);

/* Record Restoration is what makes a past event collectable. Asserted because
   the back catalogue silently doubles without it. */
check('gone events are kept for the medians but not the backlog',
  PAST_EVENTS.length > PLAYABLE_EVENTS.length, `${PAST_EVENTS.length} vs ${PLAYABLE_EVENTS.length}`);
check('  no mini event is offered as still-clearable (they never rerun)',
  !PLAYABLE_EVENTS.some((e) => e.type === 'ministory'),
  PLAYABLE_EVENTS.filter((e) => e.type === 'ministory').map((e) => e.name).join(', '));
check('  Hymnoi Wisdom is gone without being named anywhere',
  !PLAYABLE_EVENTS.some((e) => /hymnoi/i.test(e.name)));
check('  but mini events still inform the future estimate',
  EVENT_TYPES.ministory.events >= 15, String(EVENT_TYPES.ministory?.events));
check('  and the permanent pools are untouched by playability',
  ONE_TIME.originiteByStageType.main > 500 && ONE_TIME.originiteByStageType.sub > 60,
  `main ${ONE_TIME.originiteByStageType.main}, sub ${ONE_TIME.originiteByStageType.sub}`);

/* The minigames the gamedata wrongly credits. Asserted rather than assumed,
   because the correction is invisible once applied: nothing on the page would
   look wrong if Icebreaker Games crept back in with its 88 phantom Originite. */
check('the co-op, duel and April Fools events are excluded', EXCLUDED_EVENTS.length >= 6, String(EXCLUDED_EVENTS.length));
check('  and none of them is still counted as a real event',
  !PAST_EVENTS.some((e) => EXCLUDED_EVENTS.some((x) => x.id === e.id)));
check('  Icebreaker Games is among them',
  EXCLUDED_EVENTS.some((e) => /icebreaker/i.test(e.name)));
check('  they claimed a hundred-odd Originite between them',
  EXCLUDED_EVENTS.reduce((n, e) => n + e.claimed, 0) > 100,
  String(EXCLUDED_EVENTS.reduce((n, e) => n + e.claimed, 0)));
check('  and every one is a known minigame kind, not a sidestory',
  EXCLUDED_EVENTS.every((e) => /MULTIPLAY|ENEMY_DUEL|APRIL_FOOL/.test(e.kind)));
check('each event type has a measured median inside its own range',
  Object.values(EVENT_TYPES).every((t) => t.median >= t.low && t.median <= t.high && t.events > 0));

const twoSide = futureEventOrundum({ sidestory: 2 });
check('two future sidestories = 2 x the measured median',
  twoSide.op === 2 * EVENT_TYPES.sidestory.median && twoSide.events === 2, String(twoSide.op));
check('  and convert at the Originite rate',
  twoSide.orundum === twoSide.op * ORUNDUM_PER_ORIGINITE, String(twoSide.orundum));
check('an unknown event type is ignored rather than counted as zero-ish',
  futureEventOrundum({ nonsense: 5 }).events === 0);
check('a negative count cannot subtract Originite', futureEventOrundum({ sidestory: -3 }).op === 0);

/* --- the back catalogue, once a returning player ticks things off ----------- */
const none = new Set<string>();
const backlogSources = bundledBacklogSources();
const full = remainingBacklog(backlogSources, none, none, false);
check('nothing ticked = the whole catalogue',
  full.originitePrime === ONE_TIME.originitePrime
  && full.annihilationOrundum === ONE_TIME.annihilationOrundum,
  `${full.originitePrime}`);

const allDone = remainingBacklog(
  backlogSources,
  new Set(PAST_EVENTS.map((e) => e.id)),
  new Set([...ONE_TIME.chapters.map((c) => c.id), ...Object.keys(ONE_TIME.originiteByStageType)]),
  true,
);
check('everything ticked = nothing left', allDone.orundum === 0, String(allDone.orundum));

/* --- the mainline, chapter by chapter -------------------------------------- */
const mainline = (ONE_TIME.originiteByStageType.main ?? 0) + (ONE_TIME.originiteByStageType.sub ?? 0);
check('the chapters account for every mainline stage, adverse modes included',
  ONE_TIME.chapters.reduce((n, c) => n + c.op, 0) === mainline,
  `${ONE_TIME.chapters.reduce((n, c) => n + c.op, 0)} vs ${mainline}`);
check('every chapter is named and pays something',
  ONE_TIME.chapters.every((c) => c.id && c.label && c.op > 0),
  ONE_TIME.chapters.filter((c) => !c.id || !c.label || c.op <= 0).map((c) => c.id).join(', '));
check('no two chapters share an id',
  new Set(ONE_TIME.chapters.map((c) => c.id)).size === ONE_TIME.chapters.length);

const oneChapter = ONE_TIME.chapters[3];
const chapterDone = remainingBacklog(backlogSources, none, new Set([oneChapter.id]), false);
check('ticking one chapter removes exactly that chapter',
  full.originitePrime - chapterDone.originitePrime === oneChapter.op,
  `${full.originitePrime - chapterDone.originitePrime} vs ${oneChapter.op}`);

const allChapters = remainingBacklog(backlogSources, none, new Set(ONE_TIME.chapters.map((c) => c.id)), false);
check('ticking every chapter removes the whole mainline and nothing else',
  full.originitePrime - allChapters.originitePrime === mainline,
  String(full.originitePrime - allChapters.originitePrime));

const oneEvent = PAST_EVENTS[0];
const minusOne = remainingBacklog(backlogSources, new Set([oneEvent.id]), none, false);
check('ticking one event removes exactly that event',
  full.originitePrime - minusOne.originitePrime === oneEvent.op,
  `${full.originitePrime - minusOne.originitePrime} vs ${oneEvent.op}`);

check('ticking Annihilation removes its orundum but no Originite',
  remainingBacklog(backlogSources, none, none, true).annihilationOrundum === 0
  && remainingBacklog(backlogSources, none, none, true).originitePrime === full.originitePrime);

/* ---------------------------------------------------------------- the card */
const cardWindow = incomeBetween(at('2026-09-01T00:00:00Z'), at('2026-10-15T00:00:00Z'));
const mc = monthlyCardIncome(cardWindow);
check('monthly card pays the daily rate once per counted daily reset',
  mc.orundum === cardWindow.days * MONTHLY_CARD_DAILY_ORUNDUM,
  `${mc.orundum} over ${cardWindow.days} days`);
check('a window longer than one card needs a second card',
  cardWindow.days > MONTHLY_CARD_DAYS && mc.cards === Math.ceil(cardWindow.days / MONTHLY_CARD_DAYS),
  `${mc.cards} cards for ${cardWindow.days} days`);
check('each card pays its Originite once, not per day',
  mc.originitePrime === mc.cards * MONTHLY_CARD_ORIGINITE, String(mc.originitePrime));
check('a zero-length window buys no card and pays nothing',
  monthlyCardIncome(incomeBetween(new Date(0), new Date(0))).orundum === 0
  && monthlyCardIncome(incomeBetween(new Date(0), new Date(0))).originitePrime === 0);

/* -------------------------------------------------------------- the banners */
const noReruns = { cleared: new Set<string>() };
const farFuture = at('2030-01-01T00:00:00Z');

check('every banner has a start before its end',
  ALL_BANNERS.every((b) => b.start < b.end),
  String(ALL_BANNERS.filter((b) => !(b.start < b.end)).length));
check('every banner with an event has a payout from a named source',
  ALL_BANNERS.every((b) => !b.event || b.opSource !== 'none'),
  ALL_BANNERS.filter((b) => b.event && b.opSource === 'none').map((b) => b.name).join(', '));

/* The one that would be silent: an event that is both in the back catalogue and
   attached to a coming banner, counted once in each, paying the reader twice. */
const overlap = ALL_BANNERS.filter((b) => b.inBacklog);
const everything = bannerHaul(ALL_BANNERS, farFuture, noReruns);
check('a banner whose event is in the back catalogue is skipped, not counted',
  everything.counted.every((b) => !b.inBacklog)
  && everything.skipped.length === overlap.length,
  `${everything.skipped.length} skipped of ${overlap.length} overlapping`);
check('nothing appears in both the counted and the skipped lists',
  !everything.counted.some((b) => everything.skipped.includes(b)));

/* An event pays when it FINISHES, so a boundary inside its run must not count it. */
const withEvents = ALL_BANNERS.filter((b) => b.event && !b.inBacklog);
if (withEvents.length > 0) {
  const first = withEvents[0];
  const midRun = new Date(`${first.start}T12:00:00Z`);
  check('an event still running at the boundary is not counted yet',
    !bannerHaul([first], midRun, noReruns).counted.includes(first));
  check('the same event counts once it has ended',
    bannerHaul([first], new Date(`${first.end}T23:59:59Z`), noReruns).counted.includes(first));
}

/* The rerun switches. Each must move the total by exactly its own amount and
   nothing else -- the failure mode here is a switch that looks live and is not,
   which is exactly what the reader reported the last time one was. */
const reruns = ALL_BANNERS.filter((b) => b.rerun && b.event && !b.inBacklog);
if (reruns.length > 0) {
  const one = reruns[0];
  const uncleared = bannerHaul([one], farFuture, noReruns);
  const cleared = bannerHaul([one], farFuture, { cleared: new Set([one.name]) });
  check('clearing a rerun removes exactly its Originite',
    uncleared.op - cleared.op === one.op,
    `${uncleared.op - cleared.op} vs ${one.op}`);
  check('clearing a rerun leaves every other banner alone',
    bannerHaul(ALL_BANNERS, farFuture, { cleared: new Set([one.name]) }).op
      === bannerHaul(ALL_BANNERS, farFuture, noReruns).op - one.op);

  check('marking a NON-rerun cleared changes nothing -- only reruns can be',
    ALL_BANNERS.filter((b) => !b.rerun && b.event && !b.inBacklog).every(
      (b) => bannerHaul([b], farFuture, { cleared: new Set([b.name]) }).op === b.op,
    ));
}

/* ------------------------------------------------------------- the permits */
const zero = incomeBetween(new Date(0), new Date(0));
check('a permit is a pull, added whole',
  pullsFrom({ orundum: 0, originitePrime: 0, permits: 7 }, zero).pulls === 7);
check('permits do not top up an Orundum shortfall into a pull it cannot pay for',
  pullsFrom({ orundum: ORUNDUM_PER_PULL - 1, originitePrime: 0, permits: 1 }, zero).pulls === 1,
  String(pullsFrom({ orundum: ORUNDUM_PER_PULL - 1, originitePrime: 0, permits: 1 }, zero).pulls));
check('and the leftover Orundum is still reported as leftover',
  pullsFrom({ orundum: ORUNDUM_PER_PULL - 1, originitePrime: 0, permits: 1 }, zero).remainder
    === ORUNDUM_PER_PULL - 1);
check('a negative permit count cannot subtract pulls',
  pullsFrom({ orundum: ORUNDUM_PER_PULL, originitePrime: 0, permits: -5 }, zero).pulls === 1);
check('a fractional permit count is floored, not rounded up',
  pullsFrom({ orundum: 0, originitePrime: 0, permits: 2.9 }, zero).pulls === 2);

/* ------------------------------------------------- free pulls, banner-locked */
const withFree = ALL_BANNERS.filter((b) => b.freePulls > 0);
check('free pulls attach ONLY to pools the gacha table types LIMITED',
  withFree.every((b) => b.ruleType === 'LIMITED'),
  withFree.filter((b) => b.ruleType !== 'LIMITED').map((b) => `${b.name}=${b.ruleType}`).join(', '));
check('and every LIMITED banner in range has them',
  ALL_BANNERS.filter((b) => b.ruleType === 'LIMITED' && b.freePulls === 0).length === 0
  || withFree.length > 0);
check('a banner our file calls "limited" but the pool does not gets nothing',
  ALL_BANNERS.filter((b) => b.category === 'limited' && b.ruleType !== 'LIMITED')
    .every((b) => b.freePulls === 0),
  ALL_BANNERS.filter((b) => b.category === 'limited' && b.ruleType !== 'LIMITED' && b.freePulls > 0)
    .map((b) => b.name).join(', '));
check('free pulls are the ten-roll permit plus one a day',
  withFree.every((b) => b.freePulls === b.freeTicket + b.freeDaily));

if (withFree.length > 0) {
  const lim = withFree[0];
  check('nothing is free before the banner opens',
    bannerFreePulls(lim, new Date(`${lim.start}T00:00:00Z`).getTime() - 86400000 > 0
      ? new Date(new Date(`${lim.start}T00:00:00Z`).getTime() - 86400000) : new Date(0)) === 0);
  check('day one gives the permit and a single daily pull',
    bannerFreePulls(lim, new Date(`${lim.start}T12:00:00Z`)) === lim.freeTicket + 1,
    String(bannerFreePulls(lim, new Date(`${lim.start}T12:00:00Z`))));
  check('the last day gives the permit and every daily pull',
    bannerFreePulls(lim, new Date(`${lim.end}T23:59:59Z`)) === lim.freeTicket + lim.freeDaily,
    String(bannerFreePulls(lim, new Date(`${lim.end}T23:59:59Z`))));
  check('the daily pulls never exceed their own count, however late you ask',
    bannerFreePulls(lim, at('2030-01-01T00:00:00Z')) === lim.freeTicket + lim.freeDaily);
}

/* -------------------------------------------------------- the Wishing Wall */
const walls = ALL_BANNERS.filter((b) => b.wishOrundum > 0);
check('every Wishing Wall pays days times the guaranteed floor',
  walls.every((b) => b.wishOrundum === b.wishDays * WISH_MIN_ORUNDUM),
  walls.filter((b) => b.wishOrundum !== b.wishDays * WISH_MIN_ORUNDUM).map((b) => b.name).join(', '));
check('a wall only ever attaches to a LIMITED pool',
  walls.every((b) => b.ruleType === 'LIMITED'),
  walls.filter((b) => b.ruleType !== 'LIMITED').map((b) => `${b.name}=${b.ruleType}`).join(', '));

if (walls.length > 0) {
  const w = walls[0];
  check('a wall still running at the boundary is not counted yet',
    bannerHaul([w], new Date(`${w.start}T12:00:00Z`), noReruns).wishOrundum === 0);
  check('and counts in full once it has finished',
    bannerHaul([w], new Date(`${w.end}T23:59:59Z`), noReruns).wishOrundum === w.wishOrundum,
    String(bannerHaul([w], new Date(`${w.end}T23:59:59Z`), noReruns).wishOrundum));
  /* The wall is Orundum, not a first clear -- so it survives everything that
     cancels an event's Originite.
     Tested against a SYNTHETIC rerun rather than a real one: no banner on
     record is both a rerun and a wall, so asserting it on real data passed
     even with the rule deliberately broken. A check that cannot fail is not a
     check. */
  const rerunWithWall = { ...w, name: `${w.name} (synthetic rerun)`, rerun: true };
  check('clearing a rerun does not cancel its wall',
    bannerHaul([rerunWithWall], farFuture, { cleared: new Set([rerunWithWall.name]) })
      .wishOrundum === w.wishOrundum,
    String(bannerHaul([rerunWithWall], farFuture, { cleared: new Set([rerunWithWall.name]) }).wishOrundum));
  check('...while that same clear DOES cancel its Originite, so the two are independent',
    bannerHaul([rerunWithWall], farFuture, { cleared: new Set([rerunWithWall.name]) }).op === 0
    && bannerHaul([rerunWithWall], farFuture, noReruns).op === w.op);
  check('a wall on a back-catalogue banner is still paid, being Orundum not a clear',
    ALL_BANNERS.filter((b) => b.inBacklog && b.wishOrundum > 0)
      .every((b) => bannerHaul([b], farFuture, noReruns).wishOrundum === b.wishOrundum));
}

/* --------------------------------------------------- event shop permits */
const shopBanners = ALL_BANNERS.filter((b) => b.event && !b.inBacklog && b.hasShop);
check('permits are paid only by events that actually have a shop',
  bannerHaul(ALL_BANNERS.filter((b) => b.event && !b.inBacklog && !b.hasShop), farFuture, noReruns)
    .permits === 0);
check('and every shop event pays exactly its allowance',
  bannerHaul(shopBanners, farFuture, noReruns).permits === shopBanners.length * EVENT_SHOP_PERMITS,
  `${bannerHaul(shopBanners, farFuture, noReruns).permits} vs ${shopBanners.length * EVENT_SHOP_PERMITS}`);

if (shopBanners.length > 0) {
  const sb = shopBanners[0];
  check('a shop still running at the boundary has not been shopped yet',
    bannerHaul([sb], new Date(`${sb.start}T12:00:00Z`), noReruns).permits === 0);

  /* The behaviour the owner asked for in as many words: "you can buy them even
     in reruns". Synthetic, because no real banner is both a rerun and a shop
     event in the current window -- and a check that cannot fire is not a check. */
  const rerunShop = { ...sb, name: `${sb.name} (synthetic rerun)`, rerun: true };
  const clearedHaul = bannerHaul([rerunShop], farFuture, { cleared: new Set([rerunShop.name]) });
  check('a rerun you have already cleared STILL sells its permits',
    clearedHaul.permits === EVENT_SHOP_PERMITS, String(clearedHaul.permits));
  check('...while that same clear still cancels its Originite',
    clearedHaul.op === 0);
}

/* Archived first clears do not reopen event shops. */
check('the back catalogue never invents permits from expired shops',
  remainingBacklog(backlogSources, none, none, false).permits === 0);
check('clearing archived events does not change scheduled shop permits',
  remainingBacklog(backlogSources, new Set(PLAYABLE_EVENTS.map(e => e.id)), none, false).permits === 0);

check('bannersAfter drops what has already ended',
  bannersAfter(farFuture).length === 0 && bannersAfter(new Date(0)).length === ALL_BANNERS.length,
  `${bannersAfter(farFuture).length} / ${bannersAfter(new Date(0)).length} of ${ALL_BANNERS.length}`);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll pull checks passed.');
process.exit(failures ? 1 : 0);
