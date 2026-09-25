import { usePlannerContent } from '@/lib/content/planner';
import { useContentUrl } from '@/lib/content/context';
import { withContentPage } from '@/lib/content/server';
import { TransferDialog } from "@/components/planner/TransferDialog";
import { PlannerStateLabel } from '@/components/planner/PromotionIcon';
import { withMasteryPrerequisites, withModulePrerequisites, withSkillRankPrerequisites } from '@/lib/planner/goalPrerequisites';
import { SimplePlanner } from '@/components/planner/SimplePlanner';
import { upgradeCostGroups } from '@/lib/planner/upgradeCostGroups';
import { publicFiles, publicFileExists } from '@/lib/assets/publicAssets';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import fs from 'fs';
import path from 'path';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getAllOperators } from '@/lib/operators/operators';
import { isOperatorReleased } from '@/lib/operators/operatorAvailability';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';
import { highlightStats } from '@/components/ui/HighlightedText';
import { PlannerOperator, PlannerOperatorSummary, Skill, OperatorModule, PromotionTier, getSkillList, type CostGroup } from '@/lib/operators/operatorTypes';
import { buildAliasMap } from '@/lib/operators/operatorAliases';
import { checkItemSortIds, MATERIAL_SORT_ORDER } from '@/lib/farming/materialSortOrder';
import baseFormulas from '@/data/base-formulas.json';
import { DepotGrid } from '@/components/planner/DepotGrid';
import { OperatorBill, ShortfallList } from '@/components/planner/ShortfallList';
import { MaterialIcon } from '@/components/planner/MaterialIcon';
import { PlanRows, type PlanRowView } from '@/components/planner/PlanRows';
import { OperatorStateForm } from '@/components/planner/OperatorStateForm';
import { OperatorWizard, type WizardFlow } from '@/components/planner/OperatorWizard';
import { BuildDialog, type BuildStep } from '@/components/planner/BuildDialog';
import { bundleFilename, describeTransfer, formatBundle, parseTransfer } from '@/lib/planner/transfer';
import { clampBuilderStates, defaultStartingState, knownPlanNames, type BuilderState } from '@/lib/planner/builderStates';
import { checkImportAliases, unheldSummary } from '@/lib/planner/foreignImport';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';
import { hasFilePicker, hasFolderPicker, loadFromFile, saveToFile, showFolder } from '@/lib/planner/fileTransfer';
import { goalsFor, type Goal, type GoalFrom } from '@/lib/planner/goals';
import { compactCount } from '@/lib/planner/format';
import { applyGoal, goalBlocker, goalReady, plannerModules, priceGoal, type BuildPlan } from '@/lib/planner/build';
import { CRAFTING_EVENT, readCrafting, writeCrafting } from '@/lib/planner/crafting';
import {
  ROSTER_EVENT,
  UNBUILT,
  migrateFromBuilderStates,
  ownedLabel,
  readRoster,
  writeRoster,
  type Owned,
  type Roster,
} from '@/lib/planner/roster';
import {
  DEPOT_EVENT,
  readDepot,
  readDepotTouched,
  writeDepot,
  type Depot,
} from '@/lib/planner/depot';
import {
  moduleStageCostRemaining,
  LEVEL_CAPS,
  maxLevelForElite,
  defaultTarget,
  computeLevelCostRemaining,
  promotionCostsNeeded,
  addCostGroup,
  totalsToCostGroup,
  skillLevelCostRemaining,
  skillMasteryCostRemaining,
  moduleStageCost,
  maxEliteForRarity,
  maxSkillRankForElite,
  moduleUnlock,
} from '@/lib/planner/plannerLogic';

interface Props {
  operators: PlannerOperatorSummary[];
  /** Every material the depot can hold: in MATERIAL_SORT_ORDER, and with an icon
   *  actually on disk. Built in getStaticProps because getMaterialIconPath cannot
   *  tell you the second part -- it builds a path and never looks. */
  depotCatalogue: string[];
}

/** "E1L50SR5", or "E2L20 S1M3S2M1" once any mastery exists -- SR7 is
 * omitted in that case since mastery requires it and it'd be redundant
 * to state. Only skills with an actual mastery level show up in the
 * mastery part; a skill with no stated mastery is implicitly at SR7/M0
 * too, per the same "everything else assumed at Rank 7 once any
 * mastery exists" rule. */
/**
 * Where a build starts from, in the same shape as where it is going.
 *
 * One function, because two spellings of one fact is how the editor came to
 * print "E2 L70 S1M3" -- SR instead of SL, and the skill rank silently dropped
 * whenever a mastery was recorded -- beside a row saying "E2 L70 SL7 S1M3".
 * Same fact, two readings, and neither reader can tell which is the real one.
 */
function spacedLevelLabel(state: Pick<BuilderState, 'startingElite' | 'startingLevel' | 'startingSkillLevel' | 'startingMasteryLevels'>): string {
  const masteries = Object.entries(state.startingMasteryLevels)
    .map(([idx, m]) => [Number(idx), m] as const)
    .filter(([, m]) => m > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([idx, m]) => `S${idx + 1}M${m}`);
  return [`E${state.startingElite}`, `L${state.startingLevel}`, `SL${state.startingSkillLevel}`, ...masteries].join(' ');
}

/* The saved-plan gate, `clampBuilderStates`, lives in lib/planner/builderStates.ts
   now -- it bounds every field and drops unknown operators, and being in lib is
   what lets `npm run audit:import` prove each of its guards by breaking it. */

/** "2 hours ago", coarsely. Client-only: the timestamp is read in an effect, so
 *  the server never renders a relative time that the client would disagree with. */
function sinceLabel(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * Where the build is going, spelt the way the form reads it.
 *
 * An UNSTATED mastery target means "as owned" -- that is how the form reads it
 * (`masteryTargets[i] ?? startingMasteryLevels[i]`) and how the bill prices it,
 * because a plan that quietly asked you to un-master a skill would be a plan
 * the game cannot sell. This used to print only `masteryTargets`, so an
 * operator with a mastery already on her came out as
 * "from E2 L60 SL7 S2M3 -> E2 L60 SL7": a from-and-to that reads as a
 * downgrade, on a row and a dialog header that are otherwise the same fact.
 */
function targetLabel(b: BuilderState): string {
  const masteries = Object.keys({ ...b.startingMasteryLevels, ...b.masteryTargets })
    .map((i) => [Number(i), b.masteryTargets[Number(i)] ?? (b.startingMasteryLevels[Number(i)] || 0)] as const)
    .filter(([, m]) => m > 0)
    .sort((a, b2) => a[0] - b2[0])
    .map(([i, m]) => `S${i + 1}M${m}`);
  return [`E${b.elite}`, `L${b.level}`, `SL${b.skillLevel}`, ...masteries].join(' ');
}

/**
 * A destructive clear, behind two presses.
 *
 * These three empty a localStorage store outright and there is no undo: the
 * depot is ninety-three hand-typed numbers, the roster is every operator you
 * own, and the goals are the thing you spend the most time setting. One press
 * was all it took, and the buttons sit directly under an Import that a reader
 * is already clicking around in.
 *
 * So the first press ARMS and says what will go, with the count -- "Clear 83
 * materials?" is a different sentence from "Clear depot", and the number is the
 * part that makes a mistake visible before it happens. The second press does
 * it. `Keep it` backs out, and an armed button disarms itself after a few
 * seconds, because a primed destructive control left sitting on screen is worse
 * than an unprimed one.
 *
 * Disabled when the store is already empty: there is nothing to confirm, and a
 * button that asks you to confirm doing nothing teaches you to press through
 * the question.
 */
function ClearControl({
  label,
  count,
  noun,
  armed,
  onArm,
  onConfirm,
}: {
  label: string;
  count: number;
  /** Singular; pluralised with an s. */
  noun: string;
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
}) {
  const what = `${count} ${noun}${count === 1 ? '' : 's'}`;
  return (
    <button type="button" className="danger btn-sm planner-clear-button"
      disabled={count === 0} data-armed={armed}
      aria-label={armed ? `Confirm clear ${what}` : label}
      title={count === 0 ? `Nothing to clear` : armed ? `Click again to clear ${what}` : `${label} (${what})`}
      onClick={armed ? onConfirm : onArm}>
      {armed ? 'Confirm' : label}
    </button>
  );
}

/** A roster entry, read the way the goal model reads it. */
function goalFrom(o: Owned): GoalFrom {
  return {
    elite: o.elite, level: o.level, skillLevel: o.skillLevel,
    masteryOf: (i) => o.masteries[i] || 0,
    moduleStageOf: (i) => o.modules?.[i] ?? -1,
  };
}

/**
 * The goals between where an operator is and where the plan wants them.
 *
 * One function for the row ("6 goals · Next: E1 to Lv 70"), the header's total
 * and the dialog's Build list, so the three cannot count differently. A target
 * that is not stated for a mastery or module means "as owned" -- the form reads
 * it that way, and so does this.
 */
function goalsOf(rarity: number, detail: PlannerOperator | undefined, from: Owned, b: BuilderState): Goal[] {
  const modules = (detail ? plannerModules(detail) : [])
    .map((m, i) => ({ name: m.name || m.badgeText || `Module ${i + 1}`, stages: m.stages.length }));
  const at = goalFrom(from);
  return goalsFor(rarity, detail ? getSkillList(detail).length : 0, modules, at, {
    elite: b.elite, level: b.level, skillLevel: b.skillLevel,
    masteryOf: (i) => b.masteryTargets[i] ?? at.masteryOf(i),
    moduleStageOf: (i) => b.moduleStageTargets[i] ?? at.moduleStageOf(i),
  });
}

/** "4 Vanguard Chip · 5 Polyester · 20,000 LMD" -- a bill in one line. */
function costLine(cost: CostGroup): string {
  return cost
    .filter((c) => Number(c.quantity) > 0)
    .map((c) => `${Math.ceil(Number(c.quantity)).toLocaleString()} ${c.name}`)
    .join(' · ');
}


export default function PlannerPage({ operators, depotCatalogue }: Props) {
  const { resolveNeeds, shortShares, planBuild, levels, importAliases, inGameOrder } = usePlannerContent();
  const contentUrl = useContentUrl();
  const [plannerMode, setPlannerMode] = useState<'simple' | 'experimental'>('simple');
  const [simpleNewOperator, setSimpleNewOperator] = useState(false);
  const [simpleStep, setSimpleStep] = useState<'current' | 'goal'>('current');
  const [summaryName, setSummaryName] = useState<string | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  /**
   * The one dialog, and where you are in it.
   *
   * `pick` is the operator picker; `goals` walks a queue of them through the
   * four blocks. A row's Edit enters at `goals` with a queue of one, which is
   * why `fromPick` is recorded -- Back means the picker when you came through
   * it and nothing when you did not.
   */
  const [wizard, setWizard] = useState<
    | { flow: WizardFlow; step: 'pick' }
    | { flow: WizardFlow; step: 'one'; queue: string[]; index: number; fromPick: boolean }
    | null
  >(null);
  /**
   * Whose build dialog is open, and whether closing it goes back to the editor.
   *
   * Its own overlay rather than a block inside the editor: spending the depot
   * is a different errand from deciding what to aim at, and it is reached from
   * the plan row without opening the editor at all. Opening it FROM the editor
   * remembers to hand the reader back where they came from.
   */
  const [build, setBuild] = useState<{ name: string; fromEditor: boolean } | null>(null);
  /* Whose goals the dialog is on, if any. Derived from the dialog's own state
     so there is one place that decides it, and no second flag to fall out of
     step with the queue it is walking. */
  const activeName = wizard?.step === 'one' ? (wizard.queue[wizard.index] ?? null) : null;
  /* Panel-level view state. None of it is persisted: they are ways of reading
     the same plan, not facts about it. */
  const [showAllMaterials, setShowAllMaterials] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  /**
   * Closing the depot, without the page moving underneath you.
   *
   * It is the one thing left here that REMOVES a screenful rather than swapping
   * one content for another -- 1,567 pixels, measured -- and a height floor
   * cannot help with that: the floor lives inside the thing being unmounted,
   * and a floor that outlived it would leave a screen of nothing where the
   * panel was. So this is the other pattern: the change has a known anchor, the
   * panel head holding the button you just pressed, and the reader gets put
   * back to it. (The editor used to need this too, and does not any more: an
   * overlay does not change the height of the document behind it.)
   *
   * Only ever UPWARDS. If you are above the panel already, nothing moves --
   * being dragged DOWN to a panel you just closed would be worse than the jump.
   * The anchor is read off a statically positioned element as
   * `rect.top + scrollY`, which is the same number whether or not the browser
   * has already clamped the scroll, so the correction does not have to win a
   * race against it.
   */
  const depotPanelRef = useRef<HTMLElement | null>(null);
  const [anchorAfter, setAnchorAfter] = useState<'depot' | null>(null);
  useLayoutEffect(() => {
    if (!anchorAfter) return;
    setAnchorAfter(null);
    const el = depotPanelRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    /* Instantly, never smoothly: a smooth scroll is an animation, and anything
       else touching the position cancels it midway. */
    if (window.scrollY > top - 90) window.scrollTo({ top: Math.max(0, top - 90), behavior: 'auto' });
  }, [anchorAfter]);
  /* When the depot was last written, so the summary line can say. Read once on
     mount and after every change, alongside the depot itself. */
  const [depotTouched, setDepotTouched] = useState<number | null>(null);
  /* What this browser can do about files, read after mount rather than during
     render: the server has no window, and a control that appears on the first
     paint and vanishes on the second is a hydration mismatch. */
  const [filePickerReady, setFilePickerReady] = useState(false);
  const [folderPickerReady, setFolderPickerReady] = useState(false);
  useEffect(() => {
    setFilePickerReady(hasFilePicker());
    setFolderPickerReady(hasFolderPicker());
  }, []);

  /**
   * What you already own.
   *
   * Empty until the first effect, never read during render: the server has no
   * localStorage, and a depot baked into the server's HTML would not be the reader's.
   * The listener is for the OTHER tab -- `storage` does not fire in the tab that
   * wrote, which is why depot.ts dispatches an event of its own as well.
   */
  /**
   * Which operators you have, and how far along each one is.
   *
   * Read after the first render for the same reason the depot is -- the server has no
   * localStorage -- and migrated on that first read: everyone who has used the planner
   * before has this typed in already, spread across their builder states, and losing it
   * on the upgrade would mean entering every operator again.
   */
  const [roster, setRoster] = useState<Roster>({});
  const rosterRef = useRef<Roster>({});
  rosterRef.current = roster;

  /**
   * Which materials the reader has said they will craft.
   *
   * A preference about how they intend to play, not a record of what they hold, which
   * is why it is its own key rather than a field on the depot.
   */
  const [crafting, setCrafting] = useState<ReadonlySet<string>>(new Set<string>());
  const toggleCrafting = (name: string) => {
    setCrafting((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      writeCrafting(next);
      return next;
    });
  };

  const [depot, setDepot] = useState<Depot>({});
  const [depotOpen, setDepotOpen] = useState(false);
  const [transferText, setTransferText] = useState('');
  const [transferNote, setTransferNote] = useState<string | null>(null);
  /* Which clear is primed, if any. One at a time: arming the second disarms the
     first, so there is never more than one loaded gun on screen. */
  const [armedClear, setArmedClear] = useState<'depot' | 'roster' | 'goals' | 'simple' | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const armClear = (which: 'depot' | 'roster' | 'goals' | 'simple' | null) => {
    setArmedClear(which);
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    armTimerRef.current = which === null
      ? null
      : window.setTimeout(() => setArmedClear(null), 8000);
  };
  useEffect(() => () => {
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
  }, []);
  useEffect(() => {
    const sync = () => { setDepot(readDepot()); setDepotTouched(readDepotTouched()); };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(DEPOT_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(DEPOT_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => setCrafting(readCrafting());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(CRAFTING_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CRAFTING_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => setRoster(readRoster());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(ROSTER_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(ROSTER_EVENT, sync);
    };
  }, []);

  const setOwned = (name: string, owned: Owned | null) => {
    setRoster((prev) => {
      const next = { ...prev };
      if (owned) next[name] = owned;
      else delete next[name];
      writeRoster(next);
      return next;
    });
  };
  const setDepotCount = (name: string, next: number) => {
    setDepot((prev) => {
      const updated = { ...prev };
      if (next > 0) updated[name] = next;
      else delete updated[name];
      writeDepot(updated);
      return updated;
    });
  };
  const [builderStates, setBuilderStates] = useState<Record<string, BuilderState>>({});
  /* Whether crafting is counted AT ALL, which is a different question from
     whether any given material may be crafted. Not persisted: it is a way of
     reading the same plan, not a fact about the reader's account. */
  const [autoCraft, setAutoCraft] = useState(true);

  // Full promotion/skills/modules build data, fetched on demand per
  // operator rather than shipped upfront for the entire roster --
  // keyed by name. undefined = not yet fetched/loaded.
  const [detailCache, setDetailCache] = useState<Record<string, PlannerOperator>>({});
  const [failedNames, setFailedNames] = useState<Set<string>>(new Set());
  const [loadingNames, setLoadingNames] = useState<Set<string>>(new Set());
  const fetchInFlightRef = useRef<Set<string>>(new Set());

  function fetchOperatorDetail(name: string) {
    if (detailCache[name] || fetchInFlightRef.current.has(name)) return;
    fetchInFlightRef.current.add(name);
    setFailedNames(cur => { const next = new Set(cur); next.delete(name); return next; });
    setLoadingNames((cur) => new Set(cur).add(name));
    // The filename itself is encoded on disk, so encode it again for the URL.
    fetch(contentUrl(`/planner-data/${encodeURIComponent(encodeURIComponent(name))}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed to load ${name}`))))
      .then((data: PlannerOperator) => {
        setDetailCache((cur) => ({ ...cur, [name]: data }));
      })
      .catch(() => {
        setFailedNames(cur => new Set(cur).add(name));
      })
      .finally(() => {
        fetchInFlightRef.current.delete(name);
        setLoadingNames((cur) => {
          const next = new Set(cur);
          next.delete(name);
          return next;
        });
      });
  }

  // Whenever the selected roster changes -- a fresh addOperator() call,
  // or selectedNames just restored from localStorage on mount -- make
  // sure every one of them has (or is getting) its detail data. Both
  // cases flow through this same selectedNames state, so one effect
  // covers both instead of needing a separate mount-specific fetch.
  useEffect(() => {
    for (const name of selectedNames) fetchOperatorDetail(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNames]);

  /**
   * And whoever the dialog is standing on, plan or not.
   *
   * An operator opened from the roster grid is usually NOT in the plan -- most
   * of the cast never will be -- so the effect above never reaches them, and
   * the dialog, whose every block is drawn from that data, rendered as an empty
   * box with a Done button. The old "set starting level" screen fetched on open
   * for exactly this reason; the line went missing when that screen did.
   */
  useEffect(() => {
    if (activeName) fetchOperatorDetail(activeName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeName]);

  /* And whoever the build dialog is about, for the same reason: every step it
     lists is priced from that data. */
  useEffect(() => {
    if (build?.name) fetchOperatorDetail(build.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build?.name]);

  // Loads the saved planner state (which operators were added, plus
  // each one's target/starting settings) on mount, similarly to how
  // the base simulator retains its own setup.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('plannerState');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.builderStates && typeof parsed.builderStates === 'object') {
          const states = clampBuilderStates(parsed.builderStates, operators);
          setBuilderStates(states);
          /* Known operators, once each, with a state behind them -- the same
             gate the import uses. A stored list is the import that landed last
             time, arriving again. */
          setSelectedNames(knownPlanNames(parsed.selectedNames, states));
          /* The roster used to live inside these, one copy per plan entry. Carry it
             across on the first load after the upgrade, so nobody has to state again
             what they had already told the planner. Runs only when the roster key has
             never existed, so clearing the roster deliberately does not undo itself. */
          const migrated = migrateFromBuilderStates(parsed.builderStates);
          if (migrated) setRoster(migrated);
        }
      }
    } catch {
      // Corrupted or unavailable -- just fall back to an empty planner.
    }
    /* Mount only, deliberately. It reads `operators`, which is a getStaticProps
       prop and so the same array for the life of the page; listing it would make
       a restore-from-storage effect look like one that re-runs. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saves on every change. Skips its own first run (mount) -- both
  // this effect and the load-effect above run within the same initial
  // flush, before any re-render, so on that very first pass this
  // effect's closure still holds the ORIGINAL empty defaults
  // regardless of the setState calls the load-effect just queued.
  // Saving here would silently overwrite the just-loaded planner state
  // with an empty one before the user ever saw it take effect. See the
  // identical pattern (and full reasoning) in operators_index.tsx.
  const isFirstPlannerSaveRunRef = useRef(true);
  useEffect(() => {
    if (isFirstPlannerSaveRunRef.current) {
      isFirstPlannerSaveRunRef.current = false;
      return;
    }
    try {
      localStorage.setItem('plannerState', JSON.stringify({ selectedNames, builderStates }));
    } catch {
      // Not persisted this session -- not worth failing over.
    }
  }, [selectedNames, builderStates]);

  const operatorByName = useMemo(() => new Map(operators.map((o) => [o.name, o])), [operators]);

  function addOperator(name: string) {
    const op = operatorByName.get(name);
    if (!op) return;
    setSelectedNames((cur) => (cur.includes(name) ? cur : [...cur, name]));
    if (!builderStates[name]) {
      const target = defaultTarget(op.rarity || 1);
      /* The "from" comes off the roster, which is the whole point of having one: you
         state what you own once, and every plan you make afterwards starts there
         instead of at E0 L1 with you retyping it. An operator you have not recorded
         still starts unbuilt, which is the honest default. */
      const owned = rosterRef.current[name];
      const start = owned
        ? {
            startingElite: owned.elite,
            startingLevel: owned.level,
            startingSkillLevel: owned.skillLevel,
            startingMasteryLevels: { ...owned.masteries },
            startingModuleStages: { ...(owned.modules ?? {}) },
          }
        : defaultStartingState();
      /* A target below where you already are is not a target. */
      const elite = Math.max(target.elite, start.startingElite);
      const level = elite === start.startingElite ? Math.max(target.level, start.startingLevel) : target.level;
      setBuilderStates((cur) => ({
        ...cur,
        [name]: {
          elite,
          level: Math.min(level, maxLevelForElite(op.rarity || 1, elite)),
          skillLevel: Math.min(maxSkillRankForElite(elite), Math.max(7, start.startingSkillLevel)),
          masteryTargets: {},
          moduleStageTargets: {},
          ...start,
        },
      }));
    }
  }

  /* Out of the PLAN, not out of the roster. What you own does not stop being
     true because you finished planning them -- which is also how an operator
     gets recorded without being built: add, set where they are, drop the row. */
  function removeOperator(name: string) {
    setSelectedNames((cur) => cur.filter((n) => n !== name));
    /* If the dialog is standing on the row that just went, take it off. */
    setWizard((cur) => (cur?.step === 'one' && cur.queue.includes(name)
      ? (cur.queue.length === 1 ? null : { ...cur, queue: cur.queue.filter((n) => n !== name), index: 0 })
      : cur));
  }

  /**
   * Everything a planner file carries, applied at once or not at all.
   *
   * One function for every door -- the file dialog, the paste box, an older
   * single-store export, and the three other planners' formats -- because an
   * import that half landed would leave the reader believing the whole file had.
   *
   * Which sections a file carries is the file's business: each is applied only
   * when it is there, so a Krooster CSV fills the depot and leaves the plan
   * standing rather than emptying it on the strength of silence.
   *
   * The goals go through `clampBuilderStates`, the same gate localStorage's own
   * restore uses. An imported plan is untrusted input arriving by a different
   * door, and it can hold a state the game cannot produce just as easily as a
   * stored one can.
   */
  function applyTransfer(text: string, source: string) {
    /* Size before shape, and said in words: parseTransfer refuses it too, but
       "not a planner file" would be the wrong explanation for a real export that
       happens to be enormous. */
    if (text.length > MAX_IMPORT_BYTES) {
      setTransferNote(`That is ${(text.length / 1048576).toFixed(1)} MB -- far larger than any planner file, so it was not read. (${source})`);
      return;
    }
    const parsed = parseTransfer(text, importAliases);
    if (!parsed) {
      setTransferNote(`That is not a planner file this can read -- nothing changed. (${source})`);
      return;
    }

    /**
     * Only what this page can hold. Material names not in the catalogue and
     * operator names the page does not know are dropped and REPORTED, the way
     * the foreign parsers already treat a key they cannot map: every real export
     * has a few, and a renamed material should be a line in the note, not a
     * refused file. (A malformed COUNT still fails the whole file, in the
     * parsers.) Filtering here rather than in the parsers because this is where
     * the catalogue and the operator list are.
     */
    const catalogue = new Set(depotCatalogue);
    const skipped: string[] = [];
    if (parsed.depot) {
      const kept: Depot = {};
      for (const [name, n] of Object.entries(parsed.depot)) {
        if (catalogue.has(name)) kept[name] = n;
        else skipped.push(name);
      }
      parsed.depot = kept;
    }
    if (parsed.roster) {
      const kept: Roster = {};
      for (const [name, owned] of Object.entries(parsed.roster)) {
        if (operatorByName.has(name)) kept[name] = owned;
        else skipped.push(name);
      }
      parsed.roster = kept;
    }

    if (parsed.depot) { setDepot(parsed.depot); writeDepot(parsed.depot); }
    if (parsed.roster) { setRoster(parsed.roster); writeRoster(parsed.roster); }
    /* Only names this planner actually has a material for, and only when the
       file said something about crafting at all -- null means it did not, and
       the reader's own toggles stay as they were. */
    if (parsed.crafting) {
      const next = new Set<string>();
      for (const n of parsed.crafting) {
        if (catalogue.has(n)) next.add(n);
        else if (!skipped.includes(n)) skipped.push(n);
      }
      parsed.crafting = [...next];
      setCrafting(next);
      writeCrafting(next);
    }
    if (parsed.goals) {
      const states = clampBuilderStates(parsed.goals.builderStates, operators);
      /* Known operators, once each, and only with a state to price: a selected
         name with no builder renders a row that can answer nothing, and an
         unknown one fetches a file that does not exist on every load. */
      const names = knownPlanNames(parsed.goals.selectedNames, states);
      for (const n of parsed.goals.selectedNames) if (!names.includes(n) && !skipped.includes(n)) skipped.push(n);
      parsed.goals = { selectedNames: names, builderStates: states };
      setSelectedNames(names);
      setBuilderStates(states);
      setWizard(null);
    }
    /* The foreign parsers report their own skips inside describeTransfer and
       emit only catalogue names, so `skipped` is empty for them. */
    setTransferNote(describeTransfer(parsed) + unheldSummary(skipped));
  }

  /** Forget an operator entirely: out of the plan and out of the roster. */
  function forgetOperator(name: string) {
    setSelectedNames((cur) => cur.filter((n) => n !== name));
    setOwned(name, null);
    setWizard(null);
  }

  function updateBuilder(name: string, patch: Partial<BuilderState>) {
    setBuilderStates((cur) => ({ ...cur, [name]: { ...cur[name], ...patch } }));
  }

  function setElite(name: string, op: PlannerOperator, elite: number) {
    setBuilderStates((curStates) => {
      const b = curStates[name];
      if (b && elite < b.startingElite) return curStates; // floor: can't demote below the stated starting promotion
      const maxLevel = maxLevelForElite(op.rarity || 1, elite);
      const target = defaultTarget(op.rarity || 1);
      // Switching tiers resets level to a sensible default for that tier
      // (max minus 30 if that headroom exists, otherwise the tier's max),
      // since level doesn't carry over numerically between elite tiers.
      let newLevel = elite === target.elite ? target.level : Math.max(1, maxLevel - 30 > 0 ? maxLevel - 30 : maxLevel);
      newLevel = Math.min(newLevel, maxLevel);
      // At the SAME tier as the stated starting point, level can't go
      // below the starting level either.
      if (b && elite === b.startingElite) newLevel = Math.max(newLevel, b.startingLevel);
      /* Demoting the target takes the axes the game hangs off it with it. Skill
         ranks 5-7 need E1 and a mastery needs E2, so a target left behind at
         rank 7 M3 under E0 is a state the game has no way to reach -- and the
         planner would have gone on pricing it. */
      const rankCeiling = maxSkillRankForElite(elite);
      const skillLevel = Math.min(b?.skillLevel ?? 1, rankCeiling);
      const masteryTargets = elite === 2 && skillLevel === 7 ? (b?.masteryTargets ?? {}) : {};
      const unlock = moduleUnlock(op.rarity || 1);
      const moduleStageTargets = unlock && elite >= unlock.elite && newLevel >= unlock.level
        ? (b?.moduleStageTargets ?? {})
        : {};
      return {
        ...curStates,
        [name]: { ...b, elite, level: newLevel, skillLevel, masteryTargets, moduleStageTargets },
      };
    });
  }

  // --- Where an operator actually is ---
  /**
   * What you own, written straight through.
   *
   * The old screen held a draft behind Confirm and Cancel. Inside the dialog
   * that would be a second save model beside the target's -- one tab that
   * commits as you press and one that does not, with nothing on either saying
   * which -- so this commits, like the depot and like the target.
   *
   * Every write goes through here rather than through setOwned, because two
   * things have to happen together: the roster is the record, and the plan's
   * own "from" is a view of it. They came apart once already, when the plan
   * kept its own copy.
   */
  function recordOwned(name: string, next: Owned) {
    const op = operatorByName.get(name);
    if (!op) return;
    const rarity = op.rarity || 1;

    /* The game's own rules, applied on the way in -- the same ones readRoster
       applies to a stored roster, so a state typed here and a state loaded
       from storage cannot disagree. */
    const elite = Math.min(Math.max(0, next.elite), maxEliteForRarity(rarity));
    const level = Math.min(Math.max(1, next.level), maxLevelForElite(rarity, elite));
    const skillLevel = Math.min(Math.max(1, next.skillLevel), maxSkillRankForElite(elite));
    const unlock = moduleUnlock(rarity);
    const masteries = elite === 2 && skillLevel === 7 ? next.masteries : {};
    const modules = unlock && elite >= unlock.elite && level >= unlock.level ? (next.modules ?? {}) : {};

    const owned: Owned = {
      elite,
      level,
      skillLevel,
      masteries,
      ...(Object.keys(modules).length ? { modules } : {}),
    };
    setOwned(name, owned);

    const b = builderStates[name];
    /* Nothing to reconcile for an operator with no target yet. */
    if (!b) return;

    /* A target can never sit below where the operator already is, so raising
       the starting point carries the target up with it. */
    let nextElite = b.elite;
    let nextLevel = b.level;
    if (elite > nextElite) {
      nextElite = elite;
      nextLevel = Math.min(level, maxLevelForElite(rarity, nextElite));
    } else if (elite === nextElite && level > nextLevel) {
      nextLevel = Math.min(level, maxLevelForElite(rarity, nextElite));
    }
    const nextSkillLevel = Math.min(Math.max(b.skillLevel, skillLevel), maxSkillRankForElite(nextElite));
    const nextMasteryTargets = { ...b.masteryTargets };
    for (const [idxStr, m] of Object.entries(masteries)) {
      const idx = Number(idxStr);
      if (m > 0 && (!nextMasteryTargets[idx] || nextMasteryTargets[idx] < m)) {
        nextMasteryTargets[idx] = m as 1 | 2 | 3;
      }
    }
    const nextModuleTargets = { ...b.moduleStageTargets };
    for (const [idxStr, stage] of Object.entries(modules)) {
      const idx = Number(idxStr);
      if (nextModuleTargets[idx] === undefined || nextModuleTargets[idx] < stage) nextModuleTargets[idx] = stage;
    }

    updateBuilder(name, {
      startingElite: elite,
      startingLevel: level,
      startingSkillLevel: skillLevel,
      startingMasteryLevels: masteries,
      startingModuleStages: modules,
      elite: nextElite,
      level: nextLevel,
      skillLevel: nextSkillLevel,
      masteryTargets: nextElite === 2 && nextSkillLevel === 7 ? nextMasteryTargets : {},
      moduleStageTargets: nextModuleTargets,
    });
  }

  /** Where an operator is now: the roster first, the plan's stated start
   *  second, unbuilt last. */
  function currentOf(name: string): Owned {
    const owned = roster[name];
    if (owned) return owned;
    const b = builderStates[name];
    if (!b) return UNBUILT;
    return {
      elite: b.startingElite,
      level: b.startingLevel,
      skillLevel: b.startingSkillLevel,
      masteries: b.startingMasteryLevels as Owned['masteries'],
      ...(Object.keys(b.startingModuleStages ?? {}).length ? { modules: b.startingModuleStages } : {}),
    };
  }

  const activeOp = activeName ? detailCache[activeName] : null;
  const activeOpLoading = activeName ? !detailCache[activeName] && loadingNames.has(activeName) : false;
  const builder = activeName ? builderStates[activeName] : null;

  // --- Building ---
  /**
   * The last build, so it can be taken back.
   *
   * One press spends materials and promotes an operator, and both halves have
   * to be undone together or the depot stops matching the game. The snapshot
   * holds everything the press changed; undo is offered only while the depot
   * still reads exactly as the build left it, because restoring an older depot
   * over edits the reader made since would lose those edits.
   */
  const [lastBuild, setLastBuild] = useState<{
    name: string;
    label: string;
    depotBefore: Depot;
    depotAfter: string;
    ownedBefore: Owned | undefined;
    builderBefore: BuilderState | undefined;
  } | null>(null);
  const [buildNote, setBuildNote] = useState<{ name: string; text: string } | null>(null);
  const canUndoBuild = !!lastBuild && JSON.stringify(depot) === lastBuild.depotAfter;

  /**
   * Pay for one goal and record it, or do neither.
   *
   * The receipt is what the resolver resolved: what is held goes first, a crafted
   * material spends its ingredients all the way down, the bench's LMD rides on
   * the plan's own line, EXP leaves as the records actually on the shelf. The
   * roster moves through recordOwned, which lifts the plan's start with it so
   * the row's "from" and the goal list agree on where the operator now stands.
   */
  function buildGoal(name: string, goal: Goal) {
    const op = detailCache[name];
    const summary = operatorByName.get(name);
    if (!op || !summary) return;
    const rarity = summary.rarity || 1;
    const now = currentOf(name);
    if (!goalReady(goal, now, rarity)) return;
    const plan = planBuild(priceGoal(goal, op, rarity, now, levels), depot, { crafting, autoCraft });
    if (!plan.ok) {
      setBuildNote({ name, text: `${goal.label} is short of ${plan.short.join(', ')} -- nothing changed.` });
      return;
    }
    setLastBuild({
      name,
      label: goal.label,
      depotBefore: depot,
      depotAfter: JSON.stringify(plan.remaining),
      ownedBefore: roster[name],
      builderBefore: builderStates[name],
    });
    setDepot(plan.remaining);
    writeDepot(plan.remaining);
    recordOwned(name, applyGoal(goal, now));
    const spent = Object.entries(plan.spent).map(([n, c]) => `${c.toLocaleString()} ${n}`).join(', ');
    const made = Object.entries(plan.made).map(([n, c]) => `${c} ${n}`).join(', ');
    setBuildNote({
      name,
      text: `Built ${goal.label} -- spent ${spent || 'nothing'}`
        + (made ? `, making ${made} at the bench` : '')
        + (plan.expWasted > 0 ? `; the last record over-shot by ${plan.expWasted.toLocaleString()} EXP` : '')
        + '.',
    });
  }

  function undoBuild() {
    if (!lastBuild || !canUndoBuild) return;
    const { name, depotBefore, ownedBefore, builderBefore } = lastBuild;
    setDepot(depotBefore);
    writeDepot(depotBefore);
    setOwned(name, ownedBefore ?? null);
    setBuilderStates((cur) => {
      const next = { ...cur };
      if (builderBefore) next[name] = builderBefore;
      else delete next[name];
      return next;
    });
    setBuildNote({ name, text: `Took back ${lastBuild.label}: the depot and ${name} are as they were.` });
    setLastBuild(null);
  }

  /**
   * The build dialog's steps: every goal between where the operator is and the
   * target, in the game's order, each priced from where they stand and
   * resolved against the depot ON ITS OWN. On its own, because that is the
   * question a build asks -- can I do THIS now -- whereas the row's meter
   * answers a different one, how much of the whole plan the depot covers once
   * the operators ahead in the plan have had their share.
   */
  const buildSteps = useMemo<BuildStep[]>(() => {
    const name = build?.name;
    const op = name ? detailCache[name] : null;
    const b = name ? builderStates[name] : null;
    if (!name || !op || !b) return [];
    const rarity = op.rarity || 1;
    const now = currentOf(name);
    return goalsOf(rarity, op, now, b).map((goal) => {
      const ready = goalReady(goal, now, rarity);
      const cost = priceGoal(goal, op, rarity, now, levels);
      const plan: BuildPlan | null = ready ? planBuild(cost, depot, { crafting, autoCraft }) : null;
      return { goal, ready, blocker: ready ? '' : goalBlocker(goal, now, rarity), cost, plan };
    });
    // currentOf reads roster and builderStates, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, detailCache, roster, builderStates, depot, crafting, autoCraft, levels]);

  const levelCost = activeOp && builder
    ? computeLevelCostRemaining(levels, activeOp.rarity || 1, builder.startingElite, builder.startingLevel, builder.elite, builder.level)
    : null;
  const promotions = activeOp && builder ? promotionCostsNeeded(activeOp, builder.elite, builder.startingElite) : [];
  const promotionTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of promotions) addCostGroup(totals, p.cost);
    return totalsToCostGroup(totals);
  }, [promotions]);

  const skillList = activeOp ? getSkillList(activeOp) : [];
  const sharedSkillCost = activeOp && builder ? skillLevelCostRemaining(activeOp, builder.startingSkillLevel, builder.skillLevel) : [];

  const skillsTotal = useMemo(() => {
    if (!activeOp || !builder) return [];
    const totals = new Map<string, number>();
    for (const item of sharedSkillCost) addCostGroup(totals, [item]);
    /* E2 as well as rank 7. Every mastery row in the gamedata sits behind
       PHASE_2, so rank 7 alone -- which is reachable at E1 -- is not enough,
       and this used to charge for masteries the game would not sell. */
    if (builder.skillLevel === 7 && builder.elite === 2) {
      for (const [idxStr, level] of Object.entries(builder.masteryTargets)) {
        const idx = Number(idxStr);
        const startMastery = builder.startingMasteryLevels[idx] || 0;
        addCostGroup(totals, skillMasteryCostRemaining(idx, activeOp, startMastery, level));
      }
    }
    return totalsToCostGroup(totals);
  }, [activeOp, builder, sharedSkillCost]);

  /**
   * The mastery a plan targets, set OUTRIGHT rather than toggled.
   *
   * M0 is a real option on the row now, so "press the selected one to clear it"
   * has nothing left to do -- and two ways to reach the same state, one of them
   * invisible, is how a reader ends up somewhere they did not mean to be. The
   * floor is what the roster already records: you cannot plan to un-master a
   * skill.
   */
  function setMasteryTarget(name: string, skillIndex: number, level: number) {
    setBuilderStates((curStates) => {
      const cur = curStates[name];
      if (!cur || maxEliteForRarity(operatorByName.get(name)?.rarity || 1) < 2) return curStates;
      const floor = cur.startingMasteryLevels[skillIndex] || 0;
      const wanted = Math.max(floor, Math.min(3, Math.max(0, level)));
      const next = { ...cur.masteryTargets };
      if (wanted === 0) delete next[skillIndex];
      else next[skillIndex] = wanted as 1 | 2 | 3;
      return { ...curStates, [name]: { ...(wanted > 0 ? withMasteryPrerequisites(cur) : cur), masteryTargets: next } };
    });
  }

  /** Same, for a module stage. -1 is "not unlocked", and it is an option rather
   *  than an absence, because stage index 0 is a stage already paid for. */
  function setModuleTarget(name: string, moduleIndex: number, stageIndex: number) {
    setBuilderStates((curStates) => {
      const cur = curStates[name];
      if (!cur) return curStates;
      const floor = cur.startingModuleStages?.[moduleIndex] ?? -1;
      const wanted = Math.max(floor, stageIndex);
      const next = { ...cur.moduleStageTargets };
      if (wanted < 0) delete next[moduleIndex];
      else next[moduleIndex] = wanted;
      return { ...curStates, [name]: { ...(wanted >= 0 ? withModulePrerequisites(cur, operatorByName.get(name)?.rarity || 1) : cur), moduleStageTargets: next } };
    });
  }

  const moduleList = useMemo(() => (activeOp ? plannerModules(activeOp) : []), [activeOp]);
  /* -1, not 0: a module you have never unlocked owes every stage, and stage index 0 is
     one you have already paid for. */
  const ownedModuleStage = (b: BuilderState, moduleIndex: number) =>
    (b.startingModuleStages?.[moduleIndex] ?? -1);

  const modulesTotal = useMemo(() => {
    if (!activeOp || !builder) return [];
    const totals = new Map<string, number>();
    for (const [idxStr, stageIdx] of Object.entries(builder.moduleStageTargets)) {
      const mod = moduleList[Number(idxStr)];
      /* From where you already are, not from nothing. This counted every stage of
         every targeted module however far along the operator already was -- the one
         dimension of a build that had no starting point to subtract. */
      if (mod) addCostGroup(totals, moduleStageCostRemaining(mod, ownedModuleStage(builder, Number(idxStr)), stageIdx));
    }
    return totalsToCostGroup(totals);
  }, [activeOp, builder, moduleList]);

  /**
   * The bill, one operator at a time, and then the sum.
   *
   * Kept per operator rather than only as a total, because every number on the
   * page is a reading of the same answer: the header's counts, the cards, each
   * row's meter and the depot strip's amber. Summing early would leave the rows
   * with nothing to attribute a shortfall to, and a second resolve to attribute
   * it WITH is a second answer that can disagree with the first.
   */
  const bills = useMemo(() => {
    const out: Record<string, CostGroup> = {};
    for (const name of selectedNames) {
      const op = detailCache[name];
      const b = builderStates[name];
      if (!op || !b) continue;
      const totals = new Map<string, number>();
      for (const group of upgradeCostGroups(op, b, levels)) addCostGroup(totals, group.cost);
      out[name] = totalsToCostGroup(totals);
    }
    return out;
  }, [selectedNames, builderStates, detailCache, levels]);

  /**
   * How many steps each planned operator has left, for the row's Build button
   * and the editor's line. The same `goalsOf` the row's goal count uses, so a
   * row reading "6 goals" cannot offer a dialog with five steps in it.
   */
  const buildStepCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const name of selectedNames) {
      const op = detailCache[name];
      const b = builderStates[name];
      if (!op || !b) continue;
      out[name] = goalsOf(op.rarity || 1, op, currentOf(name), b).length;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNames, detailCache, builderStates, roster]);

  const combinedBill = useMemo(() => {
    const totals = new Map<string, number>();
    for (const bill of Object.values(bills)) addCostGroup(totals, bill);
    return totalsToCostGroup(totals);
  }, [bills]);

  /** EXP and LMD are counted, not held, so they come out of the material list. */
  const split = useMemo(() => {
    let exp = 0;
    let lmd = 0;
    const materials: CostGroup = [];
    for (const item of combinedBill) {
      const qty = Number(item.quantity) || 0;
      if (item.name === 'EXP') exp += qty;
      else if (item.name === 'LMD') lmd += qty;
      else materials.push(item);
    }
    return { exp, lmd, materials };
  }, [combinedBill]);

  /* THE resolve. One, for the whole page. */
  const resolution = useMemo(
    () => resolveNeeds(split.materials, depot, { crafting, autoCraft }),
    [split.materials, depot, crafting, autoCraft, resolveNeeds],
  );
  /* Crafting costs LMD at the bench, and the plan's own LMD line is where that
     belongs -- it is the same money. */
  const lmdTotal = split.lmd + resolution.craftingLmd;
  const shares = useMemo(() => shortShares(resolution), [resolution, shortShares]);
  const shortMaterialCount = resolution.rows.filter((r) => r.short > 0).length;

  /**
   * A row per operator: the goals, the next one, and how covered the bill is.
   *
   * Coverage is attributed from the one resolution rather than resolved again
   * per operator -- so two operators wanting the same Orirock Cube cannot both
   * be told they have it. `shortShares` is what makes that work through a
   * declared craft, whose own row reports nothing short while its ingredients
   * carry the whole shortfall.
   */
  const planRows = useMemo(() => {
    const build = (name: string): PlanRowView | null => {
      const op = operatorByName.get(name);
      if (!op) return null;
      const detail = detailCache[name];
      const b = builderStates[name];
      const owned = roster[name];

      /* The roster first, the plan's stated start second, unbuilt last -- the
         same reading currentOf() gives the dialog, spelled out here because
         this memo lists what it reads. */
      const now: Owned = owned
        ?? (b
          ? { elite: b.startingElite, level: b.startingLevel, skillLevel: b.startingSkillLevel,
              masteries: b.startingMasteryLevels as Owned['masteries'], modules: b.startingModuleStages }
          : UNBUILT);
      const from = goalFrom(now);

      /* Masteries included, because the target label has them: "E2 L70 SL7"
         next to "E2 L80 SL7 S1M3 S2M3 S3M3" reads as though the masteries were
         all still to buy when one of them is already there. */
      const fromMasteries = (detail ? getSkillList(detail) : [])
        .map((_, i) => from.masteryOf(i))
        .map((m, i) => (m > 0 ? `S${i + 1}M${m}` : null))
        .filter(Boolean);
      const fromLabel = [`E${from.elite}`, `L${from.level}`, `SL${from.skillLevel}`, ...fromMasteries].join(' ');
      /* A selected name with no builder state can still happen for one render
         after an import; it prices nothing, so it says so rather than reading
         as a fully covered plan. */
      if (!b) {
        return { name, op, goals: 0, next: null, fromLabel, toLabel: null, covered: 0, blocked: 0, pending: false };
      }
      /* Everything below is computed from `detail`, which arrives over the
         network. Without it the goal count silently loses the masteries and
         the bill comes out empty, which the meter reads as fully covered. */
      const pending = !detail;

      const goals = goalsOf(op.rarity || 1, detail, now, b);
      /* "Next" is the first goal the operator can actually take, not the first
         in the list: the list groups promotions ahead of level runs, and
         "Next: E1 promotion" at E0 Lv20 sends the reader to a button that is
         locked. Falls back to the list's head if nothing is ready, which a
         consistent plan never produces. */
      const next = goals.find((g) => goalReady(g, now, op.rarity || 1)) ?? goals[0] ?? null;

      /* This operator's own share of the shortfall, weighted by how much of
         each material it asks for. */
      let wanted = 0;
      let missing = 0;
      let blocked = 0;
      for (const item of bills[name] || []) {
        if (item.name === 'EXP' || item.name === 'LMD') continue;
        const qty = Math.ceil(Number(item.quantity) || 0);
        if (qty <= 0) continue;
        const ratio = shares.get(item.name) ?? 0;
        wanted += qty;
        missing += qty * ratio;
        if (ratio > 0) blocked += 1;
      }

      return {
        name,
        op,
        goals: goals.length,
        next: next?.label ?? null,
        fromLabel,
        toLabel: targetLabel(b),
        covered: wanted > 0 ? Math.max(0, 1 - missing / wanted) : 1,
        blocked,
        pending,
      };
    };

    /* Only the operators with goals. The rest of the roster used to be built
       into row views for a folded-away list in the same panel; the roster grid
       shows them now, so four hundred views were being computed for a list
       nothing renders. */
    const planned = selectedNames.map((n) => build(n)).filter(Boolean) as PlanRowView[];
    return { planned };
  }, [selectedNames, roster, builderStates, detailCache, operatorByName, bills, shares]);

  /* Only the rows that can answer. A total that included the half-loaded ones
     would tick upwards as their data landed, which reads as the plan growing. */
  const goalTotal = useMemo(
    () => planRows.planned.filter((r) => !r.pending).reduce((n, r) => n + r.goals, 0),
    [planRows],
  );
  /* Everyone this page knows about: recorded, planned, or both. It used to be
     the plan panel's two lists added together, and that panel no longer renders
     the operators without goals -- the roster grid does -- so the number comes
     off the stores themselves rather than off a list nothing shows. */
  const operatorTotal = useMemo(
    () => new Set([...selectedNames, ...Object.keys(roster)]).size,
    [selectedNames, roster],
  );

  /** The slice of the depot this plan actually touches, in the game's order. */
  const depotStrip = useMemo(() => {
    const wanted = new Map<string, number>();
    for (const item of combinedBill) {
      if (item.name === 'EXP') continue;
      wanted.set(item.name, (wanted.get(item.name) || 0) + Math.ceil(Number(item.quantity) || 0));
    }
    return inGameOrder
      .filter((name) => wanted.has(name))
      .map((name) => ({
        name,
        have: depot[name] || 0,
        need: wanted.get(name) || 0,
        short: (shares.get(name) ?? 0) > 0 || (name === 'LMD' && (depot.LMD || 0) < lmdTotal),
      }));
  }, [combinedBill, depot, shares, lmdTotal, inGameOrder]);

  const clearControl = (section: 'simple' | 'goals' | 'roster' | 'depot') => <ClearControl
    label="Clear"
    count={section === 'simple' ? operatorTotal : section === 'goals' ? selectedNames.length : Object.keys(section === 'depot' ? depot : roster).length}
    noun={section === 'depot' ? 'material' : section === 'goals' ? 'plan' : 'operator'}
    armed={armedClear === section} onArm={() => armClear(section)}
    onConfirm={() => {
      if (section === 'simple' || section === 'goals') { setSelectedNames([]); setBuilderStates({}); setSummaryName(null); setBuild(null); }
      if (section === 'simple' || section === 'roster') { setRoster({}); writeRoster({}); }
      if (section === 'depot') { setDepot({}); writeDepot({}); }
      armClear(null);
    }} />;


  return (
    <>
      <Head><title>Operator Planner — Arkpedia</title></Head>

      <div className="planner-workspace-head">
        <h1>Operator Planner</h1>
        <div className="planner-mode" role="group" aria-label="Planner mode">
          {(['simple', 'experimental'] as const).map((mode) => <button key={mode} type="button" aria-pressed={plannerMode === mode} onClick={() => { setPlannerMode(mode); setWizard(null); }}>{mode === 'simple' ? 'Simple' : 'Experimental'}</button>)}
        </div>
        <button type="button" className="ghost" aria-expanded={transferOpen} onClick={() => setTransferOpen(v => !v)}>Export / import</button>
      </div>

      <main>
        {/* Not a nicety. This browser's storage is the only copy there is, so
            clearing site data or moving machine loses the depot and the roster
            both -- which is why the way out lives in the page header rather
            than at the bottom of a panel nobody opens. */}
        {transferOpen && (
          <TransferDialog onClose={() => setTransferOpen(false)}>
              {/* One file, all three stores. The two boxes this replaces carried
                  the depot and the roster and left the GOALS behind -- the thing
                  you spend the most time setting was the one thing you could not
                  take with you. */}
              <div className="plan-transfer-acts">
                <button
                  type="button"
                  className="primary"
                  onClick={async () => {
                    const text = formatBundle(depot, roster, selectedNames, builderStates, crafting);
                    const saved = await saveToFile(text, bundleFilename());
                    if (!saved) { setTransferNote('Nothing saved.'); return; }
                    setTransferText(text);
                    setTransferNote(saved.chosen
                      ? `Saved as ${saved.name}, where you chose.`
                      : `Downloaded as ${saved.name} — it is in your browser's downloads.`);
                  }}
                >
                  Export file
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    const opened = await loadFromFile();
                    if (!opened) { setTransferNote('Nothing loaded.'); return; }
                    if (opened.tooLarge) { setTransferNote(`${opened.name} is far larger than any planner file, so it was not read.`); return; }
                    setTransferText(opened.text);
                    applyTransfer(opened.text, opened.name);
                  }}
                >
                  Import file
                </button>
              </div>
              <details>
                <summary>Supported formats</summary>
                <p>Arkpedia backups include your inventory, operators and goals. Krooster CSV, Penguin Stats JSON and ark-nights files import inventory only.</p>
                <p>{filePickerReady ? 'Choose where to save your backup.' : 'Exports go to your browser’s downloads.'}</p>
                {folderPickerReady && <button type="button" className="ghost" onClick={async () => { if (!await showFolder()) setTransferNote('Your browser would not open the folder.'); }}>Show folder</button>}
              </details>

              <details className="plan-transfer-text">
                <summary>Paste / copy data</summary>
                <textarea
                  className="planner-depot-text"
                  rows={4}
                  aria-label="Planner data"
                  placeholder="Paste planner data…"
                  value={transferText}
                  onChange={(e) => { setTransferText(e.target.value); setTransferNote(null); }}
                />
                <div className="submit-row-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setTransferText(formatBundle(depot, roster, selectedNames, builderStates, crafting));
                      setTransferNote('Export text ready to copy.');
                    }}
                  >
                    Get export text
                  </button>
                  <button type="button" className="ghost" onClick={() => applyTransfer(transferText, 'the box')}>
                    Import text
                  </button>
                </div>
              </details>

              {transferNote && <p className="hint" role="status">{transferNote}</p>}
          </TransferDialog>
        )}

        {plannerMode === 'simple' ? (
          <SimplePlanner clearControl={clearControl('simple')} operators={operators} selectedNames={selectedNames} states={builderStates} details={detailCache} bills={bills} combinedBill={combinedBill} selected={summaryName} onSelect={setSummaryName}
            onEdit={(name, step) => { setSimpleNewOperator(!selectedNames.includes(name)); addOperator(name); setSummaryName(name); setSimpleStep(step ?? (selectedNames.includes(name) ? 'goal' : 'current')); setWizard({ flow: 'goal', step: 'one', queue: [name], index: 0, fromPick: false }); }}
            onRemove={removeOperator} onRetry={fetchOperatorDetail} failedNames={failedNames} />
        ) : (<>
        {/* First, because it is the thing the reader came to state. Everything
            below is worked out FROM it. */}
        <section className="plan-panel">
          <PlanRows
            clearControl={clearControl('goals')}
            planned={planRows.planned}
            openName={activeName}
            /* A row's Edit is the GOAL window at its second step, with a queue
               of one: editing a target and setting one are the same act
               arriving from different directions. Where the operator actually
               is lives in the roster window, reached from its own button. */
            onEdit={(name) => setWizard({ flow: 'goal', step: 'one', queue: [name], index: 0, fromPick: false })}
            onBuild={(name) => { setBuildNote(null); setBuild({ name, fromEditor: false }); }}
            onRemove={removeOperator}
            onRoster={() => setWizard({ flow: 'roster', step: 'pick' })}
            onAddGoal={() => setWizard({ flow: 'goal', step: 'pick' })}
            rosterCount={Object.keys(roster).length}
          />
        </section>

        {/* Second, under the plan it is derived from. It used to lead, on the
            argument that what is MISSING is the first question -- and the
            reader's own order is the other way round: you say who you are
            building, and then what that leaves you short of. Moved on request. */}
        <section className="plan-panel">
          <ShortfallList
            resolution={resolution}
            depot={depot}
            crafting={crafting}
            onCraftingToggle={toggleCrafting}
            autoCraft={autoCraft}
            onAutoCraft={setAutoCraft}
            showAll={showAllMaterials}
            onShowAll={setShowAllMaterials}
            exp={split.exp}
            lmd={lmdTotal}
            goalCount={goalTotal}
            /* The bill is assembled from one static file per operator, fetched
               on demand -- so on a cold load there is a moment where the plan
               has four operators and no cost yet. Saying "no goals set" then
               would be the page reporting the network as an empty plan. */
            loading={selectedNames.some((n) => !detailCache[n])}
          />
        </section>

        {/* Last, because it is the answer to the least urgent question. Closed,
            it still shows the slice of the depot this plan actually touches --
            twelve tiles rather than ninety-three, which is the part worth
            reading at a glance. */}
        <section className="plan-panel" ref={depotPanelRef}>
          <div className="plan-panel-head">
            <span className="label-pair">
              <span className="label-tag">What you have</span>
              <h2>Depot</h2>
            </span>
            {/* When it was last touched, and nothing else. "82 of 92 held" was
                a count of the catalogue, which is not a fact about your depot --
                every reader has most of the list at zero, so the number said
                the same thing to everybody. */}
            {depotTouched && <span className="hint">&middot; edited {sinceLabel(depotTouched)}</span>}
            <span className="plan-panel-acts">
              {clearControl('depot')}
              <button
                type="button"
                className={depotOpen ? 'primary btn-sm' : 'ghost'}
                aria-expanded={depotOpen}
                onClick={() => setDepotOpen((v) => {
                  if (v) setAnchorAfter('depot');
                  return !v;
                })}
              >
                {depotOpen ? 'Done' : 'Open depot'}
              </button>
            </span>
          </div>

          <div className="plan-panel-body">
            {depotOpen ? (
              <DepotGrid
                catalogue={depotCatalogue}
                /* The WHOLE plan, not the operator on screen: the depot is one
                   store and you fill it once, so leading with what one of four
                   operators happens to want would hide the other three. */
                planNeeds={combinedBill}
                depot={depot}
                onChange={setDepotCount}
              />
            ) : depotStrip.length > 0 ? (
              <>
                <div className="depot-strip">
                  {depotStrip.map((item) => (
                    <span
                      key={item.name}
                      className={`depot-chip${item.have === 0 ? ' empty' : ''}${item.short ? ' short' : ''}`}
                      title={`${item.name} — ${item.have} held, the plan wants ${item.need.toLocaleString()}`}
                    >
                      <MaterialIcon name={item.name} size={32} />
                      <b>{item.have > 0 ? compactCount(item.have) : '—'}</b>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="hint">
                {/* "Nothing planned" is only true when nothing IS planned. With
                    four operators in the plan and their bills still on the
                    wire, it would be the page reporting the network as an empty
                    plan -- the same slip the panel at the top makes if it is
                    not told. */}
                {selectedNames.some((n) => !detailCache[n])
                  ? 'Working out what the plan wants...'
                  : 'Nothing planned yet, so there is nothing to compare a depot against. Open it and read your counts in, or set a goal above first.'}
              </p>
            )}
          </div>
        </section>
        </>)}
      </main>

      {build && (() => {
        /* The row's own labels, so the dialog's header and the row it was
           opened from cannot describe the operator differently. */
        const row = planRows.planned.find((r) => r.name === build.name);
        const summary = operatorByName.get(build.name);
        if (!row || !summary) return null;
        return (
          <BuildDialog
            name={build.name}
            op={summary}
            fromLabel={row.fromLabel}
            toLabel={row.toLabel ?? ''}
            steps={buildSteps}
            note={buildNote && buildNote.name === build.name ? buildNote.text : null}
            canUndo={canUndoBuild && lastBuild?.name === build.name}
            held={(n) => depotCatalogue.includes(n)}
            onBuild={(goal) => buildGoal(build.name, goal)}
            onUndo={undoBuild}
            onClose={() => {
              /* Back where they came from: the editor if that is where the
                 dialog was opened, otherwise the plan. */
              if (build.fromEditor) setWizard({ flow: 'goal', step: 'one', queue: [build.name], index: 0, fromPick: false });
              setBuild(null);
              setBuildNote(null);
            }}
          />
        );
      })()}

      {wizard && (
        <OperatorWizard
          clearControl={wizard.flow === 'roster' ? clearControl('roster') : undefined}
          simpleStep={plannerMode === 'simple' ? simpleStep : undefined}
          onSimpleNext={simpleNewOperator && simpleStep === 'current' ? () => setSimpleStep('goal') : undefined}
          flow={wizard.flow}
          step={wizard.step}
          operators={operators}
          roster={roster}
          inPlan={new Set(selectedNames)}
          queue={wizard.step === 'one' ? wizard.queue : []}
          index={wizard.step === 'one' ? wizard.index : 0}
          canGoBack={wizard.step === 'one' && wizard.fromPick}
          onOpen={(name, order) => {
            /* The queue is the grid as the reader filtered it, so Next walks
               their 6-stars when that is what they narrowed it to. Nothing is
               written by opening the roster flow -- a look is not a statement --
               but the GOAL flow has to put the operator in the plan, because a
               target is the thing that puts them there. */
            if (wizard.flow === 'goal') addOperator(name);
            setWizard({ flow: wizard.flow, step: 'one', queue: order, index: Math.max(0, order.indexOf(name)), fromPick: true });
          }}
          onBack={() => setWizard({ flow: wizard.flow, step: 'pick' })}
          onIndex={(i) => setWizard((cur) => {
            if (cur?.step !== 'one') return cur;
            /* Walking the goal flow adds each one as you reach it, for the same
               reason opening the first did. */
            const next = cur.queue[i];
            if (cur.flow === 'goal' && next) addOperator(next);
            return { ...cur, index: i };
          })}
          onClose={() => setWizard(null)}
          headline={activeOp ? (
            <span className="planner-buildhead wizard-headline">
              <span className="planner-buildface">
                <Image src={getOperatorIconPath(activeOp)} alt="" width={44} height={44} />
                <span className={`planner-buildrarity tier-${activeOp.rarity || 1}`} />
              </span>
              <span className="planner-buildwho">
                <span className="label-pair">
                  <h2>{activeOp.name}</h2>
                </span>
                {/* The roster window has no target to point at, and drawing
                    "from -> " with nothing either side is what it did before
                    these became two windows. It states where they are; the goal
                    window states where they are GOING. */}
                {wizard.flow === 'roster' ? (
                  <span className="planner-buildfromto">
                    <i>{roster[activeOp.name] ? 'now at' : 'not recorded'}</i>
                    {roster[activeOp.name] && <b><PlannerStateLabel label={ownedLabel(roster[activeOp.name])} /></b>}
                  </span>
                ) : (
                  <span className="planner-buildfromto">
                    <i>from</i>
                    <b><PlannerStateLabel label={builder ? spacedLevelLabel(builder) : ''} /></b>
                    <em aria-hidden="true">&rarr;</em>
                    <span className="visually-hidden">to</span>
                    <b className="planner-buildto"><PlannerStateLabel label={builder ? targetLabel(builder) : ''} /></b>
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="hint">
              {activeName && !failedNames.has(activeName)
                ? `Loading ${activeName}...`
                : activeName
                  ? `Could not load ${activeName} -- close this and try again.`
                  : ''}
              {activeName && failedNames.has(activeName) && <button type="button" className="ghost" onClick={() => fetchOperatorDetail(activeName)}>Retry</button>}
            </span>
          )}
        >
          {activeName && activeOp && (
            <>
              {/* No tabs: the window IS the question. The roster window asks
                  where they are and carries the Owned switch; the goal window
                  asks where you want them and carries the bill. Both write
                  through as you press, so there is no Confirm on one and none
                  on the other. */}
              {wizard.flow === 'roster' && (
                <div className="wizard-tabrow">
                  <span className="label-pair">
                    <span className="label-tag">Where they are now</span>
                  </span>
                  {/* Ownership, stated. Krooster's OWNED switch, and the one thing
                      the four blocks cannot say on their own: a value in any of
                      them already means "owned" (recordOwned writes the roster),
                      but an operator you own and have not touched is E0 Lv1 too,
                      and only this can tell that apart from one you do not have. */}
                  <button
                    type="button"
                    className={`wizard-owned${roster[activeName] ? ' on' : ''}`}
                    aria-pressed={!!roster[activeName]}
                    onClick={() => {
                      if (roster[activeName]) {
                        /* Off: out of the roster. A plan for them stands, but it
                           starts from nothing again -- its "from" was a view of the
                           record that just went, and pricing from a state you have
                           said you do not have is the lie the roster exists to
                           prevent. */
                        setOwned(activeName, null);
                        if (builder) updateBuilder(activeName, defaultStartingState());
                      } else {
                        recordOwned(activeName, currentOf(activeName));
                      }
                    }}
                  >
                    <span className="wizard-owned-mark" aria-hidden="true">{roster[activeName] ? '✓' : ''}</span>
                    Owned
                  </button>
                </div>
              )}

              {wizard.flow === 'roster' || !builder || (plannerMode === 'simple' && simpleStep === 'current') ? (
                <OperatorStateForm
                  mode="current"
                  rarity={activeOp.rarity || 1}
                  skills={skillList.map((sk, i) => ({
                    name: sk.name || `Skill ${i + 1}`,
                    icon: sk.icon || getSkillIconPath(activeOp.name, sk.name),
                  }))}
                  modules={moduleList.map((mod, i) => ({
                    name: mod.name || mod.badgeText || `Module ${i + 1}`,
                    icon: mod.icon ?? null,
                    stages: mod.stages.length,
                  }))}
                  elite={currentOf(activeName).elite}
                  level={currentOf(activeName).level}
                  skillLevel={currentOf(activeName).skillLevel}
                  masteryOf={(i) => currentOf(activeName).masteries[i] || 0}
                  /* -1, not 0: a module never unlocked owes every stage, and
                     stage index 0 is one already paid for. */
                  moduleStageOf={(i) => currentOf(activeName).modules?.[i] ?? -1}
                  onElite={(e) => recordOwned(activeName, { ...currentOf(activeName), elite: e })}
                  onLevel={(l) => recordOwned(activeName, { ...currentOf(activeName), level: l })}
                  onSkillLevel={(r) => recordOwned(activeName, withSkillRankPrerequisites(currentOf(activeName), r))}
                  onMastery={(i, m) => {
                    const now = currentOf(activeName);
                    const masteries = { ...now.masteries };
                    if (m <= 0) delete masteries[i];
                    else masteries[i] = m as 1 | 2 | 3;
                    /* A mastery implies rank 7, because it cannot exist without
                       one -- and recordOwned would otherwise clamp it away. */
                    const anyMastery = Object.values(masteries).some((x) => x > 0);
                    recordOwned(activeName, { ...(anyMastery ? withMasteryPrerequisites(now) : now), masteries });
                  }}
                  onModuleStage={(i, sIdx) => {
                    const now = currentOf(activeName);
                    const modules = { ...(now.modules ?? {}) };
                    if (sIdx < 0) delete modules[i];
                    else modules[i] = sIdx;
                    recordOwned(activeName, { ...(sIdx >= 0 ? withModulePrerequisites(now, activeOp.rarity || 1) : now), modules });
                  }}
                />
              ) : (
                <OperatorStateForm
                  mode="target"
                  rarity={activeOp.rarity || 1}
                  skills={skillList.map((sk, i) => ({
                    name: sk.name || `Skill ${i + 1}`,
                    icon: sk.icon || getSkillIconPath(activeOp.name, sk.name),
                  }))}
                  modules={moduleList.map((mod, i) => ({
                    name: mod.name || mod.badgeText || `Module ${i + 1}`,
                    icon: mod.icon ?? null,
                    stages: mod.stages.length,
                  }))}
                  elite={builder.elite}
                  level={builder.level}
                  skillLevel={builder.skillLevel}
                  /* No target set means the plan asks for what you already have,
                     which is the honest default: it charges nothing. */
                  masteryOf={(i) => builder.masteryTargets[i] ?? (builder.startingMasteryLevels[i] || 0)}
                  moduleStageOf={(i) => builder.moduleStageTargets[i] ?? ownedModuleStage(builder, i)}
                  minElite={builder.startingElite}
                  minLevel={builder.elite === builder.startingElite ? builder.startingLevel : 1}
                  minSkillLevel={builder.startingSkillLevel}
                  minMasteryOf={(i) => builder.startingMasteryLevels[i] || 0}
                  minModuleStageOf={(i) => ownedModuleStage(builder, i)}
                  onElite={(e) => setElite(activeOp.name, activeOp, e)}
                  onLevel={(l) => {
                    const unlock = moduleUnlock(activeOp.rarity || 1);
                    updateBuilder(activeOp.name, { level: l, moduleStageTargets: unlock && builder.elite >= unlock.elite && l >= unlock.level ? builder.moduleStageTargets : {} });
                  }}
                  onSkillLevel={(r) => updateBuilder(activeOp.name, {
                    ...withSkillRankPrerequisites(builder, r),
                    /* Below 7 there are no masteries to buy, so a target left
                       behind at M3 would be priced against a rank that cannot
                       carry it. */
                    masteryTargets: r < 7 ? {} : builder.masteryTargets,
                  })}
                  onMastery={(i, m) => setMasteryTarget(activeOp.name, i, m)}
                  onModuleStage={(i, sIdx) => setModuleTarget(activeOp.name, i, sIdx)}
                  /* What the choice actually DOES, at the level chosen -- the
                     reason to pick M3 over M2 is the effect, not the number. */
                  skillDescription={(i) => {
                    const sk = skillList[i];
                    const target = builder.masteryTargets[i];
                    const entry = target
                      ? sk?.levels?.find((lv) => lv.mastery === target)
                      : sk?.levels?.find((lv) => lv.level === builder.skillLevel && !lv.mastery);
                    return entry?.description ? highlightStats(entry.description) : 'No description available.';
                  }}
                  moduleDescription={(i) => {
                    const mod = moduleList[i];
                    if (!mod) return 'No description available.';
                    const target = builder.moduleStageTargets[i];
                    const stage = mod.stages[target ?? mod.stages.length - 1];
                    return stage?.effectText ? highlightStats(stage.effectText) : 'No description available.';
                  }}
                />
              )}

              {/* What THIS one costs, against the same resolution the summary at
                  the top of the page reads. Not a second resolve: one Orirock
                  Cube cannot be spent on two operators, and two independent
                  answers would each claim it.

                  Goal window only: a bill is what a TARGET asks of the depot,
                  and the roster window has no target in it to ask. */}
              {plannerMode === 'experimental' && wizard.flow === 'goal' && builder && (
                <>
                  <div className="wizard-bill">
                    <OperatorBill bill={bills[activeName] || []} shares={shares} depot={depot} />
                  </div>

                  <div className="wizard-build">
                    {/* Spending the depot is its own screen again. A block here
                        meant opening the window where you change what you WANT
                        in order to do the thing that spends what you have. */}
                    <button
                      type="button"
                      className="primary"
                      onClick={() => { setBuild({ name: activeName, fromEditor: true }); setWizard(null); }}
                    >
                      Build&hellip;
                    </button>
                    <span className="hint">
                      {buildStepCount[activeName] === undefined
                        ? 'Work out what to spend, one step at a time.'
                        : `Spend your depot on the next of ${buildStepCount[activeName]} ${buildStepCount[activeName] === 1 ? 'step' : 'steps'}.`}
                    </span>
                  </div>
                </>
              )}

              {/* Forgetting is the roster's business -- it is the record of what
                  you HAVE, and this drops it along with any plan built on it. A
                  plan row's own × drops just the goal. */}
              {wizard.flow === 'roster' && (
                <div className="wizard-drop">
                  <button
                    type="button"
                    className="danger btn-sm"
                    onClick={() => forgetOperator(activeName)}
                  >
                    Forget {activeOp.name}
                  </button>
                  <span className="hint">Out of the plan and out of your roster, both.</span>
                </div>
              )}
            </>
          )}
        </OperatorWizard>
      )}
    </>
  );
}

function trimSkill(sk: Skill) {
  return {
    name: sk.name ?? null,
    icon: sk.icon ?? null,
    recoveryType: null,
    activationType: null,
    duration: null,
    cost: sk.cost ?? null,
    levels: (sk.levels || []).map((lv) => ({
      level: lv.level ?? null,
      mastery: lv.mastery ?? null,
      description: lv.description ?? null,
      initialSp: null,
      spCost: null,
      duration: null,
    })),
  };
}

function trimModule(mod: OperatorModule) {
  return {
    type: mod.type,
    icon: mod.icon ?? null,
    badgeText: mod.badgeText ?? null,
    name: mod.name ?? null,
    mission: null,
    stages: (mod.stages || []).map((s) => ({
      stage: null,
      attributesIncreased: null,
      effectLabel: null,
      effectText: s.effectText ?? null,
      ...(s.cost ? { cost: s.cost } : {}),
    })),
  };
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/planner", async () => {
  const allOps = getAllOperators().filter((op) => isOperatorReleased(op));

  // Lightweight props -- just enough for the search picker and
  // selected-operator chips. Full promotion/skills/modules build data
  // lives in one static JSON file per operator (written below), fetched
  // on demand once that operator is actually added to the plan --
  // rather than shipping every operator's full build data (previously
  // several MB) upfront regardless of whether it's ever looked at.
  // Static files, not an API route: this avoids serverless function
  // invocations on Vercel entirely -- served straight from the CDN like
  // any other public/ asset (icons, etc.), not billed/limited as
  // function executions the way an API route would be per request.
  /* Built from every operator, including the future ones filtered out of the list
     below: an alter's `alternate` field can point at a record global has not shipped,
     and the map has to resolve it either way or buildAliasMap throws. */
  const aliases = buildAliasMap(getAllOperators().map((op) => ({ name: op.name, alternate: op.alternate })));
  const operators: PlannerOperatorSummary[] = allOps.map((op) => ({
    name: op.name,
    rarity: op.rarity,
    /* Class, not branch: the grid filters by the eight classes, and Chiave's
       "Pioneer" is a level of detail a planning screen has no use for. */
    className: op.class ?? null,
    art: (() => { const src = getOperatorIconPath(op).replace('-star-icons/', '-star-skins/'); return publicFileExists(decodeURIComponent(src)) ? src : getOperatorIconPath(op); })(),
    ...(aliases[op.name] ? { aliases: aliases[op.name] } : {}),
  }));

  /**
   * Every operator the grid offers has to have a face.
   *
   * `getOperatorIconPath` builds a path out of a name and returns it whether or
   * not the file is there, and about forty call sites across the site trust it,
   * so a missing portrait is a silent 404 that renders as a blank square. Two of
   * them -- Gallus-squared and Rhodes Island Recon, both CN-only 1-star robots --
   * were found by eye in the roster grid rather than by any check, which is the
   * failure mode this codebase keeps paying for: where there was a warning the
   * gap got fixed, where there wasn't nobody looked.
   *
   * A failed build rather than a warning, because the grid is ENTIRELY portraits
   * and there is nothing else on a tile to carry the operator. The fix is a
   * command, so the message says which one.
   */
  const RARITY_WORDS: Record<number, string> = { 6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one' };
  const faceless = allOps.filter((op) => {
    const word = RARITY_WORDS[op.rarity || 0];
    if (!word) return true;
    const safe = op.name.replace(/[\\/*?:"<>|]/g, '').trim();
    return !publicFileExists(`/${word}-star-icons/${safe} - Base.webp`);
  });
  if (faceless.length) {
    throw new Error(
      `planner: ${faceless.length} operator(s) have no portrait in public/<rarity>-star-icons/, so the `
      + `roster grid would show a blank square for them here and on /operators, the guesser, `
      + `recruitment, the base and the timeline: ${faceless.map((o) => `${o.name} (${o.rarity}\u2605)`).join(', ')}. `
      + 'Run: python3 scripts/imports/import-operator-avatars.py',
    );
  }

  /**
   * The base art is labelled "Base". Always, in both folders.
   *
   * Three illustrations were labelled `- Default.webp` instead -- Lancet-2,
   * Plume and Popukar -- while their icons were `- Base.webp`, which split the
   * pair: `getOperatorAppearances` collects labels by the `<Name> - ` prefix, so
   * each of those operators reported TWO appearances, one with no icon and one
   * with no illustration, and two separate code paths grew a special case for
   * the odd label. One spelling of one thing; the exception is not worth the
   * branches it costs, and nothing warned about any of it.
   */
  const oddLabels: string[] = [];
  for (const word of Object.values(RARITY_WORDS)) {
    for (const kind of ['icons', 'skins']) {
      const dir = `${word}-star-${kind}`;
      for (const f of publicFiles(dir)) {
        if (f.endsWith(' - Default.webp')) oddLabels.push(`${word}-star-${kind}/${f}`);
      }
    }
  }
  if (oddLabels.length) {
    throw new Error(
      `planner: ${oddLabels.length} art file(s) are labelled "Default" where this site's convention is `
      + `"Base", which splits the operator's appearance pair in getOperatorAppearances: `
      + `${oddLabels.join(', ')}. Rename them to "<Name> - Base.webp".`,
    );
  }

  const dataDir = path.join(process.cwd(), 'public', 'planner-data');
  fs.mkdirSync(dataDir, { recursive: true });
  for (const op of allOps) {
    const trimmed: PlannerOperator = {
      name: op.name,
      rarity: op.rarity,
      promotion: (op.promotion || []).map((p: PromotionTier) => ({
        tier: '',
        upgrades: [],
        prerequisite: null,
        cost: p.cost ?? [],
      })),
      skills: Array.isArray(op.skills)
        ? op.skills.map(trimSkill)
        : op.skills
        ? { skillList: op.skills.skillList.map(trimSkill), skillCost: op.skills.skillCost ?? null }
        : [],
      modules: (op.modules || []).map(trimModule),
    };
    const filePath = path.join(dataDir, `${encodeURIComponent(op.name)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trimmed));
  }

  /**
   * The depot's catalogue, checked rather than assumed.
   *
   * MATERIAL_SORT_ORDER names everything the planner can emit; public/material-icons/
   * is what there is art for. The depot grid needs the intersection, because
   * getMaterialIconPath builds `/material-icons/<name>.webp` from a name and never
   * asks whether the file is there -- a miss is a 404 that renders as a blank square
   * and says nothing. Checking here means the grid can only ever contain tiles that
   * draw.
   *
   * It throws rather than filtering silently when the loss is large. A handful of
   * sort-order entries with no art is ordinary (LMD and EXP are counters, not items);
   * half the list missing means the folder moved, and a depot that quietly shrank to
   * sixty tiles is the kind of wrong answer nothing reports.
   */
  const iconStems = new Set(
    publicFiles('material-icons')
      .map((f) => path.parse(f).name),
  );
  const depotCatalogue = MATERIAL_SORT_ORDER.filter(
    (name) => iconStems.has(name.replace(/[\\/*?:"<>|]/g, '').trim()),
  );
  if (depotCatalogue.length < MATERIAL_SORT_ORDER.length * 0.8) {
    throw new Error(
      `planner: only ${depotCatalogue.length} of ${MATERIAL_SORT_ORDER.length} materials have an icon in ` +
      'public/material-icons/. That is too few to be a data gap -- check the folder.',
    );
  }

  /**
   * Everything a base recipe mentions has to be somewhere a reader can count it.
   *
   * The depot's catalogue is MATERIAL_SORT_ORDER intersected with the icons on disk,
   * so a material absent from the sort order simply never gets a tile -- and the
   * planner will still cheerfully tell you a Dualchip is made of two Chip Packs and a
   * Chip Catalyst you have no way to record. That is exactly what happened when the
   * Factory's table was added: three items (Chip Catalyst, Originium Shard, Pure Gold)
   * came in with it and none of them could be entered.
   *
   * The importer cannot check this -- it is a .mjs script and the sort order is a TS
   * module -- so the assertion lives here, where getStaticProps already reads both and
   * a failure is a failed build rather than a missing tile.
   */
  const holdable = new Set(depotCatalogue);
  const unrecordable = new Set<string>();
  for (const [product, recipe] of Object.entries(baseFormulas as Record<string, { costs: { name: string }[] }>)) {
    /* Only recipes for something a plan can actually ASK for. base-formulas.json covers
       both base workbenches, so it also knows how to make Pure Gold and an Originium
       Shard -- neither of which appears in any operator's bill, which is exactly why
       they are not in the depot. Demanding that every product be holdable would fail
       the build over a recipe nothing can ever request. What matters is the other
       direction: if a plan CAN ask for it, every ingredient has to be enterable. */
    if (!holdable.has(product)) continue;
    for (const cost of recipe.costs) if (cost.name !== 'LMD' && !holdable.has(cost.name)) unrecordable.add(cost.name);
  }
  if (unrecordable.size) {
    throw new Error(
      `planner: ${unrecordable.size} material(s) named by data/base-formulas.json cannot be held in the ` +
      `depot, so the plan can ask for something nobody can enter: ${[...unrecordable].sort().join(', ')}. ` +
      'Add them to MATERIAL_SORT_ORDER and MATERIAL_GROUPS in lib/farming/materialSortOrder.ts, ' +
      'and check public/material-icons/ has art for each.',
    );
  }

  /* The stage-code guard that used to sit here is gone with the hand-typed list it
     guarded: the supply stages are derived from data/stages.json now, so a code that is
     not a stage cannot be written in the first place, and the script refuses to emit an
     empty map. */

  /**
   * Every operator with a module has a rarity the unlock table knows.
   *
   * `moduleUnlock` is a rarity -> level map read off uniequip_table: 4-star 40,
   * 5-star 50, 6-star 60, with no exceptions across all 477 upgrade modules in the EN
   * gamedata. It cannot be re-derived at build time, because the repo does not carry
   * uniequip_table -- so what is checked is the assumption it rests on: that only
   * 4, 5 and 6 star operators have modules at all. The day the game gives one to a
   * 3-star, the module block would say "A 3-star operator does not get modules" over
   * a row of live controls, and nothing else would notice.
   */
  const modulesWithoutAnUnlock = allOps
    .filter((op) => (op.modules || []).some((m) => m.type !== 'Original') && !moduleUnlock(op.rarity || 0))
    .map((op) => `${op.name} (${op.rarity}-star)`);
  if (modulesWithoutAnUnlock.length) {
    throw new Error(
      `planner: ${modulesWithoutAnUnlock.length} operator(s) have an upgrade module but a rarity with no ` +
      `module unlock condition: ${modulesWithoutAnUnlock.join(', ')}. ` +
      'Re-read unlockEvolvePhase/unlockLevel out of uniequip_table.json and extend ' +
      'MODULE_UNLOCK_LEVEL in lib/plannerLogic.ts.',
    );
  }

  return { props: { operators, depotCatalogue } };
}, {
  tables: {
    'base-formulas': async () => (await import('@/data/base-formulas.json')).default,
    'battle-records': async () => (await import('@/data/battle-records.json')).default,
    'supply-stages': async () => (await import('@/data/supply-stages.json')).default,
    operatorLevelExpLmd: async () => (await import('@/data/operatorLevelExpLmd.json')).default,
    // Both checked against the material catalogue wherever they are read from data/,
    // so a release that disagrees fails its export (they used to fail at import).
    'import-aliases': async () => checkImportAliases((await import('@/data/import-aliases.json')).default),
    'item-sort-ids': async () => checkItemSortIds((await import('@/data/item-sort-ids.json')).default),
    'farming-tiers': async () => (await import('@/data/farming-tiers.json')).default,
  },
});
