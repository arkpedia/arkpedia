import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, CSSProperties } from 'react';
import { getAllOperators } from '@/lib/operators/operators';
import type { BaseSkillSlot, BaseSkillSlots } from '@/lib/base/baseSkillSlots';
import { useReleaseTable } from '@/lib/content/context';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getBaseSkillIconPath, getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import { BaseOperator, BaseSkill } from '@/lib/operators/operatorTypes';
import {
  getFacilities,
  createEmptyAssignments,
  levelEditableFacilities,
  reconcileAssignments,
  migrateLegacySetup,
  defaultProductionSpots,
  presetSpots,
  productionKindCounts,
  canSetSpotKind,
  assignedKindCount,
  PRODUCTION_SPOTS,
  PRODUCTION_SPOT_IDS,
  PRODUCTION_KINDS,
  MAX_LEVEL_BY_KIND,
  MAX_PER_PRODUCTION_KIND,
  FACILITY_KIND_LABELS,
  BASE_PRESETS,
  BASE_PRESET_IDS,
  BasePresetId,
  presetLevels,
  matchingPreset,
  powerBalance,
  layoutProblems,
} from '@/lib/base/baseConfig';
import { BaseAssignments, FactoryProduct, FactoryProducts, DormitoryAmbience, SlotAssignment, BaseLayout, FacilityLevels, ProductionKind, ProductionSpots } from '@/lib/base/baseTypes';
import { calcProductivity, calcCapacity, calcCapacityPerOperator, calcOrderLimit, calcMorale, calcClueSpeed, calcReceptionRoomBaseSpeed, receptionRoomBaseContribution, calcDroneRate, calcFullTime, calcDeadTime, calcDailyProduction, calcControlCenterEffects, clueCollectionBonusFrom, calcControlCenterMoraleRelief, calcOffice, calcTradingPostFullTime, calcTradingPostGoldPerHourStandardized, calcTradingPostGoldAndLmdPerHour, formatHours, ControlCenterEffects, calcGreyProductivity, factoryYellowContribution, tradingPostYellowContribution, calcDormitoryRecovery, defaultDormitoryAmbience, dormitoryAmbienceCap } from '@/lib/base/baseProductivity';
import { FACTORY_SPECIAL_SKILLS, FactorySkillContext } from '@/lib/base/factorySpecialSkills';
import { checkBaseRosters, toBaseRosters, type BaseRosterData } from '@/lib/base/baseGroupRosters';
import { useAccount } from '@/lib/account/accountStore';
import { readRoster, ROSTER_EVENT } from '@/lib/planner/roster';
import { DORMITORY_SPECIAL_SKILLS, DORMITORY_PREFERRED_TARGET } from '@/lib/base/dormitorySpecialSkills';
import { RECEPTION_ROOM_SPECIAL_SKILLS, ReceptionRoomContext } from '@/lib/base/receptionRoomSpecialSkills';
import { POWER_PLANT_SPECIAL_SKILLS } from '@/lib/base/powerPlantSpecialSkills';
import { OFFICE_SPECIAL_SKILLS, OfficeContext } from '@/lib/base/officeSpecialSkills';
import { TRADING_POST_SPECIAL_SKILLS, TradingPostContext } from '@/lib/base/tradingPostSpecialSkills';
import { CONTROL_CENTER_SPECIAL_SKILLS, ControlCenterContext } from '@/lib/base/controlCenterSpecialSkills';
import { computeResourcePools, consumerBonuses, BaseResourceState, pureGoldProductionLineCount, ResourcePools, LayoutCounts } from '@/lib/base/baseResources';
import { RotationExperimentResult, runRotationExperiment, RotationFacilityLevels, initializeRotationExperimentData } from '@/lib/base/baseRotationExperiment';
import { initializeOptimizerData } from '@/lib/base/optimizerLogic';
import PageHeader from '@/components/ui/PageHeader';
import XButton from '@/components/ui/XButton';


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

const LOGIN_INTERVAL_OPTIONS = [12, 16, 20, 24];

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
}

const STORAGE_KEY = 'baseAssignments_v2';
const PRODUCT_STORAGE_KEY = 'baseFactoryProducts_v1';
const AMBIENCE_STORAGE_KEY = 'baseDormitoryAmbience_v1';
const SETTINGS_STORAGE_KEY = 'baseResourceSettings_v1';
// Hides the Rotation Experiment button/panel entirely -- set to true to
// bring it back. Deliberately not tied to process.env.NODE_ENV: this is
// meant to be under direct, explicit control regardless of build mode,
// not an accident of which environment happens to build the site.
const ROTATION_EXPERIMENT_ENABLED = false;
const PRODUCTIVITY_KINDS = new Set(['factory', 'tradingPost']);

function matchingSkills(op: BaseOperator, facilityLabel: string): BaseSkill[] {
  return (op.baseSkills || []).filter((bs) => bs.facility === facilityLabel);
}

export default function BasePage({ operators }: Props) {
  // The game's slot chains and the group rosters: game tables from this page's props
  // (lib/content/tables.mjs), so they follow the content release. Every calculation
  // below reads the rosters from here, and the special-skill handlers get them in
  // their context.
  const skillSlots = useReleaseTable<BaseSkillSlots>('base-skill-slots');
  const rosterData = useReleaseTable<BaseRosterData>('base-group-rosters');
  const rosters = useMemo(() => toBaseRosters(rosterData), [rosterData]);
  const { ELITE_OPERATOR, ABYSSAL_HUNTERS, OPERATION_PLATFORM, BLACKSTEEL_WORLDWIDE, TEAM_RAINBOW, DURIN, PINUS_SYLVESTRIS, WANDERING_MEDIC, SUI, KNIGHTS, LATERANO, RHINE_LAB } = rosters;
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

  const layoutCounts = useMemo<LayoutCounts>(() => {
    const built = productionKindCounts(productionSpots, facilityLevels);
    return {
      tradingPostCount: built.tradingPost,
      factoryCount: built.factory,
      powerPlantCount: built.powerPlant,
    };
  }, [productionSpots, facilityLevels]);
  // Philae's drone rate scales with every Dormitory's own level added together,
  // so this has to follow the player's chosen levels, not a fixed 4 x 5.
  const totalDormitoryLevels = useMemo(
    () => FACILITIES.filter((f) => f.kind === 'dormitory').reduce((sum, f) => sum + f.level, 0),
    [FACILITIES]
  );

  const [assignments, setAssignments] = useState<BaseAssignments>(createEmptyAssignments(FACILITIES));
  const [factoryProducts, setFactoryProducts] = useState<FactoryProducts>({});
  const [dormitoryAmbience, setDormitoryAmbience] = useState<DormitoryAmbience>({});
  const [activeFacility, setActiveFacility] = useState<string | null>(null);
  // The facility popover has two faces: the slots you assign operators to,
  // and the gear that changes what that one building IS. Same popover, so
  // both get the measured placement and edge-clamping for free.

  const baseRoomPanelRef = useRef<HTMLDivElement>(null);
  const baseScrollBeforeRoomPanelRef = useRef<number | null>(null);
  const [breakdownFacilityId, setBreakdownFacilityId] = useState<string | null>(null);
  const [roomPanelFacilityId, setRoomPanelFacilityId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cumulated' | 'separated'>('cumulated');
  const [loginInterval, setLoginInterval] = useState(24);
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
  const ownedOperators = useMemo(() => (account ? new Set(account.operators) : null), [account]);
  const [includeUnowned, setIncludeUnowned] = useState(false);
  const [rosterElite, setRosterElite] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => setRosterElite(Object.fromEntries(Object.entries(readRoster()).map(([name, owned]) => [name, owned.elite])));
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
    return (['Base', 'Elite 1', 'Elite 2'] as const)[ownedOperators?.has(name) ? Math.min(2, Math.max(0, rosterElite[name] ?? 0)) : 0];
  }
  const [statsPeriod, setStatsPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const STATS_PERIOD_MULTIPLIER: Record<typeof statsPeriod, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };

  // --- Base grid zoom/pan panel: the facility boxes live in their own
  // zoomable panel, starting zoomed out so the whole base is visible at
  // once (with correspondingly tiny text), and zooming in via mouse
  // wheel, the slider control, or touch pinch reveals detail. panOffset
  // is in the same coordinate space as CSS transform translate, applied
  // BEFORE scale (see the stage's transform below), with the origin at
  // the viewport's own center (matching transform-origin: center center)
  // so zoom-toward-a-point math stays simple.
  const BASE_MIN_ZOOM = 0.35;
  const BASE_MAX_ZOOM = 2.5;
  const BASE_INITIAL_ZOOM = 0.5;
  const [baseZoom, setBaseZoom] = useState(BASE_INITIAL_ZOOM);
  const baseZoomRef = useRef(BASE_INITIAL_ZOOM);
  useEffect(() => {
    baseZoomRef.current = baseZoom;
  }, [baseZoom]);
  const [basePan, setBasePan] = useState({ x: 0, y: 0 });
  const basePanRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    basePanRef.current = basePan;
  }, [basePan]);
  // Text renders blurry under a CSS scale transform when the stage is
  // kept permanently GPU-layer-promoted (will-change: transform) --
  // the browser scales up a bitmap of the layer instead of
  // re-rasterizing crisp vector text at the final size. Only promoting
  // during active interaction, and dropping it ~150ms after the user
  // stops, keeps zooming/panning smooth while letting the RESTING frame
  // render at full text sharpness.
  const [baseInteracting, setBaseInteracting] = useState(false);
  const baseInteractingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseViewportRef = useRef<HTMLDivElement>(null);
  const baseDragActiveRef = useRef(false);
  const baseDragMovedRef = useRef(false);
  const baseDragStartRef = useRef({ x: 0, y: 0 });
  const baseDragStartPanRef = useRef({ x: 0, y: 0 });
  const basePinchStartDistRef = useRef<number | null>(null);
  const basePinchStartZoomRef = useRef(BASE_INITIAL_ZOOM);

  function markBaseInteracting() {
    setBaseInteracting(true);
    if (baseInteractingTimeoutRef.current) clearTimeout(baseInteractingTimeoutRef.current);
    baseInteractingTimeoutRef.current = setTimeout(() => setBaseInteracting(false), 150);
  }

  function clampBaseZoom(z: number) {
    return Math.min(BASE_MAX_ZOOM, Math.max(BASE_MIN_ZOOM, z));
  }

  function zoomBaseToward(nextZoomRaw: number, anchorX: number, anchorY: number) {
    markBaseInteracting();
    // Wheel, slider and pinch all come through here, so this one line is
    // enough to stop the fit-to-view observer from overriding the user.
    baseUserZoomedRef.current = true;
    setBaseZoom((prevZoom) => {
      const nextZoom = clampBaseZoom(nextZoomRaw);
      const ratio = nextZoom / prevZoom;
      setBasePan((prevPan) => ({
        x: anchorX - (anchorX - prevPan.x) * ratio,
        y: anchorY - (anchorY - prevPan.y) * ratio,
      }));
      return nextZoom;
    });
  }

  // This is a page on a website, not a standalone map app, so a plain
  // wheel over the base scrolls the page like it does everywhere else --
  // that is what the reader almost always means by it. Zooming is the
  // slider's job, with ctrl/cmd + wheel kept as the usual shortcut for
  // anyone who wants it.
  //
  // React attaches onWheel as a passive listener by default (for scroll
  // performance), so preventDefault() inside a React synthetic wheel
  // handler is frequently ignored by the browser. A real, non-passive
  // native listener is the only reliable way to actually stop the page
  // scrolling when we DO handle the event.
  useEffect(() => {
    const viewport = baseViewportRef.current;
    if (!viewport) return;
    function nativeWheelHandler(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return; // let the page scroll
      e.preventDefault();
      const rect = viewport!.getBoundingClientRect();
      const anchorX = e.clientX - rect.left - rect.width / 2;
      const anchorY = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomBaseToward(baseZoomRef.current * factor, anchorX, anchorY);
    }
    viewport.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => viewport.removeEventListener('wheel', nativeWheelHandler);
  }, [roomPanelFacilityId, setupComplete]);

  function handleBaseSliderChange(nextZoom: number) {
    // Slider has no cursor position to anchor to -- zooms around the
    // viewport's own center instead.
    zoomBaseToward(nextZoom, 0, 0);
  }

  function baseTouchDistance(touches: TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function handleBasePointerDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault(); // stops the browser's native drag-to-select text behavior from ever starting
    markBaseInteracting();
    baseDragActiveRef.current = true;
    baseDragMovedRef.current = false;
    baseDragStartRef.current = { x: e.clientX, y: e.clientY };
    baseDragStartPanRef.current = { ...basePan };
  }
  function handleBasePointerMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!baseDragActiveRef.current) return;
    markBaseInteracting();
    const dx = e.clientX - baseDragStartRef.current.x;
    const dy = e.clientY - baseDragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) baseDragMovedRef.current = true;
    setBasePan({ x: baseDragStartPanRef.current.x + dx, y: baseDragStartPanRef.current.y + dy });
  }
  function handleBasePointerUp() {
    baseDragActiveRef.current = false;
  }

  // Same passive-listener issue as wheel above -- React's synthetic
  // onTouchStart/onTouchMove are passive by default, so preventDefault()
  // on the pinch-zoom case wouldn't reliably stop the page itself from
  // scrolling/zooming underneath a two-finger pinch. Native listeners
  // with { passive: false } are the reliable fix, same pattern as wheel.
  useEffect(() => {
    const viewport = baseViewportRef.current;
    if (!viewport) return;

    function nativeTouchStart(e: TouchEvent) {
      markBaseInteracting();
      if (e.touches.length === 2) {
        basePinchStartDistRef.current = baseTouchDistance(e.touches);
        basePinchStartZoomRef.current = baseZoomRef.current;
        baseDragActiveRef.current = false;
      } else if (e.touches.length === 1) {
        baseDragActiveRef.current = true;
        baseDragMovedRef.current = false;
        baseDragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        baseDragStartPanRef.current = { ...basePanRef.current };
      }
    }
    function nativeTouchMove(e: TouchEvent) {
      markBaseInteracting();
      if (e.touches.length === 2 && basePinchStartDistRef.current) {
        e.preventDefault();
        const dist = baseTouchDistance(e.touches);
        const scaleFactor = dist / basePinchStartDistRef.current;
        setBaseZoom(clampBaseZoom(basePinchStartZoomRef.current * scaleFactor));
      } else if (e.touches.length === 1 && baseDragActiveRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - baseDragStartRef.current.x;
        const dy = e.touches[0].clientY - baseDragStartRef.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) baseDragMovedRef.current = true;
        setBasePan({ x: baseDragStartPanRef.current.x + dx, y: baseDragStartPanRef.current.y + dy });
      }
    }
    function nativeTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) basePinchStartDistRef.current = null;
      if (e.touches.length === 0) baseDragActiveRef.current = false;
    }

    viewport.addEventListener('touchstart', nativeTouchStart, { passive: false });
    viewport.addEventListener('touchmove', nativeTouchMove, { passive: false });
    viewport.addEventListener('touchend', nativeTouchEnd, { passive: false });
    return () => {
      viewport.removeEventListener('touchstart', nativeTouchStart);
      viewport.removeEventListener('touchmove', nativeTouchMove);
      viewport.removeEventListener('touchend', nativeTouchEnd);
    };
  }, [roomPanelFacilityId, setupComplete]);

  const [baseFullscreen, setBaseFullscreen] = useState(false);

  // The grid is ~1003x1060 CSS px at 1:1 (see .base-grid) in a view that is
  // deliberately the operator picker's height, so that swapping between them
  // never changes the page's height. That means the grid's width fits and its
  // height does not, on purpose: fitBaseView scales to the width and the rest
  // of the base is a pan away.
  //
  // A hard-coded starting zoom was wrong for every screen -- 0.5 clipped the
  // bottom row against the view's own edge before anyone touched a control --
  // and fitting BOTH axes was worse, dropping to ~0.6 and taking the tile
  // labels down to ~7px. Measure the width, cap at 1:1, and re-fit when the
  // view changes size, unless the user has taken the zoom over themselves.
  const baseGridRef = useRef<HTMLDivElement>(null);
  const baseUserZoomedRef = useRef(false);

  function fitBaseView() {
    const viewport = baseViewportRef.current;
    const grid = baseGridRef.current;
    if (!viewport || !grid) return;
    // offsetWidth/Height are layout values, so they report the grid's real
    // 1003x1149 regardless of the scale currently applied to the stage.
    const gridWidth = grid.offsetWidth;
    const gridHeight = grid.offsetHeight;
    if (!gridWidth || !gridHeight) return;
    const breathingRoom = 16;
    // WIDTH only, and capped at 1:1. Fitting both axes is what dropped the
    // zoom to ~0.52 and took the tile labels down to ~6px: the view is
    // deliberately the picker's height, so the grid's height is not meant to
    // fit and the rest of the base is a pan away. Scaling up past 1:1 would
    // only blur it; zooming in further stays available on the slider.
    const fit = clampBaseZoom(Math.min(1, (viewport.clientWidth - breathingRoom) / gridWidth));
    setBaseZoom(fit);
    // Open on the TOP of the base, not the middle. The stage is centred in
    // the view, so with a grid taller than the view the default would show
    // the middle floors; shifting down by half the overhang puts the first
    // floor at the top. Pan is applied before the scale in the stage's
    // transform, so it is in screen pixels.
    const overhang = gridHeight * fit - (viewport.clientHeight - breathingRoom);
    setBasePan({ x: 0, y: overhang > 0 ? overhang / 2 : 0 });
  }

  useEffect(() => {
    const viewport = baseViewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    // Fires once on observe, which is what gives us the initial fit, and
    // then on window resize, fullscreen, and the room panel handing the
    // viewport back -- each of which mounts or resizes the box we measure.
    const observer = new ResizeObserver(() => {
      if (!baseUserZoomedRef.current) fitBaseView();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [roomPanelFacilityId, baseFullscreen, setupComplete]);

  // --- Facility popover placement ---------------------------------------
  // The popover lives inside the zoom stage so that it stays glued to its
  // facility while the base is panned, which also puts it under the
  // viewport's overflow: hidden. Opening downwards therefore fails for any
  // facility in the lower part of the view: Dormitory 3 was measured
  // clipping 132px of its 236px popover, slots included, leaving nothing
  // to click. That used to be worked around with a hard-coded set of two
  // facilities that opened upwards instead, which can only ever be correct
  // at one particular zoom and pan.
  //
  // So measure, then place. The offsets are applied as a translate placed
  // AFTER the counter-scale in the transform list, which makes them screen
  // pixels at any zoom -- verified in the browser rather than derived: a
  // trailing translateX(100px) moves the popover 100px at 0.5x zoom, the
  // same translate ahead of the scale moves it 50px.
  const BASE_POPOVER_GAP = 10; // screen px between a facility and its popover
  const BASE_POPOVER_EDGE = 8; // screen px kept clear of the viewport's edges
  const basePopoverRef = useRef<HTMLDivElement>(null);
  const [basePopoverPlacement, setBasePopoverPlacement] = useState<{
    dx: number;
    dy: number;
    above: boolean;
    maxHeight: number;
    arrowX: number;
  } | null>(null);
  // Bumped on scroll/resize purely to re-run the placement below.
  const [basePopoverNudge, setBasePopoverNudge] = useState(0);

  useLayoutEffect(() => {
    if (!activeFacility) {
      setBasePopoverPlacement((prev) => (prev === null ? prev : null));
      return;
    }
    const popover = basePopoverRef.current;
    const viewport = baseViewportRef.current;
    const tile = popover?.parentElement;
    if (!popover || !viewport || !tile) return;

    const viewportBox = viewport.getBoundingClientRect();
    const tileBox = tile.getBoundingClientRect();
    // Layout values again, deliberately: reading the popover's own
    // getBoundingClientRect() here would include the translate this effect
    // set last time and feed each placement back into the next one.
    const popoverWidth = popover.offsetWidth;

    // The viewport is normally taller than the space left below the page
    // header, so its lower part sits past the bottom of the browser window.
    // Clamping to the viewport alone therefore still leaves popovers
    // off-screen -- "if the bottom is cut off it doesn't even show". Clamp
    // into the part of the viewport that is genuinely on screen instead.
    const visible = {
      top: Math.max(viewportBox.top, 0),
      bottom: Math.min(viewportBox.bottom, window.innerHeight),
      left: Math.max(viewportBox.left, 0),
      right: Math.min(viewportBox.right, window.innerWidth),
    };
    // With the viewport scrolled nearly out of view there is no band worth
    // clamping into, and squeezing a popover into a 20px sliver would be
    // worse than letting the page scroll to it. Fall back to the viewport.
    const MIN_BAND = 200;
    if (visible.bottom - visible.top < MIN_BAND) {
      visible.top = viewportBox.top;
      visible.bottom = viewportBox.bottom;
    }
    if (visible.right - visible.left < MIN_BAND) {
      visible.left = viewportBox.left;
      visible.right = viewportBox.right;
    }

    const maxHeight = Math.max(120, visible.bottom - visible.top - BASE_POPOVER_EDGE * 2);
    // offsetHeight, not scrollHeight: scrollHeight reads ~9px taller here
    // because the slot grid's margins overflow the padding box, and that
    // difference lands as visible slack between popover and facility. Once
    // maxHeight is clamping (a popover taller than the whole viewport)
    // offsetHeight is already the clamped height, so the min() is a no-op
    // and the popover just gets pinned inside and scrolls.
    const height = Math.min(popover.offsetHeight, maxHeight);

    // Below is the default; flip above only when below genuinely doesn't
    // fit and above is the roomier side.
    const roomBelow = visible.bottom - tileBox.bottom - BASE_POPOVER_GAP - BASE_POPOVER_EDGE;
    const roomAbove = tileBox.top - visible.top - BASE_POPOVER_GAP - BASE_POPOVER_EDGE;
    const above = roomBelow < height && roomAbove > roomBelow;

    // Where the CSS anchor alone puts it: top: 100% is the facility's bottom
    // edge exactly, with no margin (the gap is applied here instead, so that
    // it stays 10 screen px rather than shrinking with the zoom), and
    // left: 50% + translateX(-50%) centres it on the facility. dx/dy are
    // corrections from that point.
    const anchorTop = tileBox.bottom;
    const anchorLeft = tileBox.left + tileBox.width / 2 - popoverWidth / 2;

    const wantedTop = above
      ? tileBox.top - BASE_POPOVER_GAP - height
      : tileBox.bottom + BASE_POPOVER_GAP;
    const lowestTop = Math.max(visible.top + BASE_POPOVER_EDGE, visible.bottom - BASE_POPOVER_EDGE - height);
    const top = Math.min(Math.max(wantedTop, visible.top + BASE_POPOVER_EDGE), lowestTop);

    // A 5-slot Dormitory popover is ~508px wide, so on a narrow viewport it
    // can be wider than the space it has to fit in; centre it there rather
    // than clamping it to one edge.
    const visibleWidth = visible.right - visible.left;
    const left =
      popoverWidth >= visibleWidth - BASE_POPOVER_EDGE * 2
        ? visible.left + (visibleWidth - popoverWidth) / 2
        : Math.min(
            Math.max(anchorLeft, visible.left + BASE_POPOVER_EDGE),
            visible.right - BASE_POPOVER_EDGE - popoverWidth,
          );

    const arrowX = Math.min(
      Math.max(tileBox.left + tileBox.width / 2 - left, 14),
      Math.max(14, popoverWidth - 14),
    );

    const next = {
      dx: Math.round(left - anchorLeft),
      dy: Math.round(top - anchorTop),
      above,
      maxHeight: Math.round(maxHeight),
      arrowX: Math.round(arrowX),
    };
    setBasePopoverPlacement((prev) =>
      prev &&
      prev.dx === next.dx &&
      prev.dy === next.dy &&
      prev.above === next.above &&
      prev.maxHeight === next.maxHeight &&
      prev.arrowX === next.arrowX
        ? prev
        : next,
    );
    // assignments and factoryProducts are here because filling a slot
    // changes the popover's own height, which changes where it has to go.
  }, [activeFacility, baseZoom, basePan.x, basePan.y, baseFullscreen, assignments, factoryProducts, dormitoryAmbience, basePopoverNudge]);

  // The operator picker replaces the base view in place, so opening it while
  // the page is scrolled down the base leaves its own header -- Back, the
  // search box, the Elite toggles -- above the top of the window. Bring the
  // panel's top into view, and put the page back where it was on the way out,
  // so picking an operator doesn't cost you your place on the base.
  //
  // The remembered position is only set when we actually move the page, so
  // closing the panel restores nothing if opening it scrolled nothing.
  useEffect(() => {
    if (roomPanelFacilityId) {
      const panel = baseRoomPanelRef.current;
      if (!panel) return;
      const margin = 24;
      const top = panel.getBoundingClientRect().top;
      if (top >= margin) return;
      // Instant, not smooth: a smooth scroll is an animation that anything
      // else touching the scroll position cancels, and the page height changes
      // underneath this one. The jump is the point anyway -- the header has to
      // be on screen before the first click, not a moment later.
      window.scrollTo({ top: window.scrollY + top - margin, behavior: 'auto' });
      return;
    }
    const previous = baseScrollBeforeRoomPanelRef.current;
    if (previous === null) return;
    baseScrollBeforeRoomPanelRef.current = null;
    // Set once now and again on the next frame. The panel is short and the
    // base view that replaces it is tall, and the browser's scroll anchoring
    // adjusts the scroll position during the layout that follows -- which
    // silently undid a single scrollTo here, landing back within ~12px of
    // where the panel had been rather than where the base was left.
    window.scrollTo({ top: previous, behavior: 'auto' });
    requestAnimationFrame(() => window.scrollTo({ top: previous, behavior: 'auto' }));
  }, [roomPanelFacilityId]);

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
      if (showResourceSettings && !target.closest('.base-resource-settings')) {
        setShowResourceSettings(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setActiveFacility(null);
      setShowResourceSettings(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeFacility, showResourceSettings]);

  // Scrolling the page slides the on-screen band that the placement above
  // clamped into, so it has to be recomputed as the page moves -- otherwise
  // a scroll walks the popover straight back off the bottom of the screen.
  useEffect(() => {
    if (!activeFacility) return;
    let frame = 0;
    const nudge = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setBasePopoverNudge((n) => n + 1);
      });
    };
    window.addEventListener('scroll', nudge, { passive: true });
    window.addEventListener('resize', nudge);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', nudge);
      window.removeEventListener('resize', nudge);
    };
  }, [activeFacility]);

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

  function toggleBaseFullscreen() {
    markBaseInteracting();
    setBaseFullscreen((v) => !v);
    // Fresh zoom/pan each time, matching the same reset-on-toggle
    // behavior already used for the world map's fullscreen view. Handing
    // the zoom back to fit-to-view is what makes fullscreen actually fill
    // the screen -- the resize this toggle causes is picked up by the
    // observer, which re-fits to the new viewport size.
    baseUserZoomedRef.current = false;
    setBasePan({ x: 0, y: 0 });
  }

  // Escape exits fullscreen, matching standard fullscreen UX elsewhere
  // on the site (world map).
  useEffect(() => {
    if (!baseFullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setBaseFullscreen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [baseFullscreen]);


  useEffect(() => {
    try {
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
      if (savedAssignments) setAssignments({ ...createEmptyAssignments(FACILITIES), ...remapIds(JSON.parse(savedAssignments)) });
      const savedProducts = window.localStorage.getItem(PRODUCT_STORAGE_KEY);
      if (savedProducts) setFactoryProducts(remapIds(JSON.parse(savedProducts)));
      const savedAmbience = window.localStorage.getItem(AMBIENCE_STORAGE_KEY);
      if (savedAmbience) setDormitoryAmbience(remapIds(JSON.parse(savedAmbience)));
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

  // Debug-only: exposes the full operator dataset to the dev console for
  // manual inspection/extraction (e.g. window.__operators.filter(...)).
  // Read-only, doesn't affect app behavior.
  useEffect(() => {
    (window as unknown as { __operators?: BaseOperator[] }).__operators = operators;
  }, [operators]);

  function persist(next: BaseAssignments) {
    setAssignments(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function persistProduct(facilityId: string, product: FactoryProduct) {
    const next = { ...factoryProducts, [facilityId]: product };
    setFactoryProducts(next);
    try {
      window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function persistAmbience(facilityId: string, level: number, ambience: number) {
    const clamped = Math.max(0, Math.min(ambience, dormitoryAmbienceCap(level)));
    const next = { ...dormitoryAmbience, [facilityId]: clamped };
    setDormitoryAmbience(next);
    try {
      window.localStorage.setItem(AMBIENCE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function persistSettings(next: { clueExchangeActive: boolean; moraleAbove12: boolean; swapPolicy: SwapPolicy }) {
    setClueExchangeActive(next.clueExchangeActive);
    setMoraleAbove12(next.moraleAbove12);
    setSwapPolicy(next.swapPolicy);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Hours a ramping skill gets to climb before its operator is pulled out.
  // `hoursUntilMoraleGone` is Infinity for a room that never drains.
  function rampWindow(hoursUntilMoraleGone: number): number {
    const untilSwap = swapPolicy === 'onLogin' ? Math.min(loginInterval, hoursUntilMoraleGone) : hoursUntilMoraleGone;
    return Math.min(24, untilSwap);
  }

  function assignedElsewhere(name: string): string | null {
    for (const [facilityId, slots] of Object.entries(assignments)) {
      if (slots.some((s) => s?.operatorName === name)) return facilityId;
    }
    return null;
  }

  // Places immediately into the first empty slot -- no separate "select
  // then click a slot" step anymore, per your request.
  function clearSlot(facilityId: string, slotIndex: number) {
    const next = { ...assignments, [facilityId]: [...assignments[facilityId]] };
    next[facilityId][slotIndex] = null;
    persist(next);
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
    slots[emptyIdx] = { operatorName, eliteLevel };
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
    next[facilityId][slotIndex] = { ...slot, eliteLevel };
    persist(next);
  }

  /** 'Base'/'Level 30' -> E0, for the chips and card corners, where the full
   * words don't fit and the game's own shorthand is what players read. */
  function eliteShort(eliteLevel: string | null | undefined): 'E0' | 'E1' | 'E2' {
    return eliteLevel === 'Elite 2' ? 'E2' : eliteLevel === 'Elite 1' ? 'E1' : 'E0';
  }

  function persistSetup(nextSpots: ProductionSpots, nextFacilityLevels: FacilityLevels, nextComplete: boolean) {
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
    persist(createEmptyAssignments(FACILITIES));
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

  function toggleFacility(id: string) {
    if (baseDragMovedRef.current) {
      baseDragMovedRef.current = false;
      return;
    }
    setActiveFacility((current) => (current === id ? null : id));
  }

  /** Opens the operator picker for a facility, remembering where the page was
   * first. This has to happen HERE rather than in an effect: the picker panel
   * is far shorter than the base view it replaces, so the page shrinks the
   * moment it mounts and the browser clamps the scroll position down to the
   * new maximum. By the time an effect runs, the position worth returning to
   * has already been overwritten -- measured at 760 becoming 298 before a
   * single line of our own code got to look at it. */
  function openRoomPanel(facilityId: string) {
    baseScrollBeforeRoomPanelRef.current = window.scrollY;
    setRoomPanelFacilityId(facilityId);
  }

  /** The gear and the room itself open the SAME panel now -- it carries the
   * building's type and level and its operator slots together, because
   * "change this room" and "who works here" were never separate questions.
   * The gear still exists on an unbuilt plot, where there are no slots to
   * click and it is the only way in. */
  function openFacilitySettings(id: string) {
    if (baseDragMovedRef.current) {
      baseDragMovedRef.current = false;
      return;
    }
    setActiveFacility((current) => (current === id ? null : id));
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

  // Two skills are treated as "the same skill, just upgraded" if their
  // descriptions match word-for-word once numbers are stripped out --
  // e.g. "...productivity +5%..." and "...productivity +10%..." are the
  // same skill at different levels, since upgrades typically only change
  // the number and leave the wording identical. Anything that differs
  // beyond the numbers is treated as a genuinely separate skill.
  function normalizeForComparison(description: string | null): string {
    if (!description) return '';
    return description.replace(/\d+(\.\d+)?%?/g, '#').trim();
  }

  // Confirmed against the raw scraped skill data: many skill names are
  // stored raw-concatenated with "ReplacesX" (e.g. "Master of Machines
  // βReplacesMaster of Machines α", no space), which breaks any special
  // -case handler lookup keyed on the clean name. Strip it once, here,
  // rather than patching every individual handler key.
  function cleanSkillName(name: string | null): string | null {
    if (!name) return name;
    const idx = name.indexOf('Replaces');
    return idx === -1 ? name : name.slice(0, idx).trim();
  }

  // Icon files/lookups use the 'Elite 0' naming convention, but this
  // simulator's own data model stores that same tier internally as
  // 'Base' -- the text-label display already converts this inline in a
  // couple of places (lvl === 'Base' ? 'Elite 0' : lvl), but the icon
  // path lookups were missing the same conversion, which is what caused
  // Elite 0 operators to render the wrong badge.
  function eliteIconLabel(eliteLevel: string | null): string | null {
    if (!eliteLevel) return null;
    return eliteLevel === 'Base' ? 'Elite 0' : eliteLevel;
  }

  // The name a raw name explicitly says it replaces, if any -- e.g.
  // "Workflow OptimizationReplacesScientific Restructuring" -> "Scientific
  // Restructuring". More reliable than description-diffing for upgrades
  // that add a genuinely new clause (confirmed case: Snegurochka's Elite
  // 1 skill adds an entire extra productivity-bonus phrase her Base skill
  // doesn't have, so normalizeForComparison alone can't match them).
  function extractReplacedName(rawName: string | null): string | null {
    if (!rawName) return null;
    const idx = rawName.indexOf('Replaces');
    return idx === -1 ? null : rawName.slice(idx + 'Replaces'.length).trim();
  }

  const ELITE_ORDER = ['Base', 'Elite 1', 'Elite 2'];
  function combinedSkillsForElite(op: BaseOperator, facilityLabel: string, eliteLevel: string | null): BaseSkill[] {
    // Level 30 is functionally the same tier as Base -- 1-star operators
    // have no Elite promotion path at all, so a slot tagged 'Level 30'
    // should resolve exactly like a Base-tier slot would.
    const normalizedEliteLevel = eliteLevel === 'Level 30' ? 'Base' : eliteLevel;
    const currentIndex = ELITE_ORDER.indexOf(normalizedEliteLevel || '');
    const facilitySkills = (op.baseSkills || []).filter((bs) => bs.facility === facilityLabel);
    const isBaseTierSkill = (bs: BaseSkill) => !bs.eliteLevel || bs.eliteLevel === 'Base' || bs.eliteLevel === 'Level 30';
    if (currentIndex === -1) {
      return facilitySkills.filter((bs) => bs.eliteLevel === normalizedEliteLevel).map((bs) => ({ ...bs, name: cleanSkillName(bs.name), rawName: bs.name }));
    }
    // Where the game's own slot data covers this operator, it is
    // authoritative and the text heuristics below are skipped entirely --
    // see lib/base/baseSkillSlots.ts for what a "slot" is (the table itself is
    // data/base-skill-slots.json, from this page's props). It also
    // supersedes the scraped elite tag, which is occasionally wrong:
    // Varkáris's Pride of a Hero β is tagged Elite 2 here but the game
    // unlocks it at Elite 1, so an Elite 1 Varkáris was showing the weaker
    // α. Anything the table doesn't cover (Ukusik, and any operator added
    // after the last gamedata refresh) still falls through to the
    // heuristics.
    // The record's own slot (from building_data, every nightly) first; the static table for
    // records that do not carry one yet.
    const slotted = facilitySkills.map((bs) => ({
      bs,
      meta: typeof bs.slot === 'number' && typeof bs.phase === 'number'
        ? { slot: bs.slot, phase: bs.phase, level: bs.level ?? 1 }
        : skillSlots[`${op.name}|${cleanSkillName(bs.name)}|${bs.eliteLevel || 'Base'}`],
    }));
    if (slotted.length > 0 && slotted.every((entry) => entry.meta)) {
      const bestBySlot = new Map<number, { bs: BaseSkill; meta: BaseSkillSlot }>();
      for (const entry of slotted) {
        const meta = entry.meta as BaseSkillSlot;
        if (meta.phase > currentIndex) continue; // not promoted far enough for this step yet
        const held = bestBySlot.get(meta.slot);
        // Within one slot the highest unlocked step wins, and only that one
        // applies. Operator level isn't modelled anywhere on this page, so a
        // level-gated step counts as reached -- the same "levelled far enough
        // for its tier" assumption the rest of the page already makes. That
        // is what promotes Durin's Sleepiness (+0.25) over Laziness (+0.2);
        // the two descriptions are identical once numbers are stripped, so
        // the old dedupe kept whichever came first, which was the weaker one.
        if (!held || meta.phase > held.meta.phase || (meta.phase === held.meta.phase && meta.level > held.meta.level)) {
          bestBySlot.set(meta.slot, { bs: entry.bs, meta });
        }
      }
      return [...bestBySlot.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, entry]) => ({ ...entry.bs, name: cleanSkillName(entry.bs.name), rawName: entry.bs.name }));
    }

    const result: BaseSkill[] = [];
    const explicitlyReplacedNames = new Set<string>();
    for (let i = currentIndex; i >= 0; i--) {
      // The Base tier (i === 0) additionally picks up any Level 30
      // skills alongside actual Base-tagged ones, so both apply together
      // -- same treatment as an operator with two genuinely concurrent
      // skills at the same tier.
      const tierSkills = i === 0 ? facilitySkills.filter(isBaseTierSkill) : facilitySkills.filter((bs) => bs.eliteLevel === ELITE_ORDER[i]);
      for (const sk of tierSkills) {
        const replaced = extractReplacedName(sk.name);
        if (replaced) explicitlyReplacedNames.add(replaced);
        const cleanedName = cleanSkillName(sk.name);
        if (cleanedName && explicitlyReplacedNames.has(cleanedName)) continue; // a higher-Elite skill already processed explicitly replaces this one
        // A lower-Elite skill sharing the exact same name as one already
        // kept (from a higher tier, since we iterate highest-to-lowest)
        // is the same ability just upgraded, even without an explicit
        // "Replaces" suffix or identical description text -- a repeated
        // skill name IS the signal that it's the same slot.
        if (cleanedName && result.some((r) => r.name === cleanedName)) continue;
        const normalized = normalizeForComparison(sk.description);
        if (!result.some((r) => normalizeForComparison(r.description) === normalized)) result.push({ ...sk, name: cleanedName, rawName: sk.name });
      }
    }
    return result;
  }

  // Returns EVERY skill for this operator+facility, accounting for
  // elite-level inheritance -- if this operator's Elite 2 skill is a
  // genuinely different skill than their Elite 0/Elite 1 one (different
  // wording beyond just the numbers), both apply together once placed
  // at Elite 2. If it's the same skill just upgraded, only the
  // higher-elite version is used, not both.
  function skillsFor(slot: SlotAssignment | null, facilityLabel: string): BaseSkill[] {
    if (!slot) return [];
    const op = operators.find((o) => o.name === slot.operatorName);
    if (!op) return [];
    return combinedSkillsForElite(op, facilityLabel, slot.eliteLevel);
  }

  interface FacilityBreakdownLine {
    operatorName: string;
    skillName: string | null; // null for generic (regex-parsed) skills
    rawValue: number;
    included: boolean;
    reason: string;
    formula?: string; // the skill's own derivation, when its handler provides one -- not every handler has this populated yet
    note?: string; // non-numeric/unmodeled caveat text, when its handler provides one -- shown in the breakdown panel instead of cluttering the facility tile
  }
  interface FacilityBreakdown {
    filledCount: number;
    greyProductivity: number;
    greyFormula: string;
    overrideActive: boolean;
    lines: FacilityBreakdownLine[];
    finalYellow: number;
    effectiveProductivity: number;
  }

  // Returns the rate AND the per-skill lines behind it, so the Power Plant can
  // offer the same "?" explanation the other facilities do -- a bare +13%
  // doesn't say whether it came from a base drone skill or from a Rhine Lab
  // headcount that might be counting the wrong people.
  function computePowerPlantDroneRate(
    f: (typeof FACILITIES)[number],
    filled: SlotAssignment[]
  ): { rate: number; lines: FacilityBreakdownLine[] } {
    const genericDescriptions: (string | null)[] = [];
    const genericLines: { operatorName: string; skillName: string | null; description: string | null }[] = [];
    const specialEntries: { slot: SlotAssignment; skillName: string | null; handler: (typeof POWER_PLANT_SPECIAL_SKILLS)[string] }[] = [];
    for (const slot of filled) {
      for (const sk of skillsFor(slot, f.label)) {
        const key = `${slot.operatorName}|${sk.name}`;
        if (key in POWER_PLANT_SPECIAL_SKILLS) {
          specialEntries.push({ slot, skillName: sk.name, handler: POWER_PLANT_SPECIAL_SKILLS[key] });
        } else {
          genericDescriptions.push(sk.description);
          genericLines.push({ operatorName: slot.operatorName, skillName: sk.name, description: sk.description });
        }
      }
    }
    const linesFor = (): FacilityBreakdownLine[] =>
      genericLines.map((g) => {
        const raw = calcDroneRate([g.description]);
        return {
          operatorName: g.operatorName,
          skillName: g.skillName,
          rawValue: raw,
          included: raw !== 0,
          reason: raw === 0 ? 'No numeric drone recovery effect.' : 'Counted normally.',
        };
      });
    if (specialEntries.length === 0) return { rate: calcDroneRate(genericDescriptions), lines: linesFor() };

    const kaltsitInControlCenter = ccOperatorNames.includes("Kal'tsit");
    const lateranoInAnyOtherPowerPlant = [...powerPlantsWithLaterano].some((id) => id !== f.id);

    // Spuria's ramp -- same "real time until the first operator anywhere
    // in this Power Plant dies from Morale loss" window used everywhere
    // else this codebase models a ramping skill.
    const powerPlantMorale = calcMorale(
      filled.length,
      filled.flatMap((s) => skillsFor(s, f.label).map((sk) => ({ operatorName: s.operatorName, description: sk.description })))
    );
    const ownRate = (opName: string) => Math.max(0, powerPlantMorale.grey + powerPlantMorale.allOperatorsYellow + (powerPlantMorale.selfYellow[opName] || 0));
    const worstRate = filled.length > 0 ? Math.max(...filled.map((s) => ownRate(s.operatorName))) : 0;
    const rampWindowHours = rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);

    let total = calcDroneRate(genericDescriptions);
    const lines = linesFor();
    for (const { slot, skillName, handler } of specialEntries) {
      const result = handler({
        sameFacilityOperatorNames: filled.map((s) => s.operatorName),
        lateranoInAnyOtherPowerPlant,
        kaltsitInControlCenter,
        // Training Room has exactly 1 slot in this simulator, so this
        // directly reflects whether Logos is that slot's occupant.
        logosIsTrainerInTrainingRoom: logosInTrainingRoom,
        maxDroneCapacity: 235, // confirmed by the user: fixed 2-4-3 base layout
        // Whole-base Rhine Lab count, minus this specific operator if
        // they're themselves a Rhine Lab member -- Muelsyse's skill says
        // "every OTHER Rhine Lab Operator", not including herself.
        //
        // Capped at 5 here, not in the handler: her text is "for every other
        // Rhine Lab Operator in base (excluding Assistants and Activity Room
        // users, caps at 5)", and powerPlantSpecialSkills.ts documents this
        // count as arriving pre-capped -- but it wasn't, so six or more Rhine
        // Lab operators overpaid her beyond the +15% ceiling.
        otherRhineLabCountBaseWide: Math.min(5, rhineLabCountInBase - (RHINE_LAB.has(slot.operatorName) ? 1 : 0)),
        // Summed from the actual Dormitories rather than assuming 4 x Level 5.
        // Same hardcoded max-level assumption Senshi's Diner had above.
        totalDormitoryLevels,
        rampWindowHours,
      });
      if (result.droneRate) total += result.droneRate;
      lines.push({
        operatorName: slot.operatorName,
        skillName,
        rawValue: result.droneRate ?? 0,
        included: (result.droneRate ?? 0) !== 0,
        reason: (result.droneRate ?? 0) !== 0
          ? 'Counted normally.'
          : 'No drone recovery contribution under the current setup.',
        note: result.note,
      });
    }
    return { rate: total, lines };
  }

  function productivityFor(
    f: (typeof FACILITIES)[number],
    ccEffects: ControlCenterEffects,
    ccMoraleRelief: number
  ) {
    const slots = assignments[f.id] || [];
    const filled = slots.filter((s): s is SlotAssignment => s !== null);

    let descriptions: (string | null)[];
    let specialProductivitySum = 0;
    let specialCapacitySum = 0;
    let specialOrderLimitSum = 0;
    const perOperatorSpecialMorale: Record<string, number> = {};
    let overrideActive = false;
    let overrideProductivitySum = 0;
    let exemptProductivitySum = 0;
    const specialNotes: { operator: string; note: string }[] = [];
    let facilityBreakdown: FacilityBreakdown | null = null;
    let genericSkillsForMorale: { operatorName: string; description: string | null }[] = [];
    let genericSkillsForCapacity: { operatorName: string; description: string | null }[] = [];

    if (f.kind === 'factory') {
      const sameFactoryOperatorNames = filled.map((s) => s.operatorName);
      const sameFactorySkillNames = filled.flatMap((s) => skillsFor(s, f.label).map((sk) => sk.name || ''));

      const genericDescriptions: (string | null)[] = [];
      const specialEntries: { slot: SlotAssignment; skillName: string; handler: (typeof FACTORY_SPECIAL_SKILLS)[string] }[] = [];

      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = `${slot.operatorName}|${sk.name}`;
          if (key in FACTORY_SPECIAL_SKILLS) {
            const handler = FACTORY_SPECIAL_SKILLS[key];
            specialEntries.push({ slot, skillName: sk.name || '', handler });
          } else {
            genericDescriptions.push(sk.description);
            genericSkillsForMorale.push({ operatorName: slot.operatorName, description: sk.description });
            genericSkillsForCapacity.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }
      descriptions = genericDescriptions;

      const baseCtx: Omit<FactorySkillContext, 'manualValue' | 'othersProductivitySum' | 'otherOperatorsCapacity' | 'totalFactoryCapacityIncrease' | 'eliteLevel'> = {
        rosters,
        selectedProduct: factoryProducts[f.id] || null,
        sameFactoryOperatorNames,
        sameFactorySkillNames,
        filledCountThisFactory: filled.length,
        tradingPostOperatorCount,
        tradingPostCount: FACILITIES.filter((f2) => f2.kind === 'tradingPost').length,
        powerPlantOperatorCount,
        powerPlantCount: effectivePowerPlantCount,
        robotPowerPlantCount,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        factionCountInBase,
        dormitoryCount,
        gladiiaGroupHuntingActiveInCC,
        felvineTotal: totalFelvine,
        monsterMealTotal: totalMonsterMeal,
        ursusSpecialtyBeverageTotal: totalUrsusBeverage,
        blacksteelWorldwideCountInBase,
        rhineLabCountInBase,
        resourcePools,
        resourceBonuses,
        operatorInAnyTradingPost,
        rampWindowHours: 24, // placeholder -- only the morale-dependent operators below read this, and they get a corrected context after the real value is known
        selfMoraleRate: 1, // placeholder -- only Totter's handlers read this
      };

      // Three groups now: Waai Fu (self-referential off everyone else's
      // productivity), the ramping operators (Fang/Kroos/Scene/Ceobe,
      // whose average productivity depends on THEIR OWN Morale-based
      // time window, only knowable once every other special skill --
      // including Morale-affecting ones -- has resolved), and
      // everything else.
      const MORALE_DEPENDENT_FACTORY_SKILLS = new Set([
        'Fang|Hothead',
        'Kroos|Slowcoach',
        'Scene|Time-Lapse Photography',
        'Ceobe|Right Now',
        'Totter|Blurry Vision',
        'Totter|Blizzard Outside',
        'Aroma|Routine Cleaning',
      ]);
      let othersSum = 0;
      const pending: { slot: SlotAssignment; skillName: string; handler: (typeof FACTORY_SPECIAL_SKILLS)[string] }[] = [];
      let waaiFuEntry: (typeof specialEntries)[number] | null = null;
      let bubbleEntry: (typeof specialEntries)[number] | null = null;
      let vermeilEntry: (typeof specialEntries)[number] | null = null;
      const moraleDependentEntries: (typeof specialEntries)[number][] = [];

      for (const entry of specialEntries) {
        if (entry.slot.operatorName === 'Waai Fu' && entry.skillName === 'Cooperative Will') {
          waaiFuEntry = entry;
        } else if (entry.slot.operatorName === 'Bubble' && entry.skillName === 'Bigger is Better!') {
          bubbleEntry = entry;
        } else if (entry.slot.operatorName === 'Vermeil' && entry.skillName === 'Recycling') {
          vermeilEntry = entry;
        } else if (MORALE_DEPENDENT_FACTORY_SKILLS.has(`${entry.slot.operatorName}|${entry.skillName}`)) {
          moraleDependentEntries.push(entry);
        } else {
          pending.push(entry);
        }
      }

      const results: { result: ReturnType<(typeof FACTORY_SPECIAL_SKILLS)[string]>; operator: string }[] = [];
      const pendingSelfMorale: Record<string, number> = {};
      const pendingSpecialCapacity: Record<string, number> = {};
      for (const { slot, handler } of pending) {
        const result = handler({ ...baseCtx, eliteLevel: slot.eliteLevel, manualValue: slot.manualValue });
        results.push({ result, operator: slot.operatorName });
        // Facility-count-based contributions (Purestream, Thorns, Alanna,
        // Narantuya -- marked exemptFromOverride) are explicitly excluded
        // from Waai Fu's "everyone else's productivity" sum, per her own
        // skill text.
        if (result.productivity && !result.exemptFromOverride) othersSum += result.productivity;
        if (result.selfMorale) {
          pendingSelfMorale[slot.operatorName] = (pendingSelfMorale[slot.operatorName] || 0) + result.selfMorale;
        }
        if (result.capacity) {
          pendingSpecialCapacity[slot.operatorName] = (pendingSpecialCapacity[slot.operatorName] || 0) + result.capacity;
        }
      }

      if (bubbleEntry || vermeilEntry) {
        // Shared per-operator capacity data (generic regex-parsed +
        // any special-cased skill), needed by both Bubble and Vermeil.
        const genericCapacityByOp = calcCapacityPerOperator(genericSkillsForCapacity);
        const capacityByOp = (opName: string) => (genericCapacityByOp[opName] || 0) + (pendingSpecialCapacity[opName] || 0);

        if (bubbleEntry) {
          // Bubble scales off EVERY operator's own individual capacity
          // contribution, including her own -- 1% productivity per
          // point at <=15, 3% per point at >=16 (confirmed correction
          // to the raw skill text's "16 or less"/"greater than 16"
          // wording).
          const allOperatorsCapacity: Record<string, number> = {};
          for (const slot of filled) {
            const total = capacityByOp(slot.operatorName);
            if (total !== 0) allOperatorsCapacity[slot.operatorName] = total;
          }
          const result = bubbleEntry.handler({
            ...baseCtx,
            eliteLevel: bubbleEntry.slot.eliteLevel,
            manualValue: bubbleEntry.slot.manualValue,
            otherOperatorsCapacity: allOperatorsCapacity,
          });
          results.push({ result, operator: 'Bubble' });
          // Genuinely counts toward "everyone else's productivity" for
          // Waai Fu -- Bubble returns real productivity, not just
          // capacity, and has no confirmed exemption in her skill text
          // (unlike the facility-count-based skills, which do).
          if (result.productivity) othersSum += result.productivity;
        }

        if (vermeilEntry) {
          // Vermeil: flat +2% per point of capacity increase across
          // EVERY operator in the Factory, including her own (confirmed
          // -- unlike Bubble, who excludes herself).
          const totalFactoryCapacityIncrease = filled.reduce((sum, s) => sum + capacityByOp(s.operatorName), 0);
          const result = vermeilEntry.handler({
            ...baseCtx,
            eliteLevel: vermeilEntry.slot.eliteLevel,
            manualValue: vermeilEntry.slot.manualValue,
            totalFactoryCapacityIncrease,
          });
          results.push({ result, operator: 'Vermeil' });
          if (result.productivity) othersSum += result.productivity;
        }
      }

      if (waaiFuEntry) {
        // othersSum so far only includes special-cased contributions --
        // generic, regex-parsed skills (e.g. Vanilla's plain "+25%")
        // never touched it at all, since they're computed entirely
        // separately via calcProductivity. Add that contribution too,
        // using only the skill-based yellow portion, not the grey
        // baseline rate (which isn't "provided" by any operator's skill
        // in the sense Waai Fu's own skill text means).
        const genericOthers = calcProductivity('factory', genericDescriptions, filled.length, factoryProducts[f.id] || null);
        othersSum += genericOthers.yellow;
        const result = waaiFuEntry.handler({
          ...baseCtx,
          eliteLevel: waaiFuEntry.slot.eliteLevel,
          manualValue: waaiFuEntry.slot.manualValue,
          othersProductivitySum: othersSum,
        });
        results.push({ result, operator: 'Waai Fu' });
      }


      if (moraleDependentEntries.length > 0) {
        // Real per-operator Morale calc for THIS Factory, using only
        // what's known so far (generic descriptions + every
        // non-morale-dependent special skill's self-only Morale
        // contribution).
        const factoryMorale = calcMorale(filled.length, genericSkillsForMorale);
        const ownRate = (opName: string) =>
          Math.max(
            0,
            factoryMorale.grey +
              factoryMorale.allOperatorsYellow +
              (factoryMorale.selfYellow[opName] || 0) +
              (pendingSelfMorale[opName] || 0) -
              ccMoraleRelief
          );

        // The window is genuinely facility-wide -- the first operator
        // ANYWHERE in this Factory to run out of Morale ends the whole
        // Factory's operational window, not just each operator's own
        // individual survival time.
        const worstRate = Math.max(...filled.map((s) => ownRate(s.operatorName)));
        const rampWindowHours = rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);

        for (const { slot, handler } of moraleDependentEntries) {
          const opName = slot.operatorName;
          const result = handler({
            ...baseCtx,
            rampWindowHours,
            selfMoraleRate: ownRate(opName),
            eliteLevel: slot.eliteLevel,
            manualValue: slot.manualValue,
          });
          results.push({ result, operator: opName });
        }
      }

      for (const { result, operator } of results) {
        if (result.productivity) specialProductivitySum += result.productivity;
        if (result.capacity) specialCapacitySum += result.capacity;
        if (result.selfMorale) {
          perOperatorSpecialMorale[operator] = (perOperatorSpecialMorale[operator] || 0) + result.selfMorale;
        }
        if (result.overridesOthersProductivity) {
          overrideActive = true;
          if (result.productivity) overrideProductivitySum += result.productivity;
        }
        if (result.exemptFromOverride && result.productivity) exemptProductivitySum += result.productivity;
        // NOTE: result.note is no longer pushed onto the tile-level
        // specialNotes list here -- it was cluttering the small facility
        // tile with skill caveat text instead of the usual grey/yellow
        // stats. It's carried into breakdownLines below instead, so it
        // only shows up in the "explain this facility" panel.
      }

      // Step-by-step breakdown for the "explain this facility" panel --
      // built from the SAME data the real calculation above already
      // produced, not re-derived separately, so it can't drift from what
      // actually happened.
      const product = factoryProducts[f.id] || null;
      const greyProductivity = calcGreyProductivity(filled.length);
      const breakdownLines: FacilityBreakdownLine[] = [];

      for (const g of genericSkillsForMorale) {
        const raw = factoryYellowContribution(g.description, product);
        const included = raw !== 0 && !overrideActive;
        breakdownLines.push({
          operatorName: g.operatorName,
          skillName: null,
          rawValue: raw,
          included,
          reason: overrideActive
            ? 'Excluded -- an override skill in this Factory replaces everyone else\u2019s own productivity entirely.'
            : raw === 0
            ? 'No numeric productivity effect for this Factory\u2019s selected product.'
            : 'Counted normally.',
        });
      }

      for (const { result, operator } of results) {
        const raw = result.productivity ?? 0;
        let included: boolean;
        let reason: string;
        if (result.exemptFromOverride) {
          included = raw !== 0;
          reason = 'Exempt -- this skill survives even when another skill overrides everyone else\u2019s productivity.';
        } else if (overrideActive) {
          included = !!result.overridesOthersProductivity && raw !== 0;
          reason = result.overridesOthersProductivity
            ? 'Counted -- this is the override skill itself.'
            : 'Excluded -- an override skill in this Factory replaces everyone else\u2019s own productivity entirely.';
        } else {
          included = raw !== 0;
          reason = raw === 0 ? 'No numeric productivity contribution.' : 'Counted normally.';
        }
        breakdownLines.push({
          operatorName: operator,
          skillName: specialEntries.find((e) => e.slot.operatorName === operator)?.skillName ?? null,
          rawValue: raw,
          included,
          reason,
          formula: result.formula,
          note: result.note,
        });
      }

      const finalYellow = exemptProductivitySum + (overrideActive ? overrideProductivitySum : specialProductivitySum + genericDescriptions.reduce((sum, d) => sum + factoryYellowContribution(d, product), 0));
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity,
        greyFormula: `1.01 + (${filled.length} - 1) \u00d7 0.01 = ${greyProductivity.toFixed(2)}`,
        overrideActive,
        lines: breakdownLines,
        finalYellow,
        effectiveProductivity: Math.max(0, greyProductivity + finalYellow),
      };
    } else if (f.kind === 'tradingPost') {
      const sameRoomOperatorNames = filled.map((s) => s.operatorName);
      const genericDescriptions: (string | null)[] = [];
      const specialEntries: { slot: SlotAssignment; skillName: string; handler: (typeof TRADING_POST_SPECIAL_SKILLS)[string] }[] = [];

      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = `${slot.operatorName}|${sk.name}`;
          if (key in TRADING_POST_SPECIAL_SKILLS) {
            const handler = TRADING_POST_SPECIAL_SKILLS[key];
            specialEntries.push({ slot, skillName: sk.name || '', handler });
          } else {
            genericDescriptions.push(sk.description);
            genericSkillsForMorale.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }
      descriptions = genericDescriptions;

      const baseTPCtx: Omit<TradingPostContext, 'manualValue' | 'othersOrderEfficiencySum' | 'othersOrderLimitSum'> = {
        rosters,
        sameRoomOperatorNames,
        filledCountThisRoom: filled.length,
        dormitoryOperatorCount: dormitoryOperatorNames.size,
        distinctFactoryProductCount,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        ulpianusInBase,
        facilitiesWithSuiOperator,
        facilitiesWithEliteOperator,
        resourceBonuses,
        monsterMealTotal: totalMonsterMeal,
        felvineTotal: totalFelvine,
        effectiveGoldLineCount,
        allPlacedNames,
      };

      // Snowsant/Jaye's second skill are self-referential off everyone
      // ELSE's order efficiency; Degenbrecher/Swire off everyone else's
      // order limit contribution. Both need everything else resolved first.
      const SELF_REFERENTIAL = new Set([
        'Jaye|Basic Needs',
        'Snowsant|Heavenly Reward α',
        'Snowsant|Heavenly Reward β',
        "Degenbrecher|Champion's Bearing",
        'Swire the Elegant Wit|Investment Solicitations',
      ]);

      const pendingTP = specialEntries.filter((e) => !SELF_REFERENTIAL.has(`${e.slot.operatorName}|${e.skillName}`));
      const deferredTP = specialEntries.filter((e) => SELF_REFERENTIAL.has(`${e.slot.operatorName}|${e.skillName}`));
      // Among the deferred group, only Jaye's "Basic Needs" ALSO produces
      // an orderLimit output of its own (her CAP reduction) -- Swire's
      // "Investment Solicitations" and Degenbrecher's "Champion's
      // Bearing" both read othersOrderLimitRawSum, so they need to see
      // Jaye's real reduction already netted in, not the pre-Jaye
      // snapshot. Snowsant's skill only outputs orderEfficiency, so it
      // has no such cross-dependency and stays in the normal batch.
      const orderLimitAffectingDeferred = deferredTP.filter((e) => e.skillName === 'Basic Needs');
      const remainingDeferred = deferredTP.filter((e) => e.skillName !== 'Basic Needs');

      const prelimProd = calcProductivity('tradingPost', genericDescriptions, filled.length, null);
      const prelimOrderLimit = calcOrderLimit(genericDescriptions, f.level);
      let othersEff = prelimProd.yellow;
      // Raw (including negatives) order limit total -- used by
      // Degenbrecher's "Champion's Bearing", Swire the Elegant Wit's
      // "Investment Solicitations" (both confirmed to scale off the
      // SAME net total shown as the room's final order limit, including
      // their own negative Intimidate/Imposing Presence contribution
      // netted in -- not a positive-only "exclude my own" version), and
      // Jaye's own effective-order-limit computation.
      let othersLimitRaw = prelimOrderLimit.adjustment + (perTradingPostOrderLimitBonus.get(f.id) || 0);

      const resultsTP: { result: ReturnType<(typeof TRADING_POST_SPECIAL_SKILLS)[string]>; operator: string }[] = [];
      for (const { slot, handler } of pendingTP) {
        const result = handler({ ...baseTPCtx, manualValue: slot.manualValue });
        resultsTP.push({ result, operator: slot.operatorName });
        if (result.orderEfficiency) othersEff += result.orderEfficiency;
        if (result.orderLimit) othersLimitRaw += result.orderLimit;
      }
      for (const { slot, handler } of orderLimitAffectingDeferred) {
        const result = handler({
          ...baseTPCtx,
          manualValue: slot.manualValue,
          othersOrderEfficiencySum: othersEff,
          othersOrderLimitRawSum: othersLimitRaw,
          genericOrderLimitAdjustment: prelimOrderLimit.base + prelimOrderLimit.adjustment,
        });
        resultsTP.push({ result, operator: slot.operatorName });
        // Feed Jaye's real orderLimit output back in before the
        // remaining deferred skills (Swire, Degenbrecher) run, so they
        // see the actual net total, not a stale pre-Jaye snapshot.
        if (result.orderLimit) othersLimitRaw += result.orderLimit;
      }
      for (const { slot, handler } of remainingDeferred) {
        const result = handler({
          ...baseTPCtx,
          manualValue: slot.manualValue,
          othersOrderEfficiencySum: othersEff,
          othersOrderLimitRawSum: othersLimitRaw,
          genericOrderLimitAdjustment: prelimOrderLimit.base + prelimOrderLimit.adjustment,
        });
        resultsTP.push({ result, operator: slot.operatorName });
      }

      for (const { result, operator } of resultsTP) {
        if (result.orderEfficiency) specialProductivitySum += result.orderEfficiency;
        if (result.orderLimit) specialOrderLimitSum += result.orderLimit;
        if (result.selfMorale) {
          perOperatorSpecialMorale[operator] = (perOperatorSpecialMorale[operator] || 0) + result.selfMorale;
        }
        if (result.allOperatorsBonus) {
          for (const s of filled) {
            perOperatorSpecialMorale[s.operatorName] = (perOperatorSpecialMorale[s.operatorName] || 0) + result.allOperatorsBonus;
          }
        }
        if (result.overridesOthersEfficiency) {
          overrideActive = true;
          if (result.orderEfficiency) overrideProductivitySum += result.orderEfficiency;
        }
        // NOTE: result.note is no longer pushed onto the tile-level
        // specialNotes list here -- see the matching Factory-side note
        // above. It's carried into tpBreakdownLines below instead, so it
        // only shows up in the "explain this facility" panel.
      }

      // Step-by-step breakdown for the "explain this facility" panel --
      // same approach as Factory: built from the results already
      // computed above, not re-derived separately.
      const tpGreyProductivity = calcGreyProductivity(filled.length);
      const tpBreakdownLines: FacilityBreakdownLine[] = [];

      for (const g of genericSkillsForMorale) {
        const raw = tradingPostYellowContribution(g.description);
        const included = raw !== 0 && !overrideActive;
        tpBreakdownLines.push({
          operatorName: g.operatorName,
          skillName: null,
          rawValue: raw,
          included,
          reason: overrideActive
            ? 'Excluded -- an override skill in this Trading Post replaces everyone else\u2019s own order efficiency entirely.'
            : raw === 0
            ? 'No numeric order efficiency effect.'
            : 'Counted normally.',
        });
      }

      for (const { result, operator } of resultsTP) {
        const raw = result.orderEfficiency ?? 0;
        let included: boolean;
        let reason: string;
        if (overrideActive) {
          included = !!result.overridesOthersEfficiency && raw !== 0;
          reason = result.overridesOthersEfficiency
            ? 'Counted -- this is the override skill itself.'
            : 'Excluded -- an override skill in this Trading Post replaces everyone else\u2019s own order efficiency entirely.';
        } else {
          included = raw !== 0;
          reason = raw === 0 ? 'No numeric order efficiency contribution (may still affect order limit or Morale separately).' : 'Counted normally.';
        }
        tpBreakdownLines.push({
          operatorName: operator,
          skillName: specialEntries.find((e) => e.slot.operatorName === operator)?.skillName ?? null,
          rawValue: raw,
          included,
          reason,
          formula: result.formula,
          note: result.note,
        });
      }

      const tpFinalYellow = overrideActive
        ? overrideProductivitySum
        : prelimProd.yellow + specialProductivitySum;
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: tpGreyProductivity,
        greyFormula: `1.01 + (${filled.length} - 1) \u00d7 0.01 = ${tpGreyProductivity.toFixed(2)}`,
        overrideActive,
        lines: tpBreakdownLines,
        finalYellow: tpFinalYellow,
        effectiveProductivity: Math.max(0, tpGreyProductivity + tpFinalYellow),
      };
    } else {
      descriptions = filled.flatMap((s) => skillsFor(s, f.label).map((sk) => sk.description));
      genericSkillsForMorale = filled.flatMap((s) =>
        skillsFor(s, f.label).map((sk) => ({ operatorName: s.operatorName, description: sk.description }))
      );
    }

    const morale = calcMorale(filled.length, genericSkillsForMorale);
    const productivity = PRODUCTIVITY_KINDS.has(f.kind)
      ? calcProductivity(f.kind as 'factory' | 'tradingPost', descriptions, filled.length, factoryProducts[f.id] || null)
      : null;
    // Layer Control Center's highest-only global bonus on top of this
    // facility's own local skill contributions.
    if (productivity) {
      if (f.kind === 'tradingPost') {
        const thisTpBonus = perTradingPostBonus.get(f.id) || 0;
        productivity.yellow = (overrideActive ? overrideProductivitySum : productivity.yellow + specialProductivitySum) + ccEffects.tradingPostBonus + thisTpBonus;
        // Sync the breakdown panel to match -- it was built above before
        // these cross-facility Control Center bonuses were known, so its
        // displayed percentage was silently stuck at the pre-CC-bonus
        // value even when the real productivity (and the LMD figures
        // computed from it) correctly included them.
        if (facilityBreakdown) {
          const ccBonusTotal = ccEffects.tradingPostBonus + thisTpBonus;
          if (ccBonusTotal !== 0) {
            facilityBreakdown.lines.push({
              operatorName: '(Control Center)',
              skillName: null,
              rawValue: ccBonusTotal,
              included: true,
              reason: 'Cross-facility Order Efficiency bonus (Control Center highest-only bonus plus any per-Trading-Post bonus) -- added after this room\u2019s own local skills.',
            });
          }
          facilityBreakdown.finalYellow = productivity.yellow;
          facilityBreakdown.effectiveProductivity = Math.max(0, facilityBreakdown.greyProductivity + productivity.yellow);
        }
      }
      if (f.kind === 'factory') {
        // "Zero out everyone else" skills (Snegurochka, Automation
        // family) replace ALL other LOCAL productivity contributions --
        // generic AND other special-cased ones -- with just their own,
        // EXCEPT skills whose productivity is granted based on facility
        // count rather than being "contributed" in the sense these
        // skills mean (Purestream, Thorns the Lodestar) -- not about
        // evaluation order, they're simply exempt from the zero-out
        // entirely, regardless of which other operators are also
        // present. CC-sourced cross-facility bonuses are conceptually
        // independent of this LOCAL override and always apply, the same
        // fix as Trading Post above -- these used to be silently
        // dropped whenever an override was active.
        productivity.yellow = overrideActive ? overrideProductivitySum + exemptProductivitySum : productivity.yellow + specialProductivitySum;
        productivity.yellow += ccEffects.factoryBonus;
        if (factoryProducts[f.id] === 'Precious Metals') {
          productivity.yellow += factoryPreciousMetalBonusFromCC;
        }
        productivity.yellow += perFactoryProductivityBonus.get(f.id) || 0;
        // Same sync the Trading Post branch above does: the breakdown was
        // built before any of these cross-facility bonuses were known, so
        // without this its total silently disagreed with the tile -- a Factory
        // of three Knights on Precious Metals showed 178% in the panel next to
        // 174% on the tile, with nothing named to account for the difference.
        if (facilityBreakdown) {
          // One line per contributing skill, not per contributing operator:
          // these skills grant their amount per affected operator, so a
          // three-Knight Factory produced three identical rows and the reader
          // had to add them up. Grouped, with the multiplier spelled out.
          const groupedSources = new Map<string, { operatorName: string; skillName: string | null; per: number; count: number }>();
          for (const src of perFactoryProductivitySources.get(f.id) || []) {
            const groupKey = `${src.operatorName}|${src.skillName ?? ''}`;
            const held = groupedSources.get(groupKey);
            if (held) {
              held.count += 1;
            } else {
              groupedSources.set(groupKey, { operatorName: src.operatorName, skillName: src.skillName, per: src.amount, count: 1 });
            }
          }
          for (const g of groupedSources.values()) {
            facilityBreakdown.lines.push({
              operatorName: g.operatorName,
              skillName: g.skillName,
              rawValue: g.per * g.count,
              included: true,
              reason: 'Cross-facility bonus targeting this Factory specifically -- added after this room\u2019s own local skills.',
              formula: g.count > 1 ? `${(g.per * 100).toFixed(2)}% x ${g.count} operators = ${(g.per * g.count * 100).toFixed(2)}%` : undefined,
            });
          }
          const sharedCcFactoryBonus = ccEffects.factoryBonus
            + (factoryProducts[f.id] === 'Precious Metals' ? factoryPreciousMetalBonusFromCC : 0);
          if (sharedCcFactoryBonus !== 0) {
            facilityBreakdown.lines.push({
              operatorName: '(Control Center)',
              skillName: null,
              rawValue: sharedCcFactoryBonus,
              included: true,
              reason: 'Cross-facility Factory productivity bonus (Control Center highest-only bonus, plus any Precious-Metal-specific bonus) -- added after this room\u2019s own local skills.',
            });
          }
          facilityBreakdown.finalYellow = productivity.yellow;
          facilityBreakdown.effectiveProductivity = Math.max(0, facilityBreakdown.greyProductivity + productivity.yellow);
        }
      }
    }

    const capacity = f.kind === 'factory' ? calcCapacity(descriptions, f.level) : null;
    if (capacity) capacity.adjustment += specialCapacitySum;
    const orderLimit = f.kind === 'tradingPost' ? calcOrderLimit(descriptions, f.level) : null;
    if (orderLimit) orderLimit.adjustment += specialOrderLimitSum + (perTradingPostOrderLimitBonus.get(f.id) || 0);
    let clueSpeed: number | null = null;
    let clueSpeedBase: number | null = null;
    let inesNote: string | undefined;
    const receptionRoomSelfMorale: Record<string, number> = {};
    if (f.kind === 'receptionRoom') {
      const sameRoomOperatorNames = filled.map((s) => s.operatorName);
      const genericDescriptions: (string | null)[] = [];
      // The breakdown's generic lines are built from this, NOT from
      // genericSkillsForMorale: that array is assigned every skill in the room
      // for the morale calculation and then had the generic ones pushed onto it
      // again here, so Curiosity was listed twice and Gourmand -- which is
      // special-cased and deliberately excluded from genericDescriptions --
      // appeared as a phantom flat +2%. The displayed lines have to come from
      // the same list the total sums, or the panel contradicts its own Final.
      const genericClueLines: { operatorName: string; description: string | null }[] = [];
      let specialClueSum = 0;
      const pendingReceptionEntries: { slot: SlotAssignment; sk: BaseSkill; handler: (typeof RECEPTION_ROOM_SPECIAL_SKILLS)[string] }[] = [];
      let inesEntry: { slot: SlotAssignment; handler: (typeof RECEPTION_ROOM_SPECIAL_SKILLS)[string] } | null = null;

      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = `${slot.operatorName}|${sk.name}`;
          if (key in RECEPTION_ROOM_SPECIAL_SKILLS) {
            const handler = RECEPTION_ROOM_SPECIAL_SKILLS[key];
            if (slot.operatorName === 'Ines' && sk.name === 'Shadow Gathering') {
              inesEntry = { slot, handler };
            } else {
              pendingReceptionEntries.push({ slot, sk, handler });
            }
          } else {
            genericDescriptions.push(sk.description);
            genericClueLines.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }

      const pendingReceptionSelfMorale: Record<string, number> = {};
      for (const { slot, handler } of pendingReceptionEntries) {
        const result = handler({
          rosters,
          manualValue: slot.manualValue,
          sameRoomOperatorNames,
          filledCountThisRoom: filled.length,
          dormitoryHasOperator,
          monsterMealTotal: totalMonsterMeal,
          rampWindowHours: 24, // unused by any non-Ines handler
          resourceBonuses,
          clueExchangeActive,
        });
        if (result.clueSpeed) specialClueSum += result.clueSpeed;
        if (result.selfMorale) {
          receptionRoomSelfMorale[slot.operatorName] = (receptionRoomSelfMorale[slot.operatorName] || 0) + result.selfMorale;
        }
      }

      if (inesEntry) {
        // Real facility-wide Morale window, same principle as the
        // Factory ramping operators -- the first operator ANYWHERE in
        // this Reception Room to run out of Morale ends the whole
        // room's operational window, not just Ines's own survival time.
        const receptionMorale = calcMorale(filled.length, genericSkillsForMorale);
        const ownRate = (opName: string) =>
          Math.max(
            0,
            receptionMorale.grey +
              receptionMorale.allOperatorsYellow +
              (receptionMorale.selfYellow[opName] || 0) +
              (pendingReceptionSelfMorale[opName] || 0) -
              ccMoraleRelief
          );
        const worstRate = Math.max(...filled.map((s) => ownRate(s.operatorName)));
        const rampWindowHours = rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);
        const result = inesEntry.handler({
          rosters,
          manualValue: inesEntry.slot.manualValue,
          sameRoomOperatorNames,
          filledCountThisRoom: filled.length,
          dormitoryHasOperator,
          monsterMealTotal: totalMonsterMeal,
          rampWindowHours,
          resourceBonuses,
          clueExchangeActive,
        });
        if (result.clueSpeed) specialClueSum += result.clueSpeed;
        if (result.note) inesNote = result.note;
      }
      clueSpeed = calcClueSpeed(genericDescriptions) + specialClueSum + ccEffects.clueCollectionBonus + officeReceptionRoomBonus + receptionRoomClueSpeedFromCC;
      clueSpeedBase = calcReceptionRoomBaseSpeed(
        filled.map((s) => ({
          rarity: operatorByName.get(s.operatorName)?.rarity ?? null,
          eliteLevel: s.eliteLevel,
        }))
      );
      const receptionBreakdownLines: FacilityBreakdownLine[] = [];
      // Itemise the base speed per operator instead of hiding it inside one
      // summed figure. "+25%" for an Elite 2 5-star says nothing about which
      // part is the promotion and which the rarity, and three of the reported
      // Reception Room bugs were "innate/promotion/rarity bonuses missing" --
      // which is impossible to confirm or refute against a single total.
      // Zero contributions are listed too, marked excluded, so a 3-star at
      // Elite 0 visibly contributes nothing rather than being absent.
      for (const slot of filled) {
        const contribution = receptionRoomBaseContribution({
          rarity: operatorByName.get(slot.operatorName)?.rarity ?? null,
          eliteLevel: slot.eliteLevel,
        });
        const rarity = operatorByName.get(slot.operatorName)?.rarity ?? null;
        const eliteLabel = slot.eliteLevel === 'Base' ? 'Elite 0' : slot.eliteLevel ?? 'Elite 0';
        receptionBreakdownLines.push({
          operatorName: slot.operatorName,
          skillName: 'in the room',
          rawValue: contribution.slotted,
          included: contribution.slotted !== 0,
          reason: 'Every slotted operator adds this, whether or not their skill does anything here.',
        });
        receptionBreakdownLines.push({
          operatorName: slot.operatorName,
          skillName: rarity ? `${rarity}★ rarity` : 'rarity',
          rawValue: contribution.rarity,
          included: contribution.rarity !== 0,
          reason: contribution.rarity !== 0
            ? 'Rarity bonus: 6★ +5%, 5★ +4%, 4★ +2%.'
            : 'Rarity bonus only applies at 4★ and above.',
        });
        receptionBreakdownLines.push({
          operatorName: slot.operatorName,
          skillName: eliteLabel,
          rawValue: contribution.elite,
          included: contribution.elite !== 0,
          reason: contribution.elite !== 0
            ? 'Promotion bonus: Elite 2 +16%, Elite 1 +8%.'
            : 'Promotion bonus starts at Elite 1 -- Elite 0 adds nothing.',
        });
      }
      for (const g of genericClueLines) {
        const raw = calcClueSpeed([g.description]);
        receptionBreakdownLines.push({
          operatorName: g.operatorName,
          skillName: null,
          rawValue: raw,
          included: raw !== 0,
          reason: raw === 0 ? 'No numeric Clue search speed effect.' : 'Counted normally.',
        });
      }
      for (const { slot, sk, handler } of pendingReceptionEntries) {
        const result = handler({
          rosters,
          manualValue: slot.manualValue,
          sameRoomOperatorNames,
          filledCountThisRoom: filled.length,
          dormitoryHasOperator,
          monsterMealTotal: totalMonsterMeal,
          rampWindowHours: 24,
          resourceBonuses,
          clueExchangeActive,
        });
        const raw = result.clueSpeed ?? 0;
        receptionBreakdownLines.push({ operatorName: slot.operatorName, skillName: sk.name, rawValue: raw, included: raw !== 0, reason: raw === 0 ? 'No numeric Clue search speed effect.' : 'Counted normally.', note: result.note });
      }
      if (inesEntry) {
        receptionBreakdownLines.push({ operatorName: 'Ines', skillName: 'Shadow Gathering', rawValue: specialClueSum, included: specialClueSum !== 0, reason: 'Ramping skill -- scales with the room\u2019s own Morale window, recomputed above.', note: inesNote });
      }
      if (ccEffects.clueCollectionBonus !== 0) {
        receptionBreakdownLines.push({ operatorName: clueCollectionSource?.operatorName ?? '(Control Center)', skillName: clueCollectionSource?.skillName ?? null, rawValue: ccEffects.clueCollectionBonus, included: true, reason: 'Highest single Clue Collection Speed bonus among Control Center operators -- only the strongest of this type applies, so any others in the room contribute nothing.' });
      }
      if (officeReceptionRoomBonus !== 0) {
        receptionBreakdownLines.push({ operatorName: '(Office)', skillName: null, rawValue: officeReceptionRoomBonus, included: true, reason: 'Cross-facility bonus from an Office skill.' });
      }
      for (const src of receptionRoomClueSpeedSources) {
        receptionBreakdownLines.push({
          operatorName: src.operatorName,
          skillName: src.skillName,
          rawValue: src.amount,
          included: src.amount !== 0,
          reason: 'Control Center cross-facility bonus aimed at this room -- additive, so it stacks with the highest-only Clue Collection Speed above rather than competing with it.',
        });
      }
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: clueSpeedBase,
        greyFormula: `100% room baseline + each operator's three contributions itemised below = ${(clueSpeedBase * 100).toFixed(2)}%`,
        overrideActive: false,
        lines: receptionBreakdownLines,
        finalYellow: clueSpeed,
        effectiveProductivity: clueSpeedBase + clueSpeed,
      };
    }
    if (f.kind === 'controlCenter' && filled.length > 0) {
      // The Control Center produces Morale for its own occupants plus a set of
      // bonuses that land in other facilities, so there is no baseline to show
      // and the grey figure is 0 -- same shape as the Power Plant's.
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: 0,
        greyFormula: 'no baseline -- the Control Center produces Morale for this room plus bonuses that land elsewhere',
        overrideActive: false,
        lines: ccBreakdownLines.filter((line) => filled.some((slot) => slot.operatorName === line.operatorName)),
        finalYellow: ccEffects.ccMoraleBonus,
        effectiveProductivity: ccEffects.ccMoraleBonus,
      };
    }
    const powerPlant = f.kind === 'powerPlant' ? computePowerPlantDroneRate(f, filled) : null;
    const droneRate = powerPlant ? powerPlant.rate : null;
    if (powerPlant && filled.length > 0) {
      // Drone recovery has no headcount baseline the way productivity does --
      // it is purely the sum of skill bonuses, so the grey figure is 0.
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: 0,
        greyFormula: 'no baseline -- drone recovery is only the sum of the skills below',
        overrideActive: false,
        lines: powerPlant.lines,
        finalYellow: powerPlant.rate,
        effectiveProductivity: powerPlant.rate,
      };
    }

    let office: { speed: number; ownSpeed: number; ccBonus: number; refreshHours: number } | null = null;
    let trainingSpeed: number | null = null;
    const officeSpecialMorale: Record<string, number> = {};
    if (f.kind === 'office') {
      const genericOfficeDescriptions: (string | null)[] = [];
      let specialHrSum = 0;
      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = `${slot.operatorName}|${sk.name}`;
          if (key in OFFICE_SPECIAL_SKILLS) {
            const handler = OFFICE_SPECIAL_SKILLS[key];
            const result = handler({
              manualValue: slot.manualValue,
              dormitoryCount: FACILITIES.filter((f2) => f2.kind === 'dormitory').length,
              silverAshReignfrostInControlCenter,
              resourceBonuses,
              ursusSpecialtyBeverageTotal: totalUrsusBeverage,
            });
            if (result.hrSpeed) specialHrSum += result.hrSpeed;
            if (result.selfMorale) {
              officeSpecialMorale[slot.operatorName] = (officeSpecialMorale[slot.operatorName] || 0) + result.selfMorale;
            }
          } else {
            genericOfficeDescriptions.push(sk.description);
            genericSkillsForMorale.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }
      const generic = calcOffice(genericOfficeDescriptions);
      const ownSpeed = generic.speed + specialHrSum;
      const combinedSpeed = ownSpeed + officeHrSpeedBonusFromCC;
      office = { speed: combinedSpeed, ownSpeed, ccBonus: officeHrSpeedBonusFromCC, refreshHours: 12 / (1 + combinedSpeed) };
    }

    if (f.kind === 'trainingRoom') {
      // 100% base Specialization training speed (confirmed flat
      // percentage by the user, since actual training TIME varies by
      // who's training -- this simulator doesn't model absolute time
      // for this facility, only the relative speed multiplier).
      trainingSpeed = filled.length > 0 ? 1.0 + trainingSpeedBonusFromCC : null;
    }

    // Every facility gets morale relief from however many operators
    // are physically in Control Center right now, on top of whatever
    // this facility's own skills contribute. Dormitories additionally
    // get their own dedicated relief from Control Center skills that
    // specifically target them. This is the SHARED, room-wide portion
    // only -- confirmed against the full uploaded skill list, the vast
    // majority of "Morale consumed per hour +/-X" skills only affect
    // the operator who has them, not the room, so those are tracked
    // per-operator below instead of folded into this shared number.
    //
    // Control Center itself is a special case: it uses ccBaseMoraleRelief
    // (just the base "+0.05 per CC operator" portion, unconditional on
    // who they are) rather than the full ccMoraleRelief, since that
    // bundles in bannerOfBabelBonus/chongyueSolitaryLightBonus -- two
    // skill-specific bonuses documented as cross-facility effects for
    // every OTHER facility, not meant to apply back to Control Center's
    // own display. It also gets ccMoraleBonus added on top, a separate
    // source (parsed from individual operators' own skill text) that
    // only affects Control Center's own morale. Both the base relief
    // and ccMoraleBonus stack together -- the first operator placed in
    // Control Center should show the base relief immediately, even with
    // no morale-related skill of their own.
    const facilityMoraleYellowShared =
      morale.allOperatorsYellow -
      (f.kind === 'controlCenter' ? ccEffects.ccMoraleBonus + ccBaseMoraleRelief : ccMoraleRelief) -
      0;

    const combinedMoraleRate = Math.max(0, morale.grey + facilityMoraleYellowShared);

    // Always individualized per operator now -- never a single number
    // for the whole room, since Morale almost always decreases
    // differently per operator once any of them has their own
    // self-only modifier (which is the common case, not an exception).
    let perOperatorMorale: Record<string, number> | null = null;
    if (f.kind !== 'dormitory' && filled.length > 0) {
      perOperatorMorale = {};
      for (const slot of filled) {
        const opName = slot.operatorName;
        const selfOnly =
          (morale.selfYellow[opName] || 0) +
          (perOperatorSpecialMorale[opName] || 0) +
          (officeSpecialMorale[opName] || 0) +
          (receptionRoomSelfMorale[opName] || 0) +
          (ccSelfMorale[opName] || 0);
        const isWaaiFuImmune = opName === 'Waai Fu';
        const rateBeforeSelf = isWaaiFuImmune
          ? Math.max(0, morale.grey + facilityMoraleYellowShared - morale.allOperatorsYellow)
          : combinedMoraleRate;
        perOperatorMorale[opName] = Math.max(0, rateBeforeSelf + selfOnly);
      }
    }

    // Worst-case (highest-rate, i.e. first-to-die) operator's time,
    // for the shared Full/Dead-time display alongside the per-operator
    // Morale breakdown.
    const worstCaseMoraleRate = perOperatorMorale
      ? Math.max(combinedMoraleRate, ...Object.values(perOperatorMorale))
      : combinedMoraleRate;
    const deadTime = filled.length > 0 ? calcDeadTime(worstCaseMoraleRate) : null;

    let fullTime: number | null = null;
    if (f.kind === 'factory' && productivity && capacity) {
      fullTime = calcFullTime(capacity.base + capacity.adjustment, productivity.grey + productivity.yellow, factoryProducts[f.id] || null);
    } else if (f.kind === 'tradingPost' && productivity && orderLimit) {
      fullTime = calcTradingPostFullTime(Math.max(1, orderLimit.base + orderLimit.adjustment), productivity.grey + productivity.yellow);
    }

    return {
      productivity,
      capacity,
      orderLimit,
      morale: { grey: morale.grey, yellow: facilityMoraleYellowShared },
      clueSpeed,
      clueSpeedBase,
      droneRate,
      office,
      trainingSpeed,
      combinedMoraleRate,
      perOperatorMorale,
      deadTime,
      fullTime,
      facilityBreakdown,
      // Reception Room notes are deliberately NOT included here. They ride on
      // their own breakdown line instead, which is what FacilityBreakdownLine's
      // `note` field is documented for -- "shown in the breakdown panel instead
      // of cluttering the facility tile". Ch'en the Dawnstreak's "non-numeric
      // effect, not modeled" filled her tile with a paragraph of explanation.
      // The Control Center has no "?" panel, so its notes stay on the tile.
      // Control Center notes are no longer piled onto the tile either -- they
      // ride on their own breakdown line now that the room has a panel.
      specialNotes,
    };
  }

  const facility = FACILITIES.find((f) => f.id === roomPanelFacilityId);

  // Base-wide operator/faction data -- needed by Control Center's
  // special handlers before its own effects can be computed.
  const operatorByName = new Map(operators.map((o) => [o.name, o]));
  let tradingPostOperatorCount = 0;
  let powerPlantOperatorCount = 0;
  let robotPowerPlantCount = 0;
  let lancet2InPowerPlant = false;
  const powerPlantsWithRobot = new Set<string>();
  const powerPlantsWithLaterano = new Set<string>();
  let greyyDawnlightPowerPlantId: string | null = null;
  // Justice Knight's "Beep beep, activate!" Power Plant skill boosts
  // Wild Mane's own Factory (not this Power Plant) -- tracked here so
  // it can be applied to perFactoryProductivityBonus once that map
  // exists further below, since this loop runs first.
  let justiceKnightActiveInAnyPowerPlant = false;
  let wildManeFactoryId: string | null = null;
  const allPlacedNames: string[] = [];
  for (const f of FACILITIES) {
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    if (f.kind === 'tradingPost') tradingPostOperatorCount += slots.length;
    if (f.kind === 'powerPlant') {
      powerPlantOperatorCount += slots.length;
      robotPowerPlantCount += slots.filter((s) => OPERATION_PLATFORM.has(s.operatorName)).length;
      if (slots.some((s) => OPERATION_PLATFORM.has(s.operatorName))) powerPlantsWithRobot.add(f.id);
      if (slots.some((s) => LATERANO.has(s.operatorName))) powerPlantsWithLaterano.add(f.id);
      if (slots.some((s) => s.operatorName === 'Lancet-2')) lancet2InPowerPlant = true;
      const greyySlot = slots.find((s) => s.operatorName === 'Greyy the Lightningbearer');
      if (greyySlot && skillsFor(greyySlot, f.label).some((sk) => sk.name === 'Dawnlight')) {
        greyyDawnlightPowerPlantId = f.id;
      }
      const jkSlot = slots.find((s) => s.operatorName === 'Justice Knight');
      if (jkSlot && skillsFor(jkSlot, f.label).some((sk) => sk.name === '"Beep beep, activate!"')) {
        justiceKnightActiveInAnyPowerPlant = true;
      }
    }
    if (f.kind === 'factory' && slots.some((s) => s.operatorName === 'Wild Mane')) {
      wildManeFactoryId = f.id;
    }
    allPlacedNames.push(...slots.map((s) => s.operatorName));
  }
  function factionCountInBase(factionName: string): number {
    return allPlacedNames.filter((n) => operatorByName.get(n)?.faction === factionName).length;
  }

  const ccSlots = (assignments['controlCenter'] || []).filter((s): s is SlotAssignment => s !== null);
  const ccOperatorNames = ccSlots.map((s) => s.operatorName);
  const silverAshReignfrostInControlCenter = ccOperatorNames.includes('SilverAsh the Reignfrost');

  // Training Room has exactly 1 slot in this simulator's model, so "is
  // Logos the Trainer" and "is Logos the Training Room's occupant" are
  // the same question here -- there's no separate trainer/trainee role
  // distinction to model since only one operator can ever be assigned.
  const trainingRoomSlots = (assignments['trainingRoom'] || []).filter((s): s is SlotAssignment => s !== null);
  const logosInTrainingRoom = trainingRoomSlots.some((s) => s.operatorName === 'Logos');

  // Eunectes's "I've Got This" (Control Center): if Lancet-2 is in a
  // Power Plant, Power Plant count +2 -- explicitly the FACILITY count
  // only, not operator/robot headcounts, so this affects every Factory
  // skill that scales off powerPlantCount (Windflit, Eunectes's own
  // Automation skills, Passenger, Weedy) without touching
  // powerPlantOperatorCount/robotPowerPlantCount at all.
  const eunectesIveGotThisActive = ccSlots.some(
    (s) => s.operatorName === 'Eunectes' && skillsFor(s, 'Control Center').some((sk) => sk.name === "I've Got This")
  );
  // Greyy the Lightningbearer's "Dawnlight": +1 Power Plant (facility
  // count only), conditional on no OTHER Power Plant containing an
  // Operation Platform robot (her own Power Plant is excluded from that
  // check by definition -- it's "other" Power Plants specifically).
  const greyyDawnlightActive =
    greyyDawnlightPowerPlantId !== null &&
    ![...powerPlantsWithRobot].some((id) => id !== greyyDawnlightPowerPlantId);
  const effectivePowerPlantCount =
    FACILITIES.filter((f2) => f2.kind === 'powerPlant').length +
    (eunectesIveGotThisActive && lancet2InPowerPlant ? 2 : 0) +
    (greyyDawnlightActive ? 1 : 0);
  const civilightEternaInCC = ccOperatorNames.includes('Civilight Eterna');

  const dormitoryCountForCC = FACILITIES.filter((f) => f.kind === 'dormitory').length;

  const tradingPostFacilities = FACILITIES.filter((f) => f.kind === 'tradingPost');
  const tradingPostFactionCounts = tradingPostFacilities.map((f) => ({
    facilityId: f.id,
    operatorNames: (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null).map((s) => s.operatorName),
  }));
  function operatorInAnyTradingPost(name: string): { facilityId: string } | null {
    for (const tp of tradingPostFactionCounts) {
      if (tp.operatorNames.includes(name)) return { facilityId: tp.facilityId };
    }
    return null;
  }
  const receptionRoomOperatorNames = (assignments['receptionRoom'] || [])
    .filter((s): s is SlotAssignment => s !== null)
    .map((s) => s.operatorName);
  function reineInReceptionRoom(name: string): boolean {
    return receptionRoomOperatorNames.includes(name);
  }

  let blacksteelWorldwideCountInFactories = 0;
  const blacksteelWorldwideFactoryCounts: { factoryId: string; count: number }[] = [];
  const pinusSylvestrisFactoryAssignments: { factoryId: string; product: 'Battle Records' | 'Precious Metals' | null }[] = [];
  const abyssalHunterFactoryCounts: { factoryId: string; count: number }[] = [];
  let abyssalHunterTotalInFactories = 0; // base-wide total across every Factory -- Gladiia's Group Hunting bonus scales each Factory's boost by BOTH how many AH are in that specific Factory AND how many exist base-wide, confirmed by the user's own worked examples
  const factoriesWithKnight: { facilityId: string; knightCount: number; totalFilled: number }[] = [];
  for (const f of FACILITIES) {
    if (f.kind !== 'factory') continue;
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    const ahHere = slots.filter((s) => ABYSSAL_HUNTERS.has(s.operatorName)).length;
    if (ahHere > 0) abyssalHunterFactoryCounts.push({ factoryId: f.id, count: ahHere });
    abyssalHunterTotalInFactories += ahHere;
    const knightCount = slots.filter((s) => KNIGHTS.has(s.operatorName)).length;
    if (knightCount > 0) factoriesWithKnight.push({ facilityId: f.id, knightCount, totalFilled: slots.length });
    const bswHere = slots.filter((s) => BLACKSTEEL_WORLDWIDE.has(s.operatorName)).length;
    if (bswHere > 0) blacksteelWorldwideFactoryCounts.push({ factoryId: f.id, count: bswHere });
    for (const s of slots) {
      if (BLACKSTEEL_WORLDWIDE.has(s.operatorName)) blacksteelWorldwideCountInFactories += 1;
      if (PINUS_SYLVESTRIS.has(s.operatorName)) {
        pinusSylvestrisFactoryAssignments.push({ factoryId: f.id, product: (factoryProducts[f.id] as 'Battle Records' | 'Precious Metals' | undefined) || null });
      }
    }
  }

  // Preliminary Office HR speed (generic + Office special skills, minus
  // anything that itself depends on Control Center) -- computed early
  // because Saileach's Control Center skill needs this value.
  // Base-wide resource pools -- computed once, early, since both Office
  // and Control Center handlers need the final values. Self-contained
  // (doesn't depend on dormitoryOperatorNames/facilitiesWithSuiOperator,
  // which are computed later in this function for other purposes) so it
  // doesn't need to wait on those.
  const activeSkillKeys = new Set<string>();
  let earlyDormitoryOperatorCount = 0;
  let earlySuiFacilityCount = 0;
  let earlySuiHeadcountNonDorm = 0;
  let abyssalHuntersRestingInDormitories = 0;
  let abyssalHuntersInNonDormFacilities = 0;
  let totalMonsterMeal = 0;
  // Base-wide headcounts for Eyjafjalla's and Yu's Dormitory skills.
  // Real text excludes "Assistants and Activity Room users" -- confirmed
  // not needed for this base setup (no Assistants/Activity Room usage),
  // so this counts every placed operator matching the roster directly.
  let wanderingMedicCountBaseWide = 0;
  let suiCountBaseWide = 0;
  let virtuosaRoomOperatorCount = 0;
  for (const f of FACILITIES) {
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    for (const slot of slots) {
      for (const sk of skillsFor(slot, f.label)) {
        activeSkillKeys.add(`${slot.operatorName}|${sk.name}`);
      }
      if (WANDERING_MEDIC.has(slot.operatorName)) wanderingMedicCountBaseWide++;
      if (SUI.has(slot.operatorName)) suiCountBaseWide++;
    }
    const abyssalHere = slots.filter((s) => ABYSSAL_HUNTERS.has(s.operatorName)).length;
    if (f.kind === 'dormitory') {
      earlyDormitoryOperatorCount += slots.length;
      abyssalHuntersRestingInDormitories += abyssalHere;
      // Senshi's Diner: "provide 1 Monster Meal for every level of the
      // current Dormitory" -- Dormitories are confirmed Level 5, so
      // each Senshi placement generates 5.
      // Virtuosa's Soundless Resonance: "for every 1 Operator in that
      // Dormitory, Soundless Resonance +1" -- scales with HER OWN room's
      // size specifically, not the base-wide Dormitory total.
      for (const slot of slots) {
        if (slot.operatorName === 'Senshi' && skillsFor(slot, f.label).some((sk) => sk.name === "Senshi's Diner")) {
          // "for every level of the current Dormitory" -- the level of the
          // Dormitory he is actually standing in, which is user-settable. This
          // was hardcoded to 5 on the assumption that every Dormitory is max
          // level; in a Level 2 Dormitory he generates 2, so Laios read 155%
          // (5 meals) where he should read 149% (2 meals x 2% each).
          totalMonsterMeal += f.level;
        }
        if (slot.operatorName === 'Virtuosa' && skillsFor(slot, f.label).some((sk) => sk.name === 'Soundless Resonance')) {
          virtuosaRoomOperatorCount = slots.length;
        }
      }
      continue;
    }
    abyssalHuntersInNonDormFacilities += abyssalHere;
    const suiHere = slots.filter((s) => operatorByName.get(s.operatorName)?.faction === 'Sui').length;
    if (suiHere > 0) earlySuiFacilityCount += 1;
    earlySuiHeadcountNonDorm += suiHere;
  }
  const teamRainbowOperatorsInCC = ccOperatorNames.filter((n) => TEAM_RAINBOW.has(n)).length;
  const blacksteelWorldwideCountInBase = allPlacedNames.filter((n) => BLACKSTEEL_WORLDWIDE.has(n)).length;
  // Nasti's own skill counts herself toward her 3% scale, so this is a
  // plain whole-base count with no exclusion. Muelsyse's separate
  // "other Rhine Lab" count (excluding herself) is computed per-Power-
  // Plant where it's actually consumed, since it needs to know which
  // specific operator is asking.
  const rhineLabCountInBase = allPlacedNames.filter((n) => RHINE_LAB.has(n)).length;

  // Gladiia's Group Hunting -- confirmed mechanic: 5%/10% productivity
  // per Abyssal Hunter in Factories (base-wide count), capping at
  // Waai Fu's Cooperative Will needs to know whether Gladiia's Group
  // Hunting is active (it gets overridden when it is) -- the NUMERIC
  // bonus itself is applied entirely through controlCenterSpecialSkills.ts's
  // perFactoryProductivity mechanism now, not duplicated here (that
  // duplication was the actual bug: this used to ALSO compute and apply
  // its own separate copy of the same bonus, using the older, simpler
  // per-factory-only formula, stacking on top of the newer, correctly
  // base-wide-scaled one).
  const gladiiaGroupHuntingActiveInCC = ccOperatorNames.includes('Gladiia');
  // Prelim pass, mirroring the Office prelim pattern above: runs every
  // Control Center handler once early, using placeholder values for
  // fields that genuinely can't be known yet (resourceBonuses,
  // officeHrSpeedPercent) since only a couple of handlers even read
  // those for their own Morale output -- an accepted, minor
  // approximation, same tradeoff already made for Office's own prelim
  // pass. Purpose: derive each Control Center operator's own Morale
  // rate, then the facility-wide window (time until the first operator
  // hits 0), then for Ling/Dusk specifically, what fraction of that
  // window they spend above vs below 12 Morale -- confirmed by the
  // user: operators start at full Morale and are simply left in place
  // until the first one runs out.
  const emptyResourcePoolsForPrelim: ResourcePools = {
    passion: 0,
    worldlyPlight: 0,
    soundlessResonance: 0,
    perceptionInformation: 0,
    intelligenceReserve: 0,
    memoryFragments: 0,
    witchcraftCrystal: 0,
    chainOfThought: 0,
    measure: 0,
    dreamland: 0,
  };
  let prelimCcMoraleBonus = 0;
  const prelimCcSelfMorale: Record<string, number> = {};
  for (const slot of ccSlots) {
    for (const sk of skillsFor(slot, 'Control Center')) {
      const key = `${slot.operatorName}|${sk.name}`;
      const handler = CONTROL_CENTER_SPECIAL_SKILLS[key];
      if (!handler) continue;
      const result = handler({
        rosters,
        manualValue: slot.manualValue,
        ccOperatorNames,
        // Wang's Expedience compares Factories against Power Plants +
        // Trading Posts, which is the player's own layout now.
        ...layoutCounts,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        tradingPostFactionCounts,
        reineInReceptionRoom,
        operatorInAnyTradingPost,
        blacksteelWorldwideCountInFactories,
        blacksteelWorldwideFactoryCounts,
        pinusSylvestrisFactoryAssignments,
        abyssalHunterFactoryCounts,
        abyssalHunterTotalInFactories,
        factoriesWithKnight,
        powerPlantOperatorCount,
        robotPowerPlantCount,
        officeHrSpeedPercent: 0, // not yet known at this point -- only Saileach reads this, and her skill doesn't affect Morale at all
        civilightEternaInCC,
        resourcePools: emptyResourcePoolsForPrelim,
        resourceBonuses: {},
        activeSkillKeys,
        abyssalHuntersInNonDormFacilities,
        abyssalHuntersRestingInDormitories,
        eliteLevel: slot.eliteLevel,
        allPlacedNames,
      });
      if (result.ccMoraleBonus) prelimCcMoraleBonus += result.ccMoraleBonus;
      if (result.selfMorale) {
        prelimCcSelfMorale[slot.operatorName] = (prelimCcSelfMorale[slot.operatorName] || 0) + result.selfMorale;
      }
      if (result.targetedMoraleEffect) {
        const { targetName, amount } = result.targetedMoraleEffect;
        prelimCcSelfMorale[targetName] = (prelimCcSelfMorale[targetName] || 0) + amount;
      }
      if (result.targetedMoraleEffects) {
        for (const { targetName, amount } of result.targetedMoraleEffects) {
          prelimCcSelfMorale[targetName] = (prelimCcSelfMorale[targetName] || 0) + amount;
        }
      }
    }
  }
  const prelimCcGreyRate = ccSlots.length > 0 ? Math.max(0, 1 - 0.05 * (ccSlots.length - 1)) : 0;
  // Manual setting instead of a calculated fraction -- confirmed by the
  // user: the real trigger depends on how the whole day actually plays
  // out, which this steady-state simulator can't track, so it's a
  // direct on/off choice instead. Defaults to "above 12".
  const lingFractionAbove12 = moraleAbove12 ? 1 : 0;
  const duskFractionAbove12 = moraleAbove12 ? 1 : 0;

  const resourceState: BaseResourceState = {
    // Wang's Expedience weighs Factories against Power Plants + Trading
    // Posts, so it needs the layout the player actually built.
    ...layoutCounts,
    dormitoryOperatorCount: earlyDormitoryOperatorCount,
    suiOperatorsInNonDormFacilities: earlySuiHeadcountNonDorm,
    suiOperatorFacilityCount: earlySuiFacilityCount,
    teamRainbowOperatorsInCC,
    // Assumes full Morale at the start of a freshly-placed 24h cycle --
    // this calculator computes a steady-state snapshot rather than a true
    // minute-by-minute simulation, so morale-threshold skills (Dusk,
    // Ling) are evaluated at this single starting condition rather than
    // tracking how morale actually depletes over the day.
    selfMorale: 24,
    lingFractionAbove12,
    duskFractionAbove12,
    virtuosaRoomOperatorCount,
  };
  const resourcePools = computeResourcePools(resourceState, activeSkillKeys);
  const resourceBonuses = consumerBonuses(resourceState, resourcePools);

  const officeSlotsForPrelim = (assignments['office'] || []).filter((s): s is SlotAssignment => s !== null);
  let prelimOfficeSpecialHr = 0;
  let officeReceptionRoomBonus = 0;
  const prelimOfficeGeneric: (string | null)[] = [];
  for (const slot of officeSlotsForPrelim) {
    for (const sk of skillsFor(slot, 'Office')) {
      const handler = OFFICE_SPECIAL_SKILLS[`${slot.operatorName}|${sk.name}`];
      if (handler) {
        const result = handler({
          manualValue: slot.manualValue,
          dormitoryCount: dormitoryCountForCC,
          silverAshReignfrostInControlCenter,
          resourceBonuses,
          ursusSpecialtyBeverageTotal: 0, // Control Center processing (where this is actually generated) hasn't run yet at this point -- only feeds Saileach's threshold check, not Blitz's own final HR speed
        });
        if (result.hrSpeed) prelimOfficeSpecialHr += result.hrSpeed;
        if (result.receptionRoomClueSpeed) officeReceptionRoomBonus += result.receptionRoomClueSpeed;
      } else {
        prelimOfficeGeneric.push(sk.description);
      }
    }
  }
  const officeHrSpeedPercent = (calcOffice(prelimOfficeGeneric).speed + prelimOfficeSpecialHr) * 100;

  // Control Center's cross-facility effects, computed once here since
  // every other facility's calculation needs it.
  const ccDescriptions = ccSlots.flatMap((s) =>
    skillsFor(s, 'Control Center')
      .filter((sk) => !(`${s.operatorName}|${sk.name}` in CONTROL_CENTER_SPECIAL_SKILLS))
      .map((sk) => sk.description)
  );
  let ccEffects: ControlCenterEffects = calcControlCenterEffects(ccDescriptions);
  // Who actually won the highest-only Clue Collection pool. calcControlCenterEffects
  // returns the value but not the source, and the Reception Room's breakdown was
  // labelling it "(Control Center) (generic)" -- true, but useless when Civilight
  // Eterna's +15% and Wiš'adel's +5% are both in play and only one of them is the
  // one being reported. Tracked over the same generic skills the pool is built
  // from; a special-cased candidate overwrites it below, where the source is known.
  let clueCollectionSource: { operatorName: string; skillName: string | null } | null = null;
  for (const slot of ccSlots) {
    for (const sk of skillsFor(slot, 'Control Center')) {
      if (`${slot.operatorName}|${sk.name}` in CONTROL_CENTER_SPECIAL_SKILLS) continue;
      if (Math.abs(clueCollectionBonusFrom(sk.description)) === Math.abs(ccEffects.clueCollectionBonus)
          && ccEffects.clueCollectionBonus !== 0 && !clueCollectionSource) {
        clueCollectionSource = { operatorName: slot.operatorName, skillName: sk.name };
      }
    }
  }
  const wisAdelBannerOfBabelActive = ccSlots.some(
    (s) => s.operatorName === "Wiš'adel" && skillsFor(s, 'Control Center').some((sk) => sk.name === 'Banner of Babel')
  );
  const bannerOfBabelBonus = wisAdelBannerOfBabelActive ? (civilightEternaInCC ? 0.2 : 0.1) : 0;
  const chongyueSolitaryLightActive = ccSlots.some(
    (s) => s.operatorName === 'Chongyue' && skillsFor(s, 'Control Center').some((sk) => sk.name === 'Solitary Light')
  );
  const chongyueSolitaryLightBonus = chongyueSolitaryLightActive
    ? 0.05 + (resourceBonuses['Chongyue|Solitary Light|morale_recovery_bonus'] ?? 0)
    : 0;
  // The base "each CC operator provides +0.05 relief" portion,
  // unconditional on who they are -- kept separate from the full
  // ccMoraleRelief below, since that bundles in bannerOfBabelBonus and
  // chongyueSolitaryLightBonus, which are specifically cross-facility
  // effects for every OTHER facility (see the comment above where
  // they're computed), not meant to apply back to Control Center's own
  // display.
  const ccBaseMoraleRelief = calcControlCenterMoraleRelief(ccSlots.length);
  const ccMoraleRelief = ccBaseMoraleRelief + bannerOfBabelBonus + chongyueSolitaryLightBonus;

  let ccDormitoryAllOperatorsRelief = 0; // highest-only among "all Operators in Dormitories" effects (Kestrel, Nymph, Reed the Flame Shadow)
  let ccDormitoryEliteOperatorsRelief = 0; // highest-only among "all Elite Operators in Dormitories" effects (Raidian) -- a separate type, doesn't compete with the above
  let officeHrSpeedBonusFromCC = 0;
  let trainingSpeedBonusFromCC = 0; // highest-only among Ascalon/Blaze the Igniting Spark/Hoshiguma the Breacher, all confirmed "strongest effect of this type"
  let factoryPreciousMetalBonusFromCC = 0;
  let receptionRoomClueSpeedFromCC = 0;
  const receptionRoomClueSpeedSources: { operatorName: string; skillName: string | null; amount: number }[] = [];
  const perTradingPostBonus = new Map<string, number>();
  const perTradingPostOrderLimitBonus = new Map<string, number>();
  const perFactoryProductivityBonus = new Map<string, number>();
  // Who each of those per-Factory amounts came from. The map above is a bare
  // total, which is fine for the arithmetic but leaves the Factory's "?" panel
  // unable to name Viviana, Flametail or Justice Knight -- and an unexplained
  // gap between the panel and the tile is exactly how a wrong number hides.
  const perFactoryProductivitySources = new Map<string, { operatorName: string; skillName: string | null; amount: number }[]>();
  function addPerFactoryProductivity(facilityId: string, amount: number, operatorName: string, skillName: string | null) {
    perFactoryProductivityBonus.set(facilityId, (perFactoryProductivityBonus.get(facilityId) || 0) + amount);
    perFactoryProductivitySources.set(facilityId, [
      ...(perFactoryProductivitySources.get(facilityId) || []),
      { operatorName, skillName, amount },
    ]);
  }
  // Justice Knight's "Beep beep, activate!" cross-facility bonus, tracked
  // earlier -- was computed in powerPlantSpecialSkills.ts but never
  // actually applied anywhere until now.
  if (justiceKnightActiveInAnyPowerPlant && wildManeFactoryId) {
    addPerFactoryProductivity(wildManeFactoryId, 0.05, 'Justice Knight', '"Beep beep, activate!"');
  }
  // Per-skill attribution for the Control Center's own breakdown panel. The
  // aggregates in ccEffects say what the room produces but not who produced it,
  // and without a panel the Control Center had nowhere to show any of this --
  // which is why its skills' notes were being printed onto the facility tile
  // instead, filling the card with paragraphs.
  const ccBreakdownLines: FacilityBreakdownLine[] = [];
  let totalFelvine = 0;
  let totalUrsusBeverage = 0;
  const ccSelfMorale: Record<string, number> = {};

  for (const slot of ccSlots) {
    for (const sk of skillsFor(slot, 'Control Center')) {
      const handler = CONTROL_CENTER_SPECIAL_SKILLS[`${slot.operatorName}|${sk.name}`];
      if (!handler) continue;
      const result = handler({
        rosters,
        manualValue: slot.manualValue,
        ccOperatorNames,
        // Wang's Expedience compares Factories against Power Plants +
        // Trading Posts, which is the player's own layout now.
        ...layoutCounts,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        tradingPostFactionCounts,
        reineInReceptionRoom,
        operatorInAnyTradingPost,
        blacksteelWorldwideCountInFactories,
        blacksteelWorldwideFactoryCounts,
        pinusSylvestrisFactoryAssignments,
        abyssalHunterFactoryCounts,
        abyssalHunterTotalInFactories,
        factoriesWithKnight,
        powerPlantOperatorCount,
        robotPowerPlantCount,
        officeHrSpeedPercent,
        civilightEternaInCC,
        resourcePools,
        resourceBonuses,
        activeSkillKeys,
        abyssalHuntersInNonDormFacilities,
        abyssalHuntersRestingInDormitories,
        eliteLevel: slot.eliteLevel,
        allPlacedNames,
      });
      if (result.ccMoraleBonus) ccEffects = { ...ccEffects, ccMoraleBonus: ccEffects.ccMoraleBonus + result.ccMoraleBonus };
      if (result.tradingPostBonusCandidate && Math.abs(result.tradingPostBonusCandidate) > Math.abs(ccEffects.tradingPostBonus)) {
        ccEffects = { ...ccEffects, tradingPostBonus: result.tradingPostBonusCandidate };
      }
      if (result.factoryBonusCandidate && Math.abs(result.factoryBonusCandidate) > Math.abs(ccEffects.factoryBonus)) {
        ccEffects = { ...ccEffects, factoryBonus: result.factoryBonusCandidate };
      }
      if (result.clueCollectionBonusCandidate && Math.abs(result.clueCollectionBonusCandidate) > Math.abs(ccEffects.clueCollectionBonus)) {
        ccEffects = { ...ccEffects, clueCollectionBonus: result.clueCollectionBonusCandidate };
        clueCollectionSource = { operatorName: slot.operatorName, skillName: sk.name };
      }
      if (result.dormitoryMoraleRelief) ccDormitoryAllOperatorsRelief = Math.max(ccDormitoryAllOperatorsRelief, result.dormitoryMoraleRelief);
      if (result.dormitoryEliteOperatorsRelief) ccDormitoryEliteOperatorsRelief = Math.max(ccDormitoryEliteOperatorsRelief, result.dormitoryEliteOperatorsRelief);
      if (result.officeHrSpeedBonus) officeHrSpeedBonusFromCC += result.officeHrSpeedBonus;
      if (result.trainingSpeedBonus) trainingSpeedBonusFromCC = Math.max(trainingSpeedBonusFromCC, result.trainingSpeedBonus);
      if (result.factoryPreciousMetalBonusFromCC) factoryPreciousMetalBonusFromCC += result.factoryPreciousMetalBonusFromCC;
      if (result.receptionRoomClueSpeedFromCC) {
        receptionRoomClueSpeedFromCC += result.receptionRoomClueSpeedFromCC;
        receptionRoomClueSpeedSources.push({ operatorName: slot.operatorName, skillName: sk.name, amount: result.receptionRoomClueSpeedFromCC });
      }
      if (result.perTradingPostOrderEfficiency) {
        for (const { facilityId, amount } of result.perTradingPostOrderEfficiency) {
          perTradingPostBonus.set(facilityId, (perTradingPostBonus.get(facilityId) || 0) + amount);
        }
      }
      if (result.perTradingPostOrderLimit) {
        for (const { facilityId, amount } of result.perTradingPostOrderLimit) {
          perTradingPostOrderLimitBonus.set(facilityId, (perTradingPostOrderLimitBonus.get(facilityId) || 0) + amount);
        }
      }
      if (result.perFactoryProductivity) {
        for (const { facilityId, amount } of result.perFactoryProductivity) {
          addPerFactoryProductivity(facilityId, amount, slot.operatorName, sk.name);
        }
      }
      // One line per skill, carrying whatever it contributed. Morale is the
      // Control Center's own output; everything else it produces lands in other
      // facilities, so those are reported as 0 here with the note saying where
      // to look, rather than being silently absent.
      {
        const landsElsewhere = [
          result.tradingPostBonusCandidate !== undefined && 'Trading Post order efficiency',
          result.factoryBonusCandidate !== undefined && 'Factory productivity',
          result.clueCollectionBonusCandidate !== undefined && 'Reception Room clue speed',
          result.receptionRoomClueSpeedFromCC !== undefined && 'Reception Room clue speed',
          result.perFactoryProductivity?.length && 'a specific Factory',
          result.perTradingPostOrderEfficiency?.length && 'a specific Trading Post',
          result.perTradingPostOrderLimit?.length && 'a specific Trading Post order limit',
          result.officeHrSpeedBonus !== undefined && 'Office HR speed',
          result.factoryPreciousMetalBonusFromCC !== undefined && 'Factory Precious Metal productivity',
          result.dormitoryMoraleRelief !== undefined && 'Dormitory morale',
          result.trainingSpeedBonus !== undefined && 'Training Room speed',
        ].filter(Boolean) as string[];
        const morale = result.ccMoraleBonus ?? 0;
        if (morale !== 0 || landsElsewhere.length > 0 || result.note) {
          ccBreakdownLines.push({
            operatorName: slot.operatorName,
            skillName: sk.name,
            rawValue: morale,
            included: morale !== 0,
            reason: morale !== 0
              ? 'Morale per hour for everyone in the Control Center -- these stack rather than competing.'
              : landsElsewhere.length > 0
                ? `Contributes nothing to this room; it lands in ${landsElsewhere.join(', ')}.`
                : 'No numeric effect on this room.',
            note: result.note,
          });
        }
      }
      if (result.felvine) totalFelvine += result.felvine;
      if (result.ursusSpecialtyBeverage) totalUrsusBeverage += result.ursusSpecialtyBeverage;
      if (result.selfMorale) {
        ccSelfMorale[slot.operatorName] = (ccSelfMorale[slot.operatorName] || 0) + result.selfMorale;
      }
      if (result.targetedMoraleEffect) {
        const { targetName, amount } = result.targetedMoraleEffect;
        ccSelfMorale[targetName] = (ccSelfMorale[targetName] || 0) + amount;
      }
      if (result.targetedMoraleEffects) {
        for (const { targetName, amount } of result.targetedMoraleEffects) {
          ccSelfMorale[targetName] = (ccSelfMorale[targetName] || 0) + amount;
        }
      }
    }
  }
  const dormitoryCount = FACILITIES.filter((f) => f.kind === 'dormitory').length;
  const dormitoryOperatorNames = new Set<string>();
  for (const f of FACILITIES) {
    if (f.kind !== 'dormitory') continue;
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    slots.forEach((s) => dormitoryOperatorNames.add(s.operatorName));
  }
  function dormitoryHasOperator(name: string): boolean {
    return dormitoryOperatorNames.has(name);
  }

  const dormitoryRecoveryByFacility: Record<string, { name: string; base: number; bonus: number }[]> = {};
  for (const f of FACILITIES) {
    if (f.kind !== 'dormitory') continue;
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    const roomNames = slots.map((s2) => s2.operatorName);
    // This specific Dormitory's own base recovery rate -- depends on ITS
    // level and ITS ambience (player-set, or defaulted to fully-furnished
    // for that level if never touched), not a single base-wide constant.
    const thisRoomBaseRecovery = calcDormitoryRecovery(f.level, dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level));

    // First pass: what does each operator's own skill contribute --
    // to themselves, to everyone (self included), to everyone else, and
    // to one specific other operator (single-target skills).
    const perSlotResults = slots.map((s) => {
      let selfBonus = 0;
      let allOperatorsBonus = 0;
      let allOthersBonus = 0;
      let singleTargetBonus = 0;
      // Leftmost OTHER operator in the room (confirmed tie-break, since
      // every operator is assumed to start at full Morale when placed --
      // everyone's tied for lowest, so the leftmost one wins) -- UNLESS
      // this operator has a confirmed preferred target who's actually
      // present in the room, which takes precedence over the tiebreak
      // entirely (e.g. Schwarz always targets Ceylon if she's there).
      const preferredTarget = DORMITORY_PREFERRED_TARGET[s.operatorName];
      const targetIfSelected =
        (preferredTarget && roomNames.includes(preferredTarget) ? preferredTarget : null) ??
        roomNames.find((n) => n !== s.operatorName) ??
        null;
      for (const sk of skillsFor(s, 'Dormitory')) {
        const handler = DORMITORY_SPECIAL_SKILLS[`${s.operatorName}|${sk.name}`];
        if (!handler) continue;
        const result = handler({
          rosters,
          manualValue: s.manualValue,
          sameRoomOperatorNames: roomNames,
          filledCountThisRoom: slots.length,
          // The player sets each Dormitory's own level now, so read this
          // room's rather than assuming every Dormitory is maxed.
          dormitoryLevel: f.level,
          targetIfSelected,
          wanderingMedicCountBaseWide,
          suiCountBaseWide,
          soundlessResonanceTotal: resourcePools.soundlessResonance,
          powerPlantCount: layoutCounts.powerPlantCount, // Lumen's Glimmering Glow scales off it
        });
        selfBonus += result.selfMoraleRecovery || 0;
        allOperatorsBonus += result.allOperatorsBonus || 0;
        allOthersBonus += result.allOthersBonus || 0;
        singleTargetBonus += result.singleTargetBonus || 0;
      }
      return { name: s.operatorName, selfBonus, allOperatorsBonus, allOthersBonus, singleTargetBonus, targetIfSelected };
    });

    // The single-target group is highest-only across the WHOLE room --
    // only the strongest singleTargetBonus actually applies, and only to
    // its own associated target (not necessarily the same target every
    // other skill-holder in the room would have picked).
    const winningSingleTarget = perSlotResults
      .filter((r) => r.targetIfSelected !== null)
      .reduce<{ target: string; value: number } | null>((best, r) => {
        if (r.singleTargetBonus <= 0) return best;
        if (!best || r.singleTargetBonus > best.value) return { target: r.targetIfSelected!, value: r.singleTargetBonus };
        return best;
      }, null);

    // Second pass: each operator's actual final bonus is their own
    // self-bonus, plus every "all operators" contribution in the room
    // (their own included), plus every "all others" contribution from
    // OTHER operators specifically (not their own, since "others"
    // excludes the skill-holder by definition), plus the single-target
    // bonus if they're the one operator it actually landed on.
    dormitoryRecoveryByFacility[f.id] = perSlotResults.map((r) => {
      // "Restores Morale to all Operators" skills are explicitly
      // highest-only per their own text ("Only the strongest effect of
      // this type takes place") -- only the SINGLE best one in the room
      // applies, not a sum of every such skill present.
      const fromAllOperators = Math.max(0, ...perSlotResults.map((other) => other.allOperatorsBonus));
      // "Restores Morale to all OTHER Operators" skills are ALSO
      // confirmed highest-only ("Only the strongest effect of this type
      // takes place" appears on Bagpipe's own entry) -- same fix as
      // allOperatorsBonus above, just excluding the recipient's own
      // contribution (a skill-holder never gets their own "others" bonus).
      const fromOthers = Math.max(0, ...perSlotResults.filter((other) => other.name !== r.name).map((other) => other.allOthersBonus));
      const fromSingleTarget = winningSingleTarget && winningSingleTarget.target === r.name ? winningSingleTarget.value : 0;
      const fromCCAllOperators = ccDormitoryAllOperatorsRelief;
      const fromCCEliteOperators = ELITE_OPERATOR.has(r.name) ? ccDormitoryEliteOperatorsRelief : 0;
      return { name: r.name, base: thisRoomBaseRecovery, bonus: r.selfBonus + fromAllOperators + fromOthers + fromSingleTarget + fromCCAllOperators + fromCCEliteOperators };
    });
  }

  const distinctFactoryProductCount = new Set(Object.values(factoryProducts).filter(Boolean)).size;
  const baseGoldLineCount = pureGoldProductionLineCount(Object.values(factoryProducts));
  const kiraraGoldLineBonus = activeSkillKeys.has('Kirara|Order Flow Visualization α')
    ? Math.floor(baseGoldLineCount / 4) * 2
    : activeSkillKeys.has('Kirara|Order Flow Visualization β')
    ? Math.floor(baseGoldLineCount / 2) * 2
    : 0;
  const pozemkaGoldLineBonus = activeSkillKeys.has('Pozëmka|Zeruertza Resident')
    ? Math.min(4, allPlacedNames.filter((n) => DURIN.has(n)).length)
    : 0;
  const effectiveGoldLineCount = baseGoldLineCount + kiraraGoldLineBonus + pozemkaGoldLineBonus;
  const ulpianusInBase = allPlacedNames.includes('Ulpianus');
  let facilitiesWithSuiOperator = 0;
  let facilitiesWithEliteOperator = 0;
  for (const f of FACILITIES) {
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    if (f.kind !== 'dormitory' && slots.some((s) => operatorByName.get(s.operatorName)?.faction === 'Sui')) facilitiesWithSuiOperator += 1;
    if (slots.some((s) => ELITE_OPERATOR.has(s.operatorName))) facilitiesWithEliteOperator += 1;
  }

  // Base-wide aggregates, computed across every facility, not just the
  // currently-open one. Tracked as Green/Red pairs: Green is the
  // REALISTIC daily average given the player's actual chosen login
  // interval -- if a Trading Post or Factory hits full capacity (or
  // its operators run dry) before the player is due back, it sits idle
  // doing nothing until the next check-in, wasting that time. Red is
  // the IDEAL daily average assuming the player always collects the
  // instant a room caps out, so it's never idle -- always >= Green,
  // and exactly equal to it whenever loginInterval is short enough
  // that the room never actually caps before they return anyway.
  let dailyExpGreen = 0;
  let dailyExpRed = 0;
  let dailyGoldMadeGreen = 0; // Factory (Precious Metals) production -- not yet sold
  let dailyGoldMadeRed = 0;
  let dailyGoldSoldGreen = 0; // Trading Post's random gold spawns -- this is what actually becomes LMD
  let dailyGoldFromProvisoGreen = 0; // Proviso's own slice of the gold above -- isolated for display, not a separate pool
  let dailyGoldFromProvisoRed = 0;
  let dailyGoldSoldRed = 0;
  let dailyExtraLmdFromTequilaGreen = 0;
  let dailyExtraLmdFromTequilaRed = 0;
  let dailyLmdFromPepeGreen = 0; // Pepe's Special Exclusive Orders -- a completely separate mechanic, no gold bar at all, fixed 270min/order regardless of any efficiency modifier
  let dailyLmdFromPepeRed = 0;

  for (const f of FACILITIES) {
    if (f.capacity <= 0) continue;
    const { productivity, deadTime, fullTime } = productivityFor(f, ccEffects, ccMoraleRelief);
    // capHours: whichever comes first -- running out of storage
    // capacity (fullTime) or running out of operator energy (deadTime)
    // -- is when this room actually stops producing until someone
    // collects/reassigns it. null means neither applies (never stops).
    const capHours = fullTime !== null && deadTime !== null ? Math.min(fullTime, deadTime) : fullTime !== null ? fullTime : deadTime;
    const cyclesPerDay = 24 / loginInterval;
    // Realistic: each login cycle only produces for min(capHours,
    // loginInterval) hours -- if the room caps before the player is
    // due back, the rest of that cycle is wasted. Ideal: always
    // exactly 24 (== 24/24), since perfect on-time collection means
    // the room is never actually idle.
    const realisticFraction = capHours !== null ? (Math.min(capHours, loginInterval) * cyclesPerDay) / 24 : 1;
    const idealFraction = 1;

    if (f.kind === 'factory' && productivity) {
      const product = factoryProducts[f.id];
      const effectiveProductivity = productivity.grey + productivity.yellow;
      if (product === 'Battle Records') {
        const perDay = calcDailyProduction(effectiveProductivity, 'Battle Records') * 1000;
        dailyExpGreen += perDay * realisticFraction;
        dailyExpRed += perDay * idealFraction;
      } else if (product === 'Precious Metals') {
        const perDay = calcDailyProduction(effectiveProductivity, 'Precious Metals');
        dailyGoldMadeGreen += perDay * realisticFraction;
        dailyGoldMadeRed += perDay * idealFraction;
      }
    }
    if (f.kind === 'tradingPost' && productivity) {
      const effectiveProductivity = productivity.grey + productivity.yellow;
      const roomSlots = assignments[f.id] || [];
      const pepeInsightfulActive = roomSlots.some(
        (s) => s && s.operatorName === 'Pepe' && skillsFor(s, 'Trading Post').some((sk) => sk.name === 'Insightful')
      );
      const uOfficialHere = roomSlots.some(
        (s) => s && s.operatorName === 'U-Official' && skillsFor(s, 'Trading Post').some((sk) => sk.name === 'Naive Negotiator')
      );
      const provisoBonus = roomSlots.some((s) => s && s.operatorName === 'Proviso' && skillsFor(s, 'Trading Post').some((sk) => sk.name === 'Damages for Breach β'))
        ? 2
        : roomSlots.some((s) => s && s.operatorName === 'Proviso' && skillsFor(s, 'Trading Post').some((sk) => sk.name === 'Damages for Breach α'))
        ? 1
        : 0;
      const tequilaLmdBonus = roomSlots.some((s) => s && s.operatorName === 'Tequila' && skillsFor(s, 'Trading Post').some((sk) => sk.name === 'Investment β'))
        ? 500
        : roomSlots.some((s) => s && s.operatorName === 'Tequila' && skillsFor(s, 'Trading Post').some((sk) => sk.name === 'Investment α'))
        ? 250
        : 0;
      const GOLD_TIER_HIGHER = new Set(['Bibeak|Tailoring β', "Diamante|Appraiser's Means", 'Kafka|Handicrafts β', 'Paprika|Tailoring β']);
      const GOLD_TIER_LOWER = new Set([
        'Bena|Tailoring α',
        'Bibeak|Tailoring α',
        "Diamante|Appraiser's Eyes",
        'Kafka|Handicrafts α',
        'Paprika|Tailoring α',
        'Shamare|Tailoring α',
        'Mitm|Know the Ropes',
      ]);
      const hasHigherTier = roomSlots.some((s) => s && skillsFor(s, 'Trading Post').some((sk) => GOLD_TIER_HIGHER.has(`${s.operatorName}|${sk.name}`)));
      // Counting DISTINCT operators, not just presence -- confirmed by
      // the user: two different lower-tier ("Tailoring alpha" family)
      // operators stacked together shift the distribution further than
      // either alone (its own distinct 13/22/65 split), not just a
      // boolean "is anyone lower-tier present".
      const lowerTierCount = roomSlots.filter((s) => s && skillsFor(s, 'Trading Post').some((sk) => GOLD_TIER_LOWER.has(`${s.operatorName}|${sk.name}`))).length;
      const goldTier: 'base' | 'lower' | 'doubleLower' | 'higher' = hasHigherTier
        ? 'higher'
        : lowerTierCount >= 2
        ? 'doubleLower'
        : lowerTierCount === 1
        ? 'lower'
        : 'base';
      const realisticHours = realisticFraction * 24;
      const idealHours = idealFraction * 24;
      if (pepeInsightfulActive) {
        dailyLmdFromPepeGreen += (realisticHours * 60 / 270) * 1000;
        dailyLmdFromPepeRed += (idealHours * 60 / 270) * 1000;
      } else if (uOfficialHere) {
        const perHour = calcTradingPostGoldPerHourStandardized(effectiveProductivity, 2);
        dailyGoldSoldGreen += perHour * realisticHours;
        dailyGoldSoldRed += perHour * idealHours;
      } else {
        // Always the same combined call -- Tailoring's distribution tier,
        // Proviso's gold bonus, and Tequila's LMD bonus all apply
        // together regardless of which subset is actually present
        // (0/0/'base' for any that aren't), instead of a branching chain
        // that could silently drop one dimension when another is active.
        const { goldPerHour, extraLmdPerHour } = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, provisoBonus, tequilaLmdBonus, goldTier);
        dailyGoldSoldGreen += goldPerHour * realisticHours;
        dailyGoldSoldRed += goldPerHour * idealHours;
        dailyExtraLmdFromTequilaGreen += extraLmdPerHour * realisticHours;
        dailyExtraLmdFromTequilaRed += extraLmdPerHour * idealHours;
        // Isolate Proviso's own slice for display -- same real call, her
        // bonus zeroed out, difference is exactly her own contribution.
        // Doesn't change any actual totals above, purely for the display
        // breakdown.
        if (provisoBonus > 0) {
          const withoutProviso = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, 0, tequilaLmdBonus, goldTier);
          const provisoGoldPerHour = goldPerHour - withoutProviso.goldPerHour;
          dailyGoldFromProvisoGreen += provisoGoldPerHour * realisticHours;
          dailyGoldFromProvisoRed += provisoGoldPerHour * idealHours;
        }
      }
    }
  }
  // LMD only comes from gold actually SOLD (Trading Post), not gold merely
  // produced (Factory) -- Factory output isn't automatically sold.
  const dailyGoldWorthGreen = dailyGoldSoldGreen * 500 + dailyExtraLmdFromTequilaGreen + dailyLmdFromPepeGreen;
  const dailyGoldWorthRed = dailyGoldSoldRed * 500 + dailyExtraLmdFromTequilaRed + dailyLmdFromPepeRed;

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
          let skills = combinedSkillsForElite(op, facility.label, eliteForRow);
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

  if (!setupComplete) {
    return (
      <>
        <div>
          <PageHeader
            eyebrow="Rhodes Island // Base Layout"
            title={editingExistingLayout ? 'Edit Base Layout' : 'Base Formation'}
            sub={editingExistingLayout
              ? 'Change what stands in each production spot and how far each facility is built. Operators stay where they are, except in a spot whose facility type changes.'
              : 'Build your base before starting the simulation. Start from a familiar split, then change anything you like.'}
          />
          <main>
            <section className="op-section base-setup-screen">
              <p className="hint base-setup-intro">
                The nine spots on floors 1-3 each hold a Trading Post, a Factory or a Power Plant --
                at most {MAX_PER_PRODUCTION_KIND} of any one kind. Every other room&apos;s type is
                fixed by the base itself, so only its level can change. Any facility can be left
                unbuilt. Dormitories and the Control Center reach Level 5, everything else Level 3.
                Capacity follows level for Trading Posts, Factories, the Reception Room and the
                Office (Level 1 = 1 slot, Level 2 = 2, and so on).
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
                        className={`base-setup-kind-tally${used >= MAX_PER_PRODUCTION_KIND ? ' full' : ''}`}
                      >
                        {FACILITY_KIND_LABELS[kind]} {used}/{MAX_PER_PRODUCTION_KIND}
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
                                : `Already ${MAX_PER_PRODUCTION_KIND} ${FACILITY_KIND_LABELS[kind]}s -- change another spot first`
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
                        {editingExistingLayout ? 'Apply Layout' : 'Begin Simulation'}
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
      <Head><title>Base — Arkpedia</title></Head>

      <div>
      <PageHeader
        eyebrow="Rhodes Island // Base Layout"
        title="Base"
        sub={<>Click a facility, then click an operator&apos;s skill to place them immediately in the
          next open slot. Click a filled slot to remove.</>}
        actions={<div className="base-view-controls">
          <div className="base-view-mode" role="group" aria-label="Figures">
            <button
              type="button"
              className="filter-chip" aria-pressed={viewMode === 'cumulated'}
              onClick={() => setViewMode('cumulated')}
            >
              Cumulated
            </button>
            <button
              type="button"
              className="filter-chip" aria-pressed={viewMode === 'separated'}
              onClick={() => setViewMode('separated')}
            >
              Separated
            </button>
          </div>
          {/* Outside the development-only guard below: the layout editor is a
              player-facing feature, not a debugging aid. It stays alongside
              the per-building gears for changing many rooms at once. */}
          <button type="button" className="ghost" onClick={openLayoutEditor}>
            Edit everything
          </button>
          {/* Per-building edits apply the moment they're clicked, so there is
              no commit step to refuse an over-drawn base at -- the balance is
              shown here permanently instead. */}
          <span className={`base-power-pill${basePower.ok ? '' : ' short'}`} title="Power supplied by Power Plants against what every other facility draws">
            Power {basePower.drawn} / {basePower.supplied}
            {basePower.ok ? '' : ` -- ${Math.abs(basePower.spare)} short`}
          </span>
          {ROTATION_EXPERIMENT_ENABLED && (
            <button type="button" className="ghost" onClick={() => (showRotationPanel ? setShowRotationPanel(false) : openRotationPanel())}>
              Rotation Experiment (Elite 0)
            </button>
          )}
        </div>}
      />

      <main>
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
              <div className="base-room-panel-hint" style={{ marginBottom: 14, padding: 10, border: '1px solid var(--line)', borderRadius: 6 }}>
                <div style={{ marginBottom: 6 }}>Computing rotation plan\u2026 {Math.round(rotationProgress)}%</div>
                <div style={{ width: '100%', height: 8, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${rotationProgress}%`,
                      height: '100%',
                      background: 'var(--accent)',
                      transition: 'width 0.2s ease-out',
                    }}
                  />
                </div>
              </div>
            )}
            {rotationError && !rotationLoading && (
              <div className="base-room-panel-hint" style={{ marginBottom: 14, padding: 10, border: '1px solid var(--prod-danger, #c0392b)', borderRadius: 6 }}>
                Failed to compute the rotation experiment: {rotationError}{' '}
                <button type="button" className="ghost" onClick={() => fetchRotationExperiment(rotationMode)}>
                  Retry
                </button>
              </div>
            )}
            {rotationExperiment && !rotationLoading && (
              <>
                <div className="base-room-panel-hint" style={{ marginBottom: 14, padding: 10, border: '1px solid var(--accent)', borderRadius: 6 }}>
                  <strong>Winning scenario:</strong> {rotationExperiment.chosenScenario}
                  <br />
                  <span className="hint">
                    Several Control Center placements were tried (leaving it to the normal best-per-slot picks, vs. deliberately
                    forcing in Gnosis and/or Kirin R Yato + Rathalos S Noir Corne for their Trading Post/Factory bonuses even
                    though their own Control Center skills wouldn&apos;t otherwise rank as the &quot;best&quot; picks) -- this is
                    whichever scenario produced the highest total production value.
                  </span>
                </div>
                <div className="base-room-panel-hint" style={{ marginBottom: 14, padding: 10, border: '1px solid var(--line)', borderRadius: 6 }}>
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

        <div className="base-layout">
          <div className="base-grid-wrap">
            {roomPanelFacilityId && facility ? (
              <div ref={baseRoomPanelRef} className={`base-room-panel${baseFullscreen ? ' fullscreen' : ''}`}>
                <div className="base-room-panel-header">
                  <button
                    type="button"
                    className="ghost base-room-back-btn"
                    onClick={() => {
                      setRoomPanelFacilityId(null);
                      setBreakdownFacilityId(null);
                      setSearch('');
                    }}
                  >
                    ← Back
                  </button>
                  <span className="base-room-panel-title">{facility.label}</span>
                  {!activeBreakdown && (
                    <span className="base-room-panel-count">
                      {(assignments[facility.id] || []).filter(Boolean).length}/{facility.capacity} selected
                    </span>
                  )}
                  {baseFullscreen && (
                    <button
                      type="button"
                      className="ghost base-fullscreen-btn base-room-panel-fullscreen-btn"
                      onClick={toggleBaseFullscreen}
                      aria-label="Exit fullscreen"
                      title="Exit fullscreen"
                    >
                      ⤢
                    </button>
                  )}
                </div>

                {activeBreakdown ? (
                  <div className="base-breakdown-panel">
                    <div className="base-breakdown-header">
                      <span className="base-breakdown-title">{breakdownFacility?.label} -- How this is calculated</span>
                      <button type="button" className="ghost" onClick={() => setBreakdownFacilityId(null)}>
                        ← Back to operators
                      </button>
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
                        {(['Battle Records', 'Precious Metals'] as FactoryProduct[]).map((product) => (
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

                    <p className="hint base-room-panel-hint">
                      {account ? 'The operators your imported account has, at the Elite they are at (Your elite). ' : ''}
                      Pick an operator to place them in the next open slot at the Elite chosen above; pick them again
                      to remove. Everyone already placed keeps their own Elite &mdash; shown and changed on their chip
                      below. Order matters in facilities like the Dormitory, where slot #1 gets priority.
                    </p>

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
                                          <span className="base-room-card-skill-desc">{sk.description}</span>
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
                            {needsManualValue && (
                              <input
                                type="number"
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
                          {/* The room as it stands: every slot in order, each wearing the
                              Elite it is placed at -- readable and editable here no matter
                              which tab is lit above. This is the answer to the picker's
                              old blind spot: switching tabs changed what the placed cards
                              LOOKED like while saying nothing about what they WERE. */}
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
            ) : (
            <div
              className={`base-zoom-viewport${baseFullscreen ? ' fullscreen' : ''}`}
              ref={baseViewportRef}
              onMouseDown={handleBasePointerDown}
              onMouseMove={handleBasePointerMove}
              onMouseUp={handleBasePointerUp}
              onMouseLeave={handleBasePointerUp}
              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
            >
              {/* The viewport's own mousedown handler calls preventDefault()
                  to stop native text-drag from starting, and these controls
                  are inside it -- so a mousedown on the slider thumb bubbled
                  up, got cancelled, and the range input's native drag never
                  began (it also started panning the base instead). Keeping
                  the event out of the viewport's handler fixes both. */}
              <div
                className="base-zoom-controls"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="ghost base-zoom-reset-btn base-fullscreen-btn"
                  onClick={toggleBaseFullscreen}
                  aria-label={baseFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
                  title={baseFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
                >
                  ⤢
                </button>
                <input
                  type="range"
                  className="base-zoom-slider"
                  min={BASE_MIN_ZOOM}
                  max={BASE_MAX_ZOOM}
                  step={0.01}
                  value={baseZoom}
                  onChange={(e) => handleBaseSliderChange(Number(e.target.value))}
                />
              </div>

              <div
                className="base-zoom-stage"
                style={{
                  transform: `translate(-50%, -50%) translate(${basePan.x}px, ${basePan.y}px) scale(${baseZoom})`,
                  willChange: baseInteracting ? 'transform' : 'auto',
                  /* How much a facility's gear and ? grow so they stay at least 24px on
                     screen when the map is zoomed out (9px at a phone's 0.35 before). */
                  '--base-tap-scale': Math.min(3.2, Math.max(1, 1.1 / baseZoom)),
                } as CSSProperties}
              >
                <div className="base-grid" ref={baseGridRef}>
                  {FACILITIES.map((f) => {
                    const filled = f.capacity > 0 ? assignments[f.id]?.filter(Boolean).length || 0 : 0;
                    const isActive = activeFacility === f.id;
                    const { productivity, capacity, orderLimit, morale, clueSpeed, clueSpeedBase, droneRate, office, trainingSpeed, combinedMoraleRate, perOperatorMorale, deadTime, fullTime, facilityBreakdown, specialNotes } = productivityFor(f, ccEffects, ccMoraleRelief);
                    return (
                      <div
                        key={f.id}
                        className={`base-facility base-facility-${f.kind}${isActive ? ' active' : ''}${
                          f.capacity === 0 && f.kind !== 'elevator' ? ' base-facility-unbuilt' : ''
                        }`}
                        style={{ gridArea: f.gridArea }}
                        onClick={() => f.capacity > 0 && toggleFacility(f.id)}
                      >
                        {/* On every real facility, including unbuilt ones --
                            an empty plot is exactly where you need this, since
                            the gear is the only way to build something there. */}
                        {f.kind !== 'elevator' && (
                          <button
                            type="button"
                            className="base-facility-settings-btn"
                            title={`Change this ${f.label || 'facility'}`}
                            aria-label={`Change this ${f.label || 'facility'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openFacilitySettings(f.id);
                            }}
                          >
                            ⚙
                          </button>
                        )}

                        {/* Left unbuilt: named so the plot still reads as a
                            place something could go, but with no slots and
                            nothing for the simulation to include. */}
                        {f.capacity === 0 && f.kind !== 'elevator' && (
                          <>
                            <span className="base-facility-label">{f.label}</span>
                            <span className="base-facility-unbuilt-note">Not built</span>
                          </>
                        )}
                        {f.capacity > 0 && (
                          <>
                            <span className="base-facility-level-row">
                              {f.kind === 'dormitory' && (
                                <span className="base-facility-ambience-badge" title="Ambience">
                                  {dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level)}/{dormitoryAmbienceCap(f.level)}
                                </span>
                              )}
                              <span className="base-facility-level-badge">Lvl.{f.level}</span>
                            </span>
                            {filled > 0 && (
                              <div className="base-facility-portrait-block">
                                <div className="base-facility-portraits">
                                  {(assignments[f.id] || [])
                                    .filter((s): s is SlotAssignment => s !== null)
                                    .map((s, i) => {
                                      const placedOp = operatorByName.get(s.operatorName);
                                      if (!placedOp) return null;
                                      return (
                                        <div key={i} className="base-facility-portrait">
                                          <Image src={getOperatorIconPath(placedOp)} alt={s.operatorName} width={22} height={22} />
                                        </div>
                                      );
                                    })}
                                </div>
                                <div className="base-facility-portrait-elites">
                                  {(assignments[f.id] || [])
                                    .filter((s): s is SlotAssignment => s !== null)
                                    .map((s, i) => {
                                      const eliteIconPath = s.eliteLevel ? getEssentialIconPath(eliteIconLabel(s.eliteLevel)!) : null;
                                      return (
                                        <div key={i} className="base-facility-portrait-elite-slot">
                                          {eliteIconPath && <Image src={eliteIconPath} alt={eliteIconLabel(s.eliteLevel)!} width={12} height={12} />}
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                            <span className="base-facility-label">{f.label}</span>
                        <span className="base-facility-count">
                          {filled}/{f.capacity}
                        </span>

                        {productivity && (productivity.grey > 0 || productivity.yellow !== 0) && (
                          <span className="base-facility-productivity">
                            {viewMode === 'cumulated' ? (
                              <span className="prod-grey">
                                {((productivity.grey + productivity.yellow) * 100).toFixed(2)}%
                              </span>
                            ) : (
                              <>
                                <span className="prod-grey">{(productivity.grey * 100).toFixed(2)}%</span>
                                {productivity.yellow !== 0 && (
                                  <span className="prod-yellow">
                                    {productivity.yellow > 0 ? '+' : ''}
                                    {(productivity.yellow * 100).toFixed(2)}%
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        )}

                        {/* The Reception Room builds a breakdown too, and had
                            no way to open it -- so its base speed (the flat
                            per-operator, rarity and promotion bonuses) was
                            computed and displayed in the total but could not be
                            inspected, which is exactly what made three reported
                            "innate/promotion/rarity missing" cases impossible
                            to confirm either way. */}
                        {(f.kind === 'factory' || f.kind === 'tradingPost' || f.kind === 'receptionRoom' || f.kind === 'powerPlant' || f.kind === 'controlCenter') && facilityBreakdown && (
                          <button
                            type="button"
                            className="base-facility-explain-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomPanel(f.id);
                              setBreakdownFacilityId(f.id);
                            }}
                            title="Explain this facility's calculation"
                          >
                            ?
                          </button>
                        )}

                        {specialNotes.length > 0 && (
                          <div className="base-facility-notes">
                            {specialNotes.map((n, i) => (
                              <p key={i} className="hint base-facility-note">
                                {n.operator !== '(diagnostic)' && <strong>{n.operator}: </strong>}
                                {n.note}
                              </p>
                            ))}
                          </div>
                        )}

                        {clueSpeedBase !== null && clueSpeedBase > 0 && (
                          <span className="base-facility-productivity">
                            {viewMode === 'cumulated' ? (
                              <span className="prod-grey">{((clueSpeedBase + (clueSpeed ?? 0)) * 100).toFixed(2)}%</span>
                            ) : (
                              <>
                                <span className="prod-grey">{(clueSpeedBase * 100).toFixed(2)}%</span>
                                {clueSpeed !== null && clueSpeed !== 0 && (
                                  <span className="prod-yellow">
                                    {clueSpeed > 0 ? '+' : ''}
                                    {(clueSpeed * 100).toFixed(2)}%
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        )}

                        {droneRate !== null && droneRate !== 0 && (
                          <span className="base-facility-productivity">
                            <span className="prod-yellow">
                              {droneRate > 0 ? '+' : ''}
                              {(droneRate * 100).toFixed(2)}%
                            </span>
                          </span>
                        )}

                        {office && (
                          <>
                            {office.speed !== 0 && (
                              <span className="base-facility-productivity">
                                <span className="prod-grey">Speed:</span>
                                {viewMode === 'cumulated' ? (
                                  <span className="prod-yellow">
                                    {office.speed > 0 ? '+' : ''}
                                    {(office.speed * 100).toFixed(2)}%
                                  </span>
                                ) : (
                                  <>
                                    <span className="prod-yellow">
                                      {office.ownSpeed > 0 ? '+' : ''}
                                      {(office.ownSpeed * 100).toFixed(2)}%
                                    </span>
                                    {office.ccBonus !== 0 && (
                                      <span className="prod-grey">
                                        {office.ccBonus > 0 ? '+' : ''}
                                        {(office.ccBonus * 100).toFixed(2)}% CC
                                      </span>
                                    )}
                                  </>
                                )}
                              </span>
                            )}
                            <span className="base-facility-capacity">
                              {viewMode === 'cumulated' ? (
                                <span className="prod-grey">Refresh: {formatHours(office.refreshHours)}</span>
                              ) : (
                                <>
                                  <span className="prod-grey">Refresh: 12h</span>
                                  {office.speed !== 0 && (
                                    <span className="prod-yellow">
                                      {formatHours(office.refreshHours)} effective
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                          </>
                        )}

                        {trainingSpeed !== null && (
                          <span className="base-facility-productivity">
                            <span className="prod-grey">Training Speed:</span>
                            <span className="prod-yellow">{(trainingSpeed * 100).toFixed(0)}%</span>
                          </span>
                        )}

                        {capacity && (
                          <span className="base-facility-capacity">
                            {viewMode === 'cumulated' ? (
                              <span className="prod-grey">Capacity: {capacity.base + capacity.adjustment}</span>
                            ) : (
                              <>
                                <span className="prod-grey">Capacity: {capacity.base}</span>
                                {capacity.adjustment !== 0 && (
                                  <span className="prod-yellow">
                                    {capacity.adjustment > 0 ? '+' : ''}
                                    {capacity.adjustment}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        )}

                        {orderLimit && (
                          <span className="base-facility-capacity">
                            {viewMode === 'cumulated' ? (
                              <span className="prod-grey">Order Limit: {Math.max(1, orderLimit.base + orderLimit.adjustment)}</span>
                            ) : (
                              <>
                                <span className="prod-grey">Order Limit: {orderLimit.base}</span>
                                {orderLimit.adjustment !== 0 && (
                                  <span className="prod-yellow">
                                    {orderLimit.adjustment > 0 ? '+' : ''}
                                    {orderLimit.adjustment}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        )}

                        {f.kind === 'dormitory' && (
                          <span className="base-facility-morale base-dormitory-recovery">
                            {filled > 0 ? (
                              (dormitoryRecoveryByFacility[f.id] || []).map((r) => {
                                const rate = r.base + r.bonus;
                                return (
                                  <span key={r.name} className="base-dormitory-recovery-row">
                                    <span className="base-dormitory-recovery-name">{r.name}</span>
                                    {viewMode === 'cumulated' ? (
                                      <span className="prod-grey">Recovery: +{rate.toFixed(2)}/hr</span>
                                    ) : (
                                      <>
                                        <span className="prod-grey">Recovery: +{r.base.toFixed(2)}/hr</span>
                                        {r.bonus !== 0 && (
                                          <span className="prod-yellow">
                                            {r.bonus > 0 ? '+' : ''}
                                            {r.bonus.toFixed(2)}
                                          </span>
                                        )}
                                      </>
                                    )}
                                    <span className="prod-grey">Time: {(24 / rate).toFixed(1)}hrs</span>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="base-dormitory-recovery-row">
                                {(() => {
                                  const emptyRoomRate = calcDormitoryRecovery(f.level, dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level));
                                  return (
                                    <>
                                      <span className="prod-grey">Recovery: +{emptyRoomRate.toFixed(1)}/hr</span>
                                      <span className="prod-grey">Time: {(24 / emptyRoomRate).toFixed(1)}hrs</span>
                                    </>
                                  );
                                })()}
                              </span>
                            )}
                          </span>
                        )}

                        {/* The HIGHEST consumption in the room, not the sum.
                            The room's fate is set by whoever drains fastest --
                            that operator is the one who has to be swapped out,
                            and Dead time below is derived from the same rate --
                            so a total would be a number nothing acts on. One
                            line either way, which is what keeps every grid row
                            to a modest reserved height; the per-operator rates
                            are in this facility's "?" breakdown. */}
                        {f.kind !== 'dormitory' && filled > 0 && perOperatorMorale && (
                          <span className="base-facility-morale">
                            <span className="prod-grey">
                              {/* No "max" suffix: this is always the highest
                                  rate now, so labelling it on every tile only
                                  bought a line wrap in a 155px-wide tile. The
                                  "?" breakdown says which figure this is. */}
                              Morale: -{Math.max(...Object.values(perOperatorMorale)).toFixed(2)}/hr
                            </span>
                          </span>
                        )}

                        {f.kind === 'factory' && !factoryProducts[f.id] ? (
                          <span className="base-facility-morale">
                            <span className="prod-danger">Set Formula to Work</span>
                          </span>
                        ) : (
                          <>
                            {fullTime !== null && (
                              <span className="base-facility-morale">
                                <span className={fullTime < loginInterval ? 'prod-danger' : 'prod-grey'}>
                                  Full: {formatHours(fullTime)}
                                </span>
                              </span>
                            )}

                            {f.kind !== 'dormitory' && deadTime !== null && (
                              <span className="base-facility-morale">
                                <span className={deadTime < loginInterval ? 'prod-danger' : 'prod-grey'}>
                                  Dead: {formatHours(deadTime)}
                                </span>
                              </span>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {isActive && f.kind !== 'elevator' && (
                      <div
                        ref={basePopoverRef}
                        className={`base-popover${basePopoverPlacement?.above ? ' popover-above' : ''}`}
                        style={
                          {
                            transform: `translateX(-50%) scale(${1 / baseZoom}) translate(${basePopoverPlacement?.dx ?? 0}px, ${basePopoverPlacement?.dy ?? 0}px)`,
                            maxHeight: basePopoverPlacement ? `${basePopoverPlacement.maxHeight}px` : undefined,
                            '--base-popover-arrow-x': basePopoverPlacement ? `${basePopoverPlacement.arrowX}px` : '50%',
                          } as CSSProperties
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        <XButton dense className="base-popover-close" label={`Close ${f.label}`} onClick={() => setActiveFacility(null)} />
                        <p className="base-popover-title">
                          {f.label}
                          {f.level > 0 && <span className="base-popover-subtitle">Lv.{f.level}</span>}
                        </p>

                        {/* Build and level first: they decide whether there are slots
                            below at all, and on an unbuilt plot they are the only
                            thing in here. */}
                        <div className="base-facility-settings">
                            {/* Only the nine production spots can change kind;
                                every other room's type is fixed by the base. */}
                            {PRODUCTION_SPOT_IDS.includes(f.id) ? (
                              <div className="base-facility-settings-group">
                                <span className="base-facility-settings-label">Build</span>
                                <div className="base-facility-settings-buttons" role="group" aria-label="Build">
                                  {PRODUCTION_KINDS.map((kind) => {
                                    const allowed = canSetSpotKind(productionSpots, f.id, kind);
                                    return (
                                      <button
                                        key={kind}
                                        type="button"
                                        className="filter-chip" aria-pressed={productionSpots[f.id] === kind}
                                        disabled={!allowed}
                                        title={
                                          allowed
                                            ? FACILITY_KIND_LABELS[kind]
                                            : `Already ${MAX_PER_PRODUCTION_KIND} ${FACILITY_KIND_LABELS[kind]}s -- change another spot first`
                                        }
                                        onClick={() => setFacilityKind(f.id, kind)}
                                      >
                                        {FACILITY_KIND_LABELS[kind]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <p className="hint base-facility-settings-fixed">
                                This room&apos;s type is fixed by the base -- only its level can change.
                              </p>
                            )}

                            <div className="base-facility-settings-group">
                              <span className="base-facility-settings-label">Level</span>
                              <div className="base-facility-settings-buttons base-facility-settings-level" role="group" aria-label="Level">
                                {Array.from({ length: MAX_LEVEL_BY_KIND[f.kind] + 1 }, (_, i) => i).map((lvl) => (
                                  <button
                                    key={lvl}
                                    type="button"
                                    className="filter-chip" aria-pressed={f.level === lvl}
                                    title={lvl === 0 ? 'Not built' : `Level ${lvl}`}
                                    onClick={() => setFacilityLevel(f.id, lvl)}
                                  >
                                    {lvl === 0 ? '--' : lvl}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {f.kind === 'dormitory' && f.level > 0 && (
                              <div className="base-facility-settings-group">
                                <span className="base-facility-settings-label">Ambience</span>
                                <div className="base-facility-settings-ambience">
                                  <input
                                    type="number"
                                    min={0}
                                    max={dormitoryAmbienceCap(f.level)}
                                    value={dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level)}
                                    onChange={(e) => persistAmbience(f.id, f.level, Number(e.target.value))}
                                    className="base-facility-ambience-input"
                                  />
                                  <span className="hint">/ {dormitoryAmbienceCap(f.level)} cap</span>
                                </div>
                              </div>
                            )}

                            {/* Power is a base-wide budget, so a change here can
                                break a room somewhere else -- show the balance
                                where the change is being made. */}
                            <p className={`base-facility-settings-power${basePower.ok ? '' : ' short'}`}>
                              Power {basePower.drawn} / {basePower.supplied}
                              {basePower.ok
                                ? ` -- ${basePower.spare} spare`
                                : ` -- ${Math.abs(basePower.spare)} short`}
                            </p>
                          {/* What the Factory makes is a property of the building,
                              so it belongs on this grid with Build and Level rather
                              than floating above the slots as its own bar. */}
                          {f.kind === 'factory' && f.level > 0 && (
                            <div className="base-facility-settings-group">
                              <span className="base-facility-settings-label">Makes</span>
                              <div className="base-facility-settings-buttons" role="group" aria-label="Makes">
                                {(['Battle Records', 'Precious Metals'] as FactoryProduct[]).map((product) => (
                                  <button
                                    key={product}
                                    type="button"
                                    className="filter-chip" aria-pressed={factoryProducts[f.id] === product}
                                    onClick={() => persistProduct(f.id, product)}
                                  >
                                    {product}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* The slots, in the same panel. Nothing to hop to any more --
                            the button that used to say "assign operators instead" was
                            only there because this was two panels. */}
                        {f.capacity > 0 && (<>
                        <div className="base-slot-grid">
                          {(assignments[f.id] || []).map((slot, i) => {
                            const slotOp = slot ? operatorByName.get(slot.operatorName) : null;
                            return (
                              <div
                                key={i}
                                className={`base-slot${slot ? ' filled' : ''}`}
                                onClick={() => {
                                  setActiveFacility(null);
                                  openRoomPanel(f.id);
                                }}
                              >
                                {slotOp ? (
                                  <>
                                    {/* Every icon in here is asked for well above its
                                        box: the whole base sits inside a scale()
                                        transform, so at 2.5x zoom a badge rendered at
                                        its CSS size is being stretched, not drawn. */}
                                    <span className="base-slot-face">
                                      <Image src={getOperatorIconPath(slotOp)} alt={slotOp.name} width={128} height={128} quality={85} className="base-slot-portrait" />
                                      {slot!.eliteLevel && getEssentialIconPath(eliteIconLabel(slot!.eliteLevel)!) && (
                                        <Image
                                          src={getEssentialIconPath(eliteIconLabel(slot!.eliteLevel)!)!}
                                          alt={eliteIconLabel(slot!.eliteLevel)!}
                                          width={64}
                                          height={64}
                                          quality={85}
                                          className="base-slot-elite-badge"
                                        />
                                      )}
                                    </span>
                                    <span className="base-slot-name">{slotOp.name}</span>
                                    <div className="base-slot-badges">
                                      {skillsFor(slot, f.label).map((s, si) => {
                                        const iconSrc = s.icon || getBaseSkillIconPath(slotOp.name, s);
                                        return iconSrc ? (
                                          <Image key={si} src={iconSrc} alt="" width={64} height={64} quality={85} className="base-slot-skill-icon" title={s.name ?? undefined} />
                                        ) : null;
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  <span className="base-slot-empty">+</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
              </div>
              </div>
            )}

            {/* Kept on screen while the operator picker is open. Hiding them
                took ~390px out of the page, so opening the picker shrank the
                document even though the picker itself is exactly the height
                of the base view it replaces -- and a page that changes height
                is what lets the browser clamp your scroll position away. */}
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
                      className="ghost base-resource-settings-btn"
                      onClick={() => setShowResourceSettings((s) => !s)}
                    >
                      Settings
                    </button>
                    {showResourceSettings && (
                      <div className="base-resource-settings-popup">
                        <div className="base-resource-settings-row">
                          <span className="base-resource-settings-label">Clue Exchange</span>
                          <button
                            type="button"
                            className="filter-chip" aria-pressed={clueExchangeActive}
                            onClick={() => persistSettings({ clueExchangeActive: !clueExchangeActive, moraleAbove12, swapPolicy })}
                          >
                            {clueExchangeActive ? 'On' : 'Off'}
                          </button>
                        </div>
                        <p className="hint base-resource-settings-hint">Affects Caper and Cairn&apos;s Reception Room skills.</p>

                        <div className="base-resource-settings-row">
                          <span className="base-resource-settings-label">Morale</span>
                          <button
                            type="button"
                            className="filter-chip" aria-pressed={moraleAbove12}
                            onClick={() => persistSettings({ clueExchangeActive, moraleAbove12: !moraleAbove12, swapPolicy })}
                          >
                            {moraleAbove12 ? 'Above 12' : 'Below 12'}
                          </button>
                        </div>
                        <p className="hint base-resource-settings-hint">Affects Ling and Dusk&apos;s Control Center skills, and anything that depends on the resources they produce.</p>

                        <div className="base-resource-settings-row">
                          <span className="base-resource-settings-label">Swap operators</span>
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
                        <p className="hint base-resource-settings-hint">
                          When tired operators get taken out, which is the only thing bounding a ramping skill&apos;s
                          window. Ramping skills climb over time, so a longer window averages higher.{' '}
                          {swapPolicy === 'onLogin'
                            ? `Swapping every login caps that window at your ${loginInterval}h interval.`
                            : 'Leaving them until 0 Morale lets the window run as long as their Morale lasts, up to 24h.'}{' '}
                          Affects Fang, Kroos, Scene, Ceobe and Aroma in Factories, Spuria in a Power Plant, and Ines in the Reception Room.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

            <div className="base-summary-panel">
              <div className="base-summary-row">
                <span className="base-summary-label">Login interval</span>
                <div className="base-chip-row" role="group" aria-label="Login interval">
                  {LOGIN_INTERVAL_OPTIONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="filter-chip" aria-pressed={loginInterval === h}
                      onClick={() => setLoginInterval(h)}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
              <p className="hint" style={{ margin: '6px 0 4px' }}>
                Any room&apos;s Full or Dead time below your chosen interval is highlighted in red.
              </p>
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
                                (dailyGoldWorthGreen - dailyExtraLmdFromTequilaGreen - dailyGoldFromProvisoGreen * 500) * mult,
                                (dailyGoldWorthRed - dailyExtraLmdFromTequilaRed - dailyGoldFromProvisoRed * 500) * mult,
                                (n) => `${Math.round(n).toLocaleString()} LMD/${unit}`
                              )}
                              {dailyExtraLmdFromTequilaGreen > 0 && (
                                <span className="base-summary-extra">
                                  +{Math.round(dailyExtraLmdFromTequilaGreen * mult).toLocaleString()} from Tequila
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
              <p className="hint" style={{ marginTop: 8 }}>                Daily EXP/Pure Gold figures assume items are collected continuously and never sit
                waiting on a full capacity.
              </p>
            </div>
            </div>

            {/* Both throw work away, so they are .danger, side by side at their own
                width -- they were two full-width neutral ghosts. */}
            <div className="base-reset-row">
              <button type="button" className="danger" onClick={resetBase}>
                Reset base
              </button>
              <button type="button" className="danger" onClick={resetToSetup}>
                Start over (choose new formation)
              </button>
            </div>
          </div>
        </div>
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
  const operators: BaseOperator[] = getAllOperators().map((op) => ({
    name: op.name,
    rarity: op.rarity,
    faction: op.faction,
    baseSkills: op.baseSkills,
  }));

  return { props: { operators } };
}, {
  tables: {
    'base-skill-slots': async () => (await import('@/data/base-skill-slots.json')).default,
    // Checked against the rosters the calculations name wherever it is read from data/.
    'base-group-rosters': async () => checkBaseRosters((await import('@/data/base-group-rosters.json')).default),
  },
});