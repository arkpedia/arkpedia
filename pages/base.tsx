import NumberInput from '@/components/ui/NumberInput';
import PageMeta from '@/components/layout/PageMeta';
import BaseSkillText from '@/components/operators/BaseSkillText';
import ImportDialog from '@/components/account/ImportDialog';
import dynamic from 'next/dynamic';
import type { LayoutRecommendation } from '@/lib/base/accountOptimizer';
import BaseOverview, { type BaseRoomSummary } from '@/components/base/BaseOverview';
import BaseRotationPanel from '@/components/base/BaseRotationPanel';
import BasePresetToolbar from '@/components/base/BasePresetToolbar';
import Image from '@/components/content/ContentImage';
import PageHeader from '@/components/ui/PageHeader';
import StyledSelect from '@/components/ui/StyledSelect';
import XButton from '@/components/ui/XButton';
import InfoPopover from '@/components/ui/InfoPopover';

const BaseAccountOptimizer = dynamic(() => import('@/components/base/BaseAccountOptimizer'), { ssr: false });
import { useAccount } from '@/lib/account/accountStore';
import { activeBaseSkills } from '@/lib/base/activeBaseSkills';
import {
  assignedKindCount,
  BASE_PRESET_IDS,
  BASE_PRESETS,
  BasePresetId,
  canSetSpotKind,
  createEmptyAssignments,
  defaultProductionSpots,
  FACILITY_KIND_LABELS,
  getFacilities,
  layoutProblems,
  levelEditableFacilities,
  matchingPreset,
  MAX_LEVEL_BY_KIND,
  MAX_PRODUCTION_BY_KIND,
  migrateLegacySetup,
  powerBalance,
  presetLevels,
  presetSpots,
  PRODUCTION_KINDS,
  PRODUCTION_SPOTS,
  reconcileAssignments,
} from '@/lib/base/baseConfig';
import { BASE_ROSTER_NAMES, checkBaseRosters, toBaseRosters, type BaseRosterData } from '@/lib/base/baseGroupRosters';
import { defaultDormitoryAmbience, dormitoryAmbienceCap } from '@/lib/base/baseProductivity';
import {
  initializeRotationExperimentData,
  RotationExperimentResult,
  RotationFacilityLevels,
  runRotationExperiment,
} from '@/lib/base/baseRotationExperiment';
import { BASE_ROTATION_PLAN_KEY, readRotationPlan, type BaseRotationPlan } from '@/lib/base/baseRotationPlan';
import { basePresetConfiguration, readSavedBasePresets, SAVED_BASE_PRESETS_KEY, type SavedBasePreset } from '@/lib/base/baseSavedPresets';
import { BaseSkillSlots } from '@/lib/base/baseSkillSlots';
import { downloadBaseSnapshotImage } from '@/lib/base/baseSnapshotImage';
import {
  BaseAssignments,
  BaseLayout,
  DormitoryAmbience,
  FacilityLevels,
  FactoryProduct,
  FactoryProducts,
  ProductionKind,
  ProductionSpots,
  SlotAssignment,
} from '@/lib/base/baseTypes';
import { calculateBase } from '@/lib/base/calculateBase';
import { calculateRotation } from '@/lib/base/calculateRotation';
import { initializeOptimizerData } from '@/lib/base/optimizerLogic';
import { canTrainMastery, resolveTrainingTarget, TRAINING_CLASSES, type TrainingTarget } from '@/lib/base/trainingRoomSkills';
import { type WorkshopRecipe, type WorkshopSettings } from '@/lib/base/workshopSkills';
import { useReleaseTable } from '@/lib/content/context';
import { withContentPage } from '@/lib/content/server';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getBaseSkillIconPath } from '@/lib/operators/operatorIconPaths';
import { getAllOperators } from '@/lib/operators/operators';
import { BaseOperator, BaseSkill } from '@/lib/operators/operatorTypes';
import { readRoster, ROSTER_EVENT } from '@/lib/planner/roster';
import { GetStaticProps } from 'next';
import DataLink from '@/components/account/DataLink';
import { useEffect, useMemo, useRef, useState } from 'react';


// The manual-value input mechanism (see needsManualValue / setManualValue
// below) still exists for any future skill that genuinely can't be
// auto-tracked, but as of this pass through all seven special-skills
// dictionaries, nothing currently reads ctx.manualValue -- it's declared
// on every context interface but never destructured/used in any handler
// body. This set is therefore empty for now.
//
// It used to list 'Terra Research Commission|Lovable Felynes' (Felvine
// count for her Trading Post skill), on the reasoning that Felvine
// "genuinely can't be tracked automatically". That skill was itself
// later fixed to read the shared felvineTotal resource pool instead --
// see the comment directly on that handler in tradingPostSpecialSkills.ts
// -- but this set was never updated to match, so the input kept
// rendering for a value nothing reads anymore: harmless in that nothing
// used the number, but confusing, since it looked like it should matter.
const MANUAL_VALUE_SKILLS = new Set<string>([]);

const LOGIN_INTERVAL_OPTIONS = [6, 8, 12, 16, 20, 24];

// When the player takes tired operators out. This is the only thing that bounds
// a ramping skill's window, and the two answers differ a lot: a ramping skill
// climbs over time, so a longer window spends more of itself near the cap and
// averages higher.
//
//   onMoraleZero  operators are left until they run dry. The window is however
//                 long that takes, and the login interval is irrelevant to it.
//   onLogin       operators are swapped every time the player checks in, so the
//                 window can never exceed the login interval.
//
// Defaults to onMoraleZero, which is what the page did before this setting
// existed -- switching the default would silently move every ramping number.
export type SwapPolicy = 'onMoraleZero' | 'onLogin';

interface Props {
  operators: BaseOperator[];
  __contentTables?: Record<string, unknown>;
}

const STORAGE_KEY = 'baseAssignments_v2';
const PRODUCT_STORAGE_KEY = 'baseFactoryProducts_v1';
const AMBIENCE_STORAGE_KEY = 'baseDormitoryAmbience_v1';
const SETTINGS_STORAGE_KEY = 'baseResourceSettings_v1';
const CALCULATION_SETTINGS_KEY = 'baseCalculationSettings_v1';
const MODEL_SETTINGS_KEY = 'baseModelSettings_v1';
// Hides the Rotation Experiment button/panel entirely -- set to true to
// bring it back. Deliberately not tied to process.env.NODE_ENV: this is
// meant to be under direct, explicit control regardless of build mode,
// not an accident of which environment happens to build the site.
const ROTATION_EXPERIMENT_ENABLED = false;

export default function BasePage({ operators }: Props) {
  // The game's slot chains and the group rosters: game tables from this page's props
  // (lib/content/tables.mjs), so they follow the content release. Every calculation
  // below reads the rosters from here, and the special-skill handlers get them in
  // their context.
  const workshopRecipes = useReleaseTable<WorkshopRecipe[]>('base-workshop-recipes');
  const skillSlots = useReleaseTable<BaseSkillSlots>('base-skill-slots');
  const rosterData = useReleaseTable<BaseRosterData>('base-group-rosters');
  const rosters = useMemo(() => toBaseRosters(rosterData), [rosterData]);
  // --- Base formation setup: chosen once before the simulation begins,
  // with a reset available to redo it. 2-4-3 needs no further input.
  // 2-5-2 requires the player to set every settable facility's level
  // first, since capacity (Trading Post/Factory/Reception Room/Office)
  // and eventually some skill interactions read it. setupComplete
  // gates the entire simulation UI below the setup screen.
  const [productionSpots, setProductionSpots] = useState<ProductionSpots>(defaultProductionSpots);
  const [facilityLevels, setFacilityLevels] = useState<FacilityLevels>({});
  const [setupComplete, setSetupComplete] = useState(false);
  // The editor's working copy. Edits are applied to the live base only when
  // the player commits them, so half-finished arrangements never reach the
  // simulation -- and so backing out of the editor changes nothing.
  const [spotsDraft, setSpotsDraft] = useState<ProductionSpots>(defaultProductionSpots);
  const [setupFacilityLevelsDraft, setSetupFacilityLevelsDraft] = useState<FacilityLevels>({});
  // True when the editor was opened from an existing base rather than from
  // first-run setup: committing then carries the placements across instead
  // of starting from an empty base.
  const [editingExistingLayout, setEditingExistingLayout] = useState(false);
  // Which preset the draft came from, and whether the build-it-yourself
  // controls are open. The presets are the offer; Custom is the way past them,
  // and touching any individual control means it is no longer a preset.
  const [chosenPreset, setChosenPreset] = useState<BasePresetId | null>(null);
  const [showCustomControls, setShowCustomControls] = useState(false);
  const SETUP_STORAGE_KEY = 'baseSetup_v2';
  const LEGACY_SETUP_STORAGE_KEY = 'baseSetup_v1';

  // Shadows the old static FACILITIES import with a dynamically-
  // computed value of the same name, so every existing FACILITIES.*
  // reference throughout this file keeps working without needing each
  // call site touched individually.
  const FACILITIES = useMemo(() => getFacilities(productionSpots, facilityLevels), [productionSpots, facilityLevels]);

  // How many of each production facility the player actually built. Several
  // base skills read these -- Wang's Expedience compares Factories against
  // Power Plants + Trading Posts, Lumen's Glimmering Glow scales off the
  // Power Plant count -- and they were constants while the layout was fixed.
  // Power is a base-wide budget, so this is computed once from the live
  // facility list and read wherever a change could break it.
  const basePower = useMemo(() => powerBalance(FACILITIES), [FACILITIES]);

  const [assignments, setAssignments] = useState<BaseAssignments>(createEmptyAssignments(FACILITIES));
  const [factoryProducts, setFactoryProducts] = useState<FactoryProducts>({});
  const [dormitoryAmbience, setDormitoryAmbience] = useState<DormitoryAmbience>({});
  const [activeFacility, setActiveFacility] = useState<string | null>(null);
  // The facility popover has two faces: the slots you assign operators to,
  // and the gear that changes what that one building IS. Same popover, so
  // both get the measured placement and edge-clamping for free.

  const baseRoomPanelRef = useRef<HTMLDivElement>(null);
  const [breakdownFacilityId, setBreakdownFacilityId] = useState<string | null>(null);
  const [roomPanelFacilityId, setRoomPanelFacilityId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [savedPresets, setSavedPresets] = useState<SavedBasePreset[]>([]);
  const presetControlsRef = useRef<HTMLDivElement>(null);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetStatus, setPresetStatus] = useState('');
  const [viewMode] = useState<'cumulated' | 'separated'>('cumulated');
  const [loginInterval, setLoginInterval] = useState(24);
  const [modelSettingsLoaded, setModelSettingsLoaded] = useState(false);
  const [trainingTarget, setTrainingTarget] = useState<TrainingTarget>({ class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false });
  const resolvedTrainingTarget = useMemo(() => resolveTrainingTarget(trainingTarget, operators), [trainingTarget, operators]);
  const [workshopSettings, setWorkshopSettings] = useState<WorkshopSettings>({ recipeId: '1', qualifyingDormOperators: 0, causality: 0, karma: 0, thornsFailures: 0 });
  // Caper/Cairn's "if in Clue Exchange" skills -- a game mode this
  // simulator has no way to detect on its own, so it's a manual
  // setting instead. Defaults to on (confirmed by the user).
  const [clueExchangeActive, setClueExchangeActive] = useState(true);
  // Ling/Dusk's "above/below 12 Morale" skills -- manually set rather
  // than computed, since the real trigger depends on how the whole day
  // actually plays out. Defaults to "above 12" (confirmed by the user).
  const [moraleAbove12, setMoraleAbove12] = useState(true);
  const [swapPolicy, setSwapPolicy] = useState<SwapPolicy>('onMoraleZero');
  const [showResourceSettings, setShowResourceSettings] = useState(false);
  const [roomPanelEliteLevel, setRoomPanelEliteLevel] = useState<'Yours' | 'Base' | 'Elite 1' | 'Elite 2'>('Base');
  /* With an imported account (lib/account/accountStore) the room picker offers the operators
     the reader owns, placed at the elite they are at in the planner's roster (which the import
     fills): 'Yours'. Planning ahead is still a click away -- "Not owned too" adds the rest,
     and a placed operator's elite is changed on their chip. */
  const account = useAccount();
  const [baseSource, setBaseSource] = useState<'planner' | 'account'>('planner');
  const [showRotationPlan, setShowRotationPlan] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  /* The optimizer is a Preview feature for now (next.config.js ARKPEDIA_BASE_OPTIMIZER): a
     production build draws neither its button nor its dialog. */
  const optimizerAvailable = process.env.ARKPEDIA_BASE_OPTIMIZER === '1';
  const [calculationSource, setCalculationSource] = useState<'current' | 'rotation'>('current');
  const editLayoutButtonRef = useRef<HTMLButtonElement>(null);
  const layoutEditorScroll = useRef<number | null>(null);
  const [rotationPlan, setRotationPlan] = useState<BaseRotationPlan>({ version: 1, startHour: 8, shifts: [] });
  const plannerBeforeImport = useRef<{ preset: SavedBasePreset; complete: boolean } | null>(null);
  const [snapshotRoom, setSnapshotRoom] = useState<string | null>(null);
  useEffect(() => {
    try {
      setRotationPlan(readRotationPlan(JSON.parse(window.localStorage.getItem(BASE_ROTATION_PLAN_KEY) ?? 'null')));
      const settings = JSON.parse(window.localStorage.getItem(CALCULATION_SETTINGS_KEY) ?? 'null');
      if (settings?.source === 'rotation') setCalculationSource('rotation');
      if (LOGIN_INTERVAL_OPTIONS.includes(settings?.loginInterval)) setLoginInterval(settings.loginInterval);
    } catch { /* Invalid saved settings use the defaults. */ }
  }, []);
  const ownedOperators = useMemo(() => (account ? new Set(account.operators.map(name => /^Amiya \(/.test(name) ? 'Amiya' : name)) : null), [account]);
  const [includeUnowned, setIncludeUnowned] = useState(false);
  const [rosterElite, setRosterElite] = useState<Record<string, number>>({});
  const [rosterLevel, setRosterLevel] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => {
      const roster = Object.entries(readRoster());
      setRosterElite(Object.fromEntries(roster.map(([name, owned]) => [name, owned.elite])));
      setRosterLevel(Object.fromEntries(roster.map(([name, owned]) => [name, owned.level])));
    };
    read();
    window.addEventListener(ROSTER_EVENT, read);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener(ROSTER_EVENT, read); window.removeEventListener('storage', read); };
  }, []);
  // Once an import is there, picks land at the reader's own elite unless they choose otherwise.
  const eliteDefaulted = useRef(false);
  useEffect(() => {
    if (account && !eliteDefaulted.current) { eliteDefaulted.current = true; setRoomPanelEliteLevel('Yours'); }
  }, [account]);
  /** The elite a pick of this operator lands at: the tab's, or with 'Yours' the roster's (an
   *  operator the reader does not own, added for planning, at Elite 0). */
  function pickElite(name: string): 'Base' | 'Elite 1' | 'Elite 2' {
    if (roomPanelEliteLevel !== 'Yours') return roomPanelEliteLevel;
    const imported = account?.base?.operatorProgress?.[name];
    if (ownedOperators?.has(name) && imported) return imported.eliteLevel as 'Base' | 'Elite 1' | 'Elite 2';
    return (['Base', 'Elite 1', 'Elite 2'] as const)[ownedOperators?.has(name) ? Math.min(2, Math.max(0, rosterElite[name] ?? 0)) : 0];
  }
  const [statsPeriod, setStatsPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  useEffect(() => {
    if (selectedPreset && !savedPresets.some(p => p.id === selectedPreset)) setSelectedPreset('');
  }, [savedPresets, selectedPreset]);
  useEffect(() => {
    if (editingExistingLayout || layoutEditorScroll.current === null) return;
    window.scrollTo({ top: layoutEditorScroll.current, behavior: 'instant' });
    editLayoutButtonRef.current?.focus({ preventScroll: true });
    layoutEditorScroll.current = null;
  }, [editingExistingLayout]);
  const STATS_PERIOD_MULTIPLIER: Record<typeof statsPeriod, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };

  // Staffing replaces the map visually; keep the map mounted to retain its pan/zoom.
  useEffect(() => {
    const panel = baseRoomPanelRef.current;
    if (baseSource !== 'planner' || !roomPanelFacilityId || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const scrollTop = window.scrollY;
    panel.querySelector<HTMLButtonElement>('.base-room-back-btn')?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 720px)').matches) panel.scrollIntoView({ block: 'start', behavior: 'auto' });
    const escape = (event: KeyboardEvent) => {
      // A preset popup can already be detached by its Escape handler. Its own
      // subtree still identifies the event, so leave staffing open in that case.
      if (event.key !== 'Escape' || document.querySelector('dialog[open]') || (event.target as HTMLElement)?.closest?.('.base-preset-toolbar, .base-preset-popover')) return;
      setRoomPanelFacilityId(null);
      setBreakdownFacilityId(null);
      setSearch('');
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      previous?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollTop, behavior: 'instant' });
    };
  }, [baseSource, roomPanelFacilityId]);

  // Clicking away closes whatever is open. Facility tiles and the popover
  // itself are excluded: a tile has its own toggle, so letting this fire on
  // one would close the popover a moment before the tile reopened it, and
  // clicking the same tile twice would stop closing it. Capture phase, so it
  // settles before React's own click handlers run.
  useEffect(() => {
    if (!activeFacility && !showResourceSettings) return;
    function handlePointerDown(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      if (activeFacility && !target.closest('.base-popover') && !target.closest('.base-facility')) {
        setActiveFacility(null);
      }
    }
    // Close after the clicked control handles the event. Closing on pointerdown
    // moves the calculator up on phones and prevents the intended click.
    function handleSettingsClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (showResourceSettings && target?.closest && !target.closest('.base-resource-settings, .action-popover-trigger, .action-popover')) setShowResourceSettings(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setActiveFacility(null);
      setShowResourceSettings(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('click', handleSettingsClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleSettingsClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeFacility, showResourceSettings]);

  // One-time initialization -- optimizerLogic.ts and baseRotationExperiment.ts
  // both used to fetch operator data themselves via a server-only
  // getAllOperators() call at module import time, which is why the
  // rotation experiment previously had to run at build time (or behind
  // a broken API route) instead of reacting to anything live. Now they
  // accept operator data as a parameter instead, so this page can hand
  // them the SAME data it already has client-side (from its own
  // getStaticProps props) and let them compute results live, in the
  // browser, using the player's actual current facility levels.
  //
  // Gated behind ROTATION_EXPERIMENT_ENABLED: this initialization itself
  // is real, non-trivial work (iterates every operator, running regex-
  // based skill verification against each one to build the candidate
  // pools) -- skipping it while the feature is disabled means visitors
  // aren't paying that cost on every page load for a feature they can
  // never actually reach.
  useEffect(() => {
    if (!ROTATION_EXPERIMENT_ENABLED) return;
    initializeOptimizerData(operators, rosters);
    initializeRotationExperimentData(operators, rosters);
  }, [operators, rosters]);

  // The rotation experiment's own room structure is fixed (2 Trading
  // Posts, 2 Precious-Metal Factories, 2 Battle-Records Factories) --
  // this maps the player's REAL built facilities onto those slots by
  // position, using each one's own actual level. Any slot without a
  // corresponding real facility (fewer built than the experiment
  // expects) defaults to Level 3 (max), same "assume fully built"
  // convention used throughout this codebase for anything unspecified.
  function currentRotationFacilityLevels(): RotationFacilityLevels {
    const tpLevels = FACILITIES.filter((f) => f.kind === 'tradingPost' && f.level > 0).map((f) => f.level);
    const goldLevels = FACILITIES.filter((f) => f.kind === 'factory' && f.level > 0 && factoryProducts[f.id] === 'Precious Metals').map((f) => f.level);
    const expLevels = FACILITIES.filter((f) => f.kind === 'factory' && f.level > 0 && factoryProducts[f.id] === 'Battle Records').map((f) => f.level);
    const pick = (levels: number[], slot: number) => levels[slot] ?? 3;
    return {
      tpLevels: [pick(tpLevels, 0), pick(tpLevels, 1)],
      factoryGoldLevels: [pick(goldLevels, 0), pick(goldLevels, 1)],
      factoryExpLevels: [pick(expLevels, 0), pick(expLevels, 1)],
    };
  }


  const [showRotationPanel, setShowRotationPanel] = useState(false);
  const [rotationMode, setRotationMode] = useState<'eliteZero' | 'eliteTwo'>('eliteZero');
  const [rotationResults, setRotationResults] = useState<Partial<Record<'eliteZero' | 'eliteTwo', RotationExperimentResult>>>({});
  const [rotationLoading, setRotationLoading] = useState(false);
  const [rotationProgress, setRotationProgress] = useState(0);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const rotationProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotationExperiment = rotationResults[rotationMode] ?? null;

  function fetchRotationExperiment(mode: 'eliteZero' | 'eliteTwo') {
    if (rotationResults[mode] || rotationLoading) return;
    setRotationLoading(true);
    setRotationError(null);
    setRotationProgress(0);
    // Simulated progress, not a real reported step count -- this now
    // runs as one synchronous, in-browser computation (see the
    // setTimeout wrapper below), not naturally broken into discrete
    // progress steps without a lot more complexity (a Web Worker with
    // message-based progress reporting) than is worth it here. Eases
    // toward 90% while waiting, then jumps to 100% the instant the
    // real result is ready.
    rotationProgressIntervalRef.current = setInterval(() => {
      setRotationProgress((p) => (p >= 90 ? 90 : p + (90 - p) * 0.1 + 1));
    }, 200);
    // The actual computation is wrapped in a setTimeout rather than run
    // immediately -- this lets the browser paint the loading state (and
    // the progress bar's first tick) BEFORE the heavy synchronous work
    // below blocks the main thread. It still blocks once it starts (JS
    // is single-threaded; only a real Web Worker would avoid that
    // entirely), but the page doesn't look frozen with zero feedback
    // the instant the button is clicked.
    setTimeout(() => {
      try {
        const levels = currentRotationFacilityLevels();
        const data = runRotationExperiment(mode, levels);
        setRotationResults((prev) => ({ ...prev, [mode]: data }));
        setRotationProgress(100);
      } catch (err) {
        setRotationError(err instanceof Error ? err.message : 'Failed to compute the rotation experiment.');
      } finally {
        if (rotationProgressIntervalRef.current) clearInterval(rotationProgressIntervalRef.current);
        // Brief pause at 100% so the bar visibly completes instead of
        // vanishing the instant the result is ready.
        setTimeout(() => setRotationLoading(false), 300);
      }
    }, 0);
  }

  function openRotationPanel() {
    setShowRotationPanel(true);
    fetchRotationExperiment(rotationMode);
  }

  function switchRotationMode(mode: 'eliteZero' | 'eliteTwo') {
    setRotationMode(mode);
    fetchRotationExperiment(mode);
  }

  // Storage is restored once using the initial catalogue and layout. Re-running
  // this when the reader edits a room would overwrite those edits.
  const initialBase = useRef({ operators, facilities: FACILITIES });
  useEffect(() => {
    const { operators, facilities: FACILITIES } = initialBase.current;
    try {
      const savedPresets = JSON.parse(window.localStorage.getItem(SAVED_BASE_PRESETS_KEY) ?? '[]');
      setSavedPresets(readSavedBasePresets(savedPresets, new Set(operators.map(op => op.name))));
      const savedSetup = window.localStorage.getItem(SETUP_STORAGE_KEY);
      // Ids for the nine production spots became positional (prod1..prod9),
      // so a base saved under the old kind-based ids (factory3, powerPlant3,
      // ...) is translated across by position rather than discarded -- the
      // old fixed layouts listed their facilities in exactly spot order,
      // which is what makes that a straight remap of ids.
      const legacySetup = savedSetup ? null : window.localStorage.getItem(LEGACY_SETUP_STORAGE_KEY);
      let legacyIdMap: Record<string, string> | null = null;
      if (savedSetup) {
        const parsed = JSON.parse(savedSetup);
        if (parsed.productionSpots && typeof parsed.productionSpots === 'object') setProductionSpots(parsed.productionSpots);
        if (parsed.facilityLevels && typeof parsed.facilityLevels === 'object') setFacilityLevels(parsed.facilityLevels);
        if (typeof parsed.setupComplete === 'boolean') setSetupComplete(parsed.setupComplete);
      } else if (legacySetup) {
        const parsed = JSON.parse(legacySetup);
        const layout: BaseLayout = parsed.layout === '2-5-2' ? '2-5-2' : '2-4-3';
        const migrated = migrateLegacySetup(layout, parsed.facilityLevels ?? {});
        legacyIdMap = migrated.idMap;
        setProductionSpots(migrated.spots);
        setFacilityLevels(migrated.levels);
        if (typeof parsed.setupComplete === 'boolean') setSetupComplete(parsed.setupComplete);
        window.localStorage.setItem(
          SETUP_STORAGE_KEY,
          JSON.stringify({ productionSpots: migrated.spots, facilityLevels: migrated.levels, setupComplete: parsed.setupComplete === true }),
        );
      }
      // A function declaration rather than a generic arrow: `<T,>(...) =>` is
      // the usual .tsx workaround for the JSX ambiguity, but SWC mis-parses
      // it here and fails the whole file with an error pointing hundreds of
      // lines away, while tsc accepts it -- so the two disagree and only the
      // browser notices.
      function remapIds<T>(saved: Record<string, T>): Record<string, T> {
        if (!legacyIdMap) return saved;
        const out: Record<string, T> = {};
        Object.entries(saved).forEach(([id, value]) => {
          const mapped = legacyIdMap![id];
          if (mapped) out[mapped] = value;
        });
        return out;
      }
      const savedAssignments = window.localStorage.getItem(STORAGE_KEY);
      if (savedAssignments) {
        const staffNames = new Set(operators.map(op => op.name));
        const restored = remapIds<(SlotAssignment | null)[]>(JSON.parse(savedAssignments));
        const valid = Object.fromEntries(Object.entries(restored).map(([id, slots]) => [id, Array.isArray(slots) ? slots.map(slot => slot && staffNames.has(slot.operatorName) ? slot : null) : []]));
        setAssignments({ ...createEmptyAssignments(FACILITIES), ...valid });
      }
      const savedProducts = window.localStorage.getItem(PRODUCT_STORAGE_KEY);
      if (savedProducts) setFactoryProducts(remapIds(JSON.parse(savedProducts)));
      const savedAmbience = window.localStorage.getItem(AMBIENCE_STORAGE_KEY);
      if (savedAmbience) setDormitoryAmbience(remapIds(JSON.parse(savedAmbience)));
      const savedModel = window.localStorage.getItem(MODEL_SETTINGS_KEY);
      if (savedModel) {
        const raw = JSON.parse(savedModel);
        const normalized = readSavedBasePresets([{ ...raw, version: 1, id: 'current', name: 'Current', productionSpots: defaultProductionSpots(), assignments: {} }], new Set(operators.map(op => op.name)))[0];
        if (normalized) { setTrainingTarget(resolveTrainingTarget(normalized.trainingTarget, operators)); setWorkshopSettings(normalized.workshopSettings); }
      }
      const savedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.clueExchangeActive === 'boolean') setClueExchangeActive(parsed.clueExchangeActive);
        if (typeof parsed.moraleAbove12 === 'boolean') setMoraleAbove12(parsed.moraleAbove12);
        if (parsed.swapPolicy === 'onLogin' || parsed.swapPolicy === 'onMoraleZero') setSwapPolicy(parsed.swapPolicy);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { setModelSettingsLoaded(true); }, []);
  useEffect(() => {
    if (!modelSettingsLoaded || baseSource === 'account') return;
    try { window.localStorage.setItem(MODEL_SETTINGS_KEY, JSON.stringify({ trainingTarget: resolvedTrainingTarget, workshopSettings })); } catch { /* Session remains usable. */ }
  }, [modelSettingsLoaded, resolvedTrainingTarget, workshopSettings, baseSource]);


  function persist(next: BaseAssignments) {
    if (baseSource === 'account') return;
    setAssignments(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function persistProduct(facilityId: string, product: FactoryProduct) {
    if (baseSource === 'account') return;
    const next = { ...factoryProducts, [facilityId]: product };
    setFactoryProducts(next);
    try {
      window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function persistAmbience(facilityId: string, level: number, ambience: number) {
    if (baseSource === 'account') return;
    const clamped = Math.max(0, Math.min(ambience, dormitoryAmbienceCap(level)));
    const next = { ...dormitoryAmbience, [facilityId]: clamped };
    setDormitoryAmbience(next);
    try {
      window.localStorage.setItem(AMBIENCE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function setCalculationSettings(source: 'current' | 'rotation', interval = loginInterval) {
    setCalculationSource(source); setLoginInterval(interval);
    try { window.localStorage.setItem(CALCULATION_SETTINGS_KEY, JSON.stringify({ source, loginInterval: interval })); } catch { /* Session remains usable. */ }
  }

  function persistSettings(next: { clueExchangeActive: boolean; moraleAbove12: boolean; swapPolicy: SwapPolicy }) {
    if (baseSource === 'account') return;
    setClueExchangeActive(next.clueExchangeActive);
    setMoraleAbove12(next.moraleAbove12);
    setSwapPolicy(next.swapPolicy);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function assignedElsewhere(name: string): string | null {
    for (const [facilityId, slots] of Object.entries(assignments)) {
      if (slots.some((s) => s?.operatorName === name)) return facilityId;
    }
    return null;
  }

  // Toggles an operator's placement in a facility using ordered
  // slot-filling: clicking an unselected operator appends them to the
  // first empty slot (their displayed number = their position + 1);
  // clicking an already-selected operator removes them and shifts
  // every later-numbered operator down by one to close the gap (so
  // picking #2 out of a #1/#2/#3 selection turns #3 into #2) -- this
  // left-to-right ordering is what Dormitory's leftmost-operator bonus
  // logic reads. Placing someone here still removes them from
  // whichever OTHER facility they were in, same as before, but that
  // other facility's own slots are just nulled out, not gap-closed --
  // only the facility currently being edited re-orders itself.
  function toggleRoomOperator(facilityId: string, operatorName: string, eliteLevel: string | null) {
    if (resolvedTrainingTarget.operatorName === operatorName) setTrainingTarget(t => ({ ...t, operatorName: '' }));
    const currentSlots = assignments[facilityId] || [];
    const existingIdx = currentSlots.findIndex((s) => s?.operatorName === operatorName);
    if (existingIdx !== -1) {
      const withoutOperator = currentSlots.filter((_, i) => i !== existingIdx);
      while (withoutOperator.length < currentSlots.length) withoutOperator.push(null);
      persist({ ...assignments, [facilityId]: withoutOperator });
      return;
    }
    const cleared: BaseAssignments = {};
    for (const [id, s] of Object.entries(assignments)) {
      cleared[id] = id === facilityId ? [...s] : s.map((slot) => (slot?.operatorName === operatorName ? null : slot));
    }
    const slots = cleared[facilityId];
    const emptyIdx = slots.findIndex((s) => s === null);
    if (emptyIdx === -1) return; // facility full, nothing to do
    slots[emptyIdx] = { operatorName, eliteLevel, ...(roomPanelEliteLevel === 'Yours' && ownedOperators?.has(operatorName) && (account?.base?.operatorProgress?.[operatorName]?.level ?? rosterLevel[operatorName]) ? { level: account?.base?.operatorProgress?.[operatorName]?.level ?? rosterLevel[operatorName] } : {}) };
    persist(cleared);
  }

  function setManualValue(facilityId: string, slotIndex: number, value: number) {
    const slot = assignments[facilityId]?.[slotIndex];
    if (!slot) return;
    const next = { ...assignments, [facilityId]: [...assignments[facilityId]] };
    next[facilityId][slotIndex] = { ...slot, manualValue: value };
    persist(next);
  }

  /** Changes the Elite a PLACED operator works at, in place. The old route --
   * remove, switch the tab, re-add -- also moved them to the last open slot,
   * which silently reshuffled the order the Dormitory cares about. */
  function setSlotElite(facilityId: string, slotIndex: number, eliteLevel: string) {
    const slot = assignments[facilityId]?.[slotIndex];
    if (!slot) return;
    const next = { ...assignments, [facilityId]: [...assignments[facilityId]] };
    const { level: _importLevel, ...rest } = slot;
    next[facilityId][slotIndex] = { ...rest, eliteLevel };
    persist(next);
  }

  /** 'Base'/'Level 30' -> E0, for the chips and card corners, where the full
   * words don't fit and the game's own shorthand is what players read. */
  function eliteShort(eliteLevel: string | null | undefined): 'E0' | 'E1' | 'E2' {
    return eliteLevel === 'Elite 2' ? 'E2' : eliteLevel === 'Elite 1' ? 'E1' : 'E0';
  }

  function storePresets(next: SavedBasePreset[]) {
    try { window.localStorage.setItem(SAVED_BASE_PRESETS_KEY, JSON.stringify(next)); setSavedPresets(next); return true; }
    catch { setPresetStatus('Could not save: browser storage is unavailable or full.'); return false; }
  }
  function saveNamedPreset(newName?: string) {
    if (baseSource === 'account') return false;
    const existing = savedPresets.find(p => p.id === selectedPreset);
    const name = (newName ?? existing?.name)?.trim().slice(0, 80);
    if (!name) { setPresetStatus('Enter a name for this preset.'); return false; }
    const snapshot = captureSetup(newName === undefined && existing ? existing.id : crypto.randomUUID(), name);
    if (!storePresets(savedPresets.some(p => p.id === snapshot.id) ? savedPresets.map(p => p.id === snapshot.id ? snapshot : p) : [...savedPresets, snapshot])) return false;
    setSelectedPreset(snapshot.id); setPresetStatus(`Saved ${name}.`); return true;
  }
  function renamePreset(name: string) {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed || baseSource === 'account' || !selectedPreset) return false;
    if (!storePresets(savedPresets.map(p => p.id === selectedPreset ? { ...p, name: trimmed } : p))) return false;
    setPresetStatus(`Renamed to ${trimmed}.`); return true;
  }
  function deletePreset() {
    if (baseSource === 'account') return;
    if (storePresets(savedPresets.filter(p => p.id !== selectedPreset))) {
      setSelectedPreset(''); setPresetStatus('Preset deleted. Current staffing kept.');
    }
  }
  function loadNamedPreset(id = selectedPreset) {
    const preset = readSavedBasePresets(savedPresets, new Set(operators.map(op => op.name))).find(p => p.id === id);
    if (!preset) return;
    setBaseSource('planner'); plannerBeforeImport.current = null;
    applySetupSnapshot(preset, true, true);
    setSelectedPreset(preset.id); setPresetStatus(`Loaded ${preset.name}.`);
  }
  function viewRotationShift(id: string) {
    loadNamedPreset(id); setShowRotationPlan(false);
    // The modal restores its trigger's focus on unmount; then move to the loaded base.
    requestAnimationFrame(() => {
      presetControlsRef.current?.focus({ preventScroll: true });
      presetControlsRef.current?.scrollIntoView({ block: 'start' });
    });
  }
  function captureSetup(id: string, name: string): SavedBasePreset {
    const rotationRates: Record<string, number> = {};
    for (const f of FACILITIES) {
      const stats = productivityFor(f, ccEffects, ccMoraleRelief);
      for (const slot of assignments[f.id] ?? []) if (slot) {
        const dormRate = dormitoryRecoveryByFacility[f.id]?.find(r => r.name === slot.operatorName);
        if (dormRate) rotationRates[slot.operatorName] = -(dormRate.base + dormRate.bonus);
        else if (f.kind !== 'workshop') rotationRates[slot.operatorName] = stats.perOperatorMorale?.[slot.operatorName] ?? stats.combinedMoraleRate;
      }
    }
    return JSON.parse(JSON.stringify({ version: 1, id, name, savedAt: new Date().toISOString(), productionSpots, facilityLevels, assignments, factoryProducts, dormitoryAmbience, clueExchangeActive, moraleAbove12, swapPolicy, loginInterval, trainingTarget: resolvedTrainingTarget, workshopSettings, rotationRates }));
  }
  function applySetupSnapshot(p: SavedBasePreset, complete: boolean, save: boolean) {
    setProductionSpots(p.productionSpots); setFacilityLevels(p.facilityLevels); setSetupComplete(complete);
    setAssignments(p.assignments); setFactoryProducts(p.factoryProducts); setDormitoryAmbience(p.dormitoryAmbience);
    setLoginInterval(p.loginInterval); setTrainingTarget(resolveTrainingTarget(p.trainingTarget, operators)); setWorkshopSettings(p.workshopSettings);
    setClueExchangeActive(p.clueExchangeActive); setMoraleAbove12(p.moraleAbove12); setSwapPolicy(p.swapPolicy);
    setRoomPanelFacilityId(null); setActiveFacility(null); setBreakdownFacilityId(null); setSnapshotRoom(null);
    if (save) try {
      window.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ productionSpots: p.productionSpots, facilityLevels: p.facilityLevels, setupComplete: complete }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p.assignments));
      window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(p.factoryProducts));
      window.localStorage.setItem(AMBIENCE_STORAGE_KEY, JSON.stringify(p.dormitoryAmbience));
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ clueExchangeActive: p.clueExchangeActive, moraleAbove12: p.moraleAbove12, swapPolicy: p.swapPolicy }));
    } catch { setPresetStatus('Setup loaded for this session; browser storage is unavailable.'); }
  }
  function saveOptimizerRotation(recommendation: LayoutRecommendation, startHour: number, externalGold: number): boolean {
    const template = captureSetup('', '');
    const presets: SavedBasePreset[] = recommendation.plan.shifts.map((shift, index) => ({
      ...template, id: crypto.randomUUID(), name: `${recommendation.label} · optimized shift ${index + 1}`,
      productionSpots: recommendation.spots, facilityLevels: recommendation.levels,
      assignments: shift.assignments, factoryProducts: shift.factoryProducts,
      dormitoryAmbience: recommendation.id === 'mine' ? account?.base?.dormitoryAmbience ?? {} : {},
      loginInterval, swapPolicy: 'onLogin', rotationRates: undefined,
    }));
    const nextPresets = [...savedPresets, ...presets];
    const nextPlan: BaseRotationPlan = { version: 1, startHour, externalGold, shifts: presets.map(p => ({ id: crypto.randomUUID(), presetId: p.id, hours: recommendation.plan.stepHours })) };
    let previousPresets: string | null, previousPlan: string | null;
    try {
      previousPresets = window.localStorage.getItem(SAVED_BASE_PRESETS_KEY);
      previousPlan = window.localStorage.getItem(BASE_ROTATION_PLAN_KEY);
    } catch { return false; }
    try {
      window.localStorage.setItem(SAVED_BASE_PRESETS_KEY, JSON.stringify(nextPresets));
      window.localStorage.setItem(BASE_ROTATION_PLAN_KEY, JSON.stringify(nextPlan));
    } catch {
      try {
        if (previousPresets === null) window.localStorage.removeItem(SAVED_BASE_PRESETS_KEY); else window.localStorage.setItem(SAVED_BASE_PRESETS_KEY, previousPresets);
        if (previousPlan === null) window.localStorage.removeItem(BASE_ROTATION_PLAN_KEY); else window.localStorage.setItem(BASE_ROTATION_PLAN_KEY, previousPlan);
      } catch { /* Keep the in-memory plan intact if browser storage is unavailable. */ }
      return false;
    }
    setSavedPresets(nextPresets); setRotationPlan(nextPlan);
    // Load a copy of the first team, leaving the imported account untouched.
    setBaseSource('planner'); plannerBeforeImport.current = null;
    applySetupSnapshot(presets[0], true, true); setSelectedPreset(presets[0].id);
    setCalculationSettings('rotation'); setShowOptimizer(false);
    setPresetStatus('Recommended rotation active. Existing saved setups are kept.');
    return true;
  }
  function showImportedBase() {
    if (baseSource === 'account') return;
    if (baseSource === 'planner') plannerBeforeImport.current = { preset: captureSetup('before-import', 'Your plan'), complete: setupComplete };
    setBaseSource('account'); setShowRotationPlan(false); setSetupComplete(true);
    setRoomPanelFacilityId(null); setSnapshotRoom(null);
    const snapshot = account?.base;
    if (snapshot) {
      const p = { ...captureSetup('import', 'Imported base'), ...snapshot, trainingTarget: { ...resolvedTrainingTarget, operatorName: snapshot.trainee ?? '', timeReductionActive: false, instantTrainingReady: false } };
      applySetupSnapshot(p, true, false);
    }
  }
  function showPlanner() {
    if (baseSource === 'planner') return;
    if (plannerBeforeImport.current) applySetupSnapshot(plannerBeforeImport.current.preset, plannerBeforeImport.current.complete, false);
    plannerBeforeImport.current = null; setBaseSource('planner'); setSnapshotRoom(null);
  }
  function editImportedCopy() {
    const p = captureSetup(crypto.randomUUID(), `Imported ${account?.doctor ?? 'base'}`);
    // Keep the previous plan as a recoverable preset before replacing the draft.
    if (plannerBeforeImport.current?.complete && !storePresets([...savedPresets, { ...plannerBeforeImport.current.preset, id: crypto.randomUUID(), name: 'Plan before account copy' }])) return;
    setBaseSource('planner'); plannerBeforeImport.current = null; setSelectedPreset('');
    applySetupSnapshot(p, true, true); setPresetStatus('Imported base copied into your plan.');
  }
  function addImportedShift() {
    if (!account?.base || rotationPlan.shifts.length >= 24) return;
    const preset = captureSetup(crypto.randomUUID(), `${account.doctor ?? 'Account'} · current shift`);
    if (!storePresets([...savedPresets, preset])) return;
    updateRotationPlan({ ...rotationPlan, shifts: [...rotationPlan.shifts, { id: crypto.randomUUID(), presetId: preset.id, hours: 12 }] });
    setShowRotationPlan(true);
    setPresetStatus('Imported staffing added to rotation. Add a resting setup for the next shift.');
  }
  function updateRotationPlan(next: BaseRotationPlan) {
    setRotationPlan(next);
    try { window.localStorage.setItem(BASE_ROTATION_PLAN_KEY, JSON.stringify(next)); } catch { setPresetStatus('Rotation kept for this session; browser storage is unavailable.'); }
  }
  useEffect(() => {
    if (baseSource !== 'account' || !account?.base) return;
    const b = account.base;
    setProductionSpots(b.productionSpots); setFacilityLevels(b.facilityLevels); setAssignments(b.assignments);
    setFactoryProducts(b.factoryProducts); setDormitoryAmbience(b.dormitoryAmbience);
    setTrainingTarget(resolveTrainingTarget({ class: 'Guard', branch: '', mastery: 1, operatorName: b.trainee ?? '', timeReductionActive: false, instantTrainingReady: false }, operators));
    setSnapshotRoom(null);
  }, [account, baseSource, operators]);

  function renderBaseSources() {
    return <div className="base-source-bar"><div role="group" aria-label="Base source">
      <button type="button" className="filter-chip" aria-pressed={baseSource === 'planner'} onClick={showPlanner}>Your plan</button>
      <button type="button" className="filter-chip" aria-pressed={baseSource === 'account'} onClick={showImportedBase}>Imported account</button>
    </div>{baseSource === 'account' && account?.base && <><span className="hint">{account.doctor ?? 'Account'} · {account.server.toUpperCase()} · {new Date(account.importedAt).toLocaleString()}</span><button type="button" className="ghost" disabled={rotationPlan.shifts.length >= 24} onClick={addImportedShift}>Add to rotation</button><button type="button" className="primary btn-sm" onClick={editImportedCopy}>Edit a copy</button></>}</div>;
  }
  async function exportSnapshot() {
    try {
      const rooms = FACILITIES.filter(f => f.kind !== 'elevator' && f.level > 0).map(f => {
        if (baseSource === 'account') {
          const summary = roomSummaries.find(r => r.id === f.id)!;
          return { title: `${f.id.startsWith('prod') ? f.id : f.label} · Lv${f.level}`, lines: [summary.metric, summary.detail, ...summary.workers.map(w => `${w.name} · ${w.morale === null ? 'Morale unknown' : `${w.morale.toFixed(1)}/24 Morale`}`)].filter(Boolean) };
        }
        const stats = productivityFor(f, ccEffects, ccMoraleRelief);
        const lines = (assignments[f.id] ?? []).filter((s): s is SlotAssignment => s !== null).map(s => `${s.operatorName} · ${eliteShort(s.eliteLevel)}${stats.perOperatorMorale ? ` · ${stats.perOperatorMorale[s.operatorName].toFixed(2)} Morale/h` : ''}`);
        if (stats.productivity) lines.push(`Efficiency ${((stats.productivity.grey + stats.productivity.yellow) * 100).toFixed(1)}%`);
        if (stats.capacity) lines.push(`Capacity ${stats.capacity.base + stats.capacity.adjustment}`);
        if (stats.orderLimit) lines.push(`Order limit ${stats.orderLimit.base + stats.orderLimit.adjustment}`);
        if (factoryProducts[f.id]) lines.push(`Product: ${factoryProducts[f.id]}`);
        if (stats.trainingSpeed !== null) lines.push(`Training ${(stats.trainingSpeed * 100).toFixed(1)}% · ${stats.trainingHours?.toFixed(2)}h · ${resolvedTrainingTarget.operatorName || resolvedTrainingTarget.class} M${Math.min(trainingTarget.mastery, f.level)}`);
        if (stats.workshop) lines.push(`Byproduct ${(stats.workshop.chance * 100).toFixed(1)}% · ${stats.workshop.morale} Morale/craft`);
        if (stats.office) lines.push(`HR ${(stats.office.speed * 100).toFixed(1)}% · refresh ${stats.office.refreshHours.toFixed(2)}h`);
        if (stats.droneRate !== null) lines.push(`Drone recovery +${(stats.droneRate * 100).toFixed(1)}%`);
        if (stats.clueSpeed !== null) lines.push(`Clue speed ${(((stats.clueSpeedBase ?? 1) + stats.clueSpeed) * 100).toFixed(1)}%`);
        if (f.kind === 'dormitory') {
          lines.push(`Ambience ${dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level)}`);
          dormitoryRecoveryByFacility[f.id]?.forEach(r => lines.push(`${r.name}: ${((assignments[f.id] ?? []).find(s => s?.operatorName === r.name)?.morale ?? 0).toFixed(0)}/24 Morale · ${(r.base + r.bonus).toFixed(2)}/h`));
        }
        if (stats.fullTime !== null) lines.push(`Storage full in ${stats.fullTime.toFixed(2)}h`);
        const spot = PRODUCTION_SPOTS.find(spot => spot.id === f.id);
        const roomLabel = spot ? `B${spot.row}0${spot.column} · ${f.label}` : f.kind === 'dormitory' ? `${f.label} ${f.id.replace(/\D/g, '')}` : f.label;
        return { title: `${roomLabel} · Lv${f.level}`, lines: lines.length ? lines : ['Empty'] };
      });
      await downloadBaseSnapshotImage(rooms, baseSource === 'account' ? [`${account?.doctor ?? 'Imported account'} · Snapshot ${account?.importedAt}`, 'Morale at import time; rates and efficiency are estimates.'] : [`${new Date().toLocaleString()} · Login interval ${loginInterval}h · Power ${basePower.drawn}/${basePower.supplied}`, `Daily EXP ${Math.round(dailyExpGreen)} · Gold made ${dailyGoldMadeGreen.toFixed(1)} · LMD ${Math.round(dailyGoldWorthGreen)} · Morale ${moraleAbove12 ? 'above' : 'at/below'} 12`]);
      setPresetStatus('Snapshot downloaded.');
    } catch (error) { setPresetStatus(error instanceof Error ? error.message : 'Could not export snapshot.'); }
  }

  function persistSetup(nextSpots: ProductionSpots, nextFacilityLevels: FacilityLevels, nextComplete: boolean) {
    if (baseSource === 'account') return;
    setProductionSpots(nextSpots);
    setFacilityLevels(nextFacilityLevels);
    setSetupComplete(nextComplete);
    try {
      window.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ productionSpots: nextSpots, facilityLevels: nextFacilityLevels, setupComplete: nextComplete }));
    } catch {
      /* ignore */
    }
  }

  function resetBase() {
    if (baseSource === 'account') return;
    persist(createEmptyAssignments(FACILITIES));
    setSelectedPreset('');
    setPresetStatus('Current base cleared. Layout, saved presets and rotation kept.');
    setTrainingTarget({ operatorName: '', class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false });
    setWorkshopSettings({ recipeId: '1', qualifyingDormOperators: 0, causality: 0, karma: 0, thornsFailures: 0 });
    setFactoryProducts({});
    setDormitoryAmbience({});
    try {
      window.localStorage.removeItem(PRODUCT_STORAGE_KEY);
      window.localStorage.removeItem(AMBIENCE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // The distinct "start over from the base formation" reset -- clears
  // everything AND sends the player back to the layout-choice setup
  // screen, unlike resetBase above which only clears operator
  // placements within whatever layout is already chosen.
  function resetToSetup() {
    setSetupComplete(false);
    setProductionSpots(defaultProductionSpots());
    setFacilityLevels({});
    setEditingExistingLayout(false);
    setSpotsDraft(defaultProductionSpots());
    setSetupFacilityLevelsDraft({});
    setAssignments({});
    setTrainingTarget({ operatorName: '', class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false });
    setWorkshopSettings({ recipeId: '1', qualifyingDormOperators: 0, causality: 0, karma: 0, thornsFailures: 0 });
    setFactoryProducts({});
    setDormitoryAmbience({});
    try {
      window.localStorage.removeItem(SETUP_STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(PRODUCT_STORAGE_KEY);
      window.localStorage.removeItem(AMBIENCE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Fills the draft from a preset -- both the arrangement AND the levels,
   * since a preset is a whole base and the 2-5-2 layouts only fit their
   * power budget with certain rooms held back. */
  function applyPreset(choice: BasePresetId) {
    setChosenPreset(choice);
    setShowCustomControls(false);
    setSpotsDraft(presetSpots(choice));
    setSetupFacilityLevelsDraft(presetLevels(choice));
  }

  /** Levels default to each facility's maximum, so the player adjusts DOWN
   * from a valid base rather than starting from an all-zero one. */
  function draftLevelFor(facilityId: string, maxLevel: number): number {
    return setupFacilityLevelsDraft[facilityId] ?? maxLevel;
  }

  function updateDraftLevel(facilityId: string, level: number) {
    setChosenPreset(null);
    setSetupFacilityLevelsDraft((prev) => ({ ...prev, [facilityId]: level }));
  }

  /** Switching a spot's kind is refused rather than silently clamped when
   * it would push a kind past five, so the buttons can be disabled and the
   * reason shown instead of the click appearing to do nothing. */
  function updateDraftSpotKind(spotId: string, kind: ProductionKind) {
    setChosenPreset(null);
    setSpotsDraft((prev) => {
      if (!canSetSpotKind(prev, spotId, kind)) return prev;
      return { ...prev, [spotId]: kind };
    });
  }

  function openLayoutEditor() {
    layoutEditorScroll.current = window.scrollY;
    setSpotsDraft(productionSpots);
    setSetupFacilityLevelsDraft(facilityLevels);
    // A base that came from a preset reopens with it selected; one built by
    // hand opens straight into the controls that built it.
    const preset = matchingPreset(productionSpots, facilityLevels);
    setChosenPreset(preset);
    setShowCustomControls(preset === null);
    setEditingExistingLayout(true);
    setSetupComplete(false);
  }

  function handleBeginSimulation() {
    const nextFacilities = getFacilities(spotsDraft, setupFacilityLevelsDraft);
    // Editing an existing base carries the placements across; first-run
    // setup has none to carry. reconcileAssignments drops operators from
    // any spot whose KIND changed, since their skills no longer apply
    // there, and trims a facility that was demoted to fewer slots.
    const nextAssignments = editingExistingLayout
      ? reconcileAssignments(assignments, FACILITIES, nextFacilities)
      : createEmptyAssignments(nextFacilities);
    persistSetup(spotsDraft, setupFacilityLevelsDraft, true);
    persist(nextAssignments);
    setEditingExistingLayout(false);
  }

  function openRoomPanel(facilityId: string) {
    setRoomPanelFacilityId(facilityId);
  }

  function closeRoomPanel() {
    setRoomPanelFacilityId(null);
    setBreakdownFacilityId(null);
    setSearch('');
  }

  /** Applies a change to ONE building and takes effect immediately -- there
   * is no draft to commit, since the whole point of editing in place is that
   * you see the result on the base as you go. Placements are reconciled the
   * same way the bulk editor does it: a spot that changed KIND loses its
   * operators, because their skills don't apply to the new facility, and a
   * facility with fewer slots than before is trimmed from the end. */
  function applyLayoutChange(nextSpots: ProductionSpots, nextLevels: FacilityLevels) {
    const nextFacilities = getFacilities(nextSpots, nextLevels);
    persistSetup(nextSpots, nextLevels, true);
    persist(reconcileAssignments(assignments, FACILITIES, nextFacilities));
  }

  function setFacilityKind(spotId: string, kind: ProductionKind) {
    // Refused rather than clamped, so the button can be disabled and say why.
    if (!canSetSpotKind(productionSpots, spotId, kind)) return;
    applyLayoutChange({ ...productionSpots, [spotId]: kind }, facilityLevels);
  }

  function setFacilityLevel(facilityId: string, level: number) {
    applyLayoutChange(productionSpots, { ...facilityLevels, [facilityId]: level });
  }

  const currentCalculation = calculateBase({
    operators, rosters, skillSlots, facilities: FACILITIES, assignments, factoryProducts,
    dormitoryAmbience, loginInterval, swapPolicy, clueExchangeActive, moraleAbove12,
    trainingTarget, workshopSettings, workshopRecipes,
    importedMorale: baseSource === 'account' ? account?.base?.morale : undefined,
  });
  const {
    productivityFor, operatorByName, totalMonsterMeal, resourcePools, ccEffects,
    ccMoraleRelief, totalFelvine, dormitoryOperatorNames, dormitoryRecoveryByFacility,
  } = currentCalculation;
  const rotationCalculation = useMemo(() => calculationSource === 'rotation' || showRotationPlan
    ? calculateRotation({ operators, rosters, skillSlots, workshopRecipes }, rotationPlan, savedPresets,
      loginInterval, account?.base?.morale, ownedOperators ?? undefined)
    : null, [calculationSource, showRotationPlan, operators, rosters, skillSlots, workshopRecipes, rotationPlan, savedPresets, loginInterval, account?.base?.morale, ownedOperators]);
  const presetDirty = useMemo(() => {
    const selected = savedPresets.find(p => p.id === selectedPreset);
    if (!selected || baseSource !== 'planner') return false;
    const draft: SavedBasePreset = { version: 1, id: 'draft', name: 'Draft', savedAt: '', productionSpots, facilityLevels, assignments, factoryProducts, dormitoryAmbience, clueExchangeActive, moraleAbove12, swapPolicy, loginInterval, trainingTarget: resolvedTrainingTarget, workshopSettings };
    const normalized = readSavedBasePresets([selected, draft], new Set(operators.map(op => op.name)));
    return normalized.length !== 2 || basePresetConfiguration(normalized[0]) !== basePresetConfiguration(normalized[1]);
  }, [savedPresets, selectedPreset, baseSource, productionSpots, facilityLevels, assignments, factoryProducts, dormitoryAmbience, clueExchangeActive, moraleAbove12, swapPolicy, loginInterval, resolvedTrainingTarget, workshopSettings, operators]);
  const rotationDuration = rotationPlan.shifts.reduce((hours, shift) => hours + shift.hours, 0);
  const rotationWarnings = [...new Set([...(rotationCalculation?.warnings ?? []), ...(rotationCalculation?.stages.flatMap(stage => stage.warnings) ?? [])])];
  const summaryUnavailable = calculationSource === 'rotation' && !rotationCalculation?.totals;
  const {
    dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed,
    dailyGoldSoldGreen, dailyGoldFromProvisoGreen, dailyGoldFromProvisoRed, dailyGoldSoldRed,
    dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed, dailyGoldWorthGreen, dailyGoldWorthRed,
  } = calculationSource === 'rotation' ? rotationCalculation?.totals ?? {
    dailyExpGreen: 0, dailyExpRed: 0, dailyGoldMadeGreen: 0, dailyGoldMadeRed: 0,
    dailyGoldSoldGreen: 0, dailyGoldSoldRed: 0, dailyGoldFromProvisoGreen: 0, dailyGoldFromProvisoRed: 0,
    dailyExtraLmdFromOrdersGreen: 0, dailyExtraLmdFromOrdersRed: 0, dailyGoldWorthGreen: 0, dailyGoldWorthRed: 0,
  } : currentCalculation;
  const facility = FACILITIES.find(f => f.id === roomPanelFacilityId);

  // One row per (operator, elite level) GROUP, not per individual skill --
  // an operator with two skills both at Elite 2 shows as one row
  // containing both, since placing them applies both together.
  // Classifies a base skill by what it depends on to reach its maximum
  // effect, so the room panel can surface "easier" (less setup-dependent)
  // operators first. This is a best-effort heuristic based on common
  // Arknights skill-description phrasing, NOT a hand-verified lookup
  // against every skill in receptionRoomSpecialSkills.ts and the other
  // six special-skill dictionaries (1,495 lines combined) -- doing that
  // exhaustively wasn't practical here. Tiers, easiest to hardest:
  //   0: no dependency at all -- flat bonus regardless of anyone else
  //   1: scales with a FACILITY's level (e.g. "per Dormitory level")
  //   2: scales with capacity/fill count (e.g. "for every Operator in
  //      this facility")
  //   3: needs a SPECIFIC other named operator present (simplest kind
  //      of "needs a partner")
  //   4: scales with a broader FACTION/GROUP's presence base-wide (the
  //      most involved to set up, since it rewards curating a whole team)
  const FACTION_KEYWORDS = [
    'team rainbow', 'blacksteel worldwide', 'karlan trade', 'abyssal hunters',
    'rhine lab', 'laterano', 'sami', 'sargon', 'durin', 'sui', 'sarkaz',
    'wandering medic', 'ursus student', 'operation platform', 'knights',
    'glasgow', 'lungmen guard', "lee's detective", 'elite operator',
    'a1 detachment', 'pinus sylvestris', 'victoria', 'kazimierz', 'columbia',
    'minos', 'yan', 'siracusa', 'iberia',
  ];
  function classifyDependencyTier(description: string | null): number {
    if (!description) return 0;
    const text = description.toLowerCase();
    if (/\b(dormitory|control center|reception room|office|training room)\b.{0,20}\blevel\b|\bper\b.{0,15}\block\b.{0,10}\blevel\b/.test(text)) return 1;
    if (/for (each|every)\b.{0,25}\boperator[s]?\b (in|assigned)|per operator in this|this facility'?s capacity|room'?s capacity|drone capacity|filled slots?/.test(text)) return 2;
    if (FACTION_KEYWORDS.some((kw) => text.includes(kw))) return 4;
    if (/\bif\b.{0,45}\b(is|are)\s+(also\s+)?(in|assigned|present|stationed)\b|\btogether with\b|\balongside\b/.test(text)) return 3;
    return 0;
  }
  function bestDependencyTier(skills: BaseSkill[]): number {
    if (skills.length === 0) return 99; // no skill at all -- always sorts after every skill-having operator
    return Math.min(...skills.map((s) => classifyDependencyTier(s.description)));
  }

  // "Peak" = the best-case value this skill can reach once every
  // condition it depends on is fully met -- the largest percentage
  // mentioned anywhere in its description. This is exact for flat
  // skills (their only number IS the peak) and for skills that state
  // an explicit cap ("up to +20%"), but is a reasonable approximation
  // rather than a guaranteed-exact computed max for skills whose real
  // ceiling isn't spelled out in the text itself.
  function extractPeakPercent(description: string | null): number | null {
    if (!description) return null;
    const matches = [...description.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)].map((m) => Math.abs(parseFloat(m[1])));
    if (matches.length === 0) return null;
    return Math.max(...matches);
  }

  // Combined across every active skill (they stack additively), not
  // shown per-skill -- one locked figure for the whole card. This is a
  // text heuristic (max % mentioned per skill, summed) that works for
  // genuinely additive skills, but breaks down for skills whose bonus
  // and penalty are both driven by the same underlying variable --
  // hence the special case below for known exceptions where the naive
  // sum doesn't reflect an actually-achievable value.
  function combinedPeakPercent(skills: BaseSkill[], operatorName?: string): number | null {
    if (skills.some(s => s.name === 'Tactic Guidance: Defense' || s.name === 'Tactic Guidance: Offense')) return 40;
    if (operatorName === 'Totter') {
      // Blurry Vision: +30%, -5% per 4 points of own Morale difference.
      // Blizzard Outside: +10% once Morale difference exceeds 12 -- but
      // by the time it's active, Blurry Vision's own penalty has
      // already cut its +30% down to +15% (three 4-point steps by
      // Morale difference 12), for a net of only +25%. The true peak is
      // Blurry Vision alone at zero Morale difference: a clean +30%,
      // higher than anything achievable once Blizzard Outside is live.
      const hasBlurryVision = skills.some((s) => s.name === 'Blurry Vision');
      if (hasBlurryVision) return 30;
    }
    if (operatorName === 'Marcille') {
      // Familiar Dispatch β: flat +30%, no conditions.
      // Unexpectedly Delicious: +1% per 1 Monster Meal -- a shared
      // resource generated by OTHER operators, not Marcille herself, so
      // it can't be read off her own skill text. Confirmed source in
      // this codebase: Senshi's Diner in the Dormitory, +5 max (see
      // totalMonsterMeal above). Peak reflects the best case (Senshi
      // optimally placed), not whatever the actual current count is.
      // TODO: if other operators (e.g. other Laios's-party characters)
      // also generate Monster Meal and get wired in later, this max
      // needs to be raised to match.
      const hasUnexpectedlyDelicious = skills.some((s) => s.name === 'Unexpectedly Delicious');
      const hasFamiliarDispatch = skills.some((s) => s.name?.startsWith('Familiar Dispatch'));
      if (hasUnexpectedlyDelicious && hasFamiliarDispatch) return 35; // 30 + max 5 Monster Meal
      if (hasUnexpectedlyDelicious) return 5;
    }
    const peaks = skills.map((s) => extractPeakPercent(s.description)).filter((p): p is number => p !== null);
    if (peaks.length === 0) return null;
    return peaks.reduce((sum, p) => sum + p, 0);
  }

  // Which product a Factory skill is tied to, verified directly against
  // every ctx.selectedProduct check in factorySpecialSkills.ts -- NOT
  // guessed from description wording, since several of these (e.g.
  // Purestream, Alanna, Narantuya) don't actually name the product in
  // their own text at all; the product-gating lives entirely in the
  // handler's logic. Everything not listed here is either product-
  // agnostic or a generic (non-special-cased) skill, for which the
  // description text is the only signal available -- falls back to
  // an explicit "Battle Records"/"Precious Metals" mention if present.
  const FACTORY_PRODUCT_SPECIFIC: Record<string, FactoryProduct> = {
    'Click|Editing β': 'Battle Records',
    'Scene|Editing α': 'Battle Records',
    'Executor the Ex Foedere|Reasonable Utilization': 'Battle Records',
    'Click|Vlog': 'Battle Records',
    'Leto|Through Thick and Thin': 'Battle Records',
    "Miss.Christine|Fancy Feast's Reward": 'Battle Records',
    'Purestream|Renewable Energy': 'Precious Metals',
    'Thorns the Lodestar|Essence Transmutation Byproduct': 'Originium Shards',
    'Alanna|Master of Machines α': 'Precious Metals',
    'Alanna|Master of Machines β': 'Precious Metals',
    'Alanna|"Here to Help!"': 'Precious Metals',
    'Nasti|Costly Construction': 'Precious Metals',
    'Narantuya|Union of Desert Bandits': 'Precious Metals',
    'Almond|Big Responsibilities': 'Precious Metals',
  };
  function factoryProductForSkill(operatorName: string, skillName: string | null, description: string | null): FactoryProduct | null {
    const key = `${operatorName}|${skillName}`;
    if (FACTORY_PRODUCT_SPECIFIC[key]) return FACTORY_PRODUCT_SPECIFIC[key];
    if (!description) return null;
    if (/originium formulas?/i.test(description)) return 'Originium Shards';
    const mentionsBattle = /battle records?/i.test(description);
    const mentionsMetals = /precious metals?/i.test(description);
    if (mentionsBattle && !mentionsMetals) return 'Battle Records';
    if (mentionsMetals && !mentionsBattle) return 'Precious Metals';
    return null; // product-agnostic, or genuinely applies to both
  }

  interface RoomOperatorRow {
    op: BaseOperator;
    skills: BaseSkill[];
    slotIndex: number; // -1 if not currently placed in this facility
    workingElsewhere: boolean; // already assigned to some other facility
  }
  const roomOperatorRows: RoomOperatorRow[] = facility
    ? (() => {
        const searched = operators.filter((op) => op.name.toLowerCase().includes(search.trim().toLowerCase())
          && (!ownedOperators || includeUnowned || ownedOperators.has(op.name)));
        const facilitySlots = assignments[facility.id] || [];
        // Everyone already working in some OTHER facility. They stay in the
        // list -- you may well want to move one -- but they belong at the
        // bottom of the group they'd otherwise lead, since the useful answer
        // to "who can work here" is someone who isn't busy.
        const workingElsewhere = new Set<string>();
        Object.entries(assignments).forEach(([facilityId, slots]) => {
          if (facilityId === facility.id) return;
          slots.forEach((slot) => {
            if (slot) workingElsewhere.add(slot.operatorName);
          });
        });
        const selectedProduct = facility.kind === 'factory' ? factoryProducts[facility.id] : null;
        const rows = searched.map((op) => {
          const slotIndex = facilitySlots.findIndex((s) => s?.operatorName === op.name);
          /* A PLACED operator previews the elite they are placed at, not the
             tab's -- the tab only sets what the next pick lands as. This is
             what kept the run legible: switching to Elite 2 to shop no longer
             silently rewrites what the people already in the room appear as. */
          const eliteForRow = slotIndex !== -1
            ? (facilitySlots[slotIndex]?.eliteLevel ?? pickElite(op.name))
            : pickElite(op.name);
          const level = slotIndex !== -1 ? facilitySlots[slotIndex]?.level : roomPanelEliteLevel === 'Yours' && ownedOperators?.has(op.name) ? account?.base?.operatorProgress?.[op.name]?.level ?? rosterLevel[op.name] : undefined;
          let skills = activeBaseSkills(op, facility.label, eliteForRow, skillSlots, level);
          if (facility.kind === 'factory' && selectedProduct) {
            skills = skills.filter((sk) => {
              const product = factoryProductForSkill(op.name, sk.name, sk.description);
              return product === null || product === selectedProduct;
            });
          }
          return {
            op,
            skills,
            slotIndex,
            workingElsewhere: workingElsewhere.has(op.name),
          };
        });
        // Operators with a skill for this facility/elite level sort before
        // those without; within that, anyone already working elsewhere sinks
        // to the bottom of their group; and among what's left, easier (less
        // setup-dependent) skills sort first.
        //
        // The "working elsewhere" step deliberately outranks skill tier, so a
        // strong Factory operator already standing in another Factory drops
        // below every Factory operator who is still free -- but stays above
        // the operators with no Factory skill at all, since they are no use
        // here whether they are busy or not.
        rows.sort((a, b) => {
          const hasSkillDiff = (a.skills.length === 0 ? 1 : 0) - (b.skills.length === 0 ? 1 : 0);
          if (hasSkillDiff !== 0) return hasSkillDiff;
          const elsewhereDiff = (a.workingElsewhere ? 1 : 0) - (b.workingElsewhere ? 1 : 0);
          if (elsewhereDiff !== 0) return elsewhereDiff;
          const tierDiff = bestDependencyTier(a.skills) - bestDependencyTier(b.skills);
          if (tierDiff !== 0) return tierDiff;
          const peakA = combinedPeakPercent(a.skills) ?? -1;
          const peakB = combinedPeakPercent(b.skills) ?? -1;
          if (peakA !== peakB) return peakB - peakA; // higher peak first
          return a.op.name.localeCompare(b.op.name);
        });
        /* Deliberately NOT re-sorted by selection. Selected operators used to
           jump to the front of the list, which was the only way to see who was
           in the room -- now the chips above say that, and pulling a card out
           from under the cursor cost more than it explained: filling a
           five-slot room from the far end of the roster meant the list
           reshuffled and scrolled back to the top on every single pick. */
        return rows;
      })()
    : [];

  const breakdownFacility = breakdownFacilityId ? FACILITIES.find((f) => f.id === breakdownFacilityId) ?? null : null;
  const activeFacilityStats = breakdownFacility ? productivityFor(breakdownFacility, ccEffects, ccMoraleRelief) : null;
  const activeBreakdown = activeFacilityStats?.facilityBreakdown ?? null;
  // The tiles show one summed Morale figure to keep every row the same
  // modest height, so the per-operator rates live here instead -- this is
  // the only place they are still spelled out.
  const activePerOperatorMorale = activeFacilityStats?.perOperatorMorale ?? null;
  const hasExtraResources =
    totalFelvine > 0 ||
    totalMonsterMeal > 0 ||
    resourcePools.worldlyPlight > 0 ||
    resourcePools.witchcraftCrystal > 0 ||
    resourcePools.soundlessResonance > 0 ||
    resourcePools.chainOfThought > 0 ||
    resourcePools.passion > 0 ||
    resourcePools.intelligenceReserve > 0 ||
    resourcePools.measure > 0 ||
    resourcePools.dreamland > 0 ||
    resourcePools.memoryFragments > 0 ||
    resourcePools.perceptionInformation > 0;

  const roomSummaries: BaseRoomSummary[] = FACILITIES.filter(f => f.kind !== 'elevator').map(f => {
    const stats = productivityFor(f, ccEffects, ccMoraleRelief);
    const workers = (assignments[f.id] ?? []).filter((s): s is SlotAssignment => !!s).map(s => {
      const recovery = dormitoryRecoveryByFacility[f.id]?.find(r => r.name === s.operatorName);
      return { name: s.operatorName, morale: baseSource === 'account' ? account?.base?.morale[s.operatorName] ?? null : s.morale ?? (f.kind === 'dormitory' ? 0 : 24), rate: recovery ? -(recovery.base + recovery.bonus) : f.kind === 'workshop' ? null : stats.perOperatorMorale?.[s.operatorName] ?? stats.combinedMoraleRate };
    });
    const draining = workers.filter(w => w.rate !== null && w.rate > 0);
    const deadline = draining.length && draining.every(w => w.morale !== null) ? Math.min(...draining.map(w => w.morale! / w.rate!)) : null;
    let metric = '', detail = '';
    if (f.level && stats.productivity) metric = `${((stats.productivity.grey + stats.productivity.yellow) * 100).toFixed(0)}% efficiency`;
    if (f.kind === 'factory' && f.level) detail = `${factoryProducts[f.id] ?? 'Choose a product'} · Capacity ${(stats.capacity?.base ?? 0) + (stats.capacity?.adjustment ?? 0)}`;
    if (f.kind === 'tradingPost' && f.level) detail = `Order limit ${(stats.orderLimit?.base ?? 0) + (stats.orderLimit?.adjustment ?? 0)}`;
    if (f.kind === 'powerPlant' && stats.droneRate !== null) metric = `+${((stats.droneRate ?? 0) * 100).toFixed(0)}% drones`;
    if (f.kind === 'dormitory' && f.level) {
      metric = workers.length ? `Resting ${workers.length} / ${f.capacity}` : 'Ready for resting';
      detail = `Ambience ${dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level)}`;
    }
    if (stats.clueSpeed !== null) metric = `${(((stats.clueSpeedBase ?? 1) + (stats.clueSpeed ?? 0)) * 100).toFixed(0)}% clue speed`;
    if (stats.office) { metric = `+${(stats.office.speed * 100).toFixed(0)}% HR`; detail = `${stats.office.refreshHours.toFixed(1)}h refresh`; }
    if (stats.trainingSpeed !== null) { metric = baseSource === 'account' ? 'Training room staffed' : `${((stats.trainingSpeed ?? 0) * 100).toFixed(0)}% training`; detail = baseSource === 'account' ? account?.base?.trainee ? `Trainee: ${account.base.trainee}` : 'Training target unavailable' : `${stats.trainingHours?.toFixed(2) ?? '—'}h · ${resolvedTrainingTarget.operatorName || resolvedTrainingTarget.class}`; }
    if (stats.workshop && baseSource === 'planner') { metric = `${(stats.workshop.chance * 100).toFixed(1)}% byproduct`; detail = `${stats.workshop.morale} Morale · ${stats.workshop.lmd} LMD / craft`; }
    if (f.kind === 'workshop' && baseSource === 'account') { metric = 'Workshop staffed'; detail = 'Choose a craft in an editable copy'; }
    if (f.kind === 'controlCenter' && f.level) { metric = `${workers.length} / ${f.capacity} staffed`; detail = 'Base-wide support'; }
    return { id: f.id, metric: workers.length || f.kind === 'dormitory' ? metric : f.level ? 'Empty room' : '', detail: f.level ? detail : '', workers, deadline };
  });

  const optimizerDialog = optimizerAvailable && showOptimizer && <ImportDialog title="Base optimizer" className="base-rotation-dialog" onClose={() => setShowOptimizer(false)}><BaseAccountOptimizer account={account} base={{ operators, rosters, skillSlots, workshopRecipes, clueExchangeActive, moraleAbove12 }} loginInterval={loginInterval} onInterval={setLoginInterval} onApply={saveOptimizerRotation} /></ImportDialog>;
  const rotationDialog = showRotationPlan && <ImportDialog title="Rotation" className="base-rotation-dialog" onClose={() => setShowRotationPlan(false)}><BaseRotationPanel plan={rotationPlan} onChange={updateRotationPlan} presets={savedPresets} onLoad={viewRotationShift} initialMorale={account?.base?.morale ?? {}} owned={ownedOperators ?? undefined} imported={!!account?.base} stages={rotationCalculation?.stages} /></ImportDialog>;
  if (!setupComplete) {
    return (
      <>
        <div>
          <PageHeader
            eyebrow="Rhodes Island // Base Layout"
            title={editingExistingLayout ? 'Edit Base Layout' : 'Base Formation'}
            actions={<div className="base-view-controls">{optimizerAvailable && <button type="button" className="ghost" onClick={() => setShowOptimizer(true)}>Optimize base</button>}{rotationPlan.shifts.length > 0 && <button type="button" className="ghost" onClick={() => setShowRotationPlan(true)}>Rotation</button>}</div>}
            sub={editingExistingLayout
              ? 'Change what stands in each production spot and how far each facility is built. Operators stay where they are, except in a spot whose facility type changes.'
              : 'Build your base from a familiar split, then adjust its rooms and facility levels.'}
          />
          <main>
            {optimizerDialog}
            {rotationDialog}
            {renderBaseSources()}
            <section className="op-section base-setup-screen">
              <p className="hint base-setup-intro">
                The nine spots on floors 1-3 each hold a Trading Post, a Factory or a Power Plant --
                at most 5 Trading Posts, 5 Factories and 3 Power Plants. Every other room&apos;s type is
                fixed by the base itself, so only its level can change. Any facility can be left
                unbuilt. Dormitories and the Control Center reach Level 5, everything else Level 3.
                Production staffing follows level (1–3 slots); the Reception Room has two slots
                and the Office one at every built level.
              </p>

              {/* Three presets and a way past them. Each preset is a whole
                  base -- arrangement and levels -- so picking one is the
                  entire decision; Custom is for building it by hand. */}
              {/* Selectable cards (.btn-bare .pick-card), picked in the teal selected
                  state; they were solid .primary blocks, which is the look of the one
                  action that matters on a screen. */}
              <div className="base-setup-preset-cards" role="group" aria-label="Base formation">
                {BASE_PRESET_IDS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="btn-bare pick-card base-setup-preset-card"
                    aria-pressed={chosenPreset === preset}
                    onClick={() => applyPreset(preset)}
                  >
                    <span className="base-setup-preset-name">{BASE_PRESETS[preset].label}</span>
                    <span className="base-setup-preset-summary">{BASE_PRESETS[preset].summary}</span>
                  </button>
                ))}
                <button
                  type="button"
                  // Highlighted only once the custom controls are actually
                  // open -- keying it on "no preset chosen" made Custom look
                  // selected on a fresh setup screen where nothing is.
                  className="btn-bare pick-card base-setup-preset-card"
                  aria-pressed={showCustomControls}
                  onClick={() => {
                    setShowCustomControls(true);
                    setChosenPreset(null);
                  }}
                >
                  <span className="base-setup-preset-name">Custom</span>
                  <span className="base-setup-preset-summary">
                    Choose each production spot and every facility&apos;s level yourself.
                  </span>
                </button>
              </div>

              {showCustomControls && (
                <div className="base-setup-tallies">
                  {PRODUCTION_KINDS.map((kind) => {
                    const used = assignedKindCount(spotsDraft, kind);
                    return (
                      <span
                        key={kind}
                        className={`base-setup-kind-tally${used >= MAX_PRODUCTION_BY_KIND[kind] ? ' full' : ''}`}
                      >
                        {FACILITY_KIND_LABELS[kind]} {used}/{MAX_PRODUCTION_BY_KIND[kind]}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Laid out three-per-row to mirror floors 1-3 of the base itself,
                  so a spot in the editor is in the same place as on the map. */}
              {showCustomControls && (
              <div className="base-setup-spot-grid">
                {PRODUCTION_SPOTS.map((spot) => (
                  <div key={spot.id} className="base-setup-spot">
                    <span className="base-setup-spot-name">
                      Floor {spot.row} &middot; {['Left', 'Middle', 'Right'][spot.column - 1]}
                    </span>
                    <div className="base-setup-spot-kinds" role="group" aria-label={`Floor ${spot.row} ${['left', 'middle', 'right'][spot.column - 1]} spot`}>
                      {PRODUCTION_KINDS.map((kind) => {
                        const chosen = spotsDraft[spot.id] === kind;
                        const allowed = canSetSpotKind(spotsDraft, spot.id, kind);
                        return (
                          <button
                            key={kind}
                            type="button"
                            className="filter-chip" aria-pressed={chosen}
                            disabled={!allowed}
                            title={
                              allowed
                                ? FACILITY_KIND_LABELS[kind]
                                : `Already ${MAX_PRODUCTION_BY_KIND[kind]} ${FACILITY_KIND_LABELS[kind]}s -- change another spot first`
                            }
                            onClick={() => updateDraftSpotKind(spot.id, kind)}
                          >
                            {FACILITY_KIND_LABELS[kind]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              )}

              {showCustomControls && (
              <div className="base-setup-levels">
                <div className="base-setup-level-grid">
                  {levelEditableFacilities(spotsDraft).map((f) => (
                    <div key={f.id} className="base-setup-level-row">
                      <span className="base-setup-level-label">{f.label}</span>
                      <div className="base-setup-level-buttons" role="group" aria-label={`${f.label} level`}>
                        {/* 0 is "not built" -- an empty plot is a legitimate base. */}
                        {Array.from({ length: f.maxLevel + 1 }, (_, i) => i).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            className="filter-chip" aria-pressed={draftLevelFor(f.id, f.maxLevel) === lvl}
                            title={lvl === 0 ? 'Not built' : `Level ${lvl}`}
                            onClick={() => updateDraftLevel(f.id, lvl)}
                          >
                            {lvl === 0 ? '--' : lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {(() => {
                const draftPower = powerBalance(getFacilities(spotsDraft, setupFacilityLevelsDraft));
                const problems = layoutProblems(spotsDraft, setupFacilityLevelsDraft);
                return (
                  <>
                    <div className={`base-setup-power${draftPower.ok ? '' : ' short'}`}>
                      <span className="base-setup-power-figure">
                        Power {draftPower.drawn} / {draftPower.supplied}
                      </span>
                      <span className="hint">
                        {draftPower.ok
                          ? `${draftPower.spare} spare -- Power Plants supply, every other facility draws.`
                          : `${Math.abs(draftPower.spare)} short of what this layout needs.`}
                      </span>
                    </div>
                    {problems.length > 0 && (
                      <ul className="base-setup-problems">
                        {problems.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    )}
                    <div className="base-setup-actions">
                      <button
                        type="button"
                        className="primary base-setup-begin-btn"
                        disabled={problems.length > 0 || (chosenPreset === null && !showCustomControls)}
                        onClick={handleBeginSimulation}
                      >
                        {editingExistingLayout ? 'Apply Layout' : 'View base'}
                      </button>
                      {editingExistingLayout && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setEditingExistingLayout(false);
                            setSetupComplete(true);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </section>
          </main>
        </div>
      </>
    );
  }

  // Green (realistic) is always shown; the red (ideal, "if collected
  // on time") annotation only appears when it would actually differ --
  // no point noting a gap that isn't there when the chosen login
  // interval already keeps up with every room's cap.
  function renderDualStat(green: number, red: number, format: (n: number) => string) {
    const hasWaste = red > green + 0.001;
    return (
      <>
        <span className="prod-green">{format(green)}</span>
        {hasWaste && (
          <span className="base-summary-ideal">
            {' '}
            (would be <span className="prod-danger">{format(red)}</span> if collected on time)
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <PageMeta title="Base" description="Arknights base planning: facilities, operator base skills, rotations and daily production." path="/base" />

      <div>
      <PageHeader
        eyebrow="Rhodes Island // Base Layout"
        title="Base"
        sub="Staff your rooms, compare setups and plan the next shift."
        actions={<div className="base-view-controls sidescroll">
          {optimizerAvailable && <button type="button" className="ghost" onClick={() => setShowOptimizer(true)}>Optimize base</button>}
          <button type="button" className="ghost" disabled={baseSource === 'account' && !account?.base} onClick={exportSnapshot}>Save image</button>
          {/* Outside the development-only guard below: the layout editor is a
              player-facing feature, not a debugging aid. It stays alongside
              the per-building gears for changing many rooms at once. */}
          <button ref={editLayoutButtonRef} type="button" className="ghost" disabled={baseSource === 'account'} onClick={openLayoutEditor}>
            Edit layout
          </button>
          {renderBaseSources()}
          {ROTATION_EXPERIMENT_ENABLED && (
            <button type="button" className="ghost" onClick={() => (showRotationPanel ? setShowRotationPanel(false) : openRotationPanel())}>
              Rotation Experiment (Elite 0)
            </button>
          )}
        </div>}
      />

      <main>
        {optimizerDialog}
        {baseSource === 'account' && account?.base && <details className="base-import-notes"><summary>Snapshot and calculation limits{account.base.warnings.length ? ` (${account.base.warnings.length})` : ''}</summary><p>Rooms, staffing, levels and Morale are from the last import. Output uses known snapshot Morale, the current collection interval and manual skill conditions. Training mastery and factory recipe tiers are not imported; output is a planning estimate.</p><ul>{account.base.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}
        {(baseSource === 'planner' || account?.base) && <div className="base-production-strip" aria-label="Daily production estimates">{calculationSource === 'rotation' ? <span className="hint">Rotation estimate</span> : baseSource === 'account' && <span className="hint">Estimated output</span>}<span><strong>{summaryUnavailable ? '—' : Math.round(dailyGoldWorthGreen).toLocaleString()}</strong> LMD / day</span><span><strong>{summaryUnavailable ? '—' : Math.round(dailyExpGreen).toLocaleString()}</strong> EXP / day</span><span><strong>{summaryUnavailable ? '—' : dailyGoldMadeGreen.toFixed(1)}</strong> Gold / day</span><span className={basePower.ok ? undefined : 'prod-danger'}>Power <strong>{basePower.drawn} / {basePower.supplied}</strong>{!basePower.ok && ` · ${Math.abs(basePower.spare)} short`}</span></div>}
        {rotationDialog}
        {ROTATION_EXPERIMENT_ENABLED && showRotationPanel && (
          <section className="op-section" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Rotation Experiment ({rotationMode === 'eliteZero' ? 'Elite 0 only' : 'Elite 2, max investment'})</h2>
              <button type="button" className="ghost" onClick={() => setShowRotationPanel(false)}>
                Close
              </button>
            </div>
            <div className="base-chip-row" role="group" aria-label="Rotation mode" style={{ marginBottom: 10 }}>
              <button type="button" className="filter-chip" aria-pressed={rotationMode === 'eliteZero'} onClick={() => switchRotationMode('eliteZero')}>
                Elite 0 only
              </button>
              <button type="button" className="filter-chip" aria-pressed={rotationMode === 'eliteTwo'} onClick={() => switchRotationMode('eliteTwo')}>
                Elite 2 (max investment)
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>
              {rotationMode === 'eliteZero'
                ? 'Assumes every operator is owned, but only their Base-tier (Elite 0) skill is usable.'
                : "Assumes every operator is owned AND promoted to Elite 2 -- each operator's best available skill tier is used, same convention as the rest of this codebase's optimizer."}{' '}
              Each facility rotates its own group out together (e.g. all 3 Factory workers swap as one lot), on its own
              independent schedule -- not one base-wide synchronized swap, since that would very likely overflow
              the Dormitory&apos;s 20-slot capacity if every facility tried to rest at the same time. Factory/Trading
              Post use the full combinatorial search; Reception Room, Office, Power Plant, and Control Center use a
              simpler best-operator-per-slot approach; Dormitory recovery uses the two most common skill phrasings
              directly rather than the full targeting system.
            </p>
            {rotationLoading && (
              <div className="notice base-rotation-notice">
                <div style={{ marginBottom: 6 }}>Computing rotation plan\u2026 {Math.round(rotationProgress)}%</div>
                <div className="meter" role="progressbar" aria-label="Computing rotation plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rotationProgress)}>
                  <span className="meter-fill" style={{ width: `${rotationProgress}%` }} />
                </div>
              </div>
            )}
            {rotationError && !rotationLoading && (
              <div className="notice notice-danger base-rotation-notice" role="alert">
                Failed to compute the rotation experiment: {rotationError}{' '}
                <button type="button" className="ghost" onClick={() => fetchRotationExperiment(rotationMode)}>
                  Retry
                </button>
              </div>
            )}
            {rotationExperiment && !rotationLoading && (
              <>
                <div className="notice base-rotation-notice">
                  <strong>Winning scenario:</strong> {rotationExperiment.chosenScenario}
                  <br />
                  <span className="hint">
                    Several Control Center placements were tried (leaving it to the normal best-per-slot picks, vs. deliberately
                    forcing in Gnosis and/or Kirin R Yato + Rathalos S Noir Corne for their Trading Post/Factory bonuses even
                    though their own Control Center skills wouldn&apos;t otherwise rank as the &quot;best&quot; picks) -- this is
                    whichever scenario produced the highest total production value.
                  </span>
                </div>
                <div className="notice base-rotation-notice">
                  <strong>Dormitory:</strong> {rotationExperiment.dormitorySlotsTotal} slots total across all 4 rooms · recovery rate{' '}
                  {rotationExperiment.dormitoryRecoveryRate.toFixed(2)}/hr · raw rest time to full: {rotationExperiment.dormitoryRestHoursNeeded.toFixed(1)}h · snapped to
                  your login cadence: {rotationExperiment.loginSnappedRestHoursNeeded}h.
                  <br />
                  <span className="hint">
                    Permanent recovery-buff staff (never rotate out): {rotationExperiment.dormitoryPermanentStaff.join(', ') || '(none found)'}. Everyone else
                    resting there at any given moment is whichever facility&apos;s group is currently off-shift.
                  </span>
                  <br />
                  <span className="hint">Total distinct operators used across every room below (working + resting sets, no repeats): {rotationExperiment.totalOperatorsUsed}.</span>
                </div>

                {[...rotationExperiment.factory, ...rotationExperiment.tradingPost, rotationExperiment.receptionRoom, rotationExperiment.office, ...rotationExperiment.powerPlant, rotationExperiment.controlCenter]
                  .filter((r): r is RotationExperimentResult['factory'][number] => !!r)
                  .map((r, i) => (
                    <div key={i} style={{ marginBottom: 10, padding: 8, borderBottom: '1px solid var(--line-soft)' }}>
                      <strong>{r.label}</strong>
                      <br />
                      Working: {r.workingSet.length > 0 ? r.workingSet.join(', ') : '(no viable operator found)'}
                      <br />
                      Resting/replacement: {r.restingSet.length > 0 ? r.restingSet.join(', ') : '(no second non-overlapping set found)'}
                      <br />
                      <span className="hint">
                        {r.metricLabel}: {r.metricValue.toFixed(2)} while working, {r.restingMetricValue.toFixed(2)} once the resting set takes over · works{' '}
                        {r.loginSnappedWorkWindowHours}h (raw: {r.workWindowHours.toFixed(1)}h before someone hits 0 Morale) · rests {rotationExperiment.loginSnappedRestHoursNeeded}h ·
                        own cycle ≈{r.cycleLoginSnappedHours}h ({(r.cycleLoginSnappedHours / 12).toFixed(0)} logins)
                      </span>
                      {r.metricLabel.endsWith('/day') && (
                        <div className="hint" style={{ marginTop: 4 }}>
                          Long-run sustained rate (average of working + resting set output, since they alternate roughly equally over time): daily{' '}
                          {r.longRunDailyRate.toFixed(1)} · weekly {r.longRunWeeklyRate.toFixed(0)} · monthly {r.longRunMonthlyRate.toFixed(0)} · yearly{' '}
                          {r.longRunYearlyRate.toFixed(0)}
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}
          </section>
        )}

        {baseSource === 'planner' && setupComplete && <div ref={presetControlsRef} tabIndex={-1} className="base-preset-anchor">
          <BasePresetToolbar presets={savedPresets} selected={selectedPreset} dirty={presetDirty} status={presetStatus} onLoad={loadNamedPreset} onSave={saveNamedPreset} onRename={renamePreset} onDelete={deletePreset} onClear={resetBase} />
        </div>}
        {baseSource === 'account' && <p className="hint base-preset-status" role="status" aria-live="polite">{presetStatus}</p>}
        {baseSource === 'account' && !account?.base ? (
          <section className="base-empty-message" aria-label="Imported base unavailable">
            <h2>{account ? 'Import your base snapshot' : 'Import an account to view your base'}</h2>
            <p>{account ? 'This account was imported before base rooms were saved, or its export did not include building data. Import it again to include rooms, staffing and Morale.' : 'Import your game account to see its rooms, staffing and Morale here.'}</p>
            <DataLink />
          </section>
        ) : <div className={`base-command-workspace${roomPanelFacilityId || snapshotRoom ? ' has-room' : ''}${baseSource === 'planner' && roomPanelFacilityId ? ' is-staffing' : ''}`}>
          <BaseOverview loginInterval={loginInterval} facilities={FACILITIES} assignments={assignments} operators={operators} summaries={roomSummaries} selected={baseSource === 'account' ? snapshotRoom : roomPanelFacilityId} readOnly={baseSource === 'account'} onSelect={id => { if (baseSource === 'account') setSnapshotRoom(id); else { setBreakdownFacilityId(null); setSearch(''); openRoomPanel(id); } }} />
          <div className="base-command-editor">
            {!roomPanelFacilityId && !snapshotRoom && <section className="base-editor-idle"><h2>{baseSource === 'account' ? 'Your imported base' : 'Staffing'}</h2><p>{baseSource === 'account' ? 'Select a room to inspect its imported operators and Morale.' : 'Select a room to change its workers, level or product.'}</p></section>}
            {baseSource === 'account' && snapshotRoom && <section className="base-import-room" aria-label="Imported room details">
              <div className="base-room-panel-header"><h2>{FACILITIES.find(f => f.id === snapshotRoom)?.label}</h2><button type="button" className="ghost" onClick={() => setSnapshotRoom(null)}>Close</button></div>
              <p>{roomSummaries.find(r => r.id === snapshotRoom)?.metric}</p>
              {roomSummaries.find(r => r.id === snapshotRoom)?.workers.map(w => <div className="base-import-worker" key={w.name}><strong>{w.name}</strong><span>{eliteShort(assignments[snapshotRoom]?.find(s => s?.operatorName === w.name)?.eliteLevel ?? null)} · Lv{assignments[snapshotRoom]?.find(s => s?.operatorName === w.name)?.level ?? '—'}</span><span>{w.morale === null ? 'Morale unknown' : `${w.morale.toFixed(1)} / 24 Morale`}</span><span>{w.rate === null ? 'Rate unavailable' : `${Math.abs(w.rate).toFixed(2)} /h ${w.rate < 0 ? 'recovery' : 'consumption'}`}</span></div>)}
              {snapshotRoom === 'trainingRoom' && account?.base?.trainee && <div className="base-import-worker"><strong>Trainee: {account.base.trainee}</strong><span>{account.base.morale[account.base.trainee] === undefined ? 'Morale unknown' : `${account.base.morale[account.base.trainee].toFixed(1)} / 24 Morale`}</span></div>}
              <p className="hint">Snapshot at import time. Estimates do not track changes since then.</p>
              <button type="button" className="primary" onClick={editImportedCopy}>Edit a copy</button>
            </section>}
            {baseSource === 'planner' && roomPanelFacilityId && facility ? (
              <div ref={baseRoomPanelRef} className="base-room-panel" role="region" aria-label={`${facility.label} staffing`}>
                <div className="base-room-panel-header">
                  <button
                    type="button"
                    className="back-btn base-room-back-btn"
                    onClick={closeRoomPanel}
                  >
                    ‹ Back
                  </button>
                  <span className="base-room-panel-title">{facility.label}</span>
                  {!activeBreakdown && (
                    <span className="base-room-panel-count">
                      {(assignments[facility.id] || []).filter(Boolean).length}/{facility.capacity} selected
                    </span>
                  )}
                </div>

                <div className="base-room-building-controls">
                  {facility.id.startsWith('prod') && <StyledSelect label="Room type" value={productionSpots[facility.id]} onChange={v => setFacilityKind(facility.id, v as ProductionKind)} options={PRODUCTION_KINDS.map(kind => ({ value: kind, label: FACILITY_KIND_LABELS[kind], disabled: !canSetSpotKind(productionSpots, facility.id, kind) }))} />}
                  <StyledSelect label="Room level" value={String(facility.level)} onChange={v => setFacilityLevel(facility.id, Number(v))} options={Array.from({ length: MAX_LEVEL_BY_KIND[facility.kind] + 1 }, (_, level) => ({ value: String(level), label: level ? `Level ${level}` : 'Not built' }))} />
                  {facility.kind === 'dormitory' && <label>Ambience <NumberInput aria-label="Dormitory ambience" min="0" max={dormitoryAmbienceCap(facility.level)} value={dormitoryAmbience[facility.id] ?? defaultDormitoryAmbience(facility.level)} onChange={e => persistAmbience(facility.id, facility.level, Number(e.target.value))} /></label>}
                  {productivityFor(facility, ccEffects, ccMoraleRelief).facilityBreakdown && <button type="button" className="ghost" onClick={() => setBreakdownFacilityId(activeBreakdown ? null : facility.id)}>{activeBreakdown ? 'Staffing' : 'Calculation'}</button>}
                </div>
                {activeBreakdown ? (
                  <div className="base-breakdown-panel">
                    <div className="base-breakdown-header">
                      <span className="base-breakdown-title">{breakdownFacility?.label} -- How this is calculated</span>
                    </div>
                    <p className="base-breakdown-line base-breakdown-base">
                      Base {breakdownFacility?.kind === 'tradingPost' ? 'order efficiency' : breakdownFacility?.kind === 'receptionRoom' ? 'clue search speed' : breakdownFacility?.kind === 'powerPlant' ? 'drone recovery' : breakdownFacility?.kind === 'controlCenter' ? 'Morale per hour' : 'productivity'}: <b>{(activeBreakdown.greyProductivity * 100).toFixed(0)}%</b>
                      <span className="hint"> ({activeBreakdown.greyFormula})</span>
                    </p>
                    {activeBreakdown.overrideActive && (
                      <p className="hint base-breakdown-override-note">
                        {breakdownFacility?.kind === 'tradingPost'
                          ? "An override skill is active in this Trading Post -- everyone else's own order efficiency is discarded entirely."
                          : "An override skill is active in this Factory -- everyone else's own productivity is discarded except skills marked \"exempt\"."}
                      </p>
                    )}
                    <div className="base-breakdown-lines">
                      {activeBreakdown.lines.map((line, i) => (
                        <div key={i} className={`base-breakdown-line-item${line.included ? ' included' : ' excluded'}`}>
                          <div className="base-breakdown-line-head">
                            <span>{line.operatorName}{line.skillName ? ` — ${line.skillName}` : ' (generic)'}</span>
                            <span className="base-breakdown-line-value">
                              {line.rawValue >= 0 ? '+' : ''}
                              {(line.rawValue * 100).toFixed(2)}%
                            </span>
                          </div>
                          <p className="hint base-breakdown-line-reason">{line.included ? '✓ ' : '✗ '}{line.reason}</p>
                          {line.formula && <p className="base-breakdown-line-formula">{line.formula}</p>}
                          {line.note && <p className="hint base-breakdown-line-note">{line.note}</p>}
                        </div>
                      ))}
                    </div>
                    {activePerOperatorMorale && Object.keys(activePerOperatorMorale).length > 0 && (
                      <div className="base-breakdown-morale">
                        <p className="base-breakdown-morale-title">Morale per hour, by operator</p>
                        {Object.entries(activePerOperatorMorale).map(([opName, rate]) => (
                          <div key={opName} className="base-breakdown-morale-row">
                            <span>{opName}</span>
                            <span className="prod-grey">-{rate.toFixed(2)}/hr</span>
                          </div>
                        ))}
                        <p className="hint base-breakdown-morale-note">
                          The tile shows the highest of these rather than a total: each operator
                          drains their own Morale at their own rate, so the room is decided by
                          whoever empties first -- they are the one to swap out, and the tile&apos;s
                          Dead time comes from that same rate.
                        </p>
                      </div>
                    )}
                    <p className="base-breakdown-line base-breakdown-final">
                      Final: {(activeBreakdown.greyProductivity * 100).toFixed(2)}% + {(activeBreakdown.finalYellow * 100).toFixed(2)}% ={' '}
                      <b>{(activeBreakdown.effectiveProductivity * 100).toFixed(2)}%</b>
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="base-room-panel-controls">
                      <input
                        type="text"
                        placeholder="Search operators..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="base-sidebar-search"
                      />
                      <div className="base-room-elite-select" role="group" aria-label="Elite level new picks are placed at">
                        {/* This sets what the NEXT pick lands as -- never what the
                            placed ones are. Their elite lives on their chip below. */}
                        <span className="base-room-elite-label">Place at</span>
                        {([...(account ? ['Yours' as const] : []), 'Base', 'Elite 1', 'Elite 2'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            className="filter-chip"
                            aria-pressed={roomPanelEliteLevel === lvl}
                            onClick={() => setRoomPanelEliteLevel(lvl)}
                          >
                            {lvl === 'Base' ? 'Elite 0' : lvl === 'Yours' ? 'Your elite' : lvl}
                          </button>
                        ))}
                      </div>
                      {account && (
                        <button type="button" className="filter-chip" aria-pressed={includeUnowned} onClick={() => setIncludeUnowned(!includeUnowned)}
                          title="Also list the operators your imported account does not have, to plan ahead.">
                          Not owned too
                        </button>
                      )}
                    </div>

                    {facility.kind === 'factory' && (
                      <div className="base-product-select" role="group" aria-label="Factory product">
                        {(['Battle Records', 'Precious Metals', 'Originium Shards'] as FactoryProduct[]).map((product) => (
                          <button
                            key={product}
                            type="button"
                            className="filter-chip" aria-pressed={factoryProducts[facility.id] === product}
                            onClick={() => persistProduct(facility.id, product)}
                          >
                            {product}
                          </button>
                        ))}
                      </div>
                    )}

                    <p className="hint base-room-panel-hint">Select an operator to assign or remove them. Moving someone here removes their other assignment.</p>

                    {(() => {
                      function renderCard({ op, skills, slotIndex }: RoomOperatorRow, facilityId: string) {
                        const selected = slotIndex !== -1;
                        const placedElsewhere = !selected ? assignedElsewhere(op.name) : null;
                        const roomFull = (assignments[facilityId] || []).every((s) => s !== null);
                        const needsManualValue = selected && skills.some((s) => MANUAL_VALUE_SKILLS.has(`${op.name}|${s.name}`));
                        return (
                          /* role=button + tabIndex rather than a real <button>: the card
                             legally contains an <input> (the manual-value skills), which
                             a button element cannot. The target check keeps a Space in
                             that input from toggling the whole card. */
                          <div
                            key={op.name}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selected}
                            className={`base-room-card${selected ? ' selected' : ''}${!selected && roomFull ? ' disabled' : ''}`}
                            onClick={() => toggleRoomOperator(facilityId, op.name, pickElite(op.name))}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleRoomOperator(facilityId, op.name, pickElite(op.name));
                              }
                            }}
                          >
                            {selected && (
                              <span className="base-room-card-number">
                                #{slotIndex + 1} &middot; {eliteShort(assignments[facilityId]?.[slotIndex]?.eliteLevel)}
                              </span>
                            )}
                            <div className="base-room-card-head">
                              <Image src={getOperatorIconPath(op)} alt={op.name} width={40} height={40} />
                              <span className="base-room-card-name">{op.name}</span>
                            </div>
                            {skills.length > 0 ? (() => {
                              const peak = combinedPeakPercent(skills, op.name);
                              return (
                                <>
                                  <div className="base-room-card-skills-scroll">
                                    {skills.map((sk, si) => {
                                      const iconSrc = sk.icon || getBaseSkillIconPath(op.name, sk);
                                      return (
                                        <div key={si} className="base-room-card-skill">
                                          {iconSrc && <Image src={iconSrc} alt="" width={26} height={26} className="base-room-card-skill-icon" />}
                                          <span className="base-room-card-skill-desc"><BaseSkillText text={sk.description} keywords={sk.keywords} /></span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {peak !== null && <span className="base-room-card-peak-locked">Peak: {peak}%</span>}
                                </>
                              );
                            })() : (
                              <span className="hint base-room-card-noskill">
                                No {pickElite(op.name) === 'Base' ? 'Elite 0' : pickElite(op.name)} skill here
                              </span>
                            )}
                            {selected && FACILITIES.find(room => room.id === facilityId)?.kind === 'dormitory' && <label className="base-slot-morale" onClick={e => e.stopPropagation()}>Morale <NumberInput aria-label={`${op.name} current Morale`} min={0} max={24} value={assignments[facilityId]?.[slotIndex]?.morale ?? 0} onChange={e => {
                              const next = [...(assignments[facilityId] || [])];
                              next[slotIndex] = { ...next[slotIndex]!, morale: Math.min(24, Math.max(0, Number(e.target.value) || 0)) };
                              persist({ ...assignments, [facilityId]: next });
                            }} /></label>}
                            {needsManualValue && (
                              <NumberInput
                                className="base-slot-manual-input"
                                placeholder="value"
                                value={assignments[facilityId]?.[slotIndex]?.manualValue ?? ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setManualValue(facilityId, slotIndex, Number(e.target.value))}
                              />
                            )}
                            {ownedOperators && !ownedOperators.has(op.name) && <span className="base-op-unowned-tag">Not owned</span>}
                            {placedElsewhere && (
                              <span className="base-op-placed-tag">In {FACILITIES.find((f) => f.id === placedElsewhere)?.label}</span>
                            )}
                          </div>
                        );
                      }

                      const slots = assignments[facility.id] || [];
                      return (
                        <>
                          {facility.kind === 'workshop' && <div className="base-room-team">
                            <label>Recipe <StyledSelect label="Workshop recipe" value={workshopSettings.recipeId} onChange={recipeId => setWorkshopSettings({ ...workshopSettings, recipeId })} options={workshopRecipes.filter(r => r.level <= facility.level).map(r => ({ value: r.id, label: workshopRecipes.filter(other => other.name === r.name).length > 1 ? `${r.name} · ${r.morale} Morale · ${r.lmd} LMD (base)` : r.name }))} /></label>
                            <label className="check"><input type="checkbox" checked={!!workshopSettings.overrideDormCount} onChange={e => setWorkshopSettings({ ...workshopSettings, overrideDormCount: e.target.checked })} />Override qualifying dorm count</label>
                            {workshopSettings.overrideDormCount && <label>Dorm operators meeting skill’s Morale threshold <NumberInput aria-label="Qualifying dorm operators" min={0} max={dormitoryOperatorNames.size} value={workshopSettings.qualifyingDormOperators} onChange={e => setWorkshopSettings({ ...workshopSettings, qualifyingDormOperators: Math.min(dormitoryOperatorNames.size, Math.max(0, Number(e.target.value))) })} /></label>}
                            {slots.some(s => s?.operatorName === 'Nine-Colored Deer') && <>{(['causality', 'karma'] as const).map(key => <label key={key}>{key} <NumberInput min={0} max={key === 'karma' ? 80 : 40} value={workshopSettings[key]} onChange={e => setWorkshopSettings({ ...workshopSettings, [key]: Math.max(0, Number(e.target.value)) })} /></label>)}</>}
                            {slots.some(s => s?.operatorName === 'Thorns') && <label>Failed crafts <NumberInput min={0} value={workshopSettings.thornsFailures} onChange={e => setWorkshopSettings({ ...workshopSettings, thornsFailures: Math.max(0, Number(e.target.value)) })} /></label>}
                            {productivityFor(facility, ccEffects, ccMoraleRelief).workshop?.notes.map(note => <p className="hint" key={note}>{note}</p>)}
                          </div>}
                          {/* The room as it stands: every slot in order, each wearing the
                              Elite it is placed at -- readable and editable here no matter
                              which tab is lit above. This is the answer to the picker's
                              old blind spot: switching tabs changed what the placed cards
                              LOOKED like while saying nothing about what they WERE. */}
                          {facility.kind === 'trainingRoom' && (
                            <div className="base-training-target">
                              <label>Trainee <StyledSelect label="Trainee operator" value={resolvedTrainingTarget.operatorName ?? ''} onChange={name => {
                                const op = operatorByName.get(name);
                                const next = Object.fromEntries(Object.entries(assignments).map(([id, slots]) => [id, slots.map(slot => slot?.operatorName === name ? null : slot)]));
                                persist(next); setTrainingTarget(t => ({ ...t, operatorName: name, timeReductionActive: false, class: op?.class ?? t.class, branch: op?.branch ?? '' }));
                              }} options={[{ value: '', label: 'Class / branch only' }, ...operators.filter(op => canTrainMastery(op) && !slots.some(s => s?.operatorName === op.name)).map(op => ({ value: op.name, label: op.name }))]} /></label>
                              <label>Class <StyledSelect label="Trainee class" disabled={!!resolvedTrainingTarget.operatorName} value={resolvedTrainingTarget.class} onChange={value => setTrainingTarget(t => ({ ...t, class: value, branch: '' }))} options={TRAINING_CLASSES.map(value => ({ value, label: value }))} /></label>
                              <label>Branch <StyledSelect label="Trainee branch" disabled={!!resolvedTrainingTarget.operatorName} value={resolvedTrainingTarget.branch} onChange={branch => setTrainingTarget(t => ({ ...t, branch }))} options={[{ value: '', label: 'Any branch' }, ...[...new Set(operators.filter(op => op.class === resolvedTrainingTarget.class).map(op => op.branch).filter((branch): branch is string => !!branch))].sort().map(value => ({ value, label: value }))]} /></label>
                              <label>Mastery <StyledSelect label="Target mastery" value={String(Math.min(trainingTarget.mastery, facility.level))} onChange={value => setTrainingTarget(t => ({ ...t, mastery: Number(value) }))} options={[1, 2, 3].filter(level => level <= facility.level).map(level => ({ value: String(level), label: `M${level}` }))} /></label>
                              <label className="check"><input type="checkbox" checked={resolvedTrainingTarget.timeReductionActive} onChange={e => setTrainingTarget(t => ({ ...t, timeReductionActive: e.target.checked }))} />Started with Irene / Logos time reduction</label>
                              {slots.some(slot => slot?.operatorName === 'Zuo Le') && <label className="check"><input type="checkbox" checked={resolvedTrainingTarget.instantTrainingReady} onChange={e => setTrainingTarget(t => ({ ...t, instantTrainingReady: e.target.checked }))} />Martial Arts ready</label>}
                            </div>
                          )}
                          <div className="base-room-team">
                            {slots.map((slot, i) => {
                              const op = slot ? operators.find((o) => o.name === slot.operatorName) : null;
                              if (!slot || !op) {
                                return (
                                  <div key={i} className="base-room-team-slot empty">
                                    <span className="base-room-team-n">#{i + 1}</span>
                                    <span className="base-room-team-empty">empty</span>
                                  </div>
                                );
                              }
                              const placedAt = !slot.eliteLevel || slot.eliteLevel === 'Level 30' ? 'Base' : slot.eliteLevel;
                              return (
                                <div key={i} className="base-room-team-slot">
                                  <span className="base-room-team-n">#{i + 1}</span>
                                  <Image src={getOperatorIconPath(op)} alt="" width={32} height={32} className="base-room-team-face" />
                                  <span className="base-room-team-name" title={op.name}>{op.name}</span>
                                  <span className="base-room-team-elites" role="group" aria-label={`${op.name}'s Elite level`}>
                                    {(['Base', 'Elite 1', 'Elite 2'] as const).map((lvl) => (
                                      <button
                                        key={lvl}
                                        type="button"
                                        className={`base-room-team-elite${placedAt === lvl ? ' on' : ''}`}
                                        aria-pressed={placedAt === lvl}
                                        title={`Work at ${lvl === 'Base' ? 'Elite 0' : lvl}`}
                                        onClick={() => setSlotElite(facility.id, i, lvl)}
                                      >
                                        {eliteShort(lvl)}
                                      </button>
                                    ))}
                                  </span>
                                  <XButton
                                    dense
                                    className="base-room-team-x"
                                    label={`Remove ${op.name}`}
                                    title={`Remove ${op.name}`}
                                    onClick={() => toggleRoomOperator(facility.id, op.name, pickElite(op.name))}
                                  />
                                </div>
                              );
                            })}
                          </div>

                          {/* A grid that scrolls DOWN. The old horizontal strip showed
                              five giant cards and hid the rest behind a drag; this shows
                              everyone at once and scrolls the way a page does. */}
                          <div className="base-room-grid">
                            {roomOperatorRows.length === 0 && <p className="hint base-sidebar-empty">No operator matches your search.</p>}
                            {roomOperatorRows.map((r) => renderCard(r, facility.id))}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>}

            {/* Kept on screen while the operator picker is open. Hiding them
                took ~390px out of the page, so opening the picker shrank the
                document even though the picker itself is exactly the height
                of the base view it replaces -- and a page that changes height
                is what lets the browser clamp your scroll position away. */}
        {(baseSource === 'planner' || account?.base) && <>
            <div className="base-bottom-panels">
              <div className="base-extra-resources-settings-panel">
                {hasExtraResources ? (
                    <div className="base-extra-resources-panel">
                      <span className="base-extra-resources-title">Extra Resources</span>
                      {totalFelvine > 0 && <span className="base-extra-resources-item">Felvine {totalFelvine}</span>}
                      {totalMonsterMeal > 0 && <span className="base-extra-resources-item">Monster Meal {totalMonsterMeal}</span>}
                      {resourcePools.worldlyPlight > 0 && <span className="base-extra-resources-item">Worldly Plight {resourcePools.worldlyPlight}</span>}
                      {resourcePools.witchcraftCrystal > 0 && <span className="base-extra-resources-item">Witchcraft Crystal {resourcePools.witchcraftCrystal}</span>}
                      {resourcePools.soundlessResonance > 0 && <span className="base-extra-resources-item">Soundless Resonance {resourcePools.soundlessResonance}</span>}
                      {resourcePools.chainOfThought > 0 && <span className="base-extra-resources-item">Chain of Thought {resourcePools.chainOfThought}</span>}
                      {resourcePools.passion > 0 && <span className="base-extra-resources-item">Passion {resourcePools.passion}</span>}
                      {resourcePools.intelligenceReserve > 0 && <span className="base-extra-resources-item">Intelligence Reserve {resourcePools.intelligenceReserve}</span>}
                      {resourcePools.measure > 0 && <span className="base-extra-resources-item">Measure {resourcePools.measure}</span>}
                      {resourcePools.dreamland > 0 && <span className="base-extra-resources-item">Dreamland {resourcePools.dreamland}</span>}
                      {/* No "(converted)" suffix any more: a conversion doesn't
                          consume its source, so Memory Fragments still read
                          their full amount after Memory Seeker has converted
                          them. The old suffix only ever showed because the pool
                          was being zeroed out, and it sat inside a `> 0` guard
                          that made it unreachable anyway. */}
                      {resourcePools.memoryFragments > 0 && (
                        <span className="base-extra-resources-item">Memory Fragment {resourcePools.memoryFragments}</span>
                      )}
                      {resourcePools.perceptionInformation > 0 && (
                        <span className="base-extra-resources-item">Perception Information {resourcePools.perceptionInformation}</span>
                      )}
                    </div>
                  ) : (
                    <p className="hint base-sidebar-empty">No extra resources being produced right now.</p>
                  )}

                  <div className="base-resource-settings">
                    <button
                      type="button"
                      className="ghost base-resource-settings-btn" disabled={baseSource === 'account'}
                      onClick={() => setShowResourceSettings((s) => !s)}
                    >
                      {calculationSource === 'rotation' ? 'Current base settings' : 'Settings'}
                    </button>
                    {showResourceSettings && (
                      <div className="base-resource-settings-popup">
                        <div className="base-resource-settings-row">
                          <span className="base-resource-settings-label">Clue Exchange<InfoPopover label="Clue exchange help"><p>Affects Caper and Cairn’s Reception Room skills.</p></InfoPopover></span>
                          <button
                            type="button"
                            className="filter-chip" aria-pressed={clueExchangeActive}
                            onClick={() => persistSettings({ clueExchangeActive: !clueExchangeActive, moraleAbove12, swapPolicy })}
                          >
                            {clueExchangeActive ? 'On' : 'Off'}
                          </button>
                        </div>


                        <div className="base-resource-settings-row">
                          <span className="base-resource-settings-label">Morale<InfoPopover label="Morale help"><p>Morale assumption for Ling and Dusk in current-base estimates. Rotation carries morale between saved shifts.</p></InfoPopover></span>
                          <button
                            type="button"
                            className="filter-chip" aria-pressed={moraleAbove12}
                            onClick={() => persistSettings({ clueExchangeActive, moraleAbove12: !moraleAbove12, swapPolicy })}
                          >
                            {moraleAbove12 ? 'Above 12' : 'Below 12'}
                          </button>
                        </div>


                        <div className="base-resource-settings-row">
                          <span className="base-resource-settings-label">Swap timing<InfoPopover label="Swap operators help"><p>Sets the averaging window for ramping skills in current-base estimates. Rotation swaps at its scheduled shift changes.</p></InfoPopover></span>
                          <button
                            type="button"
                            className="filter-chip" aria-pressed={swapPolicy === 'onLogin'}
                            onClick={() =>
                              persistSettings({
                                clueExchangeActive,
                                moraleAbove12,
                                swapPolicy: swapPolicy === 'onLogin' ? 'onMoraleZero' : 'onLogin',
                              })
                            }
                          >
                            {swapPolicy === 'onLogin' ? 'Every login' : 'At 0 Morale'}
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                </div>

            <div className="base-summary-panel" role="region" aria-label="Base production summary">
              <div className="base-summary-row">
                <span className="base-summary-label">Calculate</span>
                <div className="base-calculation-controls"><div className="base-chip-row" role="radiogroup" aria-label="Calculation source" onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next = event.key === 'Home' ? 'current' : event.key === 'End' ? 'rotation' : calculationSource === 'current' ? 'rotation' : 'current';
                  setCalculationSettings(next);
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next === 'current' ? 0 : 1]?.focus({ preventScroll: true });
                }}>
                  <button type="button" className="filter-chip" role="radio" tabIndex={calculationSource === 'current' ? 0 : -1} aria-checked={calculationSource === 'current'} onClick={() => setCalculationSettings('current')}>Current Base</button>
                  <button type="button" className="filter-chip" role="radio" tabIndex={calculationSource === 'rotation' ? 0 : -1} aria-checked={calculationSource === 'rotation'} onClick={() => setCalculationSettings('rotation')}>Rotation</button>
                </div>
                  <button type="button" className="ghost" aria-haspopup="dialog" onClick={() => setShowRotationPlan(true)}>Edit rotation</button>
                </div>
              </div>
              {calculationSource === 'rotation' && <div className="base-rotation-summary" aria-label="Rotation calculation details">
                <p className="hint" role="status">{rotationCalculation?.problem ?? `${rotationDuration}h repeating cycle`}</p>
                {rotationWarnings.length > 0 && <details className="base-rotation-warning-summary"><summary>Rotation warnings</summary><ul>{rotationWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
              </div>}
              <div className="base-summary-row">
                <span className="base-summary-label">Login interval<InfoPopover label="Login interval help"><p>Collect every {loginInterval}h. Earlier Full or Dead times are highlighted in red. Rotation also collects at shift changes.</p></InfoPopover></span>
                <div className="base-chip-row" role="group" aria-label="Login interval">
                  {LOGIN_INTERVAL_OPTIONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="filter-chip" aria-pressed={loginInterval === h}
                      onClick={() => setCalculationSettings(calculationSource, h)}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {calculationSource === 'rotation' && <div className="base-summary-row"><label className="base-summary-label" htmlFor="rotation-outside-gold">Outside gold / day</label><NumberInput className="number-input" id="rotation-outside-gold" aria-label="Rotation outside gold per day" min={0} max={1000} step="0.1" value={rotationPlan.externalGold ?? 0} onChange={event => updateRotationPlan({ ...rotationPlan, externalGold: Math.min(1000, Math.max(0, Number(event.target.value) || 0)) })} /></div>}
              <div className="base-summary-row">
                <span className="base-summary-label">Period</span>
                <div className="base-chip-row" role="group" aria-label="Period">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="filter-chip" aria-pressed={statsPeriod === p}
                      onClick={() => setStatsPeriod(p)}
                    >
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const mult = STATS_PERIOD_MULTIPLIER[statsPeriod];
                const unit = statsPeriod === 'daily' ? 'day' : statsPeriod === 'weekly' ? 'week' : statsPeriod === 'monthly' ? 'month' : 'year';
                return (
                  <>
                    <div className="base-summary-row">
                      <span className="base-summary-label">Average EXP</span>
                      <span className="base-summary-value">
                        {dailyExpGreen > 0
                          ? renderDualStat(dailyExpGreen * mult, dailyExpRed * mult, (n) => `${Math.round(n).toLocaleString()} EXP/${unit}`)
                          : '—'}
                      </span>
                    </div>
                    <div className="base-summary-row">
                      <span className="base-summary-label">Average Pure Gold Made</span>
                      <span className="base-summary-value">
                        {dailyGoldMadeGreen > 0
                          ? renderDualStat(dailyGoldMadeGreen * mult, dailyGoldMadeRed * mult, (n) => `${n.toFixed(1)}/${unit}`)
                          : '—'}
                      </span>
                    </div>
                    <div className="base-summary-row">
                      <span className="base-summary-label">Average Pure Gold Sold</span>
                      <span className="base-summary-value">
                        {dailyGoldSoldGreen > 0 ? (
                          viewMode === 'cumulated' ? (
                            renderDualStat(dailyGoldSoldGreen * mult, dailyGoldSoldRed * mult, (n) => `${n.toFixed(1)}/${unit}`)
                          ) : (
                            <>
                              {renderDualStat(
                                (dailyGoldSoldGreen - dailyGoldFromProvisoGreen) * mult,
                                (dailyGoldSoldRed - dailyGoldFromProvisoRed) * mult,
                                (n) => `${n.toFixed(1)}/${unit}`
                              )}
                              {dailyGoldFromProvisoGreen > 0 && (
                                <span className="base-summary-extra">
                                  +{(dailyGoldFromProvisoGreen * mult).toFixed(1)} from Proviso
                                </span>
                              )}
                            </>
                          )
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                    <div className="base-summary-row">
                      <span className="base-summary-label">LMD made</span>
                      <span className="base-summary-value">
                        {dailyGoldWorthGreen > 0 ? (
                          viewMode === 'cumulated' ? (
                            renderDualStat(dailyGoldWorthGreen * mult, dailyGoldWorthRed * mult, (n) => `${Math.round(n).toLocaleString()} LMD/${unit}`)
                          ) : (
                            <>
                              {renderDualStat(
                                (dailyGoldWorthGreen - dailyExtraLmdFromOrdersGreen - dailyGoldFromProvisoGreen * 500) * mult,
                                (dailyGoldWorthRed - dailyExtraLmdFromOrdersRed - dailyGoldFromProvisoRed * 500) * mult,
                                (n) => `${Math.round(n).toLocaleString()} LMD/${unit}`
                              )}
                              {dailyExtraLmdFromOrdersGreen > 0 && (
                                <span className="base-summary-extra">
                                  +{Math.round(dailyExtraLmdFromOrdersGreen * mult).toLocaleString()} from order bonuses
                                </span>
                              )}
                              {dailyGoldFromProvisoGreen > 0 && (
                                <span className="base-summary-extra">
                                  +{Math.round(dailyGoldFromProvisoGreen * 500 * mult).toLocaleString()} from Proviso&apos;s extra gold
                                </span>
                              )}
                            </>
                          )
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                  </>
                );
              })()}
<div><span className="base-summary-label">Estimate details</span><InfoPopover label="Production estimate limits"><p>Rotation uses the optimizer’s repeating simulation, including morale thresholds, storage and gold-funded LMD. Ramping skills are approximate. Excludes drones, crafting and training.</p></InfoPopover></div>
            </div>
            </div>

            {/* Both throw work away, so they are .danger, side by side at their own
                width -- they were two full-width neutral ghosts. */}
            <div className="base-reset-row">
              <button type="button" className="danger" disabled={baseSource === 'account'} onClick={resetBase}>
                Reset base
              </button>
              <button type="button" className="danger" disabled={baseSource === 'account'} onClick={resetToSetup}>
                Start over (choose new formation)
              </button>
            </div>
        </>}
      </main>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/base", async () => {
  // This page reads name/rarity/faction/baseSkills -- getAllOperators()
  // returns every operator's ENTIRE record (all combat skills' per-level/
  // per-mastery text, talents, modules, promotion tables, full bios,
  // voice credits, ...), almost none of which the base simulator touches.
  const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name)).map((op) => ({
    name: op.name,
    rarity: op.rarity,
    faction: op.faction,
    class: op.class,
    branch: op.branch,
    baseSkills: op.baseSkills,
    // The names a Global rename replaced, which the calculator's special-skill keys may still use.
    ...(op.aliases?.length ? { aliases: op.aliases } : {}),
  }));

  return { props: { operators } };
}, {
  // A deployment may briefly read the previous release while its new content is
  // compiling. Complete pre-schema rosters here, rather than counting new groups
  // as empty. Once all named groups exist, the published table remains authoritative.
  finalize: async props => {
    // Combat forms share Amiya's one physical base worker, including older releases.
    const staffProps = { ...props, operators: props.operators.filter(op => !/^Amiya \(/.test(op.name)) };
    const table = props.__contentTables?.['base-group-rosters'] as Partial<BaseRosterData> | undefined;
    if (table && BASE_ROSTER_NAMES.every(name => Array.isArray(table[name]))) return staffProps;
    return { ...staffProps, __contentTables: { ...props.__contentTables, 'base-group-rosters': checkBaseRosters((await import('@/data/base-group-rosters.json')).default) } };
  },
  tables: {
    'base-workshop-recipes': async () => (await import('@/data/base-workshop-recipes.json')).default,
    'base-skill-slots': async () => (await import('@/data/base-skill-slots.json')).default,
    // Checked against the rosters the calculations name wherever it is read from data/.
    'base-group-rosters': async () => checkBaseRosters((await import('@/data/base-group-rosters.json')).default),
  },
});
