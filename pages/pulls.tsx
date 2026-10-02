import BannerPicker from '@/components/pulls/BannerPicker';
import PullBannerRow from '@/components/pulls/PullBannerRow';
import workspace from '@/styles/pulls/pulls-workspace.module.css';
import { RewardAmount } from "@/components/pulls/RewardAmount";
import DataLink from '@/components/account/DataLink';
import ImportDialog from '@/components/account/ImportDialog';
import { PastRewards } from '@/components/pulls/PastRewards';
import { certificatePulls, greenCertificateIncome, selectedIncome, DEFAULT_INCOME_SETTINGS, type IncomeSettings } from '@/lib/pulls/incomeSettings';
import { getAllEvents } from '@/lib/schedule/schedule';
import { getEventCalendar } from '@/lib/home/frontPageContent';
import { currentPullPlan } from '@/lib/pulls/currentPlan';
import { withContentPage } from '@/lib/content/server';
import { ContentImg } from '@/components/content/ContentImage';
import { formatDayMonth, formatDayMonthYear, formatNumber, formatOneDecimal } from '@/lib/pulls/format';
import { pullSkinCollections, skinReleaseDates, type SkinCollection } from '@/lib/pulls/skinCollections';
import { getBannerOdds } from '@/lib/pulls/bannerOdds';
import type { BannerOdds } from '@/lib/pulls/probability';
import { WISHING_WALL_LABELS, type WishingWallMode } from '@/lib/pulls/wishingWall';
import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import { getPullEventSchedule, getPullSchedule } from '@/lib/pulls/schedule';
import { bundledBacklogSources } from '@/lib/pulls/sources';
import { useRouter } from 'next/router';
import { getAllSkins } from '@/lib/skins/skins';
import StyledSelect from '@/components/ui/StyledSelect';
import PageHeader from '@/components/ui/PageHeader';
import { DetailOptionContent, type DetailOption } from '@/components/pulls/DetailOption';
import { IncludePastCheckbox } from '@/components/pulls/IncludePastCheckbox';
import SkinPlanner from '@/components/skins/SkinPlanner';
import { SkinsHelp } from '@/components/pulls/PlannerHelp';
import { useSkinPlan } from '@/lib/skins/skinPlan';
import { useAccount } from '@/lib/account/accountStore';
import { usePastRewards } from '@/lib/pulls/usePastRewards';
import { pullSkinCatalogue, skinReservation, type PlannedSkin } from '@/lib/pulls/skins';
import { availableBannerFreePulls, goalsAtBannerEnd, MAX_GOALS, PULL_PLAN_KEY, parsePullPlan, planBudgets, planNumber, savingsAfterPlanAt, validPlanDate, type BannerGoal, type SavedPullPlan } from '@/lib/pulls/plan';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ANNIHILATION_WEEKLY_ORUNDUM, DAILY_ORUNDUM, ORUNDUM_PER_ORIGINITE, ORUNDUM_PER_PULL,
  MONTHLY_CARD_DAILY_ORUNDUM, MONTHLY_CARD_ORIGINITE,
  WEEKLY_ORUNDUM,
  eventWasCleared, eventShopPermits, bannerHaul, incomeBetween, monthlyCardIncome,
  fillFromDeployment, pullsFrom,
  type BacklogSources, type Holdings, type UpcomingBanner, type PullEventReward,
} from '@/lib/pulls/pulls';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A number the reader typed, floored at zero. Empty reads as zero rather than
 *  NaN, because a NaN here propagates into every figure on the page. */
function readNumber(raw: string): number {
  return planNumber(raw);
}

function Field({
  label, unit, value, onChange, icon,
}: {
  label: string; unit: string; value: string; onChange: (v: string) => void; icon?: string;
}) {
  return (
    <label className="pulls-field" title={icon ? label : undefined}>
      <span className="pulls-field-label">{/* eslint-disable-next-line @next/next/no-img-element */}
        {icon && <ContentImg src={icon} alt="" width="28" height="28" />}{label}</span>
      <span className="pulls-field-box">
        <input
          type="text"
          inputMode="numeric"
          onFocus={event => event.currentTarget.select()}
          onClick={event => event.currentTarget.select()}
          value={value}
          onChange={(e) => /^\d{0,8}$/.test(e.target.value) && Number(e.target.value) <= 10_000_000 && onChange(e.target.value)}
          placeholder="0"
          aria-label={label}
        />
        <span className="pulls-field-unit">{unit}</span>
      </span>
    </label>
  );
}

/** Events in the list that actually pay: a rerun you have cleared is shown but
 *  contributes nothing, and counting it would overstate the line above it. */
function haulCountedPaying(counted: PullEventReward[], cleared: ReadonlySet<string>): number {
  return counted.filter((b) => b.op > 0 && !eventWasCleared(b, cleared)).length;
}

/** One line of the condensed income report: the source, its working, and its pulls. */
function ReportRow({ what, how, pulls, off }: { what: string; how: string; pulls: number; off: boolean }) {
  return (
    <tr className={off ? 'muted' : undefined}>
      <th scope="row">{what}</th>
      <td>{off ? 'off' : how}</td>
      <td>{off ? '—' : formatOneDecimal(pulls)}</td>
    </tr>
  );
}

type PullsProps = { skinCollections: SkinCollection[]; bannerOdds: Record<string, BannerOdds>; scheduledEvents: PullEventReward[]; scheduledBanners: UpcomingBanner[]; skinCatalogue: PlannedSkin[]; backlogSources: BacklogSources };

export default function PullsPage({ scheduledEvents, scheduledBanners, skinCatalogue, skinCollections, bannerOdds, backlogSources }: PullsProps) {
  const router = useRouter();
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [skinsOpen, setSkinsOpen] = useState(false);
  const [choosingBanner, setChoosingBanner] = useState(false);
  const [editingBanner, setEditingBanner] = useState<string | null>(null);
  const [reservedOP, setReservedOP] = useState('');
  /* The skin plan the Skin Planner and the Skins page's ☆ share (lib/skins/skinPlan). The OP it
     reserves counts the outfits sold for OP that the imported account does not own yet. */
  const skinByName = useMemo(() => new Map(skinCatalogue.map((skin) => [skin.name, skin.id])), [skinCatalogue]);
  const [skinIds, setSkinIds] = useSkinPlan((name) => skinByName.get(name));
  const account = useAccount();
  /* The Past events ticks, shared with the Free OP Tracker (lib/pulls/usePastRewards.ts): ticked
     once per import from its cleared stages, the reader's to change after that. */
  const past = usePastRewards(backlogSources);
  const ownedSkins = useMemo(() => (account ? new Set(account.skins) : null), [account]);
  const skinsToBuy = useMemo(() => {
    const byId = new Map(skinCatalogue.map((skin) => [skin.id, skin]));
    return skinIds.filter((id) => byId.has(id) && !(ownedSkins && byId.get(id)!.skinId && ownedSkins.has(byId.get(id)!.skinId!)));
  }, [skinIds, skinCatalogue, ownedSkins]);
  const skinBudget = useMemo(() => skinReservation(skinsToBuy, skinCatalogue, readNumber(reservedOP)), [skinsToBuy, skinCatalogue, reservedOP]);
  const reserve = skinBudget.reserved;
  const [goals, setGoals] = useState<BannerGoal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading saved plan…');
  const [notice, setNotice] = useState('');
  const handledLink = useRef('');
  const [orundum, setOrundum] = useState('');
  const [yellowCerts, setYellowCerts] = useState('');
  const [incomeSettings, setIncomeSettings] = useState<IncomeSettings>(DEFAULT_INCOME_SETTINGS);
  const [originite, setOriginite] = useState('');
  const [permits, setPermits] = useState('');
  const [includeBacklog, setIncludeBacklog] = useState(false);
  /* What the reader has already cleared. Empty means "new account", which is
     the only state where the whole back catalogue is honest. */
  /* Empty until the client picks it: a date computed on the server renders one
     value in the HTML and another after hydration, which React calls a
     mismatch and the reader sees as a flicker. */
  const [until, setUntil] = useState('');
  const [monthlyCard, setMonthlyCard] = useState(false);
  const [wishingWallMode, setWishingWallMode] = useState<WishingWallMode>('average');
  /* Which banner the reader is saving for. Empty means they are working to a
     plain date instead, which is still a perfectly good question to ask. */
  const [bannerName, setBannerName] = useState('');
  const [clearedReruns, setClearedReruns] = useState<Set<string>>(new Set());
  const [walletFrom, setWalletFrom] = useState('');
  const [pastOpen, setPastOpen] = useState(false);

  const [now, setNow] = useState<Date | null>(null);

  /* `skins`: take the plan's outfits into the shared skin plan -- for an imported file, not for
     the copy this page saved, which the shared plan already holds and may have moved past. */
  const applyPlan = useCallback((plan: SavedPullPlan, skins: boolean) => {
    setYellowCerts(plan.yellowCerts ?? ''); setIncomeSettings(plan.incomeSettings ?? DEFAULT_INCOME_SETTINGS);
    setOrundum(plan.orundum); setOriginite(plan.originite); setPermits(plan.permits); setReservedOP(plan.reservedOP);
    setUntil(plan.until); setBannerName(plan.bannerName);
    setMonthlyCard(plan.monthlyCard); setIncludeBacklog(plan.includeBacklog); setClearedReruns(new Set(plan.clearedReruns));
    setWishingWallMode(plan.wishingWallMode ?? 'average'); setWalletFrom(plan.walletFrom ?? '');
    setGoals(goalsAtBannerEnd(plan.goals, scheduledBanners));
    if (skins) setSkinIds(plan.skinIds ?? []);
  }, [scheduledBanners, setSkinIds]);

  useEffect(() => {
    const today = new Date();
    setNow(today);
    setUntil(new Date(today.getTime() + 30 * DAY_MS).toISOString().slice(0, 10));
    try {
      const saved = localStorage.getItem(PULL_PLAN_KEY);
      if (saved) applyPlan(parsePullPlan(saved), false);
    } catch {
      setSaveBlocked(true);
      setSaveStatus('Could not load your saved plan. It has not been overwritten.');
    }
    setHydrated(true);
  }, [applyPlan]);

  const savedPlan = useMemo((): SavedPullPlan => ({ version: 1, orundum, originite, permits, reservedOP, until, bannerName, yellowCerts, incomeSettings,
    monthlyCard, includeBacklog, annihilationDone: past.annihilationDone, doneEvents: past.progress.doneEvents, doneKeys: past.progress.doneKeys, clearedReruns: [...clearedReruns], future: {}, manualEventDate: '', goals, skinIds, wishingWallMode,
    /* The ticks live in their own store now (lib/pulls/pastProgress.ts); the plan mirrors them
       for an older build reading this browser's storage. */
    ...(walletFrom ? { walletFrom } : {}), ...(past.progress.ticksFrom ? { ticksFrom: past.progress.ticksFrom } : {}),
  }), [orundum, originite, permits, reservedOP, until, bannerName, yellowCerts, incomeSettings, monthlyCard, includeBacklog, past.progress, past.annihilationDone, clearedReruns, goals, skinIds, wishingWallMode, walletFrom]);

  /* An account import fills the resources (and the Monthly Card, ticked while it runs), once
     per import: after that they are the reader's to edit, until the next import. Run after
     the saved plan is applied, so the plan never overwrites a newer import's numbers. */
  useEffect(() => {
    const wallet = account?.wallet;
    if (!hydrated || !wallet || walletFrom === account.importedAt) return;
    setOrundum(String(wallet.orundum)); setOriginite(String(wallet.originitePrime));
    setPermits(String(wallet.permits)); setYellowCerts(String(wallet.yellowCerts));
    setMonthlyCard(!!wallet.monthlyCardUntil && Date.parse(wallet.monthlyCardUntil) > Date.now());
    setWalletFrom(account.importedAt);
  }, [hydrated, account, walletFrom]);

  useEffect(() => {
    if (!hydrated || saveBlocked) return;
    try {
      localStorage.setItem(PULL_PLAN_KEY, JSON.stringify(savedPlan));
      setSaveStatus('Saved on this device');
    } catch { setSaveStatus('Device storage is unavailable. Export your plan to keep a copy.'); }
  }, [hydrated, saveBlocked, savedPlan]);



  const held: Holdings = {
    orundum: readNumber(orundum),
    originitePrime: readNumber(originite),
    permits: readNumber(permits),
  };

  const target = useMemo(() => {
    if (!validPlanDate(until)) return null;
    /* End of the chosen day, so "until the 30th" includes the 30th. */
    const d = new Date(`${until}T23:59:59Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [until]);

  const banners = useMemo(() => (now ? scheduledBanners.filter(b => new Date(`${b.end}T23:59:59Z`) > now).sort((a, b) => a.start.localeCompare(b.start)) : []), [now, scheduledBanners]);
  const rewardEvents = useMemo(() => now ? scheduledEvents.filter(event => new Date(`${event.end}T23:59:59Z`) > now) : [], [now, scheduledEvents]);
  const picked = useMemo(
    () => banners.find((b) => b.name === bannerName) ?? null,
    [banners, bannerName],
  );

  const income = useMemo(
    () => selectedIncome(now && target ? incomeBetween(now, target) : incomeBetween(new Date(0), new Date(0)), incomeSettings),
    [now, target, incomeSettings],
  );
  /* The card pays at the daily sign-in, so it rides the same counted resets as
     the daily mission rather than being multiplied out by calendar days. */
  const card = useMemo(() => monthlyCardIncome(income), [income]);

  /* Only what is actually left: a returning player is the normal case, and
     telling somebody with three years of clears that 2,717 OP is waiting would
     be worse than not offering the figure. */
  const backlog = past.remaining;


  /* Potential funds include selected, still-unclaimed content. The holdings
     summary below deliberately excludes these rewards. */
  const inHand: Holdings = {
    orundum: held.orundum + (includeBacklog ? backlog.annihilationOrundum : 0),
    originitePrime: held.originitePrime + (includeBacklog ? backlog.originitePrime : 0),
    permits: held.permits + (includeBacklog ? backlog.permits : 0),
  };

  const rerunOptions = useMemo(() => ({ cleared: clearedReruns, wishingWallMode }), [clearedReruns, wishingWallMode]);

  /*
   * The whole calculation at one moment in time.
   *
   * Written once and called for each date that matters -- the target, and, when
   * a banner is picked, its first day and its last. Three near-identical
   * inline sums would have drifted apart the first time anything was added to
   * one of them.
   */
  const totalAt = useCallback((when: Date) => {
    const inc = selectedIncome(now ? incomeBetween(now, when) : incomeBetween(new Date(0), new Date(0)), incomeSettings);
    const certs = now ? certificatePulls(now, when, readNumber(yellowCerts), incomeSettings.certificates) : 0;
    const green = greenCertificateIncome(now ?? when, when, !!incomeSettings.greenCertificates);
    const mc = monthlyCardIncome(inc);
    const haul = bannerHaul(rewardEvents, when, rerunOptions);
    const withExtras = {
      ...inc,
      orundum: inc.orundum + green.orundum + (monthlyCard ? mc.orundum : 0) + haul.wishOrundum,
    };
    const grossOP = inHand.originitePrime + haul.op
      + (monthlyCard ? mc.originitePrime : 0);
    const holdings: Holdings = {
      orundum: inHand.orundum,
      /* A future event's Originite is NOT in hand -- it does not exist until the
         event runs -- so it arrives here rather than in the holdings above. */
      originitePrime: Math.max(0, grossOP - reserve),
      permits: inHand.permits + haul.permits + certs + green.permits,
    };
    /* Banner-locked, so it belongs to the banner being ASKED about and to no
       other date: a limited banner passing in the meantime hands you pulls you
       can only spend on it, which are worth nothing to somebody saving for a
       later one. Kept out of `pullsFrom` and added at the end for the same
       reason permits are -- they are pulls, not currency. */
    const free = picked && now ? availableBannerFreePulls(picked, when, now, goals.find(g => g.banner === picked.name)?.ticketUsed) : 0;
    const p = pullsFrom(holdings, withExtras);
    const recurringOnly = pullsFrom({
      orundum: readNumber(orundum), permits: readNumber(permits) + certs + green.permits,
      originitePrime: Math.max(0, readNumber(originite) + (monthlyCard ? mc.originitePrime : 0) - reserve),
    }, { ...inc, orundum: inc.orundum + green.orundum + (monthlyCard ? mc.orundum : 0) });
    return {
      grossOP,
      recurringOnly: recurringOnly.pulls,
      pulls: { ...p, pulls: p.pulls + free },
      free,
      income: inc,
      card: mc,
      haul,
      arriving: withExtras.orundum,
    };
  }, [now, rewardEvents, picked, rerunOptions, monthlyCard, inHand.orundum, inHand.originitePrime,
    inHand.permits, reserve, orundum, originite, permits, goals, incomeSettings, yellowCerts]);

  const at = useMemo(() => (target ? totalAt(target) : null), [target, totalAt]);
  const total = at ? at.pulls : pullsFrom({ ...held, originitePrime: Math.max(0, held.originitePrime - reserve) }, incomeBetween(new Date(0), new Date(0)));
  const haul = at ? at.haul : bannerHaul([], new Date(0), rerunOptions);

  const today = pullsFrom({ ...held, originitePrime: Math.max(0, held.originitePrime - reserve) }, incomeBetween(new Date(0), new Date(0)));
  const greenIncome = greenCertificateIncome(now ?? new Date(0), target ?? now ?? new Date(0), !!incomeSettings.greenCertificates);
  const recurringGained = (at?.recurringOnly ?? today.pulls) - today.pulls;
  const rewardGained = at ? total.pulls - at.free - at.recurringOnly : 0;


  const budgetRows = useMemo(() => now ? planBudgets(goals, banners, now, date => {
    const result = totalAt(date);
    return result.pulls.pulls - result.free;
  }) : [], [goals, banners, now, totalAt]);
  const forecastSavings = total.pulls - (at?.free ?? 0);
  const savingsAfterPlan = savingsAfterPlanAt(forecastSavings, budgetRows, until);
  const totalShortfall = budgetRows.reduce((max, row) => Math.max(max, row.shortfall), 0);
  const addGoal = useCallback((banner: UpcomingBanner) => {
    setGoals(previous => previous.some(g => g.banner === banner.name) || previous.length >= MAX_GOALS ? previous : [...previous, { banner: banner.name, pulls: 0, spendOn: banner.end }]);
  }, []);
  useEffect(() => {
    if (!hydrated || !router.isReady || !now) return;
    const name = router.query.banner;
    if (typeof name !== 'string' || handledLink.current === name) return;
    handledLink.current = name;
    const banner = banners.find(b => b.name === name);
    if (!banner) { setNotice('This banner is not in the upcoming schedule. Choose another banner below.'); return; }
    addGoal(banner); setEditingBanner(banner.name); setBannerName(banner.name); setUntil(banner.end);
  }, [hydrated, router.isReady, router.query.banner, now, banners, addGoal]);

  const monthlyEnd = new Date((now?.getTime() ?? 0) + 30 * DAY_MS);
  const monthlyBase = selectedIncome(incomeBetween(now ?? monthlyEnd, monthlyEnd), incomeSettings);
  const monthlyBonus = monthlyCardIncome(monthlyBase);
  const monthlyGreen = greenCertificateIncome(now ?? monthlyEnd, monthlyEnd, !!incomeSettings.greenCertificates);
  const monthlyIncome = (monthlyBase.orundum + monthlyGreen.orundum + (monthlyCard ? monthlyBonus.orundum + monthlyBonus.originitePrime * ORUNDUM_PER_ORIGINITE : 0)) / ORUNDUM_PER_PULL + monthlyGreen.permits + certificatePulls(now ?? monthlyEnd, monthlyEnd, readNumber(yellowCerts), incomeSettings.certificates);
  return <>
    <Head><title>Pull Planner — Arkpedia</title></Head>
    {/* The site's page header, outside <main> like every page's: it was a 34px
        sentence-case h1 inside main, 12px from the edge on a phone. Import / export lives on
        the Account page; this points there (components/account/DataLink). */}
    <PageHeader
      eyebrow="Rhodes Island // Headhunting Budget"
      title="Pull Planner"
      actions={<DataLink />}
    />
    <main className={`pulls-page ${workspace.page}`}>
      {notice && <p role="status">{notice}</p>}
      {(saveBlocked || saveStatus.startsWith('Device storage')) && <p role="alert" className="pulls-plan-warning">{saveStatus}</p>}
      <div className={workspace.sections}>
      <section className={`op-section ${workspace.overview}`} aria-labelledby="pull-resources-heading">
        <h2 id="pull-resources-heading" className={workspace.resourceHeading}>Resources &amp; income</h2>
        <div className={workspace.wallet}>
          <Field label="Orundum" unit="" icon="/material-icons/Orundum.webp" value={orundum} onChange={setOrundum} />
          <Field label="Originite Prime" unit="" icon="/material-icons/Originite%20Prime.webp" value={originite} onChange={setOriginite} />
          <Field label="Permits" unit="" icon="/material-icons/Headhunting%20Permit.webp" value={permits} onChange={setPermits} />
          <Field label="Yellow certs" unit="" icon="/material-icons/Distinction%20Certificate.webp" value={yellowCerts} onChange={setYellowCerts} />
          {account?.wallet && walletFrom === account.importedAt
            ? <p className={`hint ${workspace.walletNote}`}>Filled from your account, imported {formatDayMonthYear(account.importedAt.slice(0, 10))}. Edit them as you spend; <Link href="/account">import again</Link> to refresh them.</p>
            : account && !account.wallet && <p className={`hint ${workspace.walletNote}`}><Link href="/account">Import your account again</Link> to fill these in from it.</p>}
        </div>
        {skinBudget.missing.length > 0 && <p className="pulls-plan-warning">Some selected skins have missing prices. Review your wishlist.</p>}
        <div className={workspace.incomeRow}>
            {/* Six settings, each a real checkbox (.check): #64 had made them highlighted
                .tgl buttons, and the maintainer asked for the checkboxes back. */}
            <div className="pulls-recurring-grid" role="group" aria-label="Recurring income">{([['daily', 'Daily missions', `${DAILY_ORUNDUM} / day`], ['weekly', 'Weekly missions', `${WEEKLY_ORUNDUM} / week`], ['annihilation', 'Annihilation', `${ANNIHILATION_WEEKLY_ORUNDUM} / week`], ['certificates', 'Yellow cert shop', '258 certs → 38 pulls'], ['greenCertificates', 'Green cert shop', '5 pulls / month']] as const).map(([key, label, rate]) => <label key={key} className="check" title={rate}><input type="checkbox" checked={!!incomeSettings[key]} onChange={event => setIncomeSettings(previous => ({ ...previous, [key]: event.target.checked }))} />{label}</label>)}<label className="check"><input type="checkbox" checked={monthlyCard} onChange={e => setMonthlyCard(e.target.checked)} />Monthly card</label></div>
<div className={workspace.rate}><strong>{formatOneDecimal(monthlyIncome)}</strong><span>pulls / 30 days</span></div></div>
        <div className={workspace.utilities}>
          <button type="button" id="tab-income" aria-haspopup="dialog" onClick={() => setIncomeOpen(true)}><span>Income</span><span aria-hidden="true">+</span></button>
          {/* One frame, "PAST EVENTS  [ ] Include  +" (the maintainer, 2026-09-27): the
              disclosure button is the frame -- it paints the box like its two siblings and
              is the hit area everywhere but the setting -- and the checkbox is its SIBLING
              laid over it, never inside it (a <button> may not hold an input, and the
              accessibility tree flattens one that does). */}
          <div className={workspace.pastUtility}>
            <button type="button" id="tab-past" aria-haspopup="dialog" onClick={() => setPastOpen(true)}><span>Past events</span><span aria-hidden="true">+</span></button>
            <IncludePastCheckbox checked={includeBacklog} onChange={setIncludeBacklog} />
          </div>
          <button type="button" id="tab-skins" aria-haspopup="dialog" onClick={() => setSkinsOpen(true)}><span>Skin wishlist <b>{skinIds.length}</b></span><span>{reserve} OP reserved +</span></button>
        </div>
      </section>
      <section className={`op-section ${workspace.forecast}`} aria-label="Pull calculation">
        <div className={workspace.calculationHeading}><h2>Pull calculation</h2><div className={workspace.forecastDate}><label htmlFor="pull-calculation-date">Until</label><input id="pull-calculation-date" type="date" value={until} onChange={e => {if (e.target.value && !validPlanDate(e.target.value)) return; setUntil(e.target.value); setBannerName('');}} /></div></div>
        <dl>
          <div><dt>Available now</dt><dd>{today.pulls}</dd></div>
          <div><dt>Income</dt><dd><span aria-hidden="true">+</span>{recurringGained}</dd></div>
          <div><dt>Event rewards</dt><dd><span aria-hidden="true">+</span>{rewardGained}</dd></div>
          <div className={workspace.forecastTotal}><dt>Before spending</dt><dd><span aria-hidden="true">=</span>{forecastSavings}<small> pulls</small></dd></div>
        </dl>
      </section>
      <section className={`op-section ${workspace.plan}`} aria-label="Your banner plan">
        <div className={workspace.planHeading}><h2>Your banners <span>{goals.length}</span></h2><button className={`primary btn-sm ${workspace.add}`} type="button" aria-expanded={choosingBanner} onClick={() => setChoosingBanner(!choosingBanner)}>{choosingBanner ? 'Close' : '+ Add banner'}</button></div>
        {choosingBanner && <BannerPicker banners={banners} selected={goals.map(goal => goal.banner)} odds={bannerOdds} onAdd={addGoal} />}
        <div className={workspace.columns}><span>Operators / banner</span><span>Until</span><span>Pulls</span><span>Available</span><span>All goals</span><span>Left</span><span /></div>
        {budgetRows.map(row => <PullBannerRow key={row.goal.banner} row={row} rules={bannerOdds[row.goal.banner]} expanded={editingBanner===row.goal.banner} onExpand={() => setEditingBanner(editingBanner===row.goal.banner ? null : row.goal.banner)} onChange={goal=>setGoals(prev=>prev.map(g=>g.banner===goal.banner?goal:g))} onRemove={()=>setGoals(prev=>prev.filter(g=>g.banner!==row.goal.banner))} />)}
        {!goals.length && <div className={workspace.empty}>Add a banner to start planning.</div>}
        <footer className={workspace.planFooter}><span>{!goals.length ? 'No planned spending' : totalShortfall ? 'Budget needs attention' : 'Budgets covered'}<small>Through {until || 'today'}</small></span><span>Savings after your plan <strong className={savingsAfterPlan < 0 ? workspace.negative : ''}>{savingsAfterPlan}<small> pulls</small></strong></span></footer>
      </section>
      </div>
    </main>
    {incomeOpen && (
      <ImportDialog title="Income" className="pulls-income-dialog" onClose={() => setIncomeOpen(false)}>
        <div className="pulls-income-body">
            <div className="pulls-target-row"><StyledSelect<DetailOption> label="Forecast banner" menuMinWidth={320} value={bannerName} onChange={name => { setBannerName(name); const banner = banners.find(b => b.name === name); if (banner) setUntil(banner.end); }}
            renderOption={option => <DetailOptionContent option={option} />} renderValue={option => <DetailOptionContent option={option} compact />}
            options={[{ value: '', label: 'Choose a banner…' }, ...banners.map((b): DetailOption => {
              const rateUp = bannerOdds[b.name]?.operators.filter(operator => operator.kind === 'featured') ?? [];
              const dateLabel = (date: string, year: boolean) => (year ? formatDayMonthYear(date) : formatDayMonth(date));
              return { value: b.name, label: (rateUp.length ? rateUp.map(operator => operator.name) : b.sixStars).join(' · ') || b.name,
                detail: b.name.replace(/^\[[^\]]*\]\s*/, ''),
                meta: `${dateLabel(b.start, b.start.slice(0, 4) !== b.end.slice(0, 4))} – ${dateLabel(b.end, true)}`,
                portraits: rateUp.filter(operator => operator.icon).map(operator => ({ name: operator.name, src: operator.icon! })) };
            })]} />
            <input id="forecast-date" type="date" className="pulls-date" aria-label="Forecast date" max="2099-12-31" value={until} min={now?.toISOString().slice(0, 10)} onChange={e => { if (e.target.value && !validPlanDate(e.target.value)) return; setUntil(e.target.value); setBannerName(''); }} />
            <div className="pulls-day-options" role="group" aria-label="Forecast day">{(['start', 'end'] as const).map(day => <button type="button" key={day} className="filter-chip" disabled={!picked} aria-pressed={!!picked && until === picked[day]} onClick={() => picked && setUntil(picked[day])}>{day === 'start' ? 'First day' : 'Last day'}</button>)}</div>
          </div>
          {picked && <div className="pulls-target-preview">{/* eslint-disable-next-line @next/next/no-img-element */}
            {picked.image ? <ContentImg src={picked.image} alt="" /> : <span className="pulls-target-preview-art" aria-hidden="true" />}<span><b>{picked.sixStars.join(' · ') || picked.name}</b><small>{picked.start} – {picked.end}{picked.datesEstimated ? ' · Estimated' : ''}</small></span></div>}
          {/* The condensed report (the maintainer, 2026-10-02): every source on one line, with
              its working and what it is worth in pulls, then the two figures the forecast
              adds. Off sources stay listed, muted, so the list reads the same every time. */}
          <table className="pulls-report">
            <thead><tr><th scope="col">Source</th><th scope="col">Working</th><th scope="col">Pulls</th></tr></thead>
            <tbody>
              <ReportRow what="Daily missions" how={`${income.days} resets × ${DAILY_ORUNDUM} Orundum`} pulls={income.daily / ORUNDUM_PER_PULL} off={!incomeSettings.daily} />
              <ReportRow what="Weekly missions" how={`${income.weeks} resets × ${WEEKLY_ORUNDUM} Orundum`} pulls={income.weekly / ORUNDUM_PER_PULL} off={!incomeSettings.weekly} />
              <ReportRow what="Annihilation" how={`${income.weeks} weeks × ${ANNIHILATION_WEEKLY_ORUNDUM} Orundum`} pulls={income.annihilation / ORUNDUM_PER_PULL} off={!incomeSettings.annihilation} />
              <ReportRow what="Monthly card" how={`${income.days} sign-ins × ${MONTHLY_CARD_DAILY_ORUNDUM} Orundum · ${card.cards} × ${MONTHLY_CARD_ORIGINITE} OP`} pulls={monthlyCard ? (card.orundum + card.originitePrime * ORUNDUM_PER_ORIGINITE) / ORUNDUM_PER_PULL : 0} off={!monthlyCard} />
              <ReportRow what="Green cert shop" how={`${greenIncome.months} resets · 600 Orundum + 4 permits each`} pulls={greenIncome.orundum / ORUNDUM_PER_PULL + greenIncome.permits} off={!incomeSettings.greenCertificates} />
              <ReportRow what="Yellow cert shop" how="full monthly sets from your certs" pulls={now && target ? certificatePulls(now, target, readNumber(yellowCerts), incomeSettings.certificates) : 0} off={!incomeSettings.certificates} />
              <tr className="pulls-report-sum"><th scope="row">Income</th><td>in whole pulls, with what you hold</td><td>{recurringGained}</td></tr>
            </tbody>
            <tbody>
              <tr className="pulls-report-group"><th scope="rowgroup" colSpan={3}>Event rewards <span className="hint">by {until || 'the date'}</span></th></tr>
              {haul.counted.map((b) => {
                const cleared = eventWasCleared(b, clearedReruns);
                const name = (b.event ?? b.name).replace(/^\[[^\]]*\]\s*/, '');
                return (
                  <tr key={b.name} className={cleared ? 'muted' : undefined}>
                    <th scope="row">{name}</th>
                    <td>ends {b.end}{b.opSource === 'median' ? ' · estimated' : ''}{b.rerun && b.op > 0 && <label className="check pulls-tick">
                      <input type="checkbox" checked={cleared} aria-label={`Already cleared ${name}`}
                        onChange={() => setClearedReruns(previous => {
                          const next = new Set(previous);
                          if (eventWasCleared(b, next)) [b.name, ...(b.legacyNames ?? [])].forEach(n => next.delete(n));
                          else next.add(b.name);
                          return next;
                        })} />
                      Already cleared
                    </label>}</td>
                    <td><RewardAmount resource="op" amount={cleared ? 0 : b.op} />{eventShopPermits(b) > 0 && <RewardAmount resource="permits" amount={eventShopPermits(b)} />}</td>
                  </tr>
                );
              })}
              {haul.skipped.map((b) => (
                <tr key={b.name} className="muted"><th scope="row">{(b.event ?? b.name).replace(/^\[[^\]]*\]\s*/, '')}</th><td>counted in Past events</td><td>{b.op} OP</td></tr>
              ))}
              {haul.counted.length === 0 && haul.skipped.length === 0 && <tr className="muted"><td colSpan={3}>No events end before this date.</td></tr>}
              <tr>
                <th scope="row">Wishing Wall</th>
                <td>
                  <div className="pulls-wish-options" role="radiogroup" aria-label="Wishing Wall">
                    {(['minimum', 'average', 'lucky'] as const).map(mode => <label key={mode} className={`pulls-wish-option${wishingWallMode === mode ? ' on' : ''}`} title={mode === 'minimum' ? '200/day · 2,800 over 14 days' : mode === 'average' ? '≈584/day · ≈8,170 over 14 days' : '800/day · 11,200 over 14 days'}>
                      <input type="radio" name="wishing-wall" value={mode} checked={wishingWallMode === mode} onChange={() => setWishingWallMode(mode)} />
                      <span><b>{WISHING_WALL_LABELS[mode]}</b></span>
                    </label>)}
                  </div>
                  {haul.wishOrundum > 0 && <span className="hint"> {haul.wishWalls.reduce((n, b) => n + b.wishDays, 0)} days</span>}
                </td>
                <td>{formatOneDecimal(haul.wishOrundum / ORUNDUM_PER_PULL)}</td>
              </tr>
              <tr className="pulls-report-sum"><th scope="row">Event rewards</th><td>{haul.op} OP · {haul.permits} permits · Wishing Wall, in whole pulls</td><td>{rewardGained}</td></tr>
            </tbody>
          </table>
        </div>
      </ImportDialog>
    )}
    {skinsOpen && (
      <ImportDialog title="Skin wishlist" className="pulls-skins-dialog" onClose={() => setSkinsOpen(false)}>
        <div id="panel-skins" className="pulls-skins-body">
            {/* The Skin Planner's own view, with this plan's OP set against it. */}
          <div className="pulls-panel-head"><p className="hint">The same plan as the <Link prefetch={false} href="/skin-planner">Skin Planner</Link>: a change here shows there, and the other way round.</p><SkinsHelp /></div>
          <SkinPlanner collections={skinCollections} today={now?.toISOString().slice(0, 10) ?? null} catalogue={skinCatalogue} ids={skinIds} onChange={setSkinIds} owned={ownedSkins}
            budget={{ heldOP: held.originitePrime, extraOP: readNumber(reservedOP), forecastOP: (date) => totalAt(new Date(`${date}T23:59:59Z`)).grossOP,
              extraField: <Field label="Extra OP reserve" unit="OP" value={reservedOP} onChange={setReservedOP} /> }} />
        </div>
      </ImportDialog>
    )}
    {pastOpen && (
      <ImportDialog title="Past events" className="pulls-past-dialog" onClose={() => setPastOpen(false)}>
        <PastRewards backlog={past.counting} doneKeys={past.doneKeys} doneEvents={past.doneEvents} annihilationDone={past.annihilationDone} onKeys={past.onKeys} onEvents={past.onEvents} onAnnihilation={past.onAnnihilation}
          imported={past.imported} cleared={past.cleared} layout="popup" />
      </ImportDialog>
    )}
  </>;
}

export const getStaticProps: GetStaticProps<PullsProps> = withContentPage<PullsProps>('/pulls', async () => {
  /* Every banner and outfit shop, over or not: what is still ahead is a question for
     the request (currentPullPlan in the finalize below), never for the export. */
  const scheduledBanners = getPullSchedule();
  /* One object for the schedule's `inBacklog` marks and the browser's backlog
     totals. The content export runs this against the release's data, so both
     arrive with the release in the page props and never from the app bundle. */
  const backlogSources = bundledBacklogSources();
  const skins = getAllSkins();
  const events = getAllEvents();
  const skinCatalogue = pullSkinCatalogue(skins, skinReleaseDates(events, skins));
  const predicted = new Set(getEventCalendar().filter(event => event.isPredicted).map(event => event.name));
  const skinCollections = pullSkinCollections(events, skins, skinCatalogue, predicted);
  return { props: { scheduledEvents: getPullEventSchedule(backlogSources), backlogSources, skinCatalogue, skinCollections, scheduledBanners, bannerOdds: getBannerOdds(scheduledBanners) } };
}, { finalize: async props => {
  const current = currentPullPlan(props, Date.now());
  if (current.backlogSources) return { ...current, backlogSources: fillFromDeployment(current.backlogSources, bundledBacklogSources()) };
  // A release exported before backlogSources joined the props. The first content
  // run after this deploy re-exports /pulls (the generator commit changes the
  // release fingerprint), and scripts/content/validate-release.mjs refuses a
  // release without it, so only an older published release can land here.
  console.warn('[pulls] Content release predates backlogSources; using the bundled back catalogue.');
  return { ...current, backlogSources: bundledBacklogSources() };
} });
